/**
 * LAVAALL Mascot Prototype — MascotRoamer v1.3
 *
 * Optional, desktop-only walking inside a bounded, non-interactive lane.
 * Rules from MASCOT_DESIGN_KIT/03_MOTION/STATES_AND_BEHAVIOR.md:
 *   - "Walk within a bounded, non-interactive visual lane, never over menus/forms"
 *   - "stops on first user interaction, focus, scrolling, forms, reduced-motion
 *      or after a few seconds. Avoid constant movement."
 *   - "No walking on mobile." "stop animation in background tabs"
 *
 * v1.3 changes (2026-11-12):
 *   R-1  Waypoints are confined to a lane (selector, rect function, or the
 *        default bottom band). Both endpoints in a convex lane means the
 *        straight-line transition also stays inside it.
 *   R-2  Stops for good on the first pointerdown / keydown / wheel / scroll /
 *        touchstart / focusin anywhere on the page.
 *   R-3  Hard time cap (maxDurationMs, default 8 s).
 *   R-4  Stops on pagehide; pauses on visibilitychange.
 *   R-5  Pause reasons are a Set — leaving hover no longer resumes walking
 *        while the tab is hidden (v1.2 bug: _setPaused ignored its reason).
 *   R-6  The mascot's own buttons are no longer treated as obstacles.
 *   R-7  stop() only resets the pose if the mascot is still walking, so it
 *        never clobbers a chat state (think/speak) set in the meantime.
 *   R-8  startWhenIdle(delay): walk only if the visitor has not interacted.
 *   R-9  Emits `mascot:roam-stop` on window with { reason }.
 *   R-10 Refuses to start (or stops) when the lane is off-screen or too small,
 *        instead of "walking" in place.
 *
 * Usage:
 *   const roamer = new MascotRoamer({ mascot, lane: '[data-mascot-lane]' });
 *   roamer.startWhenIdle(4000);   // or roamer.start()
 */

const DEFAULT_AVOID_SELECTORS = [
  'nav', 'header', 'footer', 'form',
  '[role="navigation"]', '[role="banner"]', '[role="dialog"]',
  '.chat-panel',
  'a[href]', 'button', 'input', 'select', 'textarea', '[contenteditable="true"]',
];

const AVOID_MARGIN       = 16;
const STEP_INTERVAL_MS   = 2500;
const MAX_DURATION_MS    = 8000;
const TRANSITION_MS      = 1400;
const MIN_DESKTOP_WIDTH  = 1024;
const DEFAULT_LANE_HEIGHT = 170;   // bottom band, px
const EDGE_MARGIN        = 24;

const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

