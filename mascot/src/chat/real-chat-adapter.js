/**
 * LAVAALL Mascot — RealChatAdapter
 *
 * Drop-in replacement for MockChatAdapter. Same interface, same events, but each turn
 * is answered by the existing LAVAALL backend at /api/chat-inquiry (Preview only).
 *
 *   send(text) · open() · close() · reset() · simulateError() · simulateHandoff()
 *
 * Contract used (see api/chat-inquiry.js):
 *   GET  ?action=config   → { CHAT_ENABLED, environment }      public flags only
 *   POST ?action=session  → { sessionId, csrf } + HttpOnly proof cookie (credentials: 'include')
 *   POST ?action=turn     { sessionId, csrf, eventId, text } → { text, chips?, reset?, handoff? }
 *   The formal review/confirm actions stay server-only; this adapter never calls them and never
 *   posts to api/contact or api/web/inquiry. No API key ever reaches the browser.
 *
 * Events (1:1 with MockChatAdapter, so ChatPanel and MascotController need no changes):
 *   chat:listening → chat:thinking → turn:response + chat:speaking → chat:idle
 *   chat:error / turn:error on any failure
 *   turn:start / turn:thinking compatibility events
 *   chat:open / chat:close
 * Additional, optional events (a panel may ignore them):
 *   chat:chips { chips }       suggestion chips returned by the server
 *   chat:reset {}              the server started a new topic
 *   request:review { chips }   the server is showing a summary with Confirm / Cancel
 *   request:cancelled {}       the visitor cancelled the summary
 *   request:confirmed { … }    ONLY after the visitor pressed Confirm AND the server acknowledged
 *                              the write (`handoff.status === 'received'`). Never PII.
 *   request:unconfirmed { reason }  the server acknowledged a write the visitor did not confirm
 *                              (older server builds); request:confirmed is NOT fired.
 *   chat:handoff { message: '', channel }  after request:confirmed (reply line already shown)
 */

export const ENDPOINT = '/api/chat-inquiry';
export const CONTACT_LINE = 'email support@lavaall.com or WhatsApp +1 (737) 704-4182';
export const COPY = Object.freeze({
  greeting: {
    technology: "Hi, I'm the LAVAALL Assistant. How can I help you today?",
    web: "Hi, I'm the LAVAALL Web assistant. How can I help you today?",
  },
  footer: 'LAVAALL Assistant (Preview). Please do not share passwords or payment details.',
  busy: 'This chat is temporarily busy. Please try again shortly, or ' + CONTACT_LINE + '.',
  unavailable: 'I could not complete that just now. Please ' + CONTACT_LINE + '.',
  network: 'I could not reach the LAVAALL Assistant. Please check your connection, or ' + CONTACT_LINE + '.',
});

const CONFIRM_CHIP = /^(confirm|send|yes,? send( it)?)$/i;
const CANCEL_CHIP = /^(cancel|cancel request)$/i;
const CONFIRM_TEXT = /^(confirm|send|send it|yes|yes,? send( it)?|yes,? confirm|looks good)[.!]?$/i;

