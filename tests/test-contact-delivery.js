// Offline delivery contract: isolated env, mocked fetch, no outbound requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const fixture = {
  inquiryType: 'sales-quotation', name: 'Private Fixture Name',
  email: 'private-fixture@example.test', phone: '+1 (555) 867-5309',
  company: 'Private Fixture Company', subject: 'Private Fixture Subject',
  message: 'Private Fixture Message', country: 'Sierra Leone',
  preferredResponse: 'email', consent: true,
};
const logs = [];
let transport;
let fetchCalls = 0;
let timeoutCalls = 0;
const context = {
  module: { exports: {} },
  process: { env: { CONTACT_WEBHOOK_URL: 'https://example.test/mock-only', CONTACT_WEBHOOK_SECRET: 'fixture-secret' } },
  console: { log: (line) => logs.push(line) },
  AbortSignal: { timeout(ms) {
    assert.equal(ms, 10000);
    timeoutCalls++;
    return AbortSignal.timeout(ms);
  } },
  fetch: async (url, options) => {
    fetchCalls++;
    assert.equal(url, 'https://example.test/mock-only');
    assert.ok(options.signal instanceof AbortSignal);
    return transport(options);
  },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/contact.js'), 'utf8'), context);
const contact = context.module.exports;
let id = 0;
async function invoke(overrides = {}) {
  const res = {
    status(code) { this.statusCode = code; return this; },
    setHeader() { return this; },
    send(body) { this.body = JSON.parse(body); return this; },
  };
  await contact({ method: 'POST', headers: { 'x-forwarded-for': `fixture-${++id}` }, body: { ...fixture, ...overrides } }, res);
  return res;
}
function reply(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function failed(res) {
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'delivery_failed');
  assert.ok(res.body.message);
  assert.deepEqual(res.body.fallback, {
    email: 'support@lavaall.com', whatsapp: '+1 (737) 704-4182', whatsappUrl: 'https://wa.me/17377044182',
  });
}
async function run() {
  transport = async () => reply({ ok: true });
  let res = await invoke();
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.accepted, true);
  assert.equal(res.body.routedTo, 'sales@lavaall.com');
  assert.deepEqual(JSON.parse(logs.at(-1)), { evt: 'contact', status: 200, ok: true, err: null, type: fixture.inquiryType });

  for (const body of [{ ok: false, error: 'forbidden' }, {}, null, { ok: 'true' }, { ok: false, error: fixture.email }]) {
    transport = async () => reply(body);
    failed(await invoke());
  }
  transport = async () => reply({ ok: true }, 500);
  failed(await invoke());

  // Response.json throws the native SyntaxError for a non-JSON body.
  transport = async () => new Response('<html>Not JSON</html>', { status: 200 });
  failed(await invoke());
  assert.equal(JSON.parse(logs.at(-1)).err, 'non_json');

  for (const name of ['AbortError', 'TimeoutError', 'TypeError']) {
    transport = async () => { const error = new Error(fixture.email); error.name = name; throw error; };
    failed(await invoke());
    assert.equal(JSON.parse(logs.at(-1)).err, name === 'TypeError' ? 'network' : 'timeout');
  }
  // Timeout also covers abort while reading the response body.
  transport = async () => ({ ok: true, status: 200, json: async () => { const e = new Error(); e.name = 'AbortError'; throw e; } });
  failed(await invoke());

  const before = fetchCalls;
  const beforeLogs = logs.length;
  res = await invoke({ website: 'bot.example.test' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.accepted, true);
  assert.equal(fetchCalls, before);
  assert.equal(logs.length, beforeLogs);
  assert.equal(timeoutCalls, fetchCalls);
  assert.equal(logs.length, fetchCalls, 'one diagnostic per attempted delivery');
  for (const line of logs) {
    assert.ok(!line.includes('@'), 'logs contain no email address');
    assert.ok(!line.includes('867') && !line.includes('5309'), 'logs contain no fixture phone digits');
    for (const field of ['name', 'company', 'subject', 'message']) assert.ok(!line.includes(fixture[field]));
    assert.deepEqual(Object.keys(JSON.parse(line)), ['evt', 'status', 'ok', 'err', 'type']);
  }
  console.log('PASS - contact delivery success, rejection, non-JSON, HTTP failure, timeout, network, honeypot and PII-free logs');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
