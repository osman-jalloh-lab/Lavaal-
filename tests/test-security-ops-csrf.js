// Main /ops writes reject foreign browser origins before mutating the store.
const lib = require('../api/ops/_lib');
const store = require('../api/ops/_store');
const signIn = require('../api/ops/_signin_hardening');
const EMAIL = 'founder@example.com';
const originalReadSession = signIn.readLiveSession;
// Exercise the authenticated dispatch with a synthetic identity, without changing
// the production founder allowlist or testing authentication again here.
signIn.readLiveSession = async () => ({ email: EMAIL });
const ops = require('../api/ops/index');
signIn.readLiveSession = originalReadSession;

const results = [];
function check(name, condition) { results.push({ name, pass: !!condition }); }
function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; return res; };
  res.send = (body) => {
    res.raw = body;
    try { res.body = JSON.parse(body); } catch { res.body = body; }
    return res;
  };
  return res;
}
function request(headers, html) {
  return {
    method: 'POST', url: '/ops', query: {},
    headers: {
      host: 'ops.example.com',
      accept: html ? 'text/html' : 'application/json',
      'content-type': html ? 'application/x-www-form-urlencoded' : 'application/json',
      ...headers,
    },
    body: { action: 'add-task', title: 'Synthetic CSRF task' },
  };
}

async function run() {
  const previousFetch = global.fetch;
  const previousLog = console.log;
  const logs = [];
  let fetches = 0;
  global.fetch = async () => { fetches++; throw new Error('Unexpected network request'); };
  console.log = (...args) => { logs.push(args); };
  process.env.OPS_AUTH_SECRET = 'synthetic-ops-csrf-test-secret-32chars';
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  try {
    const unitCases = [
      ['cross-site metadata', { 'sec-fetch-site': 'cross-site' }, false],
      ['same-site metadata', { 'sec-fetch-site': 'same-site' }, false],
      ['same-origin metadata', { 'sec-fetch-site': 'same-origin' }, true],
      ['none metadata', { 'sec-fetch-site': 'none' }, true],
      ['empty metadata is present', { 'sec-fetch-site': '' }, false],
      ['foreign origin', { origin: 'https://evil.example' }, false],
      ['matching origin', { origin: 'https://ops.example.com' }, true],
      ['null origin', { origin: 'null' }, false],
      ['malformed origin', { origin: 'invalid-origin' }, false],
      ['empty origin is present', { origin: '' }, false],
      ['legacy absent headers', {}, true],
      ['matching forwarded host', { host: 'internal.example.com', 'x-forwarded-host': 'ops.example.com', origin: 'https://ops.example.com' }, true],
      ['forwarded host overrides host', { 'x-forwarded-host': 'public.example.com', origin: 'https://ops.example.com' }, false],
      ['origin host includes port', { origin: 'https://ops.example.com:8443' }, false],
      ['matching port', { host: 'ops.example.com:8443', origin: 'https://ops.example.com:8443' }, true],
      ['metadata does not bypass origin', { 'sec-fetch-site': 'same-origin', origin: 'https://evil.example' }, false],
      ['origin without request host', { host: undefined, origin: 'https://ops.example.com' }, false],
    ];
    for (const [name, headers, expected] of unitCases) {
      check('helper: ' + name, lib.sameOriginRequest(request(headers)) === expected);
    }

    const integrationCases = [
      ['cross-site', { 'sec-fetch-site': 'cross-site' }, false],
      ['same-site subdomain', { 'sec-fetch-site': 'same-site', origin: 'https://sub.ops.example.com' }, false],
      ['same-origin', { 'sec-fetch-site': 'same-origin' }, true],
      ['foreign Origin', { origin: 'https://evil.example' }, false],
      ['matching Origin', { origin: 'https://ops.example.com' }, true],
      ['legacy no origin headers', {}, true],
      ['null Origin', { origin: 'null' }, false],
    ];
    for (const [name, headers, allowed] of integrationCases) {
      store.resetStore();
      await store.addTask({ title: 'Existing synthetic task', createdBy: EMAIL });
      const before = JSON.stringify((await store.readStore()).tasks);
      const logCount = logs.length;
      const res = mockRes();
      await ops(request(headers), res);
      const tasks = (await store.readStore()).tasks;
      if (allowed) {
        check(name + ': write succeeds', res.statusCode === 200 && res.body.ok === true && tasks.length === 2);
        check(name + ': no rejection log', logs.length === logCount);
      } else {
        check(name + ': JSON rejects with csrf', res.statusCode === 403 && res.body.error === 'csrf');
        check(name + ': task list unchanged', JSON.stringify(tasks) === before);
        check(name + ': one PII-free rejection log', logs.length === logCount + 1
          && logs[logCount].length === 1
          && JSON.stringify(typeof logs[logCount][0] === 'string' ? JSON.parse(logs[logCount][0]) : logs[logCount][0])
            === JSON.stringify({ type: 'OpsCsrf', event: 'rejected' }));
      }
    }
    store.resetStore();
    const beforeHtml = JSON.stringify((await store.readStore()).tasks);
    const html = mockRes();
    await ops(request({ 'sec-fetch-site': 'cross-site' }, true), html);
    check('HTML rejection re-renders existing shell error', String(html.raw).includes('Request was rejected. Reload and try again.')
      && String(html.raw).includes('Dashboard'));
    check('HTML rejection leaves tasks unchanged', JSON.stringify((await store.readStore()).tasks) === beforeHtml);
    check('tests made no network calls', fetches === 0);
  } finally {
    console.log = previousLog;
    global.fetch = previousFetch;
    store.resetStore();
  }
  let failed = 0;
  for (const result of results) {
    console.log((result.pass ? 'PASS' : 'FAIL') + ' - ' + result.name);
    if (!result.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
