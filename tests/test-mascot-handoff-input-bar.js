'use strict';
// PR #83 single chat experience: the mascot chat bar (textarea + send) stays in the panel, visible
// and usable at every step of the conversational handoff form (channel chips, contact, name, topic,
// Confirm/Cancel summary, thank-you). Text typed in the bar mid-form answers the current question.
// Local only: Bob's ChatPanel + RealChatAdapter against the real api/chat-inquiry handler over
// loopback with an in-memory store. Stubbed model and transport; no network beyond 127.0.0.1.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHandler } = require('../api/chat-inquiry');
const { memoryStore } = require('../api/_chat/store');

// Minimal DOM shim: enough for ChatPanel's render, messages, chips and send state.
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.className = ''; this.textContent = ''; this.innerHTML = ''; this.children = []; this.parentNode = null; this._attrs = {}; this._on = {}; this.style = {}; this.disabled = false; this.readOnly = false; this.value = ''; this.scrollTop = 0; this.scrollHeight = 0; this.id = ''; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return k in this._attrs; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  addEventListener(t, f) { (this._on[t] = this._on[t] || []).push(f); }
  removeEventListener(t, f) { this._on[t] = (this._on[t] || []).filter(x => x !== f); }
  click() { (this._on.click || []).forEach(f => f({ type: 'click' })); }
  focus() { globalThis.document.activeElement = this; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  contains() { return true; }
  get innerText() { return this.textContent + this.children.map(c => c.innerText).join(''); }
}
const doc = { body: new El('body'), activeElement: null, createElement: t => new El(t), createTextNode: t => { const n = new El('#text'); n.textContent = t; return n; }, getElementById: () => null, addEventListener() {}, removeEventListener() {}, contains: () => true };
globalThis.document = doc;
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, matchMedia: () => ({ matches: false }) };

function visibleInPanel(panel, el) {
  // Visible = attached to the panel, no [hidden], no inline display:none on it or any ancestor.
  for (let n = el; n; n = n.parentNode) {
    if (n.hasAttribute('hidden') && n !== panel) return false;
    if (n.style && n.style.display === 'none') return false;
    if (n === panel) return true;
  }
  return false;
}

