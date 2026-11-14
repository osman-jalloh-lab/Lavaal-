/**
 * LAVAALL Mascot Prototype — MockChatAdapter v1.2
 *
 * Simulates a chatbot turn sequence with canned responses.
 * No network calls. No fetch. No XMLHttpRequest. No LLM calls.
 *
 * ─────────────────────────────────────────────────────────────
 * // ADAPTER BOUNDARY
 * // To integrate with the real LAVAALL chatbot, replace this class
 * // with a RealChatAdapter that implements the same interface:
 * //
 * //   class RealChatAdapter extends EventTarget {
 * //     send(text)        — trigger a real chatbot turn
 * //     simulateError()   — (test use only)
 * //     simulateHandoff() — (test use only)
 * //     reset()           — cancel pending operations
 * //   }
 * //
 * // The RealChatAdapter should fire the same events defined below.
 * // The ChatPanel and MascotController listen for these events only;
 * // they do not need to know whether the adapter is mock or real.
 * //
 * // SECURITY NOTE: The adapter must never submit to api/contact or
 * // api/web/inquiry directly. Only the separately secured chatbot
 * // workflow (with server-issued one-time proof + explicit Send) may
 * // trigger form submission. See ARCHITECTURE.md and INTEGRATION_GUIDE.md.
 * ─────────────────────────────────────────────────────────────
 *
 * Events fired (on this adapter instance as EventTarget):
 *
 *   BOB_TASK.md events:
 *     chat:open       — chat panel opened
 *     chat:close      — chat panel closed
 *     chat:listening  — user turn received, processing
 *     chat:thinking   — generating response
 *     chat:speaking   — response ready, being delivered
 *     chat:idle       — turn complete, back to idle
 *     chat:error      — error occurred
 *     chat:handoff    — legacy event retained for compatibility (channel='demo-mock')
 *
 *   v1.2 P1-2: Renamed mock-specific events (no longer implies real delivery):
 *     handoff:demo        — mock handoff simulation (replaces chat:handoff in new code)
 *     request:simulated   — replaces request:confirmed; no real backend call was made
 *
 *   BOB_EXECUTE_ORIGINAL.md compatibility events:
 *     turn:start      — (same as chat:listening)
 *     turn:thinking   — (same as chat:thinking)
 *     turn:response   — response text available
 *     turn:error      — (same as chat:error)
 *
 *   NOTE: request:confirmed is reserved for a real backend acknowledgment.
 *   The mock adapter MUST NOT fire request:confirmed — it fires
 *   request:simulated instead to prevent callers from treating simulated
 *   events as real delivery confirmations.
 */

// Canned Q&A for demo (synthetic data only — no real customer data)
const CANNED_RESPONSES = [
  {
    keywords: ['hello', 'hi', 'hey', 'howdy', 'greet'],
    response: "Hello! I'm the LAVAALL Assistant demo. I can point you to LAVAALL Technology products and services, or to LAVAALL Web.",
  },
  {
    keywords: ['technology', 'hardware', 'network', 'server', 'computer', 'equipment', 'it', 'procurement'],
    response: "LAVAALL Technology covers IT hardware, networking and procurement. Product categories and the request-a-quote flow are on the main site.",
  },
  {
    keywords: ['web', 'website', 'automation', 'ai', 'digital', 'lava', 'build', 'online'],
    response: "LAVAALL Web builds websites, automations and AI solutions. Its site also has its own demo assistant, Lava.",
  },
  {
    keywords: ['contact', 'reach', 'email', 'whatsapp', 'phone', 'support', 'help', 'human'],
    response: "To reach a person, use the contact options on lavaall.com. This demo can't contact anyone or promise a response time.",
  },
  {
    keywords: ['price', 'cost', 'pricing', 'quote', 'how much', 'budget', 'cheap', 'expensive'],
    response: "Prices are only ever confirmed by the LAVAALL team in a quote. This demo can't quote or check stock.",
  },
  {
    keywords: ['request', 'order', 'quote', 'inquiry', 'send', 'submit', 'project', 'need'],
    response: "In the live version you'd review the details and press Send yourself. This demo doesn't collect or send anything, so please don't type personal details here.",
    isHandoff: true,
  },
];

const DEFAULT_RESPONSE = "Thanks! This is a canned demo. Try asking about technology, web, pricing or contact.";

function findResponse(text) {
  const lower = text.toLowerCase();
  for (const item of CANNED_RESPONSES) {
    if (item.keywords.some(kw => lower.includes(kw))) {
      return item;
    }
  }
  return { response: DEFAULT_RESPONSE, isHandoff: false };
}

