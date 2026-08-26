import assert from 'node:assert/strict';
import handler from '../../api/quote.js';

async function call(body, headers = {}) {
  let status, data;
  await handler({ method: 'POST', headers: { 'x-forwarded-for': Math.random().toString(), referer: 'https://www.lavaall.com/#products', ...headers }, body }, {
    status(c) { status = c; return this; },
    setHeader() { return this; },
    send(v) { data = JSON.parse(v); }
  });
  return { status, data };
}

const base = { name: 'Test User', email: 'test@example.com', phone: '+23276000000', company: 'Test Co', country: 'Sierra Leone', quantity: 1, message: 'Test', 'gdpr-consent': 'yes' };
const verified = { ...base, requestType: 'verified-product', context: { verified: true, productName: 'Test', sourceProductId: '1', mpn: 'M1', gtin: '123', category: 'computers', brand: 'Test' } };
const sourcing = { ...base, requestType: 'sourcing', context: { category: 'computers', requestedModel: 'ThinkPad' } };

const oldUrl = process.env.QUOTE_WEBHOOK_URL;
const oldSecret = process.env.QUOTE_WEBHOOK_SECRET;
const oldFetch = globalThis.fetch;

delete process.env.QUOTE_WEBHOOK_URL;
delete process.env.QUOTE_WEBHOOK_SECRET;
assert.equal((await call(verified)).status, 503);
assert.equal((await call(sourcing)).status, 503);
assert.equal((await call({ ...base, email: 'bad', requestType: 'sourcing', context: { category: 'computers', requestedModel: 'ThinkPad' } })).status, 400);
assert.equal((await call({ ...base, quantity: 0, requestType: 'sourcing', context: { category: 'computers', requestedModel: 'ThinkPad' } })).status, 400);
assert.equal((await call({ ...base, requestType: 'bad', context: {} })).status, 400);
assert.equal((await call({ ...base, website: 'bot' })).status, 200);

process.env.QUOTE_WEBHOOK_URL = 'https://script.google.com/macros/s/test/exec';
process.env.QUOTE_WEBHOOK_SECRET = 'test-secret';
let deliveredEnvelope;
globalThis.fetch = async (_url, options) => {
  deliveredEnvelope = JSON.parse(options.body);
  return new Response(JSON.stringify({ ok: true, accepted: true, leadId: deliveredEnvelope.payload.deliveryId }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const delivered = await call(verified);
assert.equal(delivered.status, 202);
assert.equal(delivered.data.accepted, true);
assert.equal(deliveredEnvelope.secret, 'test-secret');
assert.equal(deliveredEnvelope.eventType, 'lead');
assert.equal(deliveredEnvelope.payload.requestType, 'verified-product');
assert.equal(deliveredEnvelope.payload.context.sourceProductId, '1');
assert.match(deliveredEnvelope.payload.sourcePage, /^https:\/\/www\.lavaall\.com/);

globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 200, headers: { 'content-type': 'application/json' } });
assert.equal((await call(verified)).status, 502);

if (oldUrl === undefined) delete process.env.QUOTE_WEBHOOK_URL; else process.env.QUOTE_WEBHOOK_URL = oldUrl;
if (oldSecret === undefined) delete process.env.QUOTE_WEBHOOK_SECRET; else process.env.QUOTE_WEBHOOK_SECRET = oldSecret;
globalThis.fetch = oldFetch;
console.log('quote API audit: passed');
