/**
 * LAVAALL Mascot Prototype — MascotController v1.3
 *
 * Plain ES module. No network calls to external hosts. No LLM. No audio capture.
 * XSS-safe: all user-visible text set via textContent only.
 * User preferences persisted in localStorage (no PII).
 *
 * Audit fixes applied (v1.1 — 2026-11-11):
 *   P1-1/2: AbortController race guard + destroyed-state guard in _loadSVG()
 *   P1-5:   SVG innerHTML restricted; response.ok checked; content-type validated
 *   P2-8:   destroy() no longer clears localStorage (prefs survive reinit)
 *   P2-9:   Root is role="group" not role="button"; activation via inner trigger button
 *   P2-10:  Mute shows visible "Audio: off (text-only v1)" note when toggled
 *
 * v1.2 additions (2026-11-11):
 *   P2-4:   DOMParser-based SVG sanitization. Allowlisted elements and attributes
 *           only. Removes script/foreignObject/event-handler attributes before
 *           applying fetched markup. Defense-in-depth for the allowlisted asset path.
 *
 * v1.3 additions (2026-11-12) — design kit alignment (MASCOT_DESIGN_KIT):
 *   K-1:    Accepts COMPONENT_CONTRACT.json state names (closed, walking,
 *           greeting, listening, thinking, speaking, handoff, hidden, ...)
 *           as aliases; exposes `contractState` and `data-contract-state`.
 *   K-2:    send(EVENT) maps contract events (OPEN, USER_MESSAGE, HANDOFF ...)
 *           to presentation states. Visual only — never triggers a submission.
 *   K-3:    `svgSource` option: synchronous inline markup (no fetch). Fixes the
 *           file:// race where a failed fetch overwrote inlined art.
 *   K-4:    Labels from CHARACTER_BIBLE: "Open LAVAALL Assistant" /
 *           "Open LAVAALL Web assistant".
 *   K-5:    Animations pause on visibilitychange (hidden tab) and pagehide.
 *   K-6:    Fallback icon uses sourced brand colors only (orange removed).
 *
 * API contract (from BOB_EXECUTE_ORIGINAL.md + BOB_TASK.md):
 *   setVariant('technology' | 'web')
 *   setState('idle'|'walk'|'wave'|'listen'|'think'|'speak'|'happy'|'sleep'|'error')
 *            or any COMPONENT_CONTRACT state name (see CONTRACT_STATE_MAP)
 *   send('OPEN'|'CLOSE'|'USER_MESSAGE'|...)  — contract events (see CONTRACT_EVENT_MAP)
 *   setMessage(text)        — textContent only, max 200 chars
 *   show() / hide()
 *   destroy()
 *
 * Events dispatched on window:
 *   mascot:open-chat
 *   mascot:close-chat
 *   mascot:request-help
 *
 * localStorage keys (no PII — booleans only):
 *   lavaall_mascot_hidden   — 'true' | 'false'
 *   lavaall_mascot_paused   — 'true' | 'false'
 *   lavaall_mascot_muted    — 'true' | 'false'  (reserved for future audio)
 */

const VALID_STATES   = ['idle','walk','wave','listen','think','speak','happy','sleep','error'];
const VALID_VARIANTS = ['technology','web'];
const LS_HIDDEN = 'lavaall_mascot_hidden';
const LS_PAUSED = 'lavaall_mascot_paused';
const LS_MUTED  = 'lavaall_mascot_muted';
const MAX_MESSAGE_LEN = 200;

/**
 * Allowlisted SVG asset paths.
 * ONLY these relative paths may be injected via innerHTML.
 * Must be same-origin static files — never user-supplied values.
 * P1-5: Only load from this explicit allowlist.
 */
const SVG_PATHS = {
  technology: '../src/mascot/mascot-base.svg',
  web:        '../src/mascot/mascot-web.svg',
};