(async () => {
  const { RealChatAdapter } = await import(pathToFileURL(path.join(__dirname, '../mascot/src/chat/real-chat-adapter.js')).href);
  const { ChatPanel } = await import(pathToFileURL(path.join(__dirname, '../mascot/src/chat/chat-panel.js')).href);
  let store = memoryStore();
  let modelCalls = 0, transportCalls = 0;
  const chat = async () => { modelCalls++; throw new Error('no model call expected in the handoff form'); };
  const transport = async () => { transportCalls++; throw new Error('transport must never be called'); };
  let handler;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', async () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const shim = { statusCode: 200, setHeader(k, v) { res.setHeader(k, v); }, status(c) { this.statusCode = c; return this; }, send(b) { res.statusCode = this.statusCode; res.end(b); } };
      await handler({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body: raw || undefined }, shim);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  // A fresh in-memory store per visitor keeps the unchanged hour/day caps from limiting this local test.
  const freshBackend = () => { store = memoryStore(); handler = createHandler({ runtime: 'test', localTests: true, CHAT_ENABLED: true, store, transport, chat, trustedOrigins: [origin], salt: 'TEST ONLY salt' }); };
  let cookie = '';
  const browserFetch = async (url, init = {}) => {
    const headers = { ...(init.headers || {}), Origin: origin };
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(origin + url, { method: init.method, headers, body: init.body });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return response;
  };

  const sinks = () => store.transaction(rows => [...rows].filter(([k]) => k.startsWith('test-handoff:')));
  const mascot = { variant: 'technology', setState() {}, setMessage() {} };

  function makePanel() {
    cookie = '';
    freshBackend();
    const adapter = new RealChatAdapter({ fetch: browserFetch, crypto: require('node:crypto').webcrypto, listenMs: 0 });
    const container = new El('div');
    const panel = new ChatPanel({ mascot, adapter, container });
    const events = [];
    ['request:review', 'request:confirmed', 'request:unconfirmed'].forEach(n => adapter.addEventListener(n, () => events.push(n)));
    const idle = () => new Promise(resolve => {
      const done = () => { adapter.removeEventListener('chat:idle', done); adapter.removeEventListener('chat:error', done); resolve(); };
      adapter.addEventListener('chat:idle', done); adapter.addEventListener('chat:error', done);
    });
    const p = panel._panel;
    const lastBot = () => { const bots = panel._messageList.children.filter(li => li.className.includes('chat-message--bot')); return bots.length ? bots.at(-1).innerText : ''; };
    const chipLabels = () => panel._chipBar.hasAttribute('hidden') ? [] : panel._chipBar.children.map(c => c.textContent);
    // Type in the bar and press Send, exactly like a visitor.
    const type = async text => { const wait = idle(); panel._textarea.value = text; panel._sendBtn.click(); await wait; return lastBot(); };
    const chip = async label => { const wait = idle(); const b = panel._chipBar.children.find(c => c.textContent === label); assert.ok(b, 'chip ' + label + ' in ' + chipLabels()); b.click(); await wait; return lastBot(); };
    const barUsable = step => {
      const area = p.children.find(c => c.className === 'chat-input-area');
      assert.ok(area, step + ': input area is in the panel');
      assert.ok(visibleInPanel(p, area), step + ': input area visible');
      assert.ok(visibleInPanel(p, panel._textarea) && visibleInPanel(p, panel._sendBtn), step + ': textarea and send visible');
      assert.equal(panel._textarea.readOnly, false, step + ': textarea writable');
      assert.equal(panel._sendBtn.disabled, false, step + ': send enabled');
      // The form's chips render in the panel above the bar, never instead of it.
      assert.ok(p.children.indexOf(panel._chipBar) < p.children.indexOf(area), step + ': chips sit above the bar');
    };
    return { panel, events, type, chip, chipLabels, barUsable };
  }

  try {
    // Full form through the bar: channel chip, then every answer typed in the bar.
    let t = makePanel();
    t.barUsable('greeting');
    assert.equal(await t.type('I want to speak to someone'), 'WhatsApp or email?');
    assert.deepEqual(t.chipLabels(), ['WhatsApp', 'Email']);
    t.barUsable('channel chips');
    assert.equal(await t.chip('WhatsApp'), 'What is your WhatsApp number, with country code?');
    t.barUsable('contact question');
    // Off-topic text mid-form answers the current question: the backend re-asks it.
    assert.equal(await t.type('how much is the iPhone 15?'), 'Please enter a valid WhatsApp number with country code.');
    t.barUsable('contact re-ask');
    assert.equal(await t.type('076 123 456'), 'Can I get your first and last name?');
    t.barUsable('name question');
    assert.equal(await t.type('Ada Test'), 'What would you like to talk to the team about?');
    t.barUsable('topic question');
    assert.equal(await t.type('a laptop for our office'), 'Please confirm your details: Name: Ada Test. Contact: +23276123456. Topic: a laptop for our office. Shall I pass this to our team?');
    assert.deepEqual(t.chipLabels(), ['Confirm', 'Cancel']);
    t.barUsable('Confirm step');
    assert.deepEqual(t.events, ['request:review']);
    assert.equal((await sinks()).length, 0, 'nothing written before Confirm');
    // Typing "yes" in the bar at the Confirm step is the same as the Confirm chip.
    assert.equal(await t.type('yes'), 'Thank you, someone from our team will reach out to you shortly.');
    assert.deepEqual(t.events, ['request:review', 'request:confirmed']);
    assert.equal((await sinks()).length, 1, 'one Preview test-sink record after Confirm');
    t.barUsable('thank-you');
    console.log('ok - chat bar visible and usable at every handoff step; typed answers fill the form; typed "yes" confirms');

    // Confirm chip path + cancel typed in the bar.
    t = makePanel();
    await t.type('I want to speak to someone');
    await t.chip('Email');
    await t.type('ada@example.test');
    await t.type('Ada Test');
    await t.type('a router');
    assert.equal(await t.chip('Confirm'), 'Thank you, someone from our team will reach out to you shortly.');
    assert.deepEqual(t.events, ['request:review', 'request:confirmed']);
    t.barUsable('thank-you after chip');
    t = makePanel();
    await t.type('I want to speak to someone');
    await t.chip('WhatsApp');
    assert.equal(await t.type('cancel'), 'Request cancelled. What else can I help with?');
    t.barUsable('after typed cancel');
    assert.equal(t.events.includes('request:confirmed'), false);
    console.log('ok - Confirm chip and typed cancel keep the bar; no confirm without Confirm');

    // New #83 head through the mascot: the company pitch (3a3d525) and the knowledge pack both answer
    // with 0 model calls, and product-qualified asks still reach catalogue discovery.
    t = makePanel();
    assert.match(await t.type('What does LAVAALL do?'), /^LAVAALL is a quote-first technology marketplace.*Would you like a quick form for your project\?$/);
    assert.match(await t.type('Do you work in Guinea?'), /^Yes, we work in Guinea\./);
    assert.match(await t.type('iPhone 16'), /iPhone 16/);
    assert.doesNotMatch(await t.type('want phone'), /don't carry|do not carry/i);
    t.barUsable('after company and catalogue turns');
    console.log('ok - mascot on the new head: company pitch, knowledge pack and catalogue via the bar, 0 model calls');

    // Static guard: nothing in the panel code or CSS hides the bar.
    const js = fs.readFileSync(path.join(__dirname, '../mascot/src/chat/chat-panel.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../mascot/src/chat/chat-panel.css'), 'utf8');
    assert.doesNotMatch(js, /inputArea\.(setAttribute\('hidden'|hidden\s*=|style\.display)/);
    assert.doesNotMatch(css, /\.chat-input-area[^{]*\{[^}]*display:\s*none/);
    assert.equal(modelCalls, 0);
    assert.equal(transportCalls, 0);
    console.log('ok - 0 model calls, 0 transport calls; no code path hides the chat bar');
  } finally {
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
