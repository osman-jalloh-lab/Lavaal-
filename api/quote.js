const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 12_000;
const { hit } = require('./_shared_limits');
const crypto = require('crypto');

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().replace(/[<>"'`]/g, '').slice(0, max) : '';
}
function json(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body)); }
function signQuoteBody(secret, ts, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex');
}

async function quote(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const raw = JSON.stringify(req.body || '');
  if (raw.length > MAX_BODY) return json(res, 413, { error: 'payload_too_large' });
  const body = req.body || {};
  if (body.website) return json(res, 200, { accepted: true });
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const requestType = clean(body.requestType, 32);
  const name = clean(body.name, 100), email = clean(body.email, 100), phone = clean(body.phone, 20);
  const company = clean(body.company, 100), country = clean(body.country, 50), message = clean(body.message, 2000);
  const quantity = Number(body.quantity ?? 1);
  if (!['verified-product', 'sourcing'].includes(requestType) || body['gdpr-consent'] !== 'yes' || name.length < 2 || !EMAIL.test(email) || phone.length < 7 || company.length < 2 || !country || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return json(res, 400, { error: 'invalid_quote_request' });
  const context = body.context || {};
  if (requestType === 'verified-product') {
    if (!clean(context.productName, 240) || !clean(context.sourceProductId, 64) || !clean(context.mpn, 128) || context.verified !== true) return json(res, 400, { error: 'invalid_verified_context' });
  } else if (!clean(context.category, 80) || !clean(context.requestedModel, 240) || context.sourceProductId || context.mpn || context.gtin) return json(res, 400, { error: 'invalid_sourcing_context' });
  const safeContext = requestType === 'verified-product'
    ? { productName: clean(context.productName, 240), sourceProductId: clean(context.sourceProductId, 64), mpn: clean(context.mpn, 128), verified: true }
    : { category: clean(context.category, 80), requestedModel: clean(context.requestedModel, 240) };
  const optionalFields = requestType === 'verified-product' ? { gtin: 32, brand: 80, category: 80 } : { brand: 80 };
  for (const [key, max] of Object.entries(optionalFields)) {
    const value = clean(context[key], max);
    if (value) safeContext[key] = value;
  }
  const limit = await hit('quote:' + ip, { windowMs: 60_000, max: 1 });
  if (limit.limited) return json(res, 429, { error: 'rate_limited' });
  let webhook = process.env.QUOTE_WEBHOOK_URL;
  if (webhook) {
    try {
      const url = new URL(webhook);
      if (url.protocol !== 'https:' && !(process.env.VERCEL_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('bad_webhook_url');
    } catch {
      console.log(JSON.stringify({ type: 'QuoteDelivery', event: 'bad_webhook_url' }));
      webhook = undefined;
    }
  }
  if (webhook) {
    try {
      const payload = { requestType, name, email, phone, company, country, quantity, message, context: safeContext, receivedAt: new Date().toISOString() };
      const secret = process.env.QUOTE_WEBHOOK_SECRET;
      const headers = { 'Content-Type': 'application/json' };
      if (secret && secret.length >= 16) payload.secret = secret;
      const deliveryBody = JSON.stringify(payload);
      if (payload.secret) {
        const ts = String(Math.floor(Date.now() / 1000));
        headers['X-Lavaall-Timestamp'] = ts;
        headers['X-Lavaall-Signature'] = signQuoteBody(secret, ts, deliveryBody);
      }
      const delivery = await fetch(webhook, { method: 'POST', headers, body: deliveryBody, signal: AbortSignal.timeout(10000) });
      if (delivery.ok && (await delivery.json())?.ok === true) return json(res, 202, { accepted: true });
    } catch {}
    return json(res, 502, { error: 'delivery_failed', message: 'We could not deliver your quote request. Please try again shortly.' });
  }
  // Delivery is intentionally unavailable until an authorized provider is
  // configured. Never acknowledge a quote as delivered without durable handoff.
  return json(res, 503, { error: 'delivery_not_configured', message: 'Quote delivery is not configured yet. Please use the contact options in the quote panel.' });
}
module.exports = quote;
module.exports.signQuoteBody = signQuoteBody;
