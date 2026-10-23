// LAVAALL OS Talk: one-on-one desk chats through the EXISTING /ops Talk path. Server side: a founder session and a
// CSRF token are required (no session, a stranger, an agent credential or a bad token are all refused). Client side:
// the list, the thread, escaping, typing dots, empty states, the composer and the polling. No network, no KV.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const lib = require(path.join(root, 'api/ops/_lib.js'));
const agentThread = require(path.join(root, 'api/ops/_agent_thread.js'));
const ceoBridge = require(path.join(root, 'api/ops/_ceo_bridge.js'));
const osData = require(path.join(root, 'api/ops/_os_data.js'));
const PACK = require(path.join(root, 'api/os/_data/index.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

process.env.OPS_AUTH_SECRET = 'test-ops-auth-secret-32chars!!';
['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'OPS_STORE_FILE', 'VERCEL', 'XAI_API_KEY', 'OPS_CEO_BRIDGE_SECRET', 'OPS_SIGNIN_HARDENING_ENABLED'].forEach((k) => { delete process.env[k]; });
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('network is off in this test'); };

const FOUNDER = lib.ALLOWLIST[0];
const STRANGER = 'stranger@example.com';

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; return res; };
  res.send = (b) => { try { res.body = JSON.parse(b); } catch { res.body = b; } return res; };
  res.redirect = (c, l) => { res.statusCode = c; res.headers.location = l; return res; };
  return res;
}
function req(method, url, o) {
  const e = o || {};
  const headers = Object.assign({ host: 'preview.example.test', accept: 'application/json', 'content-type': 'application/json' }, e.headers);
  if (e.email) headers.cookie = `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(e.email))}`;
  return { method, url, headers, query: e.query || {}, body: e.body };
}
const deskThread = (o, agent) => ({ run: async () => { const res = mockRes(); await agentThread.handleDeskTalk(req('GET', `/ops/desk-talk/${agent}/thread`, o), res); return res; } });
async function getThread(agent, o) { const res = mockRes(); const handled = agent === 'lavaall-ceo' ? await ceoBridge.handleCeoBridge(req('GET', '/ops/ceo-bridge/thread', Object.assign({ query: { area: 'api/ceo-bridge/thread' } }, o)), res) : await agentThread.handleDeskTalk(req('GET', `/ops/desk-talk/${agent}/thread`, Object.assign({ query: { area: `api/desk-talk/${agent}/thread`, agent } }, o)), res); return { res, handled }; }
async function postMessage(agent, body, o) { const res = mockRes(); const handled = agent === 'lavaall-ceo' ? await ceoBridge.handleCeoBridge(req('POST', '/ops/ceo-bridge/message', Object.assign({ query: { area: 'api/ceo-bridge/message' }, body }, o)), res) : await agentThread.handleDeskTalk(req('POST', `/ops/desk-talk/${agent}/message`, Object.assign({ query: { area: `api/desk-talk/${agent}/message`, agent }, body }, o)), res); return { res, handled }; }
void deskThread;