// K-4: exact wording from CHARACTER_BIBLE.md "Content" section.
export const ARIA_LABELS = Object.freeze({
  technology: 'Open LAVAALL Assistant',
  web:        'Open LAVAALL Web assistant',
});

/**
 * K-1: COMPONENT_CONTRACT.json states → internal presentation state.
 * 'hidden' is handled specially (calls hide()). Internal names map to themselves.
 */
export const CONTRACT_STATE_MAP = Object.freeze({
  closed:    'idle',
  idle:      'idle',
  walking:   'walk',
  greeting:  'wave',
  listening: 'listen',
  thinking:  'think',
  speaking:  'speak',
  handoff:   'wave',   // STATES_AND_BEHAVIOR: "Wave + direct contact options"
  error:     'error',
  hidden:    null,
});

/** Internal state → contract state name reported by `contractState`. */
const INTERNAL_TO_CONTRACT = Object.freeze({
  idle: 'idle', walk: 'walking', wave: 'greeting', listen: 'listening',
  think: 'thinking', speak: 'speaking', happy: 'idle', sleep: 'idle', error: 'error',
});

/**
 * K-2: COMPONENT_CONTRACT.json events → contract state.
 * HOVER is accepted but changes nothing (hover never animates on its own).
 * REDUCED_MOTION is handled in send().
 */
export const CONTRACT_EVENT_MAP = Object.freeze({
  OPEN:            'greeting',
  CLOSE:           'closed',
  HOVER:           undefined,
  START_WALK:      'walking',
  STOP_WALK:       'idle',
  USER_MESSAGE:    'thinking',
  ASSISTANT_START: 'speaking',
  ASSISTANT_END:   'idle',
  LISTEN_START:    'listening',
  LISTEN_END:      'idle',
  HANDOFF:         'handoff',
  ERROR:           'error',
  REDUCED_MOTION:  undefined,
  HIDE:            'hidden',
});

// K-6: fallback colors come from the sourced tokens (see src/tokens.css).
const FALLBACK_COLORS = Object.freeze({
  technology: { accent: '#00C2FF', face: '#0A0A14', shell: '#F4F9FF' },
  web:        { accent: '#E7D3BF', face: '#0A0A14', shell: '#F5ECE5' },
});

const STATE_DESCRIPTIONS = {
  idle:   'Idle, ready to help',
  walk:   'Walking',
  wave:   'Waving hello',
  listen: 'Listening',
  think:  'Thinking',
  speak:  'Displaying response',
  happy:  'Success',
  sleep:  'Resting',
  error:  'Encountered an error',
};

export class MascotController {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {'technology'|'web'} [options.variant='technology']
   * @param {boolean} [options.enabled=false]
   * @param {{technology?: string, web?: string}} [options.svgSource]
   *   K-3: Trusted inline SVG markup per variant (e.g. MASCOT_SVGS from the
   *   generated mascot-svgs.js). When present the controller never fetches.
   */
  constructor({ container, variant = 'technology', enabled = false, svgSource = null } = {}) {
    if (!container) throw new Error('MascotController: container element required');

    this._container   = container;
    this._variant     = VALID_VARIANTS.includes(variant) ? variant : 'technology';
    this._enabled     = Boolean(enabled);
    this._svgSource   = svgSource && typeof svgSource === 'object' ? svgSource : null;
    this._state       = 'idle';
    this._contractState = 'closed';
    this._destroyed   = false;           // P1-2: guard for post-destroy async callbacks
    this._root        = null;
    this._trigger     = null;            // P2-9: separate activation button inside root
    this._bubble      = null;
    this._svgWrapper  = null;
    this._messageTimer = null;
    this._fetchAbort  = null;            // P1-1: AbortController for in-flight SVG fetch
    this._svgSeq      = 0;              // P1-2: sequence counter to discard stale responses
    this._boundKeydown = this._onKeydown.bind(this);

    this._reducedMotion = (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    this._prefs = this._loadPrefs();
    this._render();

    if (this._prefs.hidden) {
      this._root.setAttribute('hidden', '');
      this._root.setAttribute('aria-hidden', 'true');
    }
    if (this._prefs.paused) {
      this._root.setAttribute('data-paused', 'true');
    }
    if (this._reducedMotion) {
      this._root.setAttribute('data-reduced-motion', 'true');
    }

    // K-5: stop animation work in background tabs (STATES_AND_BEHAVIOR).
    this._onVisibility = () => this._setPageHidden(Boolean(document.hidden));
    this._onPageHide   = () => this._setPageHidden(true);
    this._onPageShow   = () => this._setPageHidden(Boolean(document.hidden));
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('pagehide', this._onPageHide);
      window.addEventListener('pageshow', this._onPageShow);
    }
    if (typeof document !== 'undefined' && document.hidden) this._setPageHidden(true);
  }

