'use strict';
const assert = require('node:assert/strict');
const contact = require('../api/contact');
const quote = require('../api/quote');
const { verifyTurnstile } = require('../api/_lib/turnstile');
const PASS = '1x0000000000000000000000000000000AA';
const BLOCK = '2x0000000000000000000000000000000AA';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const originalFetch = global.fetch;
function res() {
  return { status(code) { this.code = code; return this; }, setHeader() { return this; }, send(value) { this.body = JSON.parse(value); return this; } };
}
const contactBody = { inquiryType: 'general-inquiry', name: 'Test Person', email: 'person@example.test', country: 'US', subject: 'Inquiry', message: 'Test message', preferredResponse: 'email', consent: true };
const quoteBody = { requestType: 'sourcing', name: 'Test Person', email: 'person@example.test', phone: '1234567890', company: 'Test Co', country: 'US', quantity: 1, 'gdpr-consent': 'yes', context: { category: 'Computers', requestedModel: 'Laptop' } };
async function run() {
  process.env.CONTACT_WEBHOOK_URL = 'https://example.test/contact';
  process.env.QUOTE_WEBHOOK_URL = 'https://example.test/quote';
  let calls = [], verificationSuccess = true;
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => url === SITEVERIFY ? { success: verificationSuccess } : { ok: true } };
  };
  process.env.TURNSTILE_SECRET_KEY = PASS;
  let out = res();
  await contact({ method: 'POST', headers: { 'x-forwarded-for': '192.0.2.1, 192.0.2.2' }, body: { ...contactBody, turnstileToken: TOKEN } }, out);
  assert.equal(out.code, 202);
  assert.deepEqual(calls[0], { url: SITEVERIFY, body: { secret: PASS, response: TOKEN, remoteip: '192.0.2.1' } });
  assert.equal(calls.length, 2);
  calls = []; out = res();
  await quote({ method: 'POST', headers: { 'x-real-ip': '192.0.2.3' }, body: { ...quoteBody, 'cf-turnstile-response': TOKEN } }, out);
  assert.equal(out.code, 202);
  assert.equal(calls[0].body.remoteip, '192.0.2.3');
  assert.equal(calls.length, 2);
  process.env.TURNSTILE_SECRET_KEY = BLOCK; verificationSuccess = false; calls = []; out = res();
  await contact({ method: 'POST', headers: { 'x-forwarded-for': '192.0.2.4' }, body: { ...contactBody, turnstileToken: TOKEN } }, out);
  assert.equal(out.code, 400); assert.equal(out.body.error, 'turnstile_failed'); assert.match(out.body.message, /verification/i); assert.equal(calls.length, 1);
  calls = []; out = res();
  await contact({ method: 'POST', headers: { 'x-forwarded-for': '192.0.2.5' }, body: contactBody }, out);
  assert.equal(out.code, 400); assert.equal(out.body.error, 'turnstile_required'); assert.match(out.body.message, /verification/i); assert.equal(calls.length, 0);
  delete process.env.TURNSTILE_SECRET_KEY; calls = []; out = res();
  await contact({ method: 'POST', headers: { 'x-forwarded-for': '192.0.2.6' }, body: contactBody }, out);
  assert.equal(out.code, 202); assert.equal(calls.length, 1); assert.notEqual(calls[0].url, SITEVERIFY);
  process.env.TURNSTILE_SECRET_KEY = PASS;
  global.fetch = async () => { throw new Error('network'); };
  assert.equal((await verifyTurnstile({ turnstileToken: TOKEN })).error, 'turnstile_failed');
  console.log('PASS Turnstile pass, fail, missing secret, missing token, and network failure');
}
run().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; delete process.env.TURNSTILE_SECRET_KEY; });