(async () => {
  // ================= 1. server side: the existing Talk path needs a founder session and a CSRF token =================
  for (const agent of ['sales', 'technical', 'growth', 'lifecycle', 'researchy', 'lavaall-ceo']) {
    agentThread.resetDeskTalk(); ceoBridge.resetCeoBridge();
    const anon = await getThread(agent, {});
    const stranger = await getThread(agent, { email: STRANGER });
    const agentCred = await getThread(agent, { email: FOUNDER, headers: { authorization: 'Bearer something-something-1234' } });
    check(`${agent}: no session -> refused (403), nothing returned`, anon.handled && anon.res.statusCode === 403 && !anon.res.body.thread);
    check(`${agent}: a non-founder session -> refused (403)`, stranger.res.statusCode === 403 && !stranger.res.body.thread);
    check(`${agent}: agent credentials -> refused (403)`, agentCred.res.statusCode === 403);
    const ok = await getThread(agent, { email: FOUNDER });
    check(`${agent}: a founder session gets its own thread and a CSRF token`, ok.res.statusCode === 200 && ok.res.body.ok === true && Array.isArray(ok.res.body.thread.messages) && typeof ok.res.body.csrf === 'string' && ok.res.body.csrf.length > 10);
    const noCsrf = await postMessage(agent, { text: 'hello' }, { email: FOUNDER });
    const badCsrf = await postMessage(agent, { text: 'hello', csrf: 'not-a-token' }, { email: FOUNDER });
    const strangerPost = await postMessage(agent, { text: 'hello', csrf: ok.res.body.csrf }, { email: STRANGER });
    const anonPost = await postMessage(agent, { text: 'hello', csrf: ok.res.body.csrf }, {});
    check(`${agent}: POST without a session, as a stranger, or without a valid CSRF token is refused (403) and stores nothing`, noCsrf.res.statusCode === 403 && badCsrf.res.statusCode === 403 && strangerPost.res.statusCode === 403 && anonPost.res.statusCode === 403 && (await getThread(agent, { email: FOUNDER })).res.body.thread.messages.length === 0);
    const sent = await postMessage(agent, { text: 'Hello <b>desk</b>', csrf: ok.res.body.csrf, threadId: ok.res.body.thread.id }, { email: FOUNDER });
    check(`${agent}: a founder message with a valid token is stored (angle brackets stripped by the server) and the desk is "waiting" (no runtime here)`, sent.res.statusCode === 200 && sent.res.body.waiting === true && sent.res.body.thread.messages.length === 1 && sent.res.body.thread.messages[0].role === 'founder' && sent.res.body.thread.messages[0].text === 'Hello bdesk/b' && !/[<>]/.test(sent.res.body.thread.messages[0].text));
    const again = await getThread(agent, { email: FOUNDER });
    check(`${agent}: the thread read back shows the message and still waits`, again.res.body.thread.messages.length === 1 && again.res.body.waiting === true && typeof again.res.body.waitingCopy === 'string' && again.res.body.waitingCopy.length > 0);
    const other = await getThread(agent, { email: FOUNDER, query: { area: `api/${agent === 'lavaall-ceo' ? 'ceo-bridge' : 'desk-talk/' + agent}/thread`, agent, id: 'someone-elses-thread' } });
    check(`${agent}: asking for another thread id is refused`, other.res.statusCode === 403);
    const empty = await postMessage(agent, { text: '   ', csrf: ok.res.body.csrf }, { email: FOUNDER });
    check(`${agent}: an empty message is rejected (400)`, empty.res.statusCode === 400);
  }
  check('the CEO is not reachable through the generic desk path (it has its own bridge)', await (async () => { const r = await postMessage('lavaall-ceo', { text: 'x', csrf: 'x' }, { email: FOUNDER }); const res = mockRes(); await agentThread.handleDeskTalk(req('GET', '/ops/desk-talk/lavaall-ceo/thread', { email: FOUNDER, query: { area: 'api/desk-talk/lavaall-ceo/thread', agent: 'lavaall-ceo' } }), res); void r; return res.statusCode === 400; })());

  // ================= 2. client: sandbox with a stubbed window.fetch =================
  const win = { innerWidth: 1440 };
  const timers = [];
  win.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  win.clearTimeout = () => {};
  const calls = [];
  let script = () => ({ status: 200, json: { ok: true, thread: { id: 't1', messages: [] }, waiting: false, csrf: 'csrf-1' } });
  win.fetch = (u, init) => { calls.push({ u, init }); const r = script(u, init); return Promise.resolve({ status: r.status, json: () => Promise.resolve(r.json) }); };
  const sandbox = { window: win, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } }, location: { hash: '' }, setTimeout: win.setTimeout, setInterval: () => 0, Intl, Promise };
  vm.createContext(sandbox);
  ['core.js', 'desks.js', 'talk.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  const OS = win.OS;
  const data = osData.buildOsData({ store: {}, health: null }, { env: {}, pack: PACK });
  OS.data = data;
  const tick = () => new Promise((r) => setImmediate(r));
  const flush = async () => { for (let i = 0; i < 6; i += 1) await tick(); };

  // 2a. navigation
  check('Talk is in the nav with G T, and reachable on a phone (More)', OS.nav.some((n) => n.id === 'talk' && n.hint === 'G T' && n.key === 't') && OS.mobile.MORE.includes('talk') && !OS.mobile.TABS.includes('talk'));
  check('exactly the six talk desks are listed; Scout has no Talk', (() => { const l = OS.talk.listHtml(data, 'sales'); return (l.match(/class="li talkrow/g) || []).length === 6 && !/data-desk="scout"/.test(l); })());
  check('desk ids and short names: CEO, Sales, Technical, Growth, Lifecycle, Researchy', ['CEO', 'Sales', 'Technical', 'Growth', 'Lifecycle', 'Researchy'].every((n) => OS.talk.listHtml(data, 'sales').includes('<div>' + n + '</div>')));

  // 2b. endpoints are the existing ones
  check('CEO uses /ops/ceo-bridge, every other desk /ops/desk-talk/<id>', OS.talk.url('lavaall-ceo', 'thread') === '/ops/ceo-bridge/thread' && OS.talk.url('lavaall-ceo', 'message') === '/ops/ceo-bridge/message' && OS.talk.url('sales', 'thread') === '/ops/desk-talk/sales/thread' && OS.talk.url('researchy', 'message') === '/ops/desk-talk/researchy/message');

  // 2c. render
  const desk = (id) => data.desks.find((d) => d.id === id);
  const E = (over) => Object.assign({ loaded: true, error: '', waiting: false, thread: { id: 't1', messages: [] } }, over);
  const T0 = Date.parse('2026-10-23T23:02:00Z');
  const thread = E({ thread: { id: 't1', founderEmail: 'secret.person@example.org', messages: [
    { id: 'a', role: 'founder', text: 'Hi <img src=x onerror=alert(1)>', at: T0 },
    { id: 'b', role: 'assistant', text: 'Reply with <script>alert(2)</script>\nsecond line', at: T0 + 60000 },
  ] } });
  const html = OS.talk.threadHtml(thread, desk('sales'));
  check('founder bubbles sit on the right, desk bubbles on the left', /class="bub-row mine"><div class="bub mine">/.test(html) && /class="bub-row"><div class="bub desk">/.test(html));
  check('times are America/Chicago (CT), sender is You or the desk short name', /You · 23 Oct, 6:02 PM CT/.test(html) && /Sales · 23 Oct, 6:03 PM CT/.test(html));
  check('message text is escaped, never HTML', !/<img src=x|<script>/.test(html) && /&lt;img src=x/.test(html) && /&lt;script&gt;/.test(html));
  check('the founder email in the API payload is never shown', !/secret\.person|example\.org/.test(html + OS.talk.listHtml(data, 'sales')));
  check('line breaks in a message are kept as text (pre-wrap), not as markup', /second line/.test(html) && !/<br/.test(html));
  const waitingHtml = OS.talk.threadHtml(E({ waiting: true, waitingCopy: 'Waiting on LAVAALL Sales & Customer Success…', thread: { id: 't1', messages: [{ id: 'a', role: 'founder', text: 'Hello', at: T0 }] } }), desk('sales'));
  check('a desk that has not answered shows typing dots and the waiting copy', /class="typing"/.test(waitingHtml) && /Waiting on LAVAALL Sales &amp; Customer Success…/.test(waitingHtml));
  check('no thread shows "No messages with <desk> yet."', /No messages with Sales yet\./.test(OS.talk.threadHtml(E({}), desk('sales'))) && /No messages with CEO yet\./.test(OS.talk.threadHtml(E({}), desk('lavaall-ceo'))));
  check('loading and error states name the source and never invent messages', /Loading the thread/.test(OS.talk.threadHtml({ loaded: false }, desk('sales'))) && /Source: the existing \/ops Talk path \(\/ops\/desk-talk\/sales\/thread\)/.test(OS.talk.threadHtml(E({ error: 'Could not load this thread (HTTP 500).' }), desk('sales'))));
  OS.talk.state.sales = thread;
  OS.talk.state.technical = E({});
  OS.talk.state.growth = { loaded: true, error: 'x' };
  const list = OS.talk.listHtml(data, 'sales');
  check('the left list shows each desk\'s last message preview and its time', /Sales<\/div><small>Reply with &lt;script&gt;alert\(2\)&lt;\/script&gt; second line<\/small>/.test(list) && /23 Oct, 6:03 PM CT/.test(list) && /No messages yet/.test(list) && /Could not load/.test(list) && /Loading…/.test(list));
  check('a founder\'s own last message is previewed with "You: "', (() => { OS.talk.state.sales = E({ thread: { id: 't', messages: [{ id: 'a', role: 'founder', text: 'Mine', at: T0 }] } }); return /You: Mine/.test(OS.talk.listHtml(data, 'sales')); })());
  check('the open desk is marked', /class="li talkrow on" href="#talk\/sales"/.test(OS.talk.listHtml(data, 'sales')));
  Object.keys(OS.talk.state).forEach((k) => { delete OS.talk.state[k]; });
  const page = OS.views.talk.render({ id: 'talk', sub: '', data });
  check('the view renders the list and the first desk\'s pane with a composer', /id="talk-list"/.test(page) && /id="talk-pane"/.test(page) && /<textarea id="talk-input"[^>]*maxlength="2000"/.test(page) && /id="talk-send"/.test(page));
  check('a deep link opens that desk; the phone layout shows the thread only', /Message Technical/.test(OS.views.talk.render({ id: 'talk', sub: 'technical', data })) && /class="card talk open"/.test(OS.views.talk.render({ id: 'talk', sub: 'technical', data })) && /class="card talk"/.test(page));
  check('an unknown desk falls back to the first', /Message CEO/.test(OS.views.talk.render({ id: 'talk', sub: 'janitor', data })));
  check('no desks that can Talk -> an honest empty state', /No desks can Talk\./.test(OS.views.talk.render({ id: 'talk', sub: '', data: Object.assign({}, data, { desks: [] }) })));

  // 2d. mount: loads every thread, sends through the same endpoint, polls while waiting
  const els = { '#talk-list': { innerHTML: '' }, '#talk-thread': { innerHTML: '', scrollHeight: 10, scrollTo() {} }, '#talk-note': { textContent: '' }, '#talk-input': { value: '', addEventListener(t, fn) { this[t] = fn; } }, '#talk-send': { disabled: false, addEventListener(t, fn) { this[t] = fn; } } };
  const rootEl = { querySelector: (s) => els[s] || null };
  script = (u) => ({ status: 200, json: { ok: true, thread: { id: 'tid', messages: u.includes('/sales/') ? [{ id: 'm1', role: 'founder', text: 'earlier', at: T0 }] : [] }, waiting: false, csrf: 'csrf-' + (u.includes('ceo-bridge') ? 'ceo' : u.split('/')[3]) } });
  OS.views.talk.mount(rootEl, { id: 'talk', sub: 'sales', data });
  await flush();
  const gets = calls.filter((c) => c.init.method === 'GET');
  check('mount reads all six threads, GET, same-origin credentials, JSON accept', gets.length === 6 && gets.every((c) => c.init.credentials === 'same-origin' && c.init.headers.Accept === 'application/json') && gets.some((c) => c.u === '/ops/ceo-bridge/thread') && ['sales', 'technical', 'growth', 'lifecycle', 'researchy'].every((id) => gets.some((c) => c.u === `/ops/desk-talk/${id}/thread`)));
  check('the pane and the list are painted from the answers', /earlier/.test(els['#talk-thread'].innerHTML) && /You: earlier/.test(els['#talk-list'].innerHTML));
  // empty message
  const before = calls.length;
  els['#talk-input'].value = '   ';
  els['#talk-send'].click();
  await flush();
  check('an empty message sends nothing', calls.length === before && /Write a message first/.test(els['#talk-note'].textContent));
  // send
  script = (u, init) => (init.method === 'POST'
    ? { status: 200, json: { ok: true, thread: { id: 'tid', messages: [{ id: 'm1', role: 'founder', text: 'earlier', at: T0 }, { id: 'm2', role: 'founder', text: 'New one', at: T0 + 1000 }] }, waiting: true, waitingCopy: 'Waiting on Sales…', csrf: 'csrf-next' } }
    : { status: 200, json: { ok: true, thread: { id: 'tid', messages: [{ id: 'm1', role: 'founder', text: 'earlier', at: T0 }, { id: 'm2', role: 'founder', text: 'New one', at: T0 + 1000 }, { id: 'm3', role: 'assistant', text: 'Answered', at: T0 + 2000 }] }, waiting: false, csrf: 'csrf-2' } });
  els['#talk-input'].value = '  New one  ';
  els['#talk-send'].click();
  await flush();
  const post = calls.filter((c) => c.init.method === 'POST');
  check('Send POSTs to the same desk endpoint with the thread id and the CSRF token from the GET', post.length === 1 && post[0].u === '/ops/desk-talk/sales/message' && post[0].init.credentials === 'same-origin' && (() => { const b = JSON.parse(post[0].init.body); return b.text === 'New one' && b.threadId === 'tid' && b.csrf === 'csrf-sales' && Object.keys(b).sort().join() === 'csrf,text,threadId'; })());
  check('after sending: the composer clears, the new bubble and typing dots show', els['#talk-input'].value === '' && /New one/.test(els['#talk-thread'].innerHTML) && /class="typing"/.test(els['#talk-thread'].innerHTML));
  check('while a desk is waiting it polls the thread (about every 6 seconds), and stops when answered', timers.length >= 1 && timers[timers.length - 1].ms === 6000);
  const n = timers.length;
  await timers[timers.length - 1].fn();
  await flush();
  check('the poll picks up the desk reply and stops polling', /Answered/.test(els['#talk-thread'].innerHTML) && !/class="typing"/.test(els['#talk-thread'].innerHTML) && timers.length === n);
  // failures
  script = () => ({ status: 403, json: { error: 'csrf', message: 'Refresh was rejected. Reload Chat and try again.' } });
  els['#talk-input'].value = 'again';
  els['#talk-send'].click();
  await flush();
  check('a refused POST shows the server message and keeps the text', /Refresh was rejected/.test(els['#talk-note'].textContent) && els['#talk-input'].value === 'again' && els['#talk-send'].disabled === false);
  script = () => ({ status: 403, json: { error: 'forbidden' } });
  OS.views.talk.unmount();
  OS.views.talk.mount(rootEl, { id: 'talk', sub: 'sales', data });
  await flush();
  check('without an /ops sign-in the pane says so and names the source', /Talk needs your \/ops sign-in/.test(els['#talk-thread'].innerHTML) && /existing \/ops Talk path/.test(els['#talk-thread'].innerHTML));
  OS.views.talk.unmount();

  // 2e. Desks: a Talk button per talk desk
  const drawers = [];
  OS.openDrawer = (h) => { drawers.push(h); };
  OS.views.desks.mount({ addEventListener() {}, querySelector: () => null }, { id: 'desks', sub: 'sales', data });
  OS.views.desks.mount({ addEventListener() {}, querySelector: () => null }, { id: 'desks', sub: 'scout', data });
  check('the Sales desk page has "Talk to Sales" going to #talk/sales; Scout has none', /data-go="talk\/sales">[^<]*<[^>]*>[^<]*<\/svg>Talk to Sales<\/button>|data-go="talk\/sales"[\s\S]*Talk to Sales/.test(drawers[0]) && !/Talk to/.test(drawers[1]));

  // 3. Scope
  const src = fs.readFileSync(path.join(root, 'api/os/_client/talk.js'), 'utf8');
  check('talk.js has no eval, no model client, no keys and no absolute URLs', !/\beval\s*\(|new Function\(|api\.anthropic|api\.openai|api\.x\.ai|apikey|Authorization|Bearer/i.test(src) && !/https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//, '')));
  const dev = fs.readFileSync(path.join(root, 'scripts/os-dev-server.js'), 'utf8');
  check('the dev server mounts only the four Talk paths and only through the loopback bypass', /TALK_PATH = \/\^\\\/ops\\\/\(\?:desk-talk/.test(dev) && /if \(!localDevBypass\(req\)\)/.test(dev) && !/\/ops\/\(\.\*\)/.test(dev));
  check('no banned word in the new files', !new RegExp(['star' + 'link', 'gui' + 'nea'].join('|'), 'i').test(src + dev));

  globalThis.fetch = realFetch;
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