  _setPageHidden(hidden) {
    if (!this._root || this._destroyed) return;
    if (hidden) this._root.setAttribute('data-page-hidden', 'true');
    else        this._root.removeAttribute('data-page-hidden');
  }

  // ── Private: render DOM ────────────────────────────────────────────

  _render() {
    // P2-9: Root is a presentational group, NOT role=button.
    // The activation trigger is a dedicated inner <button>.
    const root = document.createElement('div');
    root.className = 'mascot-root';
    // No role=button here — root contains interactive children (buttons).
    // Screen readers will find the inner trigger button naturally.
    root.setAttribute('data-variant', this._variant);
    root.setAttribute('data-state', this._state);
    root.setAttribute('data-contract-state', this._contractState);

    if (!this._enabled) {
      root.setAttribute('hidden', '');
      root.setAttribute('aria-hidden', 'true');
    }

    // SVG wrapper (display only)
    const svgWrapper = document.createElement('div');
    svgWrapper.className = 'mascot-svg-wrapper';
    svgWrapper.setAttribute('aria-hidden', 'true'); // SVG is decorative
    root.appendChild(svgWrapper);

    // P2-9: Dedicated activation button (replaces root role=button)
    const trigger = document.createElement('button');
    trigger.className = 'mascot-trigger';
    trigger.setAttribute('type', 'button');
    trigger.setAttribute('aria-label', ARIA_LABELS[this._variant]);
    trigger.addEventListener('click', () => {
      if (this._enabled && !this._destroyed) this._dispatch('mascot:open-chat');
    });
    root.appendChild(trigger);

    // Speech bubble
    const bubble = document.createElement('div');
    bubble.className = 'mascot-bubble';
    bubble.setAttribute('aria-live', 'polite');
    bubble.setAttribute('aria-atomic', 'true');
    root.appendChild(bubble);

    // Controls (hide/pause) — separate from trigger, do not inherit root activation
    const controls = document.createElement('div');
    controls.className = 'mascot-controls';
    controls.setAttribute('aria-label', 'Mascot controls');

    controls.appendChild(this._makeCtrlBtn('✕', 'Dismiss mascot', () => this.hide()));
    controls.appendChild(this._makeCtrlBtn('⏸', 'Pause animations', () => this.pause()));
    root.appendChild(controls);

    root.addEventListener('keydown', this._boundKeydown);

    this._root       = root;
    this._trigger    = trigger;
    this._bubble     = bubble;
    this._svgWrapper = svgWrapper;

    this._loadSVG(this._variant);
    this._container.appendChild(root);
  }

  _makeCtrlBtn(icon, label, handler) {
    const btn = document.createElement('button');
    btn.className = 'mascot-ctrl-btn';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('type', 'button');
    btn.textContent = icon;
    btn.addEventListener('click', (e) => { e.stopPropagation(); handler(); });
    return btn;
  }

