// LAVAALL OS Jarvis: the founder-only voice session endpoint and the orb's tool handling. No network: fetch is mocked.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const voice = require(path.join(root, 'api/ops/_voice.js'));
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const KEY = 'sk-test-DO-NOT-PRINT-voice-0123456789';
const SESSION = { email: 'founder@example.com' };

function mockRes() {
  const res = { statusCode: 200, headers: {}, raw: '' };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; return res; };
  res.send = (b) => { res.raw = String(b); try { res.body = JSON.parse(b); } catch { res.body = b; } return res; };
  return res;
}
async function call(req, opts) {
  const res = mockRes();
  const handled = await voice.handleVoice(Object.assign({ method: 'POST', url: '/ops/voice/session', headers: {}, query: { area: 'voice/session' }, body: {} }, req), res, opts);
  return { handled, res };
}

(async () => {
  check('only /ops/voice/session is handled', voice.isVoiceRequest({ url: '/ops/voice/session', query: {} }) && voice.isVoiceRequest({ url: '/api/ops', query: { area: 'voice/session' } }) && !voice.isVoiceRequest({ url: '/ops/harness/chat', query: { area: 'harness/chat' } }));
  check('other routes fall through', (await call({ url: '/ops/harness/chat', query: { area: 'harness/chat' } }, { session: SESSION, env: { OPENAI_API_KEY: KEY } })).handled === false);

  const agent = await call({ headers: { authorization: 'Bearer something' } }, { session: SESSION, env: { OPENAI_API_KEY: KEY } });
  check('agent-looking requests are refused (403)', agent.res.statusCode === 403);
  const anon = await call({}, { session: null, env: { OPENAI_API_KEY: KEY } });
  check('without the founder sign-in: 401', anon.res.statusCode === 401 && anon.res.body.error === 'sign_in_required');
  const get = await call({ method: 'GET' }, { session: SESSION, env: { OPENAI_API_KEY: KEY } });
  check('GET is 405', get.res.statusCode === 405);
  const nokey = await call({}, { session: SESSION, env: {} });
  check('no OPENAI_API_KEY: 409 that names the variable, never a value', nokey.res.statusCode === 409 && /OPENAI_API_KEY/.test(nokey.res.body.message));

  let sent = null;
  const okFetch = async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ value: 'ek_short_lived_123', expires_at: 1790000000 }) }; };
  const ok = await call({ body: { voice: 'cedar' } }, { session: SESSION, env: { OPENAI_API_KEY: KEY }, fetchImpl: okFetch });
  const cfg = JSON.parse(sent.init.body);
  check('mints a short-lived secret from OpenAI Realtime with the server key', ok.res.statusCode === 200 && ok.res.body.value === 'ek_short_lived_123' && sent.url === 'https://api.openai.com/v1/realtime/client_secrets' && sent.init.headers.Authorization === 'Bearer ' + KEY);
  check('the real key never reaches the browser', !ok.res.raw.includes(KEY));
  check('the session has the Jarvis instructions, ask_os and navigate tools, and the picked voice', /You are Jarvis/.test(cfg.session.instructions) && cfg.session.tools.map((t) => t.name).join() === 'ask_os,navigate' && cfg.session.audio.output.voice === 'cedar' && cfg.session.model === 'gpt-realtime');
  check('Jarvis is told it can never send, deploy, merge or spend, and never to invent facts', /never send, post, deploy, merge, pay or spend/.test(cfg.session.instructions) && /Never guess, never invent prices/.test(cfg.session.instructions));
  check('navigate is limited to real OS pages', cfg.session.tools[1].parameters.properties.page.enum.join() === voice.VIEWS.join());
  const badVoice = await call({ body: { voice: '<script>' } }, { session: SESSION, env: { OPENAI_API_KEY: KEY }, fetchImpl: okFetch });
  check('an unknown voice falls back to marin', badVoice.res.body.voice === 'marin');
  const upstream = await call({}, { session: SESSION, env: { OPENAI_API_KEY: KEY }, fetchImpl: async () => ({ ok: false, json: async () => ({ error: { message: 'Incorrect API key ' + KEY } }) }) });
  check('an OpenAI refusal is a plain 502 that leaks nothing', upstream.res.statusCode === 502 && !upstream.res.raw.includes(KEY) && !/Incorrect/.test(upstream.res.raw));
  const boom = await call({}, { session: SESSION, env: { OPENAI_API_KEY: KEY }, fetchImpl: async () => { throw new Error('network ' + KEY); } });
  check('a network failure is a plain 504', boom.res.statusCode === 504 && !boom.res.raw.includes(KEY));

  // ---- the orb (client) ----
  const win = {};
  const posted = [];
  const sandbox = {
    window: win,
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { setAttribute() {}, getAttribute: () => 'dark' } },
    location: { hash: '' }, navigator: {}, setTimeout: () => 0, setInterval: () => 0, Intl, JSON,
  };
  win.fetch = async (url, init) => { posted.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ reply: 'Two decisions are open.' }) }; };
  vm.createContext(sandbox);
  ['core.js', 'voice.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  const OS = win.OS;
  const html = OS.jarvisHtml();
  check('the orb is a labelled button, off until tapped', /<button type="button" class="jv-orb" id="jv-orb" data-state="idle" aria-pressed="false" aria-label="Call Jarvis"/.test(html));
  check('the orb lists the same pages as the server', OS.jarvis.VIEWS.join() === voice.VIEWS.join());
  let went = [];
  OS.go = (id) => went.push(id);
  OS.jarvis.runTool('navigate', 'c1', '{"page":"brain"}');
  OS.jarvis.runTool('navigate', 'c2', '{"page":"../ops"}');
  check('navigate opens real pages only, anything else goes Home', went.join() === 'brain,home');
  OS.jarvis.runTool('ask_os', 'c3', '{"request":"fix the bug in kits"}');
  await new Promise((r) => setImmediate(r));
  check('ask_os goes through the founder harness chat with the routed model', posted.length === 1 && posted[0].url === '/ops/harness/chat' && posted[0].body.project === 'lavaall' && posted[0].body.message === 'fix the bug in kits' && ['codex', 'claude'].includes(posted[0].body.harness));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
