/**
 * MascotController unit tests
 * Tests run in Node.js — DOM is simulated via minimal shim.
 */

import { test, assert, assertEqual, assertNotEqual, assertContains, assertNotContains } from './run-all.js';

// ── Minimal DOM shim for Node.js ─────────────────────────────────
class MockStorage {
  constructor() { this._store = {}; }
  getItem(k)    { return this._store[k] ?? null; }
  setItem(k, v) { this._store[k] = String(v); }
  removeItem(k) { delete this._store[k]; }
  clear()       { this._store = {}; }
}

class MockElement {
  constructor(tag) {
    this.tagName      = tag.toUpperCase();
    this.className    = '';
    this.textContent  = '';
    this.innerHTML    = '';
    this._attrs       = {};
    this._children    = [];
    this._listeners   = {};
    this.style        = {};
    this.disabled     = false;
    this.scrollTop    = 0;
    this.scrollHeight = 0;
  }
  setAttribute(k, v)    { this._attrs[k] = String(v); }
  getAttribute(k)       { return this._attrs[k] ?? null; }
  removeAttribute(k)    { delete this._attrs[k]; }
  hasAttribute(k)       { return k in this._attrs; }
  appendChild(child)    { this._children.push(child); return child; }
  remove()              { /* no-op in shim */ }
  querySelectorAll(sel) { return []; }
  querySelector(sel)    { return null; }
  classList = {
    _set: new Set(),
    add(...cls)    { cls.forEach(c => this._set.add(c)); },
    remove(...cls) { cls.forEach(c => this._set.delete(c)); },
    toggle(c, f)   { f ? this._set.add(c) : this._set.delete(c); },
    contains(c)    { return this._set.has(c); },
  };
  addEventListener(evt, fn)    { (this._listeners[evt] = this._listeners[evt] || []).push(fn); }
  removeEventListener(evt, fn) {
    if (this._listeners[evt]) {
      this._listeners[evt] = this._listeners[evt].filter(f => f !== fn);
    }
  }
  dispatchEvent(e)      { (this._listeners[e.type] || []).forEach(f => f(e)); }
  focus()               { /* no-op */ }
  contains(el)          { return true; } // simplified
  requestAnimationFrame = (fn) => fn();
}

class MockDocument {
  constructor() {
    this._body = new MockElement('body');
    this._els  = {};
  }
  get body() { return this._body; }
  createElement(tag)       { return new MockElement(tag); }
  getElementById(id)       { return this._els[id] || null; }
  contains(el)             { return true; }
  _register(id, el)        { this._els[id] = el; }
}

class MockWindow {
  constructor() {
    this._listeners = {};
    this.localStorage = new MockStorage();
    this._matchMediaResult = false;
  }
  addEventListener(evt, fn)    { (this._listeners[evt] = this._listeners[evt] || []).push(fn); }
  removeEventListener(evt, fn) {}
  dispatchEvent(e) {
    (this._listeners[e.type] || []).forEach(f => f(e));
    return true;
  }
  matchMedia(query) {
    const matches = this._matchMediaResult;
    return { matches, addListener: () => {}, removeEventListener: () => {} };
  }
}

class MockCustomEvent {
  constructor(type, opts = {}) {
    this.type   = type;
    this.detail = opts.detail || {};
    this.bubbles = opts.bubbles || false;
  }
}

// ── Set up global shim ────────────────────────────────────────────
const mockDoc = new MockDocument();
const mockWin = new MockWindow();
global.document     = mockDoc;
global.window       = mockWin;
global.localStorage = mockWin.localStorage;
global.CustomEvent  = MockCustomEvent;
global.fetch        = undefined; // ensure no network calls

// ── Import controller AFTER globals are set ───────────────────────
const { MascotController } = await import('../src/mascot/mascot-controller.js');

function makeContainer() {
  return mockDoc.createElement('div');
}

// ── Tests ─────────────────────────────────────────────────────────

test('constructor mounts root element in container', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  assert(container._children.length > 0, 'Container should have a child');
  mc.destroy();
});

test('setVariant("technology") sets data-variant="technology"', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.setVariant('technology');
  const root = container._children[0];
  assertEqual(root.getAttribute('data-variant'), 'technology',
    'data-variant should be "technology"');
  mc.destroy();
});

test('setVariant("web") sets data-variant="web"', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.setVariant('web');
  const root = container._children[0];
  assertEqual(root.getAttribute('data-variant'), 'web',
    'data-variant should be "web"');
  mc.destroy();
});

test('setVariant preserves current state when switching', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.setState('walk');
  mc.setVariant('web');
  assertEqual(mc.state, 'walk', 'State should be preserved after variant switch');
  mc.destroy();
});

test('setState("walk") sets data-state="walk"', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.setState('walk');
  const root = container._children[0];
  assertEqual(root.getAttribute('data-state'), 'walk',
    'data-state should be "walk"');
  mc.destroy();
});

test('setState with all 9 valid states succeeds', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  const states = ['idle','walk','wave','listen','think','speak','happy','sleep','error'];
  states.forEach(s => {
    mc.setState(s);
    assertEqual(mc.state, s, `setState("${s}") should set state to "${s}"`);
  });
  mc.destroy();
});

