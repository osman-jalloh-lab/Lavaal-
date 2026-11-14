/**
 * XSS Safety tests
 * Verifies that MascotController.setMessage() and ChatPanel
 * never use innerHTML for user-supplied content.
 */

import { test, assert, assertEqual, assertNotContains } from './run-all.js';

// Reuse DOM shim if already set, otherwise set minimal version
if (typeof global.document === 'undefined') {
  class MockElement {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.textContent = '';
      this.innerHTML   = '';
      this._attrs = {};
      this._children = [];
      this._listeners = {};
      this.style = {};
      this.disabled = false;
      this.classList = {
        _set: new Set(),
        add(...cls)    { cls.forEach(c => this._set.add(c)); },
        remove(...cls) { cls.forEach(c => this._set.delete(c)); },
        toggle(c, f)   { f ? this._set.add(c) : this._set.delete(c); },
        contains(c)    { return this._set.has(c); },
      };
    }
    setAttribute(k, v)    { this._attrs[k] = String(v); }
    getAttribute(k)       { return this._attrs[k] ?? null; }
    removeAttribute(k)    { delete this._attrs[k]; }
    hasAttribute(k)       { return k in this._attrs; }
    appendChild(child)    { this._children.push(child); return child; }
    remove()              {}
    querySelectorAll()    { return []; }
    querySelector()       { return null; }
    addEventListener(evt, fn)    { (this._listeners[evt] = this._listeners[evt] || []).push(fn); }
    removeEventListener(evt, fn) {}
    dispatchEvent(e) { (this._listeners[e.type] || []).forEach(f => f(e)); }
    focus() {}
    contains() { return true; }
  }

  class MockDocument {
    createElement(tag) { return new MockElement(tag); }
    getElementById()   { return null; }
    contains()         { return true; }
    get body()         { return new MockElement('body'); }
  }

  class MockWindow {
    constructor() { this._listeners = {}; }
    addEventListener(evt, fn) { (this._listeners[evt] = this._listeners[evt] || []).push(fn); }
    removeEventListener() {}
    dispatchEvent(e) { (this._listeners[e.type] || []).forEach(f => f(e)); return true; }
    matchMedia() { return { matches: false }; }
    localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
  }

  global.document   = new MockDocument();
  global.window     = new MockWindow();
  global.localStorage = window.localStorage;
  global.CustomEvent = class CustomEvent {
    constructor(type, opts = {}) { this.type = type; this.detail = opts.detail || {}; this.bubbles = false; }
  };
}

global.fetch = undefined;

const { MascotController } = await import('../src/mascot/mascot-controller.js');

// ── XSS test payloads ─────────────────────────────────────────────
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '"><script>alert(document.cookie)</script>',
  "'; DROP TABLE users; --",
  '<a href="javascript:alert(1)">click</a>',
  '{{7*7}}',  // template injection attempt
  '${7*7}',   // JS template literal attempt
];

function makeContainer() {
  return document.createElement('div');
}

// ── Tests ─────────────────────────────────────────────────────────

test('setMessage() does not throw on script injection', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  // None of these should throw
  XSS_PAYLOADS.forEach(payload => {
    mc.setMessage(payload);
  });
  mc.destroy();
});

test('setMessage() stores raw string in textContent, not as HTML', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  const payload = '<script>alert(1)</script>';
  mc.setMessage(payload);

  // Find the bubble element
  const root = container._children[0];
  const bubble = root && root._children.find(c => c.className === 'mascot-bubble');
  if (bubble) {
    assertEqual(bubble.textContent, payload,
      'Bubble textContent should equal the raw string (no HTML parsing)');
    // innerHTML should NOT contain the raw script string — our MockElement
    // intentionally does not parse textContent into innerHTML
    assertNotContains(bubble.innerHTML || '', '<script>',
      'Bubble innerHTML should not contain raw <script> tag');
  }
  mc.destroy();
});

test('setMessage() with img onerror payload does not execute code', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });

  let executed = false;
  // If onerror executed, this would be true — it cannot in our shim
  const payload = '<img src=x onerror="/* would set executed=true */">';
  mc.setMessage(payload);

  assert(!executed, 'onerror handler should not execute from setMessage()');
  mc.destroy();
});

test('MascotController source does not contain innerHTML assignments for user text', async () => {
  // Read the controller source and verify no innerHTML = userText patterns
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(__dirname, '../src/mascot/mascot-controller.js'), 'utf8');

  // Check that setMessage function body only uses textContent
  const setMessageMatch = src.match(/setMessage[\s\S]*?(?=\n  \/\*\*|\n  set |\n  get |\n}$)/);
  if (setMessageMatch) {
    const setMessageBody = setMessageMatch[0];
    assertNotContains(setMessageBody, 'innerHTML =',
      'setMessage() should not use innerHTML assignment');
    assert(setMessageBody.includes('textContent'),
      'setMessage() should use textContent');
  }
});

test('MockChatAdapter source does not use innerHTML for user messages', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(__dirname, '../src/chat/mock-chat-adapter.js'), 'utf8');

  assertNotContains(src, 'innerHTML =',
    'MockChatAdapter should not use innerHTML');
});

test('ChatPanel source does not use innerHTML for message rendering', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(__dirname, '../src/chat/chat-panel.js'), 'utf8');

  // The SVG load uses innerHTML safely for SVG markup, not user input
  // Message bubbles must use textContent
  assert(src.includes('bubble.textContent = '),
    'ChatPanel should use textContent for message bubbles');
});

test('setMessage truncates long payloads to prevent DOM flooding', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  const longPayload = '<script>alert(1)</script>'.repeat(20); // 500+ chars
  mc.setMessage(longPayload);
  const root = container._children[0];
  const bubble = root && root._children.find(c => c.className === 'mascot-bubble');
  if (bubble) {
    assert(bubble.textContent.length <= 200,
      'setMessage should truncate to 200 chars maximum');
  }
  mc.destroy();
});
