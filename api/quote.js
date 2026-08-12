const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 12_000;
const recent = new Map();

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().replace(/[<>"'`]/g, '').slice(0, max) : '';
}
function json(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body)); }

async function quote(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const raw = JSON.stringify(req.body || '');
  if (raw.length > MAX_BODY) return json(res, 413, { error: 'payload_too_large' });
  const body = req.body || {};
  if (body.website) return json(res, 200, { accepted: true });
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now(); const last = recent.get(ip) || 0;
  if (now - last < 60_000) return json(res, 429, { error: 'rate_limited' });
  const requestType = clean(body.requestType, 32);
  const name = clean(body.name, 100), email = clean(body.email, 100), phone = clean(body.phone, 20);
  const company = clean(body.company, 100), country = clean(body.country, 50), message = clean(body.message, 2000);
  const quantity = Number(body.quantity ?? 1);
  if (!['verified-product', 'sourcing'].includes(requestType) || body['gdpr-consent'] !== 'yes' || name.length < 2 || !EMAIL.test(email) || phone.length < 7 || company.length < 2 || !country || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return json(res, 400, { error: 'invalid_quote_request' });
  const context = body.context || {};
  if (requestType === 'verified-product') {
    if (!clean(context.productName, 240) || !clean(context.sourceProductId, 64) || !clean(context.mpn, 128) || context.verified !== true) return json(res, 400, { error: 'invalid_verified_context' });
  } else if (!clean(context.category, 80) || !clean(context.requestedModel, 240) || context.sourceProductId || context.mpn || context.gtin) return json(res, 400, { error: 'invalid_sourcing_context' });
  recent.set(ip, now);
  const webhook = process.env.QUOTE_WEBHOOK_URL;
  if (webhook) {
    try {
      const delivery = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType, name, email, phone, company, country, quantity, message, context, receivedAt: new Date().toISOString() }) });
      if (delivery.ok) return json(res, 202, { accepted: true });
    } catch {}
    return json(res, 502, { error: 'delivery_failed', message: 'We could not deliver your quote request. Please try again shortly.' });
  }
  // Delivery is intentionally unavailable until an authorized provider is
  // configured. Never acknowledge a quote as delivered without durable handoff.
  return json(res, 503, { error: 'delivery_not_configured', message: 'Quote delivery is not configured yet. Please use the contact options in the quote panel.' });
}
module.exports = quote;
