'use strict';
// PR #83 (Osman, Nov 14): after the name step, "What would you like to talk to the team about?" offers
// compact topic chips. A chip tap fills the topic and goes straight to Confirm; only "Something else"
// asks one short free-text question. Typed topics are still accepted. 0 model calls, chat bar visible.
// Local only: Bob's ChatPanel + RealChatAdapter against the real api/chat-inquiry handler over loopback
// with an in-memory store. Stubbed model and transport; no network beyond 127.0.0.1.
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

  const TOPIC_Q = 'What would you like to talk to the team about?';
  const OTHER_Q = 'What would you like to talk about?';
  const CHIPS = ['Customer service', 'Request a call', 'Get a quote', 'Order help', 'Something else', 'Cancel request'];
  const THANKS = 'Thank you, someone from our team will reach out to you shortly.';
  const summary = topic => 'Please confirm your details: Name: Ada Test. Contact: +23276123456. Topic: ' + topic + '. Shall I pass this to our team?';
  const toTopic = async t => {
    await t.type('I want to speak to someone');
    await t.chip('WhatsApp');
    await t.type('076 123 456');
    assert.equal(await t.type('Ada Test'), TOPIC_Q);
    assert.deepEqual(t.chipLabels(), CHIPS);
    t.barUsable('topic chip step');
  };
  const lastSink = async () => { const rows = await sinks(); assert.equal(rows.length, 1, 'one test-sink record'); return JSON.stringify(rows[0][1]); };

  try {
    // Each direct chip: tap -> Confirm summary with the chip label as the topic -> Confirm -> exact thank-you.
    for (const label of ['Customer service', 'Request a call', 'Get a quote', 'Order help']) {
      const t = makePanel();
      await toTopic(t);
      assert.equal(await t.chip(label), summary(label));
      assert.deepEqual(t.chipLabels(), ['Confirm', 'Cancel']);
      t.barUsable(label + ' Confirm step');
      assert.equal((await sinks()).length, 0, 'nothing written before Confirm');
      assert.equal(await t.chip('Confirm'), THANKS);
      assert.deepEqual(t.events, ['request:review', 'request:confirmed']);
      assert.ok((await lastSink()).includes('"productOrService":"' + label + '"'), label + ' fills the topic field');
      t.barUsable(label + ' thank-you');
    }
    console.log('ok - each topic chip fills the topic and goes to Confirm, then the exact thank-you');

    // Something else: one free-text question, the typed answer becomes the topic.
    let t = makePanel();
    await toTopic(t);
    assert.equal(await t.chip('Something else'), OTHER_Q);
    assert.deepEqual(t.chipLabels(), ['Cancel request']);
    t.barUsable('Something else text step');
    assert.equal(await t.type('x'.repeat(301)), OTHER_Q, 'over-long free text is re-asked');
    assert.equal(await t.type('<b>Solar</b> for our clinic'), summary('<b>Solar</b> for our clinic'));
    // Plain text in the panel: the bubble holds the text, no markup is parsed.
    const bubble = t.panel._messageList.children.at(-1);
    assert.ok(!/<b>/.test(bubble.innerHTML || ''), 'summary is not rendered as HTML');
    assert.equal(await t.type('yes'), THANKS);
    assert.ok((await lastSink()).includes('Solar'));
    t.barUsable('Something else thank-you');
    console.log('ok - Something else asks one short text question; capped at 300; the answer is the topic');

    // Typing a topic in the bar at the chip step is still accepted.
    t = makePanel();
    await toTopic(t);
    assert.equal(await t.type('a laptop for our office'), summary('a laptop for our office'));
    assert.equal(await t.chip('Confirm'), THANKS);
    // Typed chip text (any case, trailing dot) maps to the fixed server label.
    t = makePanel();
    await toTopic(t);
    assert.equal(await t.type('order HELP.'), summary('Order help'));
    // Cancel request still works from the chip step.
    t = makePanel();
    await toTopic(t);
    assert.equal(await t.chip('Cancel request'), 'Request cancelled. What else can I help with?');
    assert.equal(t.events.includes('request:confirmed'), false);
    console.log('ok - typed topics accepted at the chip step; typed chip text maps to the fixed label; Cancel request works');

    assert.equal(modelCalls, 0);
    assert.equal(transportCalls, 0);
    console.log('ok - 0 model calls, 0 transport calls on every chip path');
  } finally {
    server.close();
  }

  // Backend unit checks: French labels, Krio mirrors the WhatsApp/Email chips (English), quote path unchanged,
  // re-asks keep the chips, and the stored topic is always the server's own label.
  const { guidedHandoff, handoffChips, topicChipIndex, TOPIC_CHIPS } = require('../api/_chat/conversation');
  const { respond } = require('../api/_chat/responder');
  const walk = (language, kind) => {
    let session = { lastLanguage: language };
    const turn = (text, start) => { const r = guidedHandoff(text, session, start); session = { ...session, awaiting: r.awaiting, handoffDraft: r.handoffDraft }; return r; };
    turn('begin', kind || true); turn('Email'); turn('ada@example.test');
    return { first: turn('Ada Test'), turn, get session() { return session; } };
  };
  let w = walk('fr');
  assert.deepEqual(w.first.chips, ['Service client', 'Demander un appel', 'Obtenir un devis', 'Aide pour une commande', 'Autre chose', 'Cancel request']);
  assert.equal(w.turn('Autre chose').text, 'De quoi souhaitez-vous parler ?');
  assert.match(w.turn('Une imprimante').text, /sujet : Une imprimante\./);
  w = walk('fr');
  assert.match(w.turn('Service client').text, /sujet : Service client\./);
  w = walk('fr');
  assert.match(w.turn('Customer service').text, /sujet : Service client\./, 'an English label tap in French stores the French label');
  w = walk('kr');
  assert.deepEqual(w.first.chips, TOPIC_CHIPS.en.concat('Cancel request'));
  assert.equal(w.turn('Something else').text, 'Wetin yu wan tɔk abawt?');
  w = walk('en', 'quote');
  assert.equal(w.first.text, 'What would you like a quote for?');
  assert.deepEqual(w.first.chips, ['Cancel request'], 'quote flow keeps its free-text question');
  assert.match(w.turn('Something else').text, /Topic: Something else\./, 'quote flow does not treat chip text specially');
  w = walk('en');
  assert.deepEqual(w.turn('').chips, TOPIC_CHIPS.en.concat('Cancel request'), 'empty re-ask keeps the chips');
  assert.deepEqual(handoffChips(w.session), TOPIC_CHIPS.en.concat('Cancel request'));
  // A blocked (sensitive) message at the chip step re-asks with the same chips.
  const blocked = respond('my card is 4111 1111 1111 1111', { awaiting: 'handoff-topic', handoffDraft: w.session.handoffDraft, lastLanguage: 'en' });
  assert.ok(blocked.text.endsWith(TOPIC_Q));
  assert.deepEqual(blocked.chips, TOPIC_CHIPS.en.concat('Cancel request'));
  assert.equal(topicChipIndex('Customer service<script>'), -1, 'only exact fixed labels count as a chip');
  assert.equal(topicChipIndex('  something ELSE! '), 4);
  console.log('ok - French labels, Krio English chips, quote flow unchanged, re-asks keep chips, fixed server labels');
})().catch(error => { console.error(error); process.exitCode = 1; });