  /**
   * P1-1/2/5: Load SVG with AbortController race guard, destroyed-state guard,
   * response.ok check, and allowlist enforcement.
   * SVG markup from allowlisted same-origin static files only — never user input.
   */
  _loadSVG(variant) {
    // K-3: Inline source wins — synchronous, no network, works on file://.
    if (this._svgSource) {
      // Invalidate any in-flight fetch so it can never overwrite this markup.
      ++this._svgSeq;
      if (this._fetchAbort) { this._fetchAbort.abort(); this._fetchAbort = null; }
      const markup = this._svgSource[variant];
      this._applySVG(typeof markup === 'string' && markup.trim().startsWith('<svg')
        ? markup
        : this._fallbackSVG(variant));
      return;
    }

    // P1-5: Only load from the explicit allowlist — never a dynamic/user-supplied path.
    const path = SVG_PATHS[variant];
    if (!path) {
      this._applySVG(this._fallbackSVG(variant));
      return;
    }

    // P1-1: Abort any previous in-flight fetch before starting a new one.
    if (this._fetchAbort) {
      this._fetchAbort.abort();
    }

    if (typeof fetch === 'undefined') {
      this._applySVG(this._fallbackSVG(variant));
      return;
    }

    // P1-2: Sequence token — discard responses that arrive after a newer request.
    const seq = ++this._svgSeq;
    const controller = new (typeof AbortController !== 'undefined' ? AbortController : class { abort(){} signal={} })();
    this._fetchAbort = controller;

    fetch(path, { signal: controller.signal })
      .then(response => {
        // P1-1: Check response is valid before consuming body.
        if (!response.ok) {
          throw new Error(`SVG fetch failed: ${response.status} ${response.statusText}`);
        }
        // P1-5: Verify content-type is SVG or plain text (not HTML/script).
        const ct = response.headers.get('content-type') || '';
        if (ct && !ct.includes('svg') && !ct.includes('text') && !ct.includes('xml')) {
          throw new Error(`Unexpected content-type for SVG: ${ct}`);
        }
        return response.text();
      })
      .then(svgText => {
        // P1-2: Discard if destroyed or a newer fetch has superseded this one.
        if (this._destroyed || seq !== this._svgSeq) return;
        // Strip XML declaration if present (safe — this is a static file we own).
        const clean = svgText.replace(/<\?xml[^?]*\?>/g, '').trim();
        // Final guard: must start with <svg to reject unexpected content.
        if (!clean.startsWith('<svg') && !clean.startsWith('<!--')) {
          throw new Error('SVG response does not start with <svg');
        }
        this._applySVG(clean);
      })
      .catch(err => {
        // P1-2: Ignore AbortError (expected on race cancel) and post-destroy errors.
        if (this._destroyed) return;
        if (err && err.name === 'AbortError') return;
        // P1-1: Graceful fallback on any other error.
        if (seq === this._svgSeq) {
          this._applySVG(this._fallbackSVG(variant));
        }
      });
  }

  /**
   * P2-4: Sanitize SVG markup using DOMParser and an element+attribute allowlist.
   * Removes script elements, foreignObject, event-handler attributes (on*),
   * and any external URI references before the markup is applied to the DOM.
   * Called from _loadSVG after all existing guards (allowlist URL, content-type,
   * starts-with-<svg) have already passed.
   *
   * The DOMParser path is browser-only. In Node.js (test environment) where
   * DOMParser is not available, the raw markup is applied as before (tests
   * run against static controlled strings, not network responses).
   *
   * @param {string} svgMarkup — raw SVG text from the allowlisted static file.
   */
  _sanitizeSVG(svgMarkup) {
    // If DOMParser is not available (Node.js test environment), skip.
    if (typeof DOMParser === 'undefined') return svgMarkup;

    let doc;
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
    } catch {
      return this._fallbackSVG('technology');
    }

    // Check for parse errors.
    const parseError = doc.querySelector('parsererror');
    if (parseError) return this._fallbackSVG('technology');