function hex(bytes) {
  return Array.prototype.map.call(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export class RealChatAdapter extends EventTarget {
  /**
   * @param {Object}   [options]
   * @param {Function} [options.fetch]   fetch implementation (defaults to globalThis.fetch)
   * @param {Object}   [options.crypto]  Web Crypto (defaults to globalThis.crypto)
   * @param {string}   [options.endpoint]
   * @param {string}   [options.site]    'technology' only; comes from the trusted route, never the visitor
   * @param {number}   [options.timeoutMs]
   * @param {number}   [options.listenMs]  pose-only pause before "thinking" (default 250ms)
   */
  constructor(options = {}) {
    super();
    this._fetch = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this._crypto = options.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    this._endpoint = options.endpoint || ENDPOINT;
    this._site = options.site === 'web' ? 'web' : 'technology';
    this._timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 20000;
    this._listenMs = Number.isFinite(options.listenMs) ? options.listenMs : 250;
    this._session = null;
    this._generation = 0;
    this._turnCount = 0;
    this._busy = false;
    this._reviewPending = false;
    this._timers = [];
    this.isReal = true;
  }

  // ── Copy used by ChatPanel instead of the demo strings ────────────
  greeting(variant) { return COPY.greeting[variant === 'web' ? 'web' : 'technology']; }
  get footerText() { return COPY.footer; }
  get turnCount() { return this._turnCount; }
  get reviewPending() { return this._reviewPending; }

  /** Public flags only. Resolves { enabled, environment }. Never throws. */
  async loadConfig() {
    if (!this._fetch) return { enabled: false, environment: 'disabled' };
    try {
      const response = await this._fetch(this._endpoint + '?action=config', { method: 'GET', credentials: 'include', cache: 'no-store' });
      if (!response.ok) return { enabled: false, environment: 'disabled' };
      const config = await response.json();
      const enabled = Boolean(config && config.CHAT_ENABLED === true && config.environment === 'preview');
      return { enabled, environment: config && config.environment };
    } catch (_) {
      return { enabled: false, environment: 'disabled' };
    }
  }

  send(userText) {
    const text = String(userText || '').trim().slice(0, 2000);
    if (!text || this._busy) return;
    this._busy = true;
    this._turnCount++;
    const generation = this._generation;
    const confirming = this._reviewPending && CONFIRM_TEXT.test(text);
    const cancelling = this._reviewPending && CANCEL_CHIP.test(text);

    this._emit('turn:start', { text });
    this._emit('chat:listening', { text });
    // Short listening beat (pose only), then thinking, then the network call. Ordering is
    // guaranteed: thinking always fires before the reply, however fast the server answers.
    new Promise(resolve => this._later(resolve, this._listenMs)).then(() => {
      if (generation !== this._generation) return null;
      this._emit('turn:thinking', {});
      this._emit('chat:thinking', {});
      return this._turn(text);
    }).then(result => {
      if (generation !== this._generation || result === null) return;
      this._busy = false;
      this._deliver(result, { confirming, cancelling });
    }, error => {
      if (generation !== this._generation) return;
      this._busy = false;
      this._fail(error);
    });
  }

  open() { this._emit('chat:open', {}); }

  close() {
    this._emit('chat:close', {});
    this.reset();
  }

  /** Cancel pending work; late responses from the old generation are ignored. */
  reset() {
    this._generation++;
    this._clearTimers();
    this._busy = false;
    this._turnCount = 0;
    this._reviewPending = false;
  }

  /** Test helper: same shape as the mock. */
  simulateError() {
    this._later(() => {
      this._emit('turn:error', { message: 'Simulated error (test helper)' });
      this._emit('chat:error', { message: COPY.unavailable });
    }, 0);
  }

  /** Test helper: a SIMULATED handoff. Never fires request:confirmed. */
  simulateHandoff() {
    this._later(() => {
      this._emit('request:simulated', { mock: true, source: 'simulateHandoff' });
      this._emit('chat:handoff', { message: 'Simulated handoff (test helper). No request was delivered.', channel: 'demo-mock', mock: true });
      this._emit('handoff:demo', { message: 'Simulated handoff (test helper). No request was delivered.', channel: 'demo-mock', mock: true });
    }, 0);
  }

  // ── Private ───────────────────────────────────────────────────────

  _deliver(result, { confirming, cancelling }) {
    const text = typeof result.text === 'string' && result.text.trim() ? result.text.slice(0, 4000) : COPY.unavailable;
    const chips = Array.isArray(result.chips) ? result.chips.filter(c => typeof c === 'string' && c.trim()).slice(0, 6) : [];
    const ack = result.handoff && typeof result.handoff === 'object' && result.handoff.status === 'received' ? result.handoff : null;

    if (result.reset) this._emit('chat:reset', {});
    this._emit('turn:response', { text, chips, reset: Boolean(result.reset), turnCount: this._turnCount });
    this._emit('chat:speaking', { text });
    this._emit('chat:chips', { chips });

    const wasReview = this._reviewPending;
    this._reviewPending = chips.some(c => CONFIRM_CHIP.test(c.trim())) && chips.some(c => CANCEL_CHIP.test(c.trim()));
    if (this._reviewPending) this._emit('request:review', { chips });
    if (cancelling && !ack) this._emit('request:cancelled', {});

    if (ack) {
      if (confirming && wasReview) {
        const detail = { route: String(ack.route || 'customer-success'), test: ack.test === true, channel: ack.test === true ? 'preview-test-sink' : 'customer-success' };
        this._emit('request:confirmed', detail);
        this._emit('chat:handoff', { message: '', channel: detail.channel, test: detail.test });
      } else {
        this._emit('request:unconfirmed', { reason: 'server-acknowledged-without-visitor-confirm' });
      }
    }
    this._emit('chat:idle', {});
  }

  _fail(error) {
    const code = error && error.code;
    const message = code === 'quota' || code === 'cost_cap' ? COPY.busy
      : code === 'network' || code === 'timeout' ? COPY.network : COPY.unavailable;
    this._emit('turn:error', { message: String(code || 'error') });
    this._emit('chat:error', { message, code: code || 'error' });
  }

  async _turn(text) {
    try {
      return await this._turnOnce(text);
    } catch (error) {
      // An expired 30-minute session is renewed once; everything else surfaces as an error.
      if (error && (error.code === 'session' || error.code === 'csrf')) {
        this._session = null;
        return this._turnOnce(text);
      }
      throw error;
    }
  }

  async _turnOnce(text) {
    const session = await this._ensureSession();
    return this._post('turn', { sessionId: session.sessionId, csrf: session.csrf, eventId: this._eventId(), text });
  }

  async _ensureSession() {
    if (this._session) return this._session;
    const session = await this._post('session', {});
    if (!session || typeof session.sessionId !== 'string' || typeof session.csrf !== 'string') throw this._error('session_unavailable');
    this._session = { sessionId: session.sessionId, csrf: session.csrf };
    return this._session;
  }

  _eventId() {
    if (!this._crypto || typeof this._crypto.getRandomValues !== 'function') throw this._error('random_unavailable');
    return hex(this._crypto.getRandomValues(new Uint8Array(32)));
  }

  async _post(action, body) {
    if (!this._fetch) throw this._error('network');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this._timeoutMs) : null;
    let response;
    try {
      response = await this._fetch(this._endpoint + '?action=' + action, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller ? controller.signal : undefined,
      });
    } catch (error) {
      throw this._error(error && error.name === 'AbortError' ? 'timeout' : 'network');
    } finally {
      if (timer) clearTimeout(timer);
    }
    let result = {};
    try { result = await response.json(); } catch (_) { result = {}; }
    if (!response.ok) throw this._error((result && typeof result.error === 'string' && result.error) || 'unavailable');
    return result && typeof result === 'object' ? result : {};
  }

  _error(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  _emit(eventName, detail) {
    let event;
    if (typeof CustomEvent !== 'undefined' && CustomEvent.prototype instanceof Event) {
      event = new CustomEvent(eventName, { detail, bubbles: false });
    } else {
      event = Object.assign(new Event(eventName), { detail });
    }
    this.dispatchEvent(event);
  }

  _later(fn, ms) {
    const id = setTimeout(() => {
      this._timers = this._timers.filter(t => t !== id);
      fn();
    }, ms);
    this._timers.push(id);
  }

  _clearTimers() {
    this._timers.forEach(id => clearTimeout(id));
    this._timers = [];
  }
}
