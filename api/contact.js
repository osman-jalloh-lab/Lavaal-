// api/contact.js — LAVAALL "Send an Inquiry" form: Vercel serverless
// function. Validates + sanitizes the submission server-side, resolves the
// correct department mailbox from the inquiry type, folds whichever
// conditional fields the customer filled in into the message body, and
// forwards a single JSON payload to CONTACT_WEBHOOK_URL for delivery (see
// scripts/email-router/contact-router.gs, unchanged and still the same
// deployed script -- this file only changes what it's handed, never how
// contact-router.gs itself works). No npm dependency, no credentials in
// client code, never reports "delivered" without a durable handoff.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+]?[0-9\s\-()]{7,20}$/;
const MAX_BODY = 14_000;
const recent = new Map();

// Single source of truth for the 15 inquiry types -> department mailbox,
// per the routing rules: sales/product/procurement -> sales, support ->
// support, orders -> orders, partnerships -> contact, general -> info.
// Keep the <select> in index.html's #inquiry form in sync with these keys.
const ROUTES = {
  'sales-quotation':        { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Sales / Quotation]' },
  'product-availability':   { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Product Availability]' },
  'equipment-procurement':  { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Equipment Procurement]' },
  'routers-networking':     { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Routers & Networking]' },
  'servers-infrastructure': { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Servers & Infrastructure]' },
  'computers-workstations': { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Computers & Workstations]' },
  'fiber-optic':            { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Fiber-Optic Products]' },
  'structured-cabling':     { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Structured Cabling]' },
  'installation-services':  { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Installation Services]' },
  'customer-support':       { to: 'support@lavaall.com', tag: '[Lavaall Website – Customer Support]' },
  'technical-support':      { to: 'support@lavaall.com', tag: '[Lavaall Website – Technical Support]' },
  'existing-order':         { to: 'orders@lavaall.com',  tag: '[Lavaall Website – Existing Order]' },
  'partnership':            { to: 'contact@lavaall.com', tag: '[Lavaall Website – Partnership]' },
  'general-inquiry':        { to: 'info@lavaall.com',    tag: '[Lavaall Website – General Inquiry]' },
  'other':                  { to: 'info@lavaall.com',    tag: '[Lavaall Website – Other]' },
};
const PREFERRED_RESPONSE = ['email', 'phone'];

// Inquiry types that require an order/reference number (PART 2: Existing Order).
const REQUIRES_ORDER_NUMBER = new Set(['existing-order']);

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().replace(/[<>"'`]/g, '').slice(0, max) : '';
}
function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

// Folds whichever conditional fields apply for this inquiry type into a
// readable block appended to the customer's own message. contact-router.gs
// is never touched -- it just receives a longer, still-plain-text message.
function buildExtraDetails(type, body) {
  const lines = [];
  const add = (label, val) => { const v = clean(val, 300); if (v) lines.push(`${label}: ${v}`); };

  if (['sales-quotation', 'product-availability', 'equipment-procurement', 'routers-networking',
       'servers-infrastructure', 'computers-workstations', 'fiber-optic', 'structured-cabling'].includes(type)) {
    add('Product or service', body.productOrService);
    add('Model', body.model);
    add('Quantity', body.quantity);
    add('Approximate budget', body.budget);
    add('Delivery country/location', body.deliveryLocation);
    add('Required timeline', body.timeline);
  }
  if (['customer-support', 'technical-support'].includes(type)) {
    add('Product', body.productOrService);
    add('Order / reference number', body.orderNumber);
    add('Issue description', body.issueDescription);
  }
  if (type === 'existing-order') {
    add('Order / reference number', body.orderNumber);
    add('Nature of request', body.issueDescription);
  }
  if (type === 'installation-services') {
    add('Installation type', body.installationType);
    add('Project location', body.deliveryLocation);
    add('Estimated timeline', body.timeline);
    add('Project description', body.projectDescription);
  }
  return lines;
}

async function contact(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const raw = JSON.stringify(req.body || '');
  if (raw.length > MAX_BODY) return json(res, 413, { error: 'payload_too_large' });
  const body = req.body || {};

  // Honeypot: real visitors never populate this hidden field.
  if (body.website) return json(res, 200, { accepted: true });

  // Basic per-IP rate limit (in-memory; resets on cold start, same as before).
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const last = recent.get(ip) || 0;
  if (now - last < 30_000) return json(res, 429, { error: 'rate_limited', message: 'Please wait a moment before submitting again.' });

  const inquiryType = clean(body.inquiryType, 40);
  const name = clean(body.name, 100);
  const email = clean(body.email, 100);
  const phone = clean(body.phone, 20);
  const country = clean(body.country, 50);
  const company = clean(body.company, 100);
  const subject = clean(body.subject, 150);
  const message = clean(body.message, 2000);
  const preferredResponse = clean(body.preferredResponse, 20);
  const consent = body.consent === true || body.consent === 'yes';

  const errors = [];
  if (!ROUTES[inquiryType]) errors.push('A valid inquiry type is required.');
  if (name.length < 2) errors.push('Full name is required.');
  if (!EMAIL.test(email)) errors.push('A valid email address is required.');
  if (phone && !PHONE.test(phone)) errors.push('Phone number format is invalid.');
  if (!country) errors.push('Country is required.');
  if (!subject) errors.push('Subject is required.');
  if (message.length < 5) errors.push('Message is required.');
  if (!PREFERRED_RESPONSE.includes(preferredResponse)) errors.push('A valid preferred response method is required.');
  if (REQUIRES_ORDER_NUMBER.has(inquiryType) && !clean(body.orderNumber)) errors.push('An order or reference number is required for this inquiry type.');
  if (!consent) errors.push('Consent is required.');
  if (errors.length) return json(res, 400, { error: 'invalid_contact_request', errors });

  recent.set(ip, now);

  const route = ROUTES[inquiryType];
  const emailSubject = `${route.tag} ${subject}`.slice(0, 180);
  const extra = buildExtraDetails(inquiryType, body);
  const fullMessage = extra.length ? `${message}\n\n${extra.join('\n')}` : message;

  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (webhook) {
    try {
      const delivery = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.CONTACT_WEBHOOK_SECRET || undefined,
          routeTo: route.to,
          subject: emailSubject,
          inquiryType, name, email, phone, country, company,
          preferredContact: preferredResponse, preferredCallback: '',
          message: fullMessage,
          receivedAt: new Date().toISOString(),
        }),
      });
      if (delivery.ok) return json(res, 202, { accepted: true, routedTo: route.to });
    } catch {
      // fall through to delivery_failed below
    }
    return json(res, 502, { error: 'delivery_failed', message: 'We could not deliver your message. Please try again shortly or email us directly.' });
  }

  return json(res, 503, {
    error: 'delivery_not_configured',
    message: 'Message delivery is not configured yet. Please email us directly using the address shown for your inquiry type.',
  });
}

module.exports = contact;
