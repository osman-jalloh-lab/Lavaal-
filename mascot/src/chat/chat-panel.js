/**
 * LAVAALL Mascot Prototype — ChatPanel v1.2
 *
 * Wires MascotController events to MockChatAdapter turns.
 * Renders conversation in an accessible dialog.
 * XSS-safe: all message text set via textContent only.
 * No form submission endpoints — this is display-only.
 *
 * v1.2 audit fixes (2026-11-11):
 *   P1-1:  Adapter listeners are now stored as named bound methods in
 *          _adapterListeners{} and removed cleanly in destroy().
 *          Anonymous registrations are completely replaced.
 *   P2-6:  Real `inert` attribute applied to all body direct-children
 *          that are not the panel or backdrop (not just a data-attribute).
 *          Original inert states are saved and restored on close().
 *   P2-7:  Timeout IDs from chat:idle and chat:error callbacks are tracked
 *          in this._timeouts[] and cleared on destroy() and close().
 *          Every callback guards on this._destroyed before acting.
 *   Handoff status copy updated to reflect demo-only / simulated
 *   (P1-2 companion change — event rename is in mock-chat-adapter.js).
 */

export class ChatPanel {
  /**
   * @param {Object} options
   * @param {import('../mascot/mascot-controller.js').MascotController} options.mascot
   * @param {import('./mock-chat-adapter.js').MockChatAdapter} options.adapter
   * @param {HTMLElement} options.container
   */
  constructor({ mascot, adapter, container }) {
    this._mascot    = mascot;
    this._adapter   = adapter;
    this._container = container;
    this._panel     = null;
    this._backdrop  = null;
    this._messageList = null;
    this._textarea  = null;
    this._sendBtn   = null;
    this._isOpen    = false;
    this._destroyed = false;
    this._previousFocus = null;       // save focus before opening
    this._timeouts  = [];             // P2-7: track all timeout IDs for cleanup
    this._inertedElements = [];       // P2-6: track elements we made inert
    this._boundOpenChat = () => { if (!this._isOpen && !this._destroyed) this.open(); };

    // P1-1: Pre-bind all adapter callbacks as named methods so they can be
    // stored and removed in destroy(). Anonymous closures cannot be removed.
    this._onListening  = this._handleListening.bind(this);
    this._onThinking   = this._handleThinking.bind(this);
    this._onSpeaking   = this._handleSpeaking.bind(this);
    this._onIdle       = this._handleIdle.bind(this);
    this._onError      = this._handleError.bind(this);
    this._onHandoff    = this._handleHandoff.bind(this);
    this._onHandoffDemo = this._handleHandoffDemo.bind(this); // P1-2: demo event
    // RealChatAdapter events (behaviour only; the mock never fires these).
    this._onChips      = this._handleChips.bind(this);
    this._onReset      = this._handleReset.bind(this);
    this._onReview     = this._handleReview.bind(this);

    // P1-1: Map of every registered adapter listener (eventName → handler fn).
    // Used in destroy() to remove them all cleanly.
    this._adapterListeners = {
      'chat:listening':  this._onListening,
      'chat:thinking':   this._onThinking,
      'chat:speaking':   this._onSpeaking,
      'chat:idle':       this._onIdle,
      'chat:error':      this._onError,
      'chat:handoff':    this._onHandoff,
      'handoff:demo':    this._onHandoffDemo,  // P1-2: renamed demo event
      'chat:chips':      this._onChips,
      'chat:reset':      this._onReset,
      'request:review':  this._onReview,
    };

    this._render();
    this._bindAdapterEvents();
    this._bindMascotEvents();
  }

  // ── Render ──────────────────────────────────────────────────────

  _render() {
    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'chat-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener('click', () => this.close());

    // Panel — use <dialog> semantics via role=dialog + aria-modal
    const panel = document.createElement('div');
    panel.className = 'chat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with LAVAALL Assistant');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('hidden', '');

    // Header
    const header = document.createElement('div');
    header.className = 'chat-header';

    const title = document.createElement('h2');
    title.className = 'chat-title';
    title.textContent = 'LAVAALL Assistant';
    title.id = 'chat-panel-title';
    this._title = title;
    panel.setAttribute('aria-labelledby', 'chat-panel-title');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'chat-close-btn';
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Status bar
    const status = document.createElement('div');
    status.className = 'chat-status';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    status.textContent = 'Ask me anything about LAVAALL';
    this._statusBar = status;