export class MockChatAdapter extends EventTarget {
  constructor() {
    super();
    this._timers = [];
    this._turnCount = 0;
  }

  /**
   * Simulate a chatbot turn for the given user text.
   * Fires: chat:listening → chat:thinking → turn:response+chat:speaking → chat:idle
   */
  send(userText) {
    const text = String(userText || '').trim();
    if (!text) return;

    this._turnCount++;
    const match = findResponse(text);

    // Clear any previous pending timers
    this._clearTimers();

    // 300ms — user turn received
    this._addTimer(setTimeout(() => {
      this._emit('turn:start',     { text });
      this._emit('chat:listening', { text });
    }, 300));

    // 1400ms — thinking
    this._addTimer(setTimeout(() => {
      this._emit('turn:thinking', {});
      this._emit('chat:thinking', {});
    }, 1400));

    // 2800ms — response ready
    this._addTimer(setTimeout(() => {
      const response = match.response;
      this._emit('turn:response', { text: response, turnCount: this._turnCount });
      this._emit('chat:speaking',  { text: response });

      if (match.isHandoff) {
        // Small delay then fire handoff
        this._addTimer(setTimeout(() => {
          // P1-2: Fire request:simulated (NOT request:confirmed) — no real
          // submission was made. request:confirmed is reserved for a verified
          // backend acknowledgment only.
          this._emit('request:simulated', { text: response, mock: true });
          // Fire both the legacy event (for backward-compat) and the new
          // explicitly-named demo event. Callers should prefer handoff:demo.
          this._emit('chat:handoff', {
            message: "I'll pass your request to the LAVAALL team. (Demo only — nothing was sent.)",
            channel: 'demo-mock',
            mock: true,
          });
          this._emit('handoff:demo', {
            message: "Simulated handoff — demo only. No request was delivered.",
            channel: 'demo-mock',
            mock: true,
          });
        }, 1000));
      }
    }, 2800));

    // 4800ms — return to idle (or 5800ms if handoff)
    const idleDelay = match.isHandoff ? 5800 : 4800;
    this._addTimer(setTimeout(() => {
      this._emit('chat:idle', {});
    }, idleDelay));
  }

  /**
   * Simulate an error response (for testing).
   */
  simulateError() {
    this._clearTimers();
    this._addTimer(setTimeout(() => {
      this._emit('turn:error', { message: 'Simulated error — mock adapter only' });
      this._emit('chat:error', { message: 'Something went wrong. Please try again, or use the contact options on lavaall.com.' });
    }, 800));
  }

  /**
   * Simulate a handoff event (for testing).
   * P1-2: Fires handoff:demo (primary) and chat:handoff (legacy compat).
   * Does NOT fire request:confirmed — that is reserved for real backend acks.
   */
  simulateHandoff() {
    this._clearTimers();
    this._addTimer(setTimeout(() => {
      // P1-2: request:simulated makes clear this is a demo-only event.
      this._emit('request:simulated', { mock: true, source: 'simulateHandoff' });
      // Legacy compat event (channel='demo-mock' flags it as mock to ChatPanel).
      this._emit('chat:handoff', {
        message: "Simulated handoff — demo only. No request was delivered.",
        channel: 'demo-mock',
        mock: true,
      });
      // New explicitly-named event preferred by v1.2+ consumers.
      this._emit('handoff:demo', {
        message: "Simulated handoff — demo only. No request was delivered.",
        channel: 'demo-mock',
        mock: true,
      });
    }, 500));
  }

  /**
   * Fire chat:open event (call when panel opens).
   */
  open() {
    this._emit('chat:open', {});
  }

  /**
   * Fire chat:close event (call when panel closes).
   */
  close() {
    this._emit('chat:close', {});
    this.reset();
  }

  /**
   * Cancel all pending timers and reset state.
   */
  reset() {
    this._clearTimers();
    this._turnCount = 0;
  }

  // ── Private helpers ──────────────────────────────────────────────

  _emit(eventName, detail) {
    // Use global CustomEvent when available (browser), otherwise
    // construct a DOM-compatible event for Node.js's built-in EventTarget.
    let event;
    if (typeof CustomEvent !== 'undefined' && CustomEvent.prototype instanceof Event) {
      event = new CustomEvent(eventName, { detail, bubbles: false });
    } else {
      // Node.js built-in EventTarget requires a real Event instance
      event = Object.assign(new Event(eventName), { detail });
    }
    this.dispatchEvent(event);
  }

  _addTimer(id) {
    this._timers.push(id);
  }

  _clearTimers() {
    this._timers.forEach(id => clearTimeout(id));
    this._timers = [];
  }

  /** Number of turns in current session */
  get turnCount() { return this._turnCount; }
}