export class MascotRoamer {
  /**
   * @param {Object} options
   * @param {import('./mascot-controller.js').MascotController} options.mascot
   * @param {string[]} [options.avoidSelectors]
   * @param {number}   [options.stepIntervalMs=2500]
   * @param {number}   [options.maxDurationMs=8000]
   * @param {() => boolean} [options.isDialogOpen]
   * @param {string | (() => {left:number,top:number,right:number,bottom:number}) | null} [options.lane]
   *   CSS selector of a non-interactive element, a function returning a viewport
   *   rect, or null for the default bottom band (right 60% of the viewport).
   * @param {(reason: string) => void} [options.onStop]
   */
  constructor({
    mascot,
    avoidSelectors = DEFAULT_AVOID_SELECTORS,
    stepIntervalMs = STEP_INTERVAL_MS,
    maxDurationMs = MAX_DURATION_MS,
    isDialogOpen = null,
    lane = null,
    onStop = null,
  } = {}) {
    if (!mascot) throw new Error('MascotRoamer: mascot controller required');

    this._mascot         = mascot;
    this._avoidSelectors = avoidSelectors;
    this._stepIntervalMs = stepIntervalMs;
    this._maxDurationMs  = maxDurationMs;
    this._isDialogOpen   = isDialogOpen;
    this._lane           = lane;
    this._onStopCb       = onStop;

    this._started        = false;
    this._destroyed      = false;
    this._intervalId     = null;
    this._capTimer       = null;
    this._idleTimer      = null;
    this._pauseReasons   = new Set();
    this._hasInteracted  = false;
    this._lastStopReason = null;
    this._x = null;
    this._y = null;

    this._onMouseEnter = () => this._pause('hover');
    this._onMouseLeave = () => this._resume('hover');
    this._onVisibility = () => {
      if (document.hidden) this._pause('visibility');
      else                 this._resume('visibility');
    };
    this._onPageHide   = () => this.stop('pagehide');
    this._onInteract   = (e) => {
      this._hasInteracted = true;
      this._cancelIdleStart();
      if (this._started) this.stop(e && e.type ? `interaction:${e.type}` : 'interaction');
    };
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Start walking now. No-op on mobile, with reduced motion, or after destroy. */
  start() {
    if (this._started || this._destroyed) return false;
    if (!this._shouldRoam()) return false;
    const root = this._mascot._root;
    if (!root) return false;
    // R-10: don't "walk" in place when the lane is scrolled away or too small.
    if (!this._laneFits(root)) { this._lastStopReason = 'lane-not-visible'; return false; }

    this._started = true;
    this._lastStopReason = null;
    this._pauseReasons.clear();

    root.style.transition = `left ${TRANSITION_MS}ms ease-in-out, top ${TRANSITION_MS}ms ease-in-out`;
    root.style.position   = 'fixed';
    const rect = root.getBoundingClientRect();
    this._x = rect.left;
    this._y = rect.top;
    this._applyPosition(this._x, this._y);

    root.addEventListener('mouseenter', this._onMouseEnter);
    root.addEventListener('mouseleave', this._onMouseLeave);
    this._addGlobalListeners();
    if (typeof document !== 'undefined' && document.hidden) this._pauseReasons.add('visibility');

    this._mascot.setState('walk');
    if (typeof this._mascot.setMessage === 'function') this._mascot.setMessage('');   // no moving text
    this._capTimer = setTimeout(() => this.stop('timeout'), this._maxDurationMs);

    // First step right away so the walk is visible, then on an interval.
    if (!this._isPaused()) this._step();
    this._scheduleStep();
    return true;
  }

  /**
   * Start walking after `delayMs` only if the visitor has not interacted by then
   * (STATES_AND_BEHAVIOR: walking trigger = "user has not interacted; timeout").
   */
  startWhenIdle(delayMs = 4000) {
    if (this._destroyed || this._started || this._hasInteracted) return false;
    if (!this._shouldRoam()) return false;
    this._cancelIdleStart();
    this._addGlobalListeners();
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (!this._hasInteracted) this.start();
    }, delayMs);
    return true;
  }

  /** Stop walking and restore the CSS-docked position. */
  stop(reason = 'manual') {
    this._cancelIdleStart();
    if (!this._started) {
      this._removeGlobalListeners();
      return;
    }
    this._started = false;
    this._lastStopReason = reason;

    clearInterval(this._intervalId);
    clearTimeout(this._capTimer);
    this._intervalId = null;
    this._capTimer = null;
    this._pauseReasons.clear();

    const root = this._mascot._root;
    if (root) {
      root.removeEventListener('mouseenter', this._onMouseEnter);
      root.removeEventListener('mouseleave', this._onMouseLeave);
      for (const p of ['left', 'top', 'right', 'bottom', 'transition', 'position']) {
        root.style.removeProperty ? root.style.removeProperty(p) : delete root.style[p];
      }
    }
    this._removeGlobalListeners();

    // R-7: only undo our own pose.
    if (this._mascot.state === 'walk') this._mascot.setState('idle');

    if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mascot:roam-stop', { detail: { reason } }));
    }
    if (typeof this._onStopCb === 'function') this._onStopCb(reason);
  }

  destroy() {
    if (this._destroyed) return;
    this.stop('destroy');
    this._destroyed = true;
  }

  get isStarted()      { return this._started; }
  get isPaused()       { return this._isPaused(); }
  get lastStopReason() { return this._lastStopReason; }
  get hasInteracted()  { return this._hasInteracted; }

  // ── Private ─────────────────────────────────────────────────────

  _shouldRoam() {
    if (typeof window === 'undefined') return false;
    if (!(window.innerWidth >= MIN_DESKTOP_WIDTH)) return false;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (this._mascot.reducedMotion) return false;
    return true;
  }

  _addGlobalListeners() {
    if (this._listening || typeof window === 'undefined') return;
    this._listening = true;
    for (const t of INTERACTION_EVENTS) window.addEventListener(t, this._onInteract, { capture: true, passive: true });
    window.addEventListener('scroll', this._onInteract, { capture: true, passive: true });
    window.addEventListener('pagehide', this._onPageHide);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('focusin', this._onInteract, true);
      document.addEventListener('visibilitychange', this._onVisibility);
    }
  }

  _removeGlobalListeners() {
    if (!this._listening || typeof window === 'undefined') return;
    this._listening = false;
    for (const t of INTERACTION_EVENTS) window.removeEventListener(t, this._onInteract, { capture: true });
    window.removeEventListener('scroll', this._onInteract, { capture: true });
    window.removeEventListener('pagehide', this._onPageHide);
    if (typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('focusin', this._onInteract, true);
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
  }

  _cancelIdleStart() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
  }

  _isPaused() {
    return this._pauseReasons.size > 0 || Boolean(this._isDialogOpen && this._isDialogOpen());
  }

  _pause(reason)  { this._pauseReasons.add(reason); }
  _resume(reason) { this._pauseReasons.delete(reason); }

  _scheduleStep() {
    clearInterval(this._intervalId);
    this._intervalId = setInterval(() => {
      if (!this._started || this._destroyed) { clearInterval(this._intervalId); this._intervalId = null; return; }
      if (this._isPaused()) return;
      this._step();
    }, this._stepIntervalMs);
  }

  /** Lane rect in viewport coordinates, clipped to the viewport edges. */
  _laneRect() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let r = null;
    if (typeof this._lane === 'function') {
      r = this._lane();
    } else if (typeof this._lane === 'string') {
      const el = typeof document !== 'undefined' && document.querySelector ? document.querySelector(this._lane) : null;
      if (el) r = el.getBoundingClientRect();
    }
    if (!r) r = { left: vw * 0.4, top: vh - DEFAULT_LANE_HEIGHT, right: vw, bottom: vh };
    return {
      left:   Math.max(r.left,   EDGE_MARGIN),
      top:    Math.max(r.top,    EDGE_MARGIN),
      right:  Math.min(r.right,  vw - EDGE_MARGIN),
      bottom: Math.min(r.bottom, vh - EDGE_MARGIN),
    };
  }

  _laneFits(root) {
    const lane = this._laneRect();
    return lane.right - lane.left >= (root.offsetWidth || 80) &&
           lane.bottom - lane.top >= (root.offsetHeight || 110);
  }

  _step() {
    const root = this._mascot._root;
    if (!root) return;
    if (!this._laneFits(root)) { this.stop('lane-not-visible'); return; }
    const w = root.offsetWidth  || 80;
    const h = root.offsetHeight || 110;
    const lane = this._laneRect();
    const minX = lane.left, maxX = lane.right - w;
    const minY = lane.top,  maxY = lane.bottom - h;
    if (maxX < minX || maxY < minY) return;   // lane too small for the mascot

    const avoid = this._getAvoidRects();
    for (let attempt = 0; attempt < 16; attempt++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      if (!this._overlapsAny({ left: x, top: y, right: x + w, bottom: y + h }, avoid)) {
        this._x = x; this._y = y;
        this._applyPosition(x, y);
        return;
      }
    }
    // No clear waypoint: stay where we are rather than risk covering a control.
  }

  _applyPosition(x, y) {
    const root = this._mascot._root;
    if (!root) return;
    root.style.left   = `${Math.round(x)}px`;
    root.style.top    = `${Math.round(y)}px`;
    root.style.right  = 'auto';
    root.style.bottom = 'auto';
  }

  _getAvoidRects() {
    const rects = [];
    const root = this._mascot._root;
    if (typeof document === 'undefined' || !document.querySelectorAll) return rects;
    for (const sel of this._avoidSelectors) {
      let nodes;
      try { nodes = document.querySelectorAll(sel); } catch { continue; }
      nodes.forEach(el => {
        if (root && (el === root || (root.contains && root.contains(el)))) return;   // R-6
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        rects.push({ left: r.left - AVOID_MARGIN, top: r.top - AVOID_MARGIN, right: r.right + AVOID_MARGIN, bottom: r.bottom + AVOID_MARGIN });
      });
    }
    return rects;
  }

  _overlapsAny(c, rects) {
    for (const r of rects) {
      if (c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top) return true;
    }
    return false;
  }
}
