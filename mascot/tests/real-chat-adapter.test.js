/**
 * RealChatAdapter + adapter selection + ChatPanel behaviour with the real adapter.
 * Uses an in-memory fake of /api/chat-inquiry. No network, no model, no paid calls.
 */
import { test, assert, assertEqual, assertContains, assertNotContains, registerAsync } from './run-all.js';

// ── DOM shim with real child lists (panel tests) ─────────────────
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.className = ''; this._text = ''; this.innerHTML = '';
    this._attrs = {}; this.children = []; this.parent = null; this._listeners = {}; this.style = {};
    this.disabled = false; this.readOnly = false; this.value = ''; this.scrollTop = 0; this.scrollHeight = 0;
    const set = new Set();
    this.classList = { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), toggle: (c, f) => (f ? set.add(c) : set.delete(c)), contains: c => set.has(c) };
  }
  get textContent() { return this.children.length ? this.children.map(c => c.textContent).join('') : this._text; }
  set textContent(v) { this.children = []; this._text = String(v); }
  get firstChild() { return this.children[0] || null; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k] ?? null; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k) { return k in this._attrs; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; return c; }
  remove() { if (this.parent) this.parent.removeChild(this); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener(e, f) { (this._listeners[e] = this._listeners[e] || []).push(f); }
  removeEventListener(e, f) { this._listeners[e] = (this._listeners[e] || []).filter(x => x !== f); }
  dispatchEvent(e) { (this._listeners[e.type] || []).forEach(f => f(e)); return true; }
  click() { this.dispatchEvent({ type: 'click' }); }
  focus() {}
  contains() { return true; }
}
class TextNode { constructor(t) { this.textContent = String(t); this.tagName = '#text'; } }
function installDom() {
  const body = new El('body');
  body.querySelectorAll = () => [];
  const doc = { body, activeElement: null, createElement: t => new El(t), createTextNode: t => new TextNode(t), getElementById: () => null, addEventListener() {}, removeEventListener() {}, contains: () => true };
  const listeners = {};
  const win = {
    addEventListener: (e, f) => (listeners[e] = listeners[e] || []).push(f),
    removeEventListener: (e, f) => (listeners[e] = (listeners[e] || []).filter(x => x !== f)),
    dispatchEvent: e => { (listeners[e.type] || []).forEach(f => f(e)); return true; },
    matchMedia: () => ({ matches: false, addListener() {}, removeEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  global.document = doc; global.window = win; global.localStorage = win.localStorage;
  global.requestAnimationFrame = fn => fn();
  global.CustomEvent = class { constructor(type, o = {}) { this.type = type; this.detail = o.detail || {}; } };
  return doc;
}
installDom();

const { RealChatAdapter, COPY } = await import('../src/chat/real-chat-adapter.js');
const { MockChatAdapter } = await import('../src/chat/mock-chat-adapter.js');
const { selectChatAdapter, DEFAULT_FLAGS } = await import('../src/chat/adapter-select.js');
const { ChatPanel } = await import('../src/chat/chat-panel.js');

const NAME_Q = 'Yes, sure. Can I get your first and last name?';
const CLOSE = 'Thank you, someone from our team will reach out to you shortly.';
const wait = ms => new Promise(r => setTimeout(r, ms));
const cryptoStub = { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 255; return a; } };

/** In-memory fake of /api/chat-inquiry. `reply(text, n)` returns { status, body } for each turn. */
function fakeServer(reply, { config = { CHAT_ENABLED: true, environment: 'preview' } } = {}) {
  const calls = [];
  let sessions = 0;
  const fetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const respond = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (url === '/api/chat-inquiry?action=config') return config instanceof Error ? Promise.reject(config) : respond(200, config);
    if (url === '/api/chat-inquiry?action=session') { sessions++; return respond(200, { sessionId: String(sessions).padStart(64, 'a'), csrf: 'c'.repeat(64) }); }
    if (url === '/api/chat-inquiry?action=turn') {
      const turns = calls.filter(c => c.url.endsWith('action=turn')).length;
      const out = await reply(JSON.parse(init.body).text, turns);
      if (out instanceof Error) throw out;
      return respond(out.status || 200, out.body);
    }
    return respond(404, { error: 'not_found' });
  };
  return { fetch, calls, get sessions() { return sessions; } };
}

function record(adapter) {
  const events = [];
  for (const name of ['turn:start', 'chat:listening', 'turn:thinking', 'chat:thinking', 'turn:response', 'chat:speaking', 'chat:chips', 'chat:reset', 'chat:idle', 'chat:error', 'turn:error', 'chat:handoff', 'handoff:demo', 'request:review', 'request:confirmed', 'request:unconfirmed', 'request:cancelled', 'request:simulated']) {
    adapter.addEventListener(name, e => events.push({ name, detail: e.detail }));
  }
  return events;
}
const names = events => events.map(e => e.name);
async function turn(adapter, text) { adapter.send(text); await wait(15); }
const make = server => new RealChatAdapter({ fetch: server.fetch, crypto: cryptoStub, listenMs: 0 });

// ── Interface and animation events ───────────────────────────────

test('R-1: RealChatAdapter has the same public interface as MockChatAdapter', () => {
  const real = new RealChatAdapter({ fetch: async () => ({}) });
  assert(real instanceof EventTarget, 'extends EventTarget');
  for (const m of ['send', 'open', 'close', 'reset', 'simulateError', 'simulateHandoff']) {
    assertEqual(typeof real[m], 'function', m);
    assertEqual(typeof MockChatAdapter.prototype[m], 'function', 'mock ' + m);
  }
});

registerAsync(test('R-2: a turn fires listening → thinking → response/speaking → idle, in order', async () => {
  const server = fakeServer(() => ({ body: { text: 'We stock **Dell** laptops in our catalogue. Which model?' } }));
  const a = make(server); const ev = record(a);
  await turn(a, 'laptops');
  assertEqual(names(ev).join(','), 'turn:start,chat:listening,turn:thinking,chat:thinking,turn:response,chat:speaking,chat:chips,chat:idle');
  assertEqual(ev.find(e => e.name === 'chat:speaking').detail.text, 'We stock **Dell** laptops in our catalogue. Which model?');
}));

registerAsync(test('R-3: chat:* animation events match the mock 1:1 for a normal turn', async () => {
  const mock = new MockChatAdapter(); const mockEv = record(mock);
  mock.send('hello'); await wait(5000); mock.reset();
  const server = fakeServer(() => ({ body: { text: 'Hello.' } }));
  const real = make(server); const realEv = record(real);
  await turn(real, 'hello');
  const anim = list => names(list).filter(n => ['chat:listening', 'chat:thinking', 'chat:speaking', 'chat:idle'].includes(n));
  assertEqual(anim(realEv).join(','), anim(mockEv).join(','));
}));

registerAsync(test('R-4: only /api/chat-inquiry config/session/turn; cookie credentials; one session; 64-hex event ids', async () => {
  const server = fakeServer(() => ({ body: { text: 'ok' } }));
  const a = make(server);
  await turn(a, 'one'); await turn(a, 'two');
  assertEqual(server.sessions, 1, 'session reused');
  for (const c of server.calls) {
    assert(c.url.startsWith('/api/chat-inquiry?action='), c.url);
    assert(!/review|confirm|draft|contact|inquiry\?action=(?!session|turn|config)/.test(c.url), 'no review/confirm/draft: ' + c.url);
    assertEqual(c.init.credentials, 'include');
  }
  const turns = server.calls.filter(c => c.url.endsWith('turn'));
  assertEqual(turns.length, 2);
  assert(/^[a-f0-9]{64}$/.test(turns[0].body.eventId), 'event id');
  assertEqual(Object.keys(turns[0].body).sort().join(','), 'csrf,eventId,sessionId,text');
}));

registerAsync(test('R-5: spend cap / quota / disabled / network errors map to safe chat:error copy', async () => {
  for (const [out, expected] of [[{ status: 429, body: { error: 'cost_cap' } }, COPY.busy], [{ status: 429, body: { error: 'quota' } }, COPY.busy],
    [{ status: 503, body: { error: 'chat_disabled' } }, COPY.unavailable], [new TypeError('offline'), COPY.network]]) {
    const a = make(fakeServer(() => out)); const ev = record(a);
    await turn(a, 'hi');
    const err = ev.find(e => e.name === 'chat:error');
    assert(err, 'chat:error fired');
    assertEqual(err.detail.message, expected);
    assertContains(err.detail.message, 'support@lavaall.com');
    assert(!names(ev).includes('chat:speaking'), 'no speaking on error');
  }
}));

registerAsync(test('R-6: an expired session is renewed once and the turn succeeds', async () => {
  const server = fakeServer((text, n) => (n === 1 ? { status: 403, body: { error: 'session' } } : { body: { text: 'renewed' } }));
  const a = make(server); const ev = record(a);
  await turn(a, 'hi');
  assertEqual(server.sessions, 2);
  assertEqual(ev.find(e => e.name === 'chat:speaking').detail.text, 'renewed');
}));

registerAsync(test('R-7: reset() during a turn drops the late reply', async () => {
  const server = fakeServer(async () => { await wait(30); return { body: { text: 'late' } }; });
  const a = make(server); const ev = record(a);
  a.send('hi'); await wait(5); a.reset(); await wait(60);
  assert(!names(ev).includes('chat:speaking'), 'late reply ignored');
}));

registerAsync(test('R-8: chips and topic reset are forwarded', async () => {
  const a = make(fakeServer(() => ({ body: { text: 'New topic.', chips: ['iPhone', 'Samsung', 7], reset: true } })));
  const ev = record(a);
  await turn(a, 'phones');
  assertEqual(ev.find(e => e.name === 'chat:chips').detail.chips.join('|'), 'iPhone|Samsung');
  assert(names(ev).includes('chat:reset'));
}));

// ── Handoff confirmation ─────────────────────────────────────────

// Emulates the #83 handoff with an explicit Confirm step (Mark's local work): the sink is written
// and acknowledged only on the Confirm turn.
// Mark's #83 handoff: WhatsApp/email chips, then one contact field, name, topic, Confirm/Cancel, then ack.
const CHANNEL_Q = 'WhatsApp or email?';
const CONFIRM_Q = 'Please confirm your details: Name: Ada Test. Contact: +23276000000. Topic: a laptop for our office. Shall I pass this to our team?';
function handoffTurns() {
  return ['I want to speak to someone', 'WhatsApp', '+23276000000', 'Ada Test', 'a laptop for our office'];
}
function handoffServer({ ackWithoutConfirm = false, ackOnConfirm = true } = {}) {
  let step = 0;
  return fakeServer(text => {
    if (/speak to someone/i.test(text)) { step = 1; return { body: { text: CHANNEL_Q, chips: ['WhatsApp', 'Email'] } }; }
    if (step === 1) {
      if (!/^(whatsapp|email|e-mail)$/i.test(text)) return { body: { text: CHANNEL_Q, chips: ['WhatsApp', 'Email'] } };
      step = 2;
      return { body: { text: /^email/i.test(text) ? 'What is your email address?' : 'What is your WhatsApp number, with country code?' } };
    }
    if (step === 2) { step = 3; return { body: { text: 'Can I get your first and last name?' } }; }
    if (step === 3) { step = 4; return { body: { text: 'What would you like to talk to the team about?' } }; }
    if (step === 4) {
      step = 5;
      if (ackWithoutConfirm) return { body: { text: CLOSE, handoff: { status: 'received', test: true, route: 'customer-success' } } };
      return { body: { text: CONFIRM_Q, chips: ['Confirm', 'Cancel'] } };
    }
    if (step === 5 && /^confirm$/i.test(text)) { step = 0; return { body: ackOnConfirm ? { text: CLOSE, handoff: { status: 'received', test: true, route: 'customer-success' } } : { text: CLOSE } }; }
    if (step === 5 && /^cancel$/i.test(text)) { step = 0; return { body: { text: 'Request cancelled. What else can I help with?' } }; }
    return { body: { text: 'ok', handoff: { status: 'received', test: true, route: 'customer-success' } } };
  });
}

registerAsync(test('C-1: request:confirmed fires once, only after Confirm and the server ack, with no personal data', async () => {
  const a = make(handoffServer()); const ev = record(a);
  await turn(a, 'I want to speak to someone');
  assertEqual(ev.filter(e => e.name === 'chat:chips').pop().detail.chips.join('|'), 'WhatsApp|Email');
  assert(!names(ev).includes('request:review'), 'channel chips are not a Confirm/Cancel review');
  assert(!a.reviewPending);
  await turn(a, 'WhatsApp');
  await turn(a, '+23276000000');
  await turn(a, 'Ada Test');
  await turn(a, 'a laptop for our office');
  assert(names(ev).includes('request:review'), 'review shown');
  assert(a.reviewPending, 'review pending');
  assert(!names(ev).includes('request:confirmed'), 'not confirmed before Confirm');
  await turn(a, 'Confirm');
  const confirmed = ev.filter(e => e.name === 'request:confirmed');
  assertEqual(confirmed.length, 1);
  assertEqual(JSON.stringify(confirmed[0].detail), JSON.stringify({ route: 'customer-success', test: true, channel: 'preview-test-sink' }));
  assertNotContains(JSON.stringify(ev.filter(e => e.name.startsWith('request:'))), 'Ada');
  const handoff = ev.find(e => e.name === 'chat:handoff');
  assertEqual(handoff.detail.message, '');
  assertEqual(ev.filter(e => e.name === 'chat:speaking').pop().detail.text, CLOSE);
}));

registerAsync(test('C-2: a server that writes without a Confirm step never triggers request:confirmed', async () => {
  const a = make(handoffServer({ ackWithoutConfirm: true })); const ev = record(a);
  for (const t of handoffTurns()) await turn(a, t);
  assert(!names(ev).includes('request:confirmed'));
  assert(names(ev).includes('request:unconfirmed'));
}));

registerAsync(test('C-3: Confirm without a server ack does not fire request:confirmed', async () => {
  const a = make(handoffServer({ ackOnConfirm: false })); const ev = record(a);
  for (const t of handoffTurns()) await turn(a, t); await turn(a, 'Confirm');
  assert(!names(ev).includes('request:confirmed'));
}));

registerAsync(test('C-4: typing Confirm with no summary on screen does not fire request:confirmed', async () => {
  const a = make(handoffServer()); const ev = record(a);
  await turn(a, 'Confirm');
  assert(!names(ev).includes('request:confirmed'));
}));

registerAsync(test('C-5: Cancel clears the summary and fires request:cancelled', async () => {
  const a = make(handoffServer()); const ev = record(a);
  for (const t of handoffTurns()) await turn(a, t); await turn(a, 'Cancel');
  assert(names(ev).includes('request:cancelled'));
  assert(!names(ev).includes('request:confirmed'));
  assert(!a.reviewPending);
}));

registerAsync(test('C-6: simulateHandoff is labelled simulated and never fires request:confirmed', async () => {
  const a = make(fakeServer(() => ({ body: { text: 'x' } }))); const ev = record(a);
  a.simulateHandoff(); await wait(10);
  assert(names(ev).includes('request:simulated'));
  assert(!names(ev).includes('request:confirmed'));
}));

registerAsync(test('C-7: WhatsApp/email chips are forwarded and never treated as Confirm/Cancel', async () => {
  const a = make(handoffServer()); const ev = record(a);
  await turn(a, 'I want to speak to someone');
  assertEqual(ev.filter(e => e.name === 'chat:chips').pop().detail.chips.join('|'), 'WhatsApp|Email');
  assert(!names(ev).includes('request:review'));
  assert(!names(ev).includes('request:confirmed'));
  assert(!a.reviewPending);
  await turn(a, 'Email');
  assertEqual(ev.filter(e => e.name === 'chat:speaking').pop().detail.text, 'What is your email address?');
  assert(!names(ev).includes('request:review'));
  assert(!a.reviewPending);
}));

// ── Flag / selection ─────────────────────────────────────────────

registerAsync(test('F-1: the real adapter is OFF by default and gated on route + server config', async () => {
  const on = { MASCOT_REAL_ADAPTER: true };
  const server = fakeServer(() => ({ body: { text: 'x' } }));
  assertEqual(DEFAULT_FLAGS.MASCOT_REAL_ADAPTER, false);
  assertEqual((await selectChatAdapter({ location: { pathname: '/' }, fetch: server.fetch })).mode, 'mock');
  assertEqual((await selectChatAdapter({ flags: on, location: { pathname: '/web' }, fetch: server.fetch })).reason, 'web-not-approved');
  assertEqual((await selectChatAdapter({ flags: on, location: { pathname: '/' }, fetch: fakeServer(() => ({}), { config: { CHAT_ENABLED: false, environment: 'preview' } }).fetch })).reason, 'server-disabled');
  assertEqual((await selectChatAdapter({ flags: on, location: { pathname: '/' }, fetch: fakeServer(() => ({}), { config: { CHAT_ENABLED: true, environment: 'production' } }).fetch })).reason, 'server-disabled');
  assertEqual((await selectChatAdapter({ flags: on, location: { pathname: '/' }, fetch: fakeServer(() => ({}), { config: new TypeError('offline') }).fetch })).reason, 'server-disabled');
  const real = await selectChatAdapter({ flags: on, location: { pathname: '/' }, fetch: server.fetch, crypto: cryptoStub });
  assertEqual(real.mode, 'real');
  assert(real.adapter instanceof RealChatAdapter);
  assert(server.calls.every(c => c.url.endsWith('action=config')), 'selection only reads public config');
}));

// ── ChatPanel with the real adapter (behaviour only) ─────────────
// Other suites swap the global DOM shim from their own async tests, so panel tests run one at a
// time after those have finished, each on a fresh shim.
let panelQueue = wait(6000);
function serial(fn) {
  const run = panelQueue.then(() => { installDom(); return fn(); });
  panelQueue = run.catch(() => {});
  return run;
}

function panelWith(adapter) {
  const doc = installDom();
  const mascotStates = [];
  const mascot = { variant: 'technology', setState: s => mascotStates.push(s), setMessage() {} };
  const panel = new ChatPanel({ mascot, adapter, container: doc.body });
  return { panel, doc, mascotStates };
}
const bubbles = panel => panel._messageList.children.map(li => ({ role: li.className.includes('--user') ? 'user' : 'bot', text: li.children[0].textContent, node: li.children[0] }));

registerAsync(test('P-1: real adapter greeting and footer replace the demo copy', () => serial(() => {
  const a = make(fakeServer(() => ({ body: { text: 'x' } })));
  const { panel } = panelWith(a);
  panel.open();
  assertEqual(bubbles(panel)[0].text, "Hi, I'm the LAVAALL Assistant. How can I help you today?");
  const footer = panel._panel.children.find(c => c.className === 'chat-footer');
  assertNotContains(footer.textContent, 'Demo only');
  panel.destroy();
})));

registerAsync(test('P-2: Confirm chip sends "Confirm"; real ack adds no extra bubble', () => serial(async () => {
  const a = make(handoffServer()); const ev = record(a);
  const { panel, mascotStates } = panelWith(a);
  panel.open();
  for (const t of handoffTurns()) { panel._sendText(t); await wait(15); }
  const chipButtons = panel._chipBar.children;
  assertEqual(chipButtons.map(b => b.textContent).join('|'), 'Confirm|Cancel');
  assert(!panel._chipBar.hasAttribute('hidden'), 'chips visible');
  const summary = bubbles(panel).pop();
  assertEqual(summary.text, CONFIRM_Q);
  chipButtons[0].click(); await wait(15);
  assert(names(ev).includes('request:confirmed'));
  const all = bubbles(panel);
  assertEqual(all[all.length - 2].text, 'Confirm');
  assertEqual(all[all.length - 1].text, CLOSE);
  assertEqual(all.filter(b => b.text === CLOSE).length, 1, 'thank-you shown once');
  assert(panel._chipBar.hasAttribute('hidden'), 'chips cleared');
  for (const s of ['listen', 'think', 'speak']) assert(mascotStates.includes(s), 'mascot ' + s);
  panel.destroy();
})));

registerAsync(test('P-3: markup in replies stays text (XSS-safe bold rendering)', () => serial(async () => {
  const a = make(fakeServer(() => ({ body: { text: 'Try **<img src=x onerror=alert(1)>** now' } })));
  const { panel } = panelWith(a);
  panel.open(); panel._sendText('hi'); await wait(15);
  const node = bubbles(panel).pop().node;
  const strong = node.children.find(c => c.tagName === 'STRONG');
  assertEqual(strong.textContent, '<img src=x onerror=alert(1)>');
  assertEqual(strong.innerHTML, '', 'never parsed as HTML');
  panel.destroy();
})));

registerAsync(test('P-4: a server topic reset keeps the greeting and the latest question only', () => serial(async () => {
  let n = 0;
  const a = make(fakeServer(() => ({ body: n++ === 0 ? { text: 'First answer.' } : { text: 'Fresh answer.', reset: true } })));
  const { panel } = panelWith(a);
  panel.open();
  panel._sendText('old topic'); await wait(15);
  panel._sendText('new topic'); await wait(15);
  assertEqual(bubbles(panel).map(b => b.text).join(' | '), "Hi, I'm the LAVAALL Assistant. How can I help you today? | new topic | Fresh answer.");
  panel.destroy();
})));
