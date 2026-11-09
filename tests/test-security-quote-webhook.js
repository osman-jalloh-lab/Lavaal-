// Quote webhook protection checks. All delivery requests use mocked fetch.
const crypto = require('crypto');
const quote = require('../api/quote');
const { resetSharedLimits } = require('../api/_shared_limits');
const results = [];
function check(name, condition) { results.push({ name, pass: !!condition }); }
function mockRes() {
  const res = { statusCode: null, headers: {}, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; return res; };
  res.send = (body) => { res.body = JSON.parse(body); return res; };
  return res;
}
const EMAIL = 'quote-security@example.com';
const PHONE = '+1 202 555 0142';
const SECRET = 'synthetic-quote-secret-for-tests';
function payload() {
  return { requestType: 'verified-product', name: 'Synthetic Buyer', email: EMAIL,
    phone: PHONE, company: 'Example Company', country: 'Example Country', quantity: 2,
    message: 'Synthetic request', 'gdpr-consent': 'yes',
    context: { productName: 'Example Product', sourceProductId: '123', mpn: 'MPN-123', verified: true } };
}
async function run() {
  const originalFetch = global.fetch, originalLog = console.log, originalTimeout = AbortSignal.timeout;
  const envKeys = ['QUOTE_WEBHOOK_URL', 'QUOTE_WEBHOOK_SECRET', 'VERCEL_ENV', 'SECURITY_SHARED_LIMITS'];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const logs = [], calls = [], timeouts = [];
  let responder = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  let ip = 0;
  async function request(body = payload()) {
    const res = mockRes();
    await quote({ method: 'POST', headers: { 'x-real-ip': `203.0.113.${++ip}` }, body }, res);
    return res;
  }
  try {
    delete process.env.SECURITY_SHARED_LIMITS;
    process.env.VERCEL_ENV = 'production';
    process.env.QUOTE_WEBHOOK_URL = 'https://example.com/quote';
    delete process.env.QUOTE_WEBHOOK_SECRET;
    resetSharedLimits();
    console.log = (...args) => { logs.push(args.map(String).join(' ')); };
    AbortSignal.timeout = (ms) => { timeouts.push(ms); return new AbortController().signal; };
    global.fetch = async (url, options) => { calls.push({ url: String(url), options }); return responder(); };

    const verified = payload();
    verified.context = JSON.parse('{"__proto__":{"polluted":true},"adminNote":"private","other":"drop"}');
    Object.assign(verified.context, { productName: ' <' + 'p'.repeat(260) + '> ', sourceProductId: 's'.repeat(90),
      mpn: 'm'.repeat(150), gtin: 'g'.repeat(50), brand: 'b'.repeat(100), category: 'c'.repeat(100), verified: true });
    check('verified quote is accepted with router ok:true', (await request(verified)).statusCode === 202);
    const sent = JSON.parse(calls.at(-1).options.body);
    check('verified context only contains allowed keys',
      Object.keys(sent.context).sort().join(',') === 'brand,category,gtin,mpn,productName,sourceProductId,verified');
    check('verified context strings are cleaned and capped', sent.context.productName === 'p'.repeat(240)
      && sent.context.sourceProductId.length === 64 && sent.context.mpn.length === 128
      && sent.context.gtin.length === 32 && sent.context.brand.length === 80 && sent.context.category.length === 80
      && sent.context.verified === true);
    check('unsigned body and headers omit secret and signature', !Object.hasOwn(sent, 'secret')
      && !Object.hasOwn(calls.at(-1).options.headers, 'X-Lavaall-Signature')
      && !Object.hasOwn(calls.at(-1).options.headers, 'X-Lavaall-Timestamp'));
    check('webhook uses a 10000ms abort signal', timeouts.at(-1) === 10000 && calls.at(-1).options.signal instanceof AbortSignal);
    await request();
    check('absent optional verified fields stay omitted',
      Object.keys(JSON.parse(calls.at(-1).options.body).context).sort().join(',') === 'mpn,productName,sourceProductId,verified');
    const nonString = payload();
    Object.assign(nonString.context, { brand: { value: 'drop' }, category: 123, gtin: false });
    await request(nonString);
    const cleanedTypes = JSON.parse(calls.at(-1).options.body).context;
    check('non-string optional values are cleaned out', !cleanedTypes.brand && !cleanedTypes.category && !cleanedTypes.gtin);

    const sourcing = payload();
    sourcing.requestType = 'sourcing';
    sourcing.context = { category: ' <' + 'c'.repeat(90) + '> ', requestedModel: 'r'.repeat(260), brand: 'b'.repeat(90),
      productName: 'drop', verified: true, adminNote: 'drop' };
    check('sourcing quote is accepted', (await request(sourcing)).statusCode === 202);
    const sourcingContext = JSON.parse(calls.at(-1).options.body).context;
    check('sourcing context only forwards cleaned capped allowed keys',
      Object.keys(sourcingContext).sort().join(',') === 'brand,category,requestedModel'
      && sourcingContext.category === 'c'.repeat(80) && sourcingContext.requestedModel.length === 240 && sourcingContext.brand.length === 80);
    const huge = payload();
    huge.context.adminNote = 'x'.repeat(50_000);
    const beforeHuge = calls.length;
    check('50KB unknown context is rejected before forwarding', (await request(huge)).statusCode === 413 && calls.length === beforeHuge);

    for (const url of ['http://example.com/quote', 'http://localhost:3000/quote', 'http://127.0.0.1/quote', 'invalid', 'ftp://example.com/quote']) {
      process.env.QUOTE_WEBHOOK_URL = url;
      const before = calls.length, beforeLogs = logs.length;
      const res = await request();
      check(`production rejects ${url} without fetch`, res.statusCode === 503 && res.body.error === 'delivery_not_configured' && calls.length === before);
      check(`invalid URL logs one metadata-only event (${url})`, logs.length === beforeLogs + 1
        && logs.at(-1) === JSON.stringify({ type: 'QuoteDelivery', event: 'bad_webhook_url' }));
    }
    process.env.VERCEL_ENV = 'preview';
    for (const url of ['http://localhost:3000/quote', 'http://127.0.0.1:3000/quote']) {
      process.env.QUOTE_WEBHOOK_URL = url;
      check('non-production permits loopback HTTP ' + url, (await request()).statusCode === 202);
    }
    process.env.QUOTE_WEBHOOK_URL = 'http://example.com/quote';
    check('non-production still rejects external HTTP', (await request()).statusCode === 503);
    process.env.VERCEL_ENV = 'production';
    process.env.QUOTE_WEBHOOK_URL = 'https://example.com/quote';
    process.env.QUOTE_WEBHOOK_SECRET = SECRET;
    const beforeTime = Math.floor(Date.now() / 1000);
    check('signed quote with router ok:true returns 202', (await request()).statusCode === 202);
    const signed = calls.at(-1).options;
    const timestamp = signed.headers['X-Lavaall-Timestamp'];
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(timestamp + '.' + signed.body).digest('hex');
    check('signature covers timestamp and exact serialized body', signed.headers['X-Lavaall-Signature'] === expected
      && quote.signQuoteBody(SECRET, timestamp, signed.body) === expected);
    check('timestamp is current Unix seconds', /^\d+$/.test(timestamp) && Number(timestamp) >= beforeTime && Number(timestamp) <= Math.floor(Date.now() / 1000));
    check('signed body includes Apps Script secret', JSON.parse(signed.body).secret === SECRET);
    process.env.QUOTE_WEBHOOK_SECRET = 'short';
    await request();
    check('short secret is omitted from body and headers', !Object.hasOwn(JSON.parse(calls.at(-1).options.body), 'secret')
      && !Object.hasOwn(calls.at(-1).options.headers, 'X-Lavaall-Signature'));
    delete process.env.QUOTE_WEBHOOK_SECRET;

    for (const [label, response] of [
      ['router ok:false', { ok: true, status: 200, json: async () => ({ ok: false }) }],
      ['non-JSON body', { ok: true, status: 200, json: async () => { throw new SyntaxError('synthetic invalid JSON'); } }],
      ['missing ok', { ok: true, status: 200, json: async () => ({}) }],
      ['string ok', { ok: true, status: 200, json: async () => ({ ok: 'true' }) }],
      ['non-2xx response', { ok: false, status: 500, json: async () => ({ ok: true }) }],
    ]) {
      responder = async () => response;
      const res = await request();
      check(label + ' returns delivery_failed', res.statusCode === 502 && res.body.error === 'delivery_failed');
    }
    for (const error of [new Error(EMAIL + ' ' + PHONE), Object.assign(new Error('synthetic timeout'), { name: 'TimeoutError' })]) {
      responder = async () => { throw error; };
      check('fetch rejection/timeout returns 502', (await request()).statusCode === 502);
    }
    delete process.env.QUOTE_WEBHOOK_URL;
    const beforeUnset = calls.length;
    const unset = await request();
    check('unset webhook preserves 503 delivery_not_configured', unset.statusCode === 503 && unset.body.error === 'delivery_not_configured' && calls.length === beforeUnset);
    check('logs contain no customer email, phone, name, company or secret',
      logs.every((line) => ![EMAIL, PHONE, 'Synthetic Buyer', 'Example Company', SECRET].some((value) => line.includes(value))));
    check('every delivery log has only metadata fields', logs.every((line) => {
      const row = JSON.parse(line);
      return row.type === 'QuoteDelivery' && Object.keys(row).every((key) => ['type', 'event', 'status'].includes(key));
    }));
  } finally {
    global.fetch = originalFetch;
    console.log = originalLog;
    AbortSignal.timeout = originalTimeout;
    resetSharedLimits();
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
  for (const result of results) console.log((result.pass ? 'PASS' : 'FAIL') + ' - ' + result.name);
  const passed = results.filter((result) => result.pass).length;
  console.log(`${passed}/${results.length} passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
