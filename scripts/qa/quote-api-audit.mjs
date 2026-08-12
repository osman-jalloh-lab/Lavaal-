import assert from 'node:assert/strict';
import handler from '../../api/quote.js';
async function call(body) { let status, data; await handler({ method: 'POST', headers: { 'x-forwarded-for': Math.random().toString() }, body }, { status(c) { status = c; return this; }, setHeader() { return this; }, send(v) { data = JSON.parse(v); } }); return { status, data }; }
const base = { name: 'Test User', email: 'test@example.com', phone: '+23276000000', company: 'Test Co', country: 'Sierra Leone', quantity: 1, message: 'Test', 'gdpr-consent': 'yes' };
assert.equal((await call({ ...base, requestType: 'verified-product', context: { verified: true, productName: 'Test', sourceProductId: '1', mpn: 'M1' } })).status, 503);
assert.equal((await call({ ...base, requestType: 'sourcing', context: { category: 'computers', requestedModel: 'ThinkPad' } })).status, 503);
assert.equal((await call({ ...base, email: 'bad', requestType: 'sourcing', context: { category: 'computers', requestedModel: 'ThinkPad' } })).status, 400);
assert.equal((await call({ ...base, quantity: 0, requestType: 'sourcing', context: { category: 'computers', requestedModel: 'ThinkPad' } })).status, 400);
assert.equal((await call({ ...base, requestType: 'bad', context: {} })).status, 400);
assert.equal((await call({ ...base, website: 'bot' })).status, 200);
console.log('quote API audit: passed');
