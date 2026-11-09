// Plain Node regression tests; every outgoing request is mocked.
const crypto = require('crypto');
const limits = require('../api/_shared_limits');
const quote = require('../api/quote');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }
function response() {
  const res = { statusCode: null, body: null };
  res.status = n => { res.statusCode = n; return res; };
  res.setHeader = () => res;
  res.send = body => { res.body = JSON.parse(body); return res; };
  return res;
}
function kvMock(calls) {
  const data = new Map();
  return async (url, opts) => {
    calls.push({ url, opts });
    if (url === 'https://example.com/quote') return { ok: true, json: async () => ({ ok: true }) };
    const commands = JSON.parse(opts.body);
    return { ok: true, json: async () => commands.map(command => {
      const [op, key, value] = command;
      if (op === 'SET') {
        if (data.has(key)) return { result: null };
        data.set(key, Number(value));
        return { result: 'OK' };
      }
      if (op === 'INCR') {
        data.set(key, (data.get(key) || 0) + 1);
        return { result: data.get(key) };
      }
      throw new Error('Unexpected mocked KV command');
    }) };
  };
}
async function run() {
  const originalFetch = global.fetch;
  const originalLog = console.log;
  const names = ['SECURITY_SHARED_LIMITS', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL_ENV', 'QUOTE_WEBHOOK_URL'];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.SECURITY_SHARED_LIMITS = '0';
    process.env.KV_REST_API_URL = 'https://example.com/kv';
    process.env.KV_REST_API_TOKEN = 'synthetic-test-token';
    process.env.VERCEL_ENV = 'preview';
    global.fetch = async () => { throw new Error('Unexpected fetch with flag off'); };
    limits.resetSharedLimits();
    check('flag off disables shared limits', !limits.sharedLimitsEnabled());
    const first = await limits.hit('memory', { windowMs: 60000, max: 1 });
    const second = await limits.hit('memory', { windowMs: 60000, max: 1 });
    check('flag off uses memory and still limits', first.mode === 'memory' && !first.limited && second.mode === 'memory' && second.limited);
    check('memory once returns true then false', await limits.once('memory-once', 60000) && !await limits.once('memory-once', 60000));
    limits.resetSharedLimits();
    for (let i = 0; i < 6000; i++) await limits.hit('bounded:' + i, { windowMs: 60000, max: 1 });
    check('memory retains newest key within 5000-key cap', (await limits.hit('bounded:5999', { windowMs: 60000, max: 1 })).limited);
    check('memory evicts keys beyond 5000-key cap', !(await limits.hit('bounded:999', { windowMs: 60000, max: 1 })).limited);
    const realNow = Date.now;
    let now = realNow();
    try {
      Date.now = () => now;
      limits.resetSharedLimits();
      await limits.hit('expires', { windowMs: 100, max: 1 });
      await limits.once('once-expires', 100);
      now += 101;
      check('memory hit and once expire', !(await limits.hit('expires', { windowMs: 100, max: 1 })).limited && await limits.once('once-expires', 100));
    } finally { Date.now = realNow; }

    process.env.SECURITY_SHARED_LIMITS = 'true';
    check('only exact flag value 1 enables shared limits', !limits.sharedLimitsEnabled());
    process.env.SECURITY_SHARED_LIMITS = '1';
    delete process.env.KV_REST_API_TOKEN;
    check('shared mode requires credentials', !limits.sharedLimitsEnabled());
    process.env.KV_REST_API_TOKEN = 'synthetic-test-token';
    check('flag and credentials enable shared limits', limits.sharedLimitsEnabled());
    const calls = [];
    global.fetch = kvMock(calls);
    limits.resetSharedLimits();
    const key = 'quote:203.0.113.9';
    const a = await limits.hit(key, { windowMs: 60000, max: 2 });
    const b = await limits.hit(key, { windowMs: 60000, max: 2 });
    const c = await limits.hit(key, { windowMs: 60000, max: 2 });
    check('shared mode limits only after max hits', a.mode === 'shared' && b.mode === 'shared' && c.mode === 'shared' && !a.limited && !b.limited && c.limited);
    const expectedKey = 'sec:preview:' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
    check('shared pipeline uses environment prefix and hashed key', calls[0].opts.body === JSON.stringify([['SET', expectedKey, '0', 'PX', '60000', 'NX'], ['INCR', expectedKey]]) && !calls.some(call => call.opts.body.includes('203.0.113.9')));
    check('shared request uses POST pipeline, authorization and abort signal', calls[0].url === 'https://example.com/kv/pipeline' && calls[0].opts.method === 'POST' && calls[0].opts.headers.Authorization === 'Bearer synthetic-test-token' && calls[0].opts.signal instanceof AbortSignal);
    check('shared once returns true then false', await limits.once('shared-once', 60000) && !await limits.once('shared-once', 60000));
    check('shared once uses SET NX pipeline', JSON.stringify(JSON.parse(calls[calls.length - 1].opts.body)[0].slice(0, 1)) === '["SET"]' && JSON.parse(calls[calls.length - 1].opts.body)[0].slice(2).join(',') === '1,PX,60000,NX');

    const logs = [];
    console.log = line => logs.push(line);
    for (const failure of [async () => { throw new Error('synthetic outage'); }, async () => ({ ok: false, status: 503 }), async () => ({ ok: true, json: async () => [{ error: 'synthetic command error' }] })]) {
      limits.resetSharedLimits();
      global.fetch = failure;
      const x = await limits.hit('fallback', { windowMs: 60000, max: 1 });
      const y = await limits.hit('fallback', { windowMs: 60000, max: 1 });
      check('KV failure falls back to memory and still limits', x.mode === 'memory' && !x.limited && y.mode === 'memory' && y.limited);
      check('KV failure once falls back and still rejects reuse', await limits.once('fallback-once', 60000) && !await limits.once('fallback-once', 60000));
    }
    console.log = originalLog;
    check('fallback logs contain only the safe event', logs.length > 0 && logs.every(line => line === JSON.stringify({ type: 'SharedLimits', event: 'fallback' })));

    const quoteCalls = [];
    global.fetch = kvMock(quoteCalls);
    limits.resetSharedLimits();
    process.env.QUOTE_WEBHOOK_URL = 'https://example.com/quote';
    const body = { requestType: 'sourcing', name: 'Test Buyer', email: 'buyer@example.com', phone: '+12025550123', company: 'Example', country: 'US', quantity: 1, 'gdpr-consent': 'yes', context: { category: 'computers', requestedModel: 'Test model' } };
    async function submit(payload, headers = { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '203.0.113.10, 203.0.113.11' }) {
      const res = response();
      await quote({ method: 'POST', headers, body: payload }, res);
      return res;
    }
    check('quote honeypot accepts without KV calls', (await submit({ website: 'spam' })).statusCode === 200 && quoteCalls.length === 0);
    check('invalid quote rejects without consuming limit', (await submit({})).statusCode === 400 && quoteCalls.length === 0);
    check('first valid quote delivers', (await submit(body)).statusCode === 202);
    limits.resetSharedLimits(); // Simulate another warm instance, retaining shared KV state.
    const repeat = await submit(body);
    check('second instance still rejects same IP with 429', repeat.statusCode === 429 && repeat.body.error === 'rate_limited');
    check('quote prefers x-real-ip over forwarded IP', JSON.parse(quoteCalls[0].opts.body)[0][1] === expectedKey);
    check('quote uses first forwarded IP when real IP absent', (await submit(body, { 'x-forwarded-for': '203.0.113.10, 203.0.113.11' })).statusCode === 202 && (await submit(body, { 'x-forwarded-for': '203.0.113.10, 203.0.113.12' })).statusCode === 429);
  } finally {
    global.fetch = originalFetch;
    console.log = originalLog;
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
    limits.resetSharedLimits();
  }
  let failed = 0;
  for (const result of results) {
    console.log((result.pass ? 'PASS' : 'FAIL') + ' - ' + result.name);
    if (!result.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