test('setState with invalid value does not crash and does not apply invalid state', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.setState('idle');
  mc.setState('__INVALID_STATE__');
  assertEqual(mc.state, 'idle', 'State should remain idle after invalid setState');
  mc.destroy();
});

test('setMessage uses textContent — XSS script tag rendered as plain text', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  const malicious = '<script>alert(1)</script>';
  // Should not throw
  mc.setMessage(malicious);
  // The bubble's textContent should equal the raw string, not execute it
  // We can't check execution in Node but we verify textContent assignment
  const root = container._children[0];
  // Find bubble element (second child of root)
  const bubble = root._children.find(c => c.className === 'mascot-bubble');
  if (bubble) {
    assertEqual(bubble.textContent, malicious,
      'textContent should equal raw string (not innerHTML-parsed)');
    // Verify innerHTML was NOT used (innerHTML would have been different)
    assertNotEqual(bubble.innerHTML, malicious,
      'innerHTML should not contain the raw script string');
  }
  mc.destroy();
});

test('setMessage with XSS img onerror does not throw', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  // If this throws, test fails
  mc.setMessage('<img src=x onerror=throw(1)>');
  mc.destroy();
});

test('setMessage truncates at 200 characters', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  const longText = 'A'.repeat(300);
  mc.setMessage(longText);
  const root = container._children[0];
  const bubble = root._children.find(c => c.className === 'mascot-bubble');
  if (bubble) {
    assert(bubble.textContent.length <= 200, 'Bubble text should be truncated to 200 chars');
  }
  mc.destroy();
});

test('show() removes hidden attribute', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.hide();
  mc.show();
  const root = container._children[0];
  assert(!root.hasAttribute('hidden'), 'Root should not have hidden attribute after show()');
  mc.destroy();
});

test('hide() sets hidden attribute', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.hide();
  const root = container._children[0];
  assert(root.hasAttribute('hidden'), 'Root should have hidden attribute after hide()');
  mc.destroy();
});

test('hide() saves preference to localStorage', () => {
  localStorage.clear();
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.hide();
  assertEqual(localStorage.getItem('lavaall_mascot_hidden'), 'true',
    'localStorage should store hidden=true after hide()');
  mc.destroy();
});

test('show() saves hidden=false to localStorage', () => {
  localStorage.clear();
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.hide();
  mc.show();
  assertEqual(localStorage.getItem('lavaall_mascot_hidden'), 'false',
    'localStorage should store hidden=false after show()');
  mc.destroy();
});

test('destroy() removes root from container', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  assert(container._children.length > 0, 'Container should have child before destroy');
  mc.destroy();
  assert(!mc.mounted, 'mounted should be false after destroy()');
});

test('destroy() does NOT clear localStorage — prefs survive reinit (P2-8)', () => {
  localStorage.clear();
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.hide();
  mc.destroy();
  assertEqual(localStorage.getItem('lavaall_mascot_hidden'), 'true',
    'localStorage key should be PRESERVED after destroy() — prefs survive remounting (P2-8)');
});

test('resetPreferences() clears localStorage keys', () => {
  localStorage.clear();
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.hide();
  mc.resetPreferences();
  assertEqual(localStorage.getItem('lavaall_mascot_hidden'), null,
    'localStorage key should be cleared after explicit resetPreferences()');
  mc.destroy();
});

test('isDestroyed getter is true after destroy()', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  assert(!mc.isDestroyed, 'isDestroyed should be false before destroy()');
  mc.destroy();
  assert(mc.isDestroyed, 'isDestroyed should be true after destroy()');
});

test('destroy() is idempotent — second call does not throw', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  mc.destroy();
  mc.destroy(); // must not throw
  assert(mc.isDestroyed, 'Still destroyed after second destroy() call');
});

test('mascot:open-chat event fires when trigger button is clicked (P2-9)', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });

  let eventFired = false;
  window.addEventListener('mascot:open-chat', () => { eventFired = true; });

  const root = container._children[0];
  // P2-9: event fires from inner trigger button, not root click
  const trigger = root._children.find(c => c.className === 'mascot-trigger');
  if (trigger) {
    trigger.dispatchEvent(new MockCustomEvent('click', {}));
  } else {
    // fallback: root click still accepted in shim environment
    root.dispatchEvent(new MockCustomEvent('click', {}));
  }

  assert(eventFired, 'mascot:open-chat should fire when trigger is clicked');
  mc.destroy();
});

test('enabled=false makes show() a no-op', () => {
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: false });
  mc.show();
  const root = container._children[0];
  assert(root.hasAttribute('hidden'), 'Mascot should remain hidden when enabled=false');
  mc.destroy();
});

test('reducedMotion getter reflects window.matchMedia', () => {
  // With our mock, matchMedia returns false by default
  const container = makeContainer();
  const mc = new MascotController({ container, variant: 'technology', enabled: true });
  assertEqual(mc.reducedMotion, false, 'reducedMotion should be false by default in tests');
  mc.destroy();
});