    // Message list
    const msgList = document.createElement('ul');
    msgList.className = 'chat-messages';
    msgList.setAttribute('role', 'log');
    msgList.setAttribute('aria-live', 'polite');
    msgList.setAttribute('aria-label', 'Conversation');
    this._messageList = msgList;

    // Typing indicator
    const typing = document.createElement('div');
    typing.className = 'chat-typing';
    typing.setAttribute('aria-live', 'polite');
    typing.setAttribute('hidden', '');
    typing.innerHTML = '<span></span><span></span><span></span>';
    this._typingIndicator = typing;

    // Input area
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';

    const textarea = document.createElement('textarea');
    textarea.className = 'chat-textarea';
    textarea.setAttribute('placeholder', 'Type your message…');
    textarea.setAttribute('maxlength', '500');
    textarea.setAttribute('aria-label', 'Your message');
    textarea.setAttribute('rows', '2');
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
    });
    this._textarea = textarea;

    const sendBtn = document.createElement('button');
    sendBtn.className = 'chat-send-btn';
    sendBtn.setAttribute('type', 'button');
    sendBtn.setAttribute('aria-label', 'Send message');
    sendBtn.textContent = '→';
    sendBtn.addEventListener('click', () => this._sendMessage());
    this._sendBtn = sendBtn;

    inputArea.appendChild(textarea);
    inputArea.appendChild(sendBtn);

    // Footer disclaimer
    const footer = document.createElement('p');
    footer.className = 'chat-footer';
    footer.textContent = this._adapter && typeof this._adapter.footerText === 'string'
      ? this._adapter.footerText
      : 'Demo only — no real messages sent. Powered by LAVAALL mock adapter.';

    // Assemble panel
    panel.appendChild(header);
    panel.appendChild(status);
    panel.appendChild(msgList);
    panel.appendChild(typing);
    // Suggestion chips from the real backend (e.g. Confirm / Cancel). Hidden when empty.
    // No styles are added here; the look is left to the design owner.
    const chips = document.createElement('div');
    chips.className = 'chat-chips';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Suggested replies');
    chips.setAttribute('hidden', '');
    this._chipBar = chips;
    panel.appendChild(chips);
    panel.appendChild(inputArea);
    panel.appendChild(footer);

    this._backdrop = backdrop;
    this._panel    = panel;

    this._container.appendChild(backdrop);
    this._container.appendChild(panel);

    // Keyboard: Tab is trapped inside the panel.
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') this._trapFocus(e);
    });
    // v1.3.1: Escape is handled at document level while open, so it still closes
    // the dialog even if focus has fallen out of it.
    this._onDocKeydown = (e) => {
      if (e.key === 'Escape' && this._isOpen) { e.preventDefault(); this.close(); }
    };
  }

  // ── Open / Close ────────────────────────────────────────────────

  open() {
    if (this._isOpen || this._destroyed) return;
    this._isOpen = true;

    // Save the element that had focus before opening the dialog.
    this._previousFocus = document.activeElement;

    this._panel.removeAttribute('hidden');
    this._backdrop.removeAttribute('hidden');
    this._backdrop.style.display = 'block';

    // P2-6: Apply real `inert` to all body direct-child elements that are
    // outside the dialog so screen readers cannot escape the modal.
    // We save the previous inert state so close() can restore accurately.
    this._inertedElements = [];
    const mascotContainer = this._mascot && this._mascot._container;
    document.body.querySelectorAll(':scope > *').forEach(el => {
      if (el === this._panel || el === this._backdrop) return;
      const wasInert = el.hasAttribute('inert');
      if (!wasInert) {
        el.setAttribute('inert', '');
        this._inertedElements.push(el);
      }
    });
    // Also inert the mascot container if it is not a direct body child.
    if (mascotContainer && !this._inertedElements.includes(mascotContainer)) {
      const wasInert = mascotContainer.hasAttribute('inert');
      if (!wasInert) {
        mascotContainer.setAttribute('inert', '');
        this._inertedElements.push(mascotContainer);
      }
    }

    // Update variant label
    const variant = this._mascot ? this._mascot.variant : 'technology';
    const label = variant === 'web'
      ? 'Chat with LAVAALL Web assistant'
      : 'Chat with LAVAALL Assistant';
    this._panel.setAttribute('aria-label', label);
    this._panel.setAttribute('data-variant', variant);
    if (this._title) this._title.textContent = this._assistantName();
    this._setStatus(this._assistantName());
    // v1.3.1: start a fresh transcript when the skin changed since the last open.
    if (this._lastVariant && this._lastVariant !== variant) {
      while (this._messageList.firstChild) this._messageList.removeChild(this._messageList.firstChild);
    }
    this._lastVariant = variant;

    // Greet (v1.3: names from CHARACTER_BIBLE; existing "Lava" product untouched)
    this._appendMessage('bot', this._adapter && typeof this._adapter.greeting === 'function'
      ? this._adapter.greeting(variant)
      : (variant === 'web'
        ? "Hi! I'm the LAVAALL Web assistant demo. Canned answers only."
        : "Hi! I'm the LAVAALL Assistant demo. Canned answers only."));
    this._mascot && this._mascot.setState('wave');
    this._mascot && this._mascot.setMessage('Need a hand?');

    // Focus close button
    requestAnimationFrame(() => {
      const closeBtn = this._panel.querySelector('.chat-close-btn');
      if (closeBtn) closeBtn.focus();
    });

    if (typeof document.addEventListener === 'function') {
      document.addEventListener('keydown', this._onDocKeydown);
    }

    this._adapter && this._adapter.open();
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;

    // P2-7: Clear any pending timeouts so they don't act on removed UI.
    this._clearTimeouts();
    if (typeof document.removeEventListener === 'function') {
      document.removeEventListener('keydown', this._onDocKeydown);
    }

    this._panel.setAttribute('hidden', '');
    this._backdrop.style.display = 'none';

    // P2-6: Remove inert from all elements we made inert during open().
    this._inertedElements.forEach(el => el.removeAttribute('inert'));
    this._inertedElements = [];

    this._mascot && this._mascot.setState('idle');
    this._mascot && this._mascot.setMessage('');
    this._adapter && this._adapter.close();

    window.dispatchEvent(new CustomEvent('mascot:close-chat'));

    // Restore focus to element that was focused before dialog opened.
    if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
      this._previousFocus.focus();
    }
    this._previousFocus = null;
  }

  // ── Message handling ────────────────────────────────────────────

  _sendMessage() {
    if (this._busy) return;   // v1.3.1: a reply is in progress
    const text = this._textarea.value.trim();
    if (!text) return;
    this._textarea.value = '';
    this._sendText(text);
  }

  /** Shared by the Send button and suggestion chips. */
  _sendText(text) {
    if (this._busy || this._destroyed) return;
    const value = String(text || '').trim();
    if (!value) return;
    this._renderChips([]);
    this._appendMessage('user', value);
    this._textarea && this._textarea.focus();
    this._setSendEnabled(false);
    this._adapter && this._adapter.send(value);
  }

  _appendMessage(role, text) {
    const li = document.createElement('li');
    li.className = `chat-message chat-message--${role}`;
    li.setAttribute('role', 'listitem');

    const bubble = document.createElement('div');
    bubble.className = 'chat-message-bubble';
    const value = String(text).slice(0, role === 'bot' ? 4000 : 1000);
    if (role === 'bot' && value.includes('**')) {
      // **key words** from the backend become <strong> nodes. Still XSS-safe: text nodes only.
      value.split(/(\*\*[^*]+\*\*)/).forEach(part => {
        if (!part) return;
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          const strong = document.createElement('strong');
          strong.textContent = part.slice(2, -2);
          bubble.appendChild(strong);
        } else {
          if (typeof document.createTextNode === 'function') {
            bubble.appendChild(document.createTextNode(part));
          } else {
            const span = document.createElement('span');
            span.textContent = part;
            bubble.appendChild(span);
          }
        }
      });
    } else {
      // XSS-safe: textContent only
      bubble.textContent = value;
    }

    li.appendChild(bubble);
    this._messageList.appendChild(li);

    // Scroll to bottom
    this._messageList.scrollTop = this._messageList.scrollHeight;
  }

  /** Bible names: "LAVAALL Assistant" (Technology) / "LAVAALL Web assistant" (Web). */
  _assistantName() {
    return this._mascot && this._mascot.variant === 'web' ? 'LAVAALL Web assistant' : 'LAVAALL Assistant';
  }

  _setStatus(text) {
    if (this._statusBar) {
      this._statusBar.textContent = String(text).slice(0, 100);
    }
  }

  /**
   * v1.3.1: The textarea is made read-only (not disabled) during a reply.
   * Disabling the focused element threw keyboard focus out of the modal onto
   * <body>, which broke Escape and the Tab trap while the page stayed inert.
   */
  _setSendEnabled(enabled) {
    this._busy = !enabled;
    if (this._textarea) {
      this._textarea.readOnly = !enabled;
      this._textarea.setAttribute('aria-busy', String(!enabled));
    }
    if (this._sendBtn) {
      if (!enabled && typeof document !== 'undefined' && document.activeElement === this._sendBtn && this._textarea) {
        this._textarea.focus();   // never strand focus on a button we are about to disable
      }
      this._sendBtn.disabled = !enabled;
    }
  }

  _showTyping(show) {
    if (!this._typingIndicator) return;
    if (show) {
      this._typingIndicator.removeAttribute('hidden');
      this._messageList.scrollTop = this._messageList.scrollHeight;
    } else {
      this._typingIndicator.setAttribute('hidden', '');
    }
  }

  // P2-7: Track timeout IDs so they can be cleared on destroy/close.
  _setTimeout(fn, ms) {
    const id = setTimeout(() => {
      // Remove the id from the tracking list when it fires.
      this._timeouts = this._timeouts.filter(t => t !== id);
      fn();
    }, ms);
    this._timeouts.push(id);
    return id;
  }

  _clearTimeouts() {
    this._timeouts.forEach(id => clearTimeout(id));
    this._timeouts = [];
  }

  // ── Adapter event handlers (P1-1: named bound methods) ──────────

  _handleListening() {
    if (this._destroyed) return;  // P2-7: guard
    // v1.3: text chat, no microphone. Don't imply audio listening.
    this._setStatus('Reading your message…');
    this._mascot && this._mascot.setState('listen');
  }

  _handleThinking() {
    if (this._destroyed) return;
    this._setStatus('Thinking…');
    this._showTyping(true);
    this._mascot && this._mascot.setState('think');
  }

  _handleSpeaking(e) {
    if (this._destroyed) return;
    this._setStatus(this._assistantName());
    this._showTyping(false);
    this._setSendEnabled(true);
    const text = e.detail && e.detail.text ? e.detail.text : '';
    if (text) {
      this._appendMessage('bot', text);
      this._mascot && this._mascot.setState('speak');
      const plain = text.replace(/\*\*/g, '');
      this._mascot && this._mascot.setMessage(plain.slice(0, 60) + (plain.length > 60 ? '…' : ''));
    }
  }

  _handleIdle() {
    if (this._destroyed) return;
    this._setSendEnabled(true);
    this._showTyping(false);
    // P2-7: Use tracked timeout; guard on _destroyed in the callback.
    this._setTimeout(() => {
      if (!this._destroyed) {
        this._mascot && this._mascot.setState('idle');
        this._mascot && this._mascot.setMessage('');
      }
    }, 1500);
  }

  _handleError(e) {
    if (this._destroyed) return;
    this._setStatus('Error — please try again');
    this._showTyping(false);
    this._setSendEnabled(true);
    const msg = e.detail && e.detail.message
      ? e.detail.message
      : 'Something went wrong. Please try again, or use the contact options on lavaall.com.';
    this._appendMessage('bot', msg);
    this._mascot && this._mascot.setState('error');
    // P2-7: Use tracked timeout; guard on _destroyed in the callback.
    this._setTimeout(() => {
      if (!this._destroyed) {
        this._mascot && this._mascot.setState('idle');
      }
    }, 2500);
  }

  _handleHandoff(e) {
    if (this._destroyed) return;
    // chat:handoff is still supported for adapter compatibility.
    // If channel is 'demo-mock' it came from the old simulateHandoff path;
    // treat it the same as handoff:demo.
    // A real adapter sends message '' because the server's thank-you line is already shown.
    const realAck = e.detail && e.detail.message === '' && e.detail.channel && e.detail.channel !== 'demo-mock';
    const msg = e.detail && e.detail.message
      ? e.detail.message
      : "I'm connecting you with the LAVAALL team. They'll follow up shortly.";
    if (!realAck) this._appendMessage('bot', msg);
    this._mascot && this._mascot.setState('happy');
    // P1-2: Do NOT claim confirmed delivery from a mock event.
    // "Request queued (demo only)" is explicit about being simulated.
    const channel = (e.detail && e.detail.channel) || '';
    if (channel === 'demo-mock' || channel === '') {
      this._setStatus('Request queued (demo only — no real submission)');
    } else {
      // Real backend would use a different channel value.
      this._setStatus('Request noted — team will follow up');
    }
  }

  _handleHandoffDemo(e) {
    if (this._destroyed) return;
    // P1-2: handoff:demo is the renamed event from MockChatAdapter.
    // Explicitly labelled as demo/simulated — no delivery claim.
    const msg = e.detail && e.detail.message
      ? e.detail.message
      : "I'll pass your request to the LAVAALL team.";
    this._appendMessage('bot', msg);
    this._mascot && this._mascot.setState('happy');
    this._setStatus('Simulated request (demo only — nothing was sent)');
  }

  _handleChips(e) {
    if (this._destroyed) return;
    this._renderChips(e.detail && Array.isArray(e.detail.chips) ? e.detail.chips : []);
  }

  _handleReset() {
    if (this._destroyed || !this._messageList) return;
    // New topic: keep the greeting and the visitor's latest message, drop earlier turns.
    const items = Array.from(this._messageList.children || []);
    const lastUser = items.filter(li => String(li.className || '').includes('chat-message--user')).pop();
    items.forEach((li, index) => { if (index !== 0 && li !== lastUser) li.remove(); });
  }

  _handleReview() {
    if (this._destroyed) return;
    this._setStatus('Please check the details, then choose Confirm or Cancel.');
  }

  _renderChips(chips) {
    const bar = this._chipBar;
    if (!bar) return;
    while (bar.firstChild) bar.removeChild(bar.firstChild);
    const list = (chips || []).filter(c => typeof c === 'string' && c.trim()).slice(0, 6);
    list.forEach(label => {
      const button = document.createElement('button');
      button.setAttribute('type', 'button');
      button.className = 'chat-chip';
      button.textContent = label.slice(0, 80);
      button.addEventListener('click', () => this._sendText(label));
      bar.appendChild(button);
    });
    if (list.length) bar.removeAttribute('hidden'); else bar.setAttribute('hidden', '');
    if (this._messageList) this._messageList.scrollTop = this._messageList.scrollHeight;
  }

  // ── Adapter event binding (P1-1) ─────────────────────────────────

  _bindAdapterEvents() {
    if (!this._adapter) return;
    // P1-1: Register each handler by the stored named reference.
    // destroy() will remove these using the exact same references.
    Object.entries(this._adapterListeners).forEach(([evt, fn]) => {
      this._adapter.addEventListener(evt, fn);
    });
  }

  // ── Mascot event binding ─────────────────────────────────────────

  _bindMascotEvents() {
    window.addEventListener('mascot:open-chat', this._boundOpenChat);
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  /**
   * Remove all event listeners and clean up DOM.
   * Call when unmounting the chat panel.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._isOpen) this.close();

    // P2-7: Cancel any outstanding timeouts before they can act on removed DOM.
    this._clearTimeouts();

    // Remove window listener
    window.removeEventListener('mascot:open-chat', this._boundOpenChat);

    // P1-1: Remove all adapter listeners using the stored named references.
    if (this._adapter) {
      Object.entries(this._adapterListeners).forEach(([evt, fn]) => {
        this._adapter.removeEventListener(evt, fn);
      });
      this._adapterListeners = {};
    }

    // Remove DOM
    if (this._panel)    { this._panel.remove();    this._panel    = null; }
    if (this._backdrop) { this._backdrop.remove(); this._backdrop = null; }
  }

  // ── Focus trap ───────────────────────────────────────────────────

  _trapFocus(e) {
    const focusable = Array.from(
      this._panel.querySelectorAll('button, textarea, [tabindex="0"]')
    ).filter(el => !el.hasAttribute('disabled') && !el.hasAttribute('hidden'));

    if (!focusable.length) return;

    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /** true if panel is currently open */
  get isOpen() { return this._isOpen; }
}