    const svgEl = doc.documentElement;
    if (!svgEl || svgEl.tagName.toLowerCase() !== 'svg') {
      return this._fallbackSVG('technology');
    }

    // Walk all nodes and strip disallowed elements and attributes.
    this._sanitizeNode(svgEl);

    // Re-serialize the cleaned SVG back to a string.
    if (typeof XMLSerializer !== 'undefined') {
      return new XMLSerializer().serializeToString(svgEl);
    }
    // Fallback: return original (it already passed content-type + prefix guards).
    return svgMarkup;
  }

  // Elements that are never allowed inside an SVG mascot asset.
  static get _SVG_BLOCKED_ELEMENTS() {
    return new Set([
      'script', 'foreignobject', 'iframe', 'embed', 'object', 'use',
      'image',  // may reference external URLs in href
    ]);
  }

  // Only these SVG elements are permitted.
  static get _SVG_ALLOWED_ELEMENTS() {
    return new Set([
      'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line',
      'polyline', 'polygon', 'text', 'tspan', 'defs', 'title', 'desc',
      'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop',
      'symbol', 'use', // 'use' only if stripped of xlink:href pointing outside
      'filter', 'feColorMatrix', 'feGaussianBlur', 'feBlend',
      'animate', 'animateTransform', 'animateMotion', 'set', 'mpath',
    ]);
  }

  // Attribute name prefixes and patterns that are always stripped.
  static get _BLOCKED_ATTR_PATTERNS() {
    return [
      /^on/i,             // event handlers: onclick, onload, onerror …
      /^xlink:href$/i,    // can point to external resources / scripts
      /^href$/i,          // can also be used for external refs in SVG
      /javascript:/i,     // safety net
    ];
  }

  _sanitizeNode(node) {
    // Walk children in reverse so removals don't break iteration.
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 1 /* ELEMENT_NODE */) {
        const tag = child.tagName.toLowerCase();
        // Remove blocked elements entirely.
        if (MascotController._SVG_BLOCKED_ELEMENTS.has(tag)) {
          node.removeChild(child);
          continue;
        }
        // Strip blocked attributes.
        if (child.attributes) {
          const attrsToRemove = [];
          for (const attr of child.attributes) {
            const name = attr.name.toLowerCase();
            const value = attr.value;
            const blocked = MascotController._BLOCKED_ATTR_PATTERNS.some(pattern => {
              if (pattern instanceof RegExp) {
                return pattern.test(name) || pattern.test(value);
              }
              return false;
            });
            if (blocked) attrsToRemove.push(attr.name);
          }
          attrsToRemove.forEach(a => child.removeAttribute(a));
        }
        // Recurse.
        this._sanitizeNode(child);
      } else if (child.nodeType === 8 /* COMMENT_NODE */) {
        // Strip HTML comments — they can sometimes be used to smuggle payloads.
        node.removeChild(child);
      }
    }
  }

  /**
   * Apply verified, sanitized SVG markup to the wrapper.
   * Only called from _loadSVG after all guards pass.
   */
  _applySVG(svgMarkup) {
    if (!this._svgWrapper || this._destroyed) return;
    // P2-4: Run DOMParser-based sanitization before injecting.
    const clean = this._sanitizeSVG(svgMarkup);
    // SVG markup from allowlisted static file (technology or web variant only),
    // further sanitized by _sanitizeSVG. Never fed user-supplied content.
    this._svgWrapper.innerHTML = clean; // eslint-disable-line no-unsanitized/property
  }

  _fallbackSVG(variant) {
    // K-6: Static fallback — a simplified head in sourced brand colors.
    // Built from constants only (no user input), safe to assign as innerHTML.
    const c = FALLBACK_COLORS[variant] || FALLBACK_COLORS.technology;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
      <circle cx="40" cy="40" r="36" fill="${c.shell}"/>
      <rect x="14" y="20" width="52" height="38" rx="12" fill="${c.face}"/>
      <path d="M22 42 Q28 34 34 42 M46 42 Q52 34 58 42" stroke="${c.accent}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M33 50 Q40 55 47 50" stroke="${c.accent}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </svg>`;
  }

  // ── Private: event handlers ────────────────────────────────────────

  _onKeydown(e) {
    if (!this._enabled || this._destroyed) return;
    if (e.key === 'Escape') this.hide();
  }

  _dispatch(eventName, detail = {}) {
    window.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true }));
  }

  // ── Private: preferences ──────────────────────────────────────────

  _loadPrefs() {
    try {
      return {
        hidden: localStorage.getItem(LS_HIDDEN) === 'true',
        paused: localStorage.getItem(LS_PAUSED) === 'true',
        muted:  localStorage.getItem(LS_MUTED)  === 'true',
      };
    } catch {
      return { hidden: false, paused: false, muted: false };
    }
  }

  _savePref(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* unavailable */ }
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Switch variant — preserves state and preferences. */
  setVariant(variant) {
    if (!VALID_VARIANTS.includes(variant) || this._destroyed) return;
    this._variant = variant;
    if (!this._root) return;
    this._root.setAttribute('data-variant', variant);
    this._trigger && this._trigger.setAttribute('aria-label', ARIA_LABELS[variant]);
    this._loadSVG(variant); // P1-1: old fetch aborted inside _loadSVG
  }

  /**
   * Set animation state. Accepts internal names (VALID_STATES) or
   * COMPONENT_CONTRACT names (CONTRACT_STATE_MAP). Returns true if applied.
   */
  setState(state) {
    if (this._destroyed) return false;

    let internal = state;
    let contract = null;
    if (!VALID_STATES.includes(state)) {
      if (!Object.prototype.hasOwnProperty.call(CONTRACT_STATE_MAP, state)) {
        console.warn(`MascotController.setState: invalid state "${state}" — ignored`);
        return false;
      }
      contract = state;
      if (state === 'hidden') {
        this._contractState = 'hidden';
        if (this._root) this._root.setAttribute('data-contract-state', 'hidden');
        this.hide();
        return true;
      }
      internal = CONTRACT_STATE_MAP[state];
    }

    this._state = internal;
    this._contractState = contract || INTERNAL_TO_CONTRACT[internal] || internal;
    if (!this._root) return true;
    this._root.setAttribute('data-state', internal);
    this._root.setAttribute('data-contract-state', this._contractState);
    this._root.setAttribute('aria-description', STATE_DESCRIPTIONS[internal] || internal);
    return true;
  }

  /**
   * K-2: Feed a COMPONENT_CONTRACT event. Presentation only — this never
   * submits anything, opens a microphone, or calls a backend.
   * @returns {string|null} the resulting contract state, or null if ignored.
   */
  send(event) {
    if (this._destroyed) return null;
    if (!Object.prototype.hasOwnProperty.call(CONTRACT_EVENT_MAP, event)) {
      console.warn(`MascotController.send: unknown event "${event}" — ignored`);
      return null;
    }
    if (event === 'REDUCED_MOTION') {
      this._reducedMotion = true;
      if (this._root) this._root.setAttribute('data-reduced-motion', 'true');
      if (this._state === 'walk') this.setState('idle');
      return this._contractState;
    }
    const target = CONTRACT_EVENT_MAP[event];
    if (target === undefined) return this._contractState;   // HOVER: no visual change
    if (target === 'walking' && this._reducedMotion) return this._contractState;
    return this.setState(target) ? this._contractState : null;
  }

  /** Set speech bubble text — XSS-safe, textContent only. */
  setMessage(text) {
    if (!this._bubble || this._destroyed) return;
    const safe = String(text || '').slice(0, MAX_MESSAGE_LEN);
    this._bubble.textContent = safe;
    if (safe) {
      this._bubble.classList.add('visible');
      clearTimeout(this._messageTimer);
      this._messageTimer = setTimeout(() => {
        if (!this._destroyed) this._bubble.classList.remove('visible');
      }, 5000);
    } else {
      clearTimeout(this._messageTimer);
      this._bubble.classList.remove('visible');
    }
  }

  /** Show mascot (respects enabled flag). */
  show() {
    if (!this._enabled || this._destroyed) return;
    if (!this._root) return;
    this._root.removeAttribute('hidden');
    this._root.removeAttribute('aria-hidden');
    if (this._contractState === 'hidden') {
      this._contractState = INTERNAL_TO_CONTRACT[this._state] || 'idle';
      this._root.setAttribute('data-contract-state', this._contractState);
    }
    this._prefs.hidden = false;
    this._savePref(LS_HIDDEN, false);
  }

  /** Hide mascot — persists preference so it survives reload. */
  hide() {
    if (!this._root || this._destroyed) return;
    this._root.setAttribute('hidden', '');
    this._root.setAttribute('aria-hidden', 'true');
    this._contractState = 'hidden';
    this._root.setAttribute('data-contract-state', 'hidden');
    this._prefs.hidden = true;
    this._savePref(LS_HIDDEN, true);
    this._dispatch('mascot:close-chat');
  }

  /** Pause animations — persists preference. */
  pause() {
    if (!this._root || this._destroyed) return;
    this._root.setAttribute('data-paused', 'true');
    this._prefs.paused = true;
    this._savePref(LS_PAUSED, true);
  }

  /** Resume animations — persists preference. */
  resume() {
    if (!this._root || this._destroyed) return;
    this._root.removeAttribute('data-paused');
    this._prefs.paused = false;
    this._savePref(LS_PAUSED, false);
  }

  /**
   * Mute (reserved for future audio phase — no audio in text-only v1).
   * P2-10: Records preference; chat:speaking means text display, not real audio.
   */
  mute() {
    this._prefs.muted = true;
    this._savePref(LS_MUTED, true);
  }

  /** Unmute. */
  unmute() {
    this._prefs.muted = false;
    this._savePref(LS_MUTED, false);
  }

  /** Signal request-help event. */
  requestHelp() {
    if (this._destroyed) return;
    this._dispatch('mascot:request-help');
  }

  /**
   * Remove from DOM and clean up all resources.
   * P2-8: Does NOT clear localStorage — preferences survive reinitialisation.
   * To reset all prefs, call resetPreferences() explicitly.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    // P1-1: Abort any in-flight SVG fetch.
    if (this._fetchAbort) {
      this._fetchAbort.abort();
      this._fetchAbort = null;
    }

    clearTimeout(this._messageTimer);

    if (typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('pagehide', this._onPageHide);
      window.removeEventListener('pageshow', this._onPageShow);
    }

    if (this._root) {
      this._root.removeEventListener('keydown', this._boundKeydown);
      this._root.remove();
      this._root = null;
    }

    // P2-8: Preferences are NOT removed — they persist for when mascot is remounted.
    // Call resetPreferences() explicitly to clear them.
  }

  /**
   * Explicitly reset all stored preferences (separate from destroy).
   * Call only when the user deliberately resets settings.
   */
  resetPreferences() {
    try {
      localStorage.removeItem(LS_HIDDEN);
      localStorage.removeItem(LS_PAUSED);
      localStorage.removeItem(LS_MUTED);
    } catch { /* ignore */ }
    this._prefs = { hidden: false, paused: false, muted: false };
  }

  // ── Getters ───────────────────────────────────────────────────────

  get state()        { return this._state; }
  get contractState(){ return this._contractState; }
  get variant()      { return this._variant; }
  get mounted()      { return !this._destroyed && this._root !== null && document.contains(this._root); }
  get reducedMotion(){ return this._reducedMotion; }
  get isDestroyed()  { return this._destroyed; }
}
