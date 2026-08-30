// api/contact.js — LAVAALL general Contact Us form: Vercel serverless
// function. Validates + sanitizes the submission server-side, resolves the
// correct department mailbox from the inquiry type, and forwards a single
// JSON payload to CONTACT_WEBHOOK_URL for delivery (see the Google Apps
// Script router in scripts/email-router/contact-router.gs, which sends the
// email from the real Google Workspace inbox — no third-party email vendor
// or DNS change required). Mirrors the existing api/quote.js pattern:
// no npm dependency, no credentials in client code, never reports
// "delivered" without a durable handoff.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+]?[0-9\s\-()]{7,20}$/;
const MAX_BODY = 12_000;
const recent = new Map();

// Single source of truth for department routing. Keep in sync with the
// inquiry-type <select> in index.html (#contact section).
const ROUTES = {
  support:     { to: 'support@lavaall.com', tag: '[Lavaall Website – Support Request]' },
  sales:       { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Sales Request]' },
  callback:    { to: 'sales@lavaall.com',   tag: '[Lavaall Website – Callback Request]' },
  order:       { to: 'orders@lavaall.com',  tag: '[Lavaall Website – Order Inquiry]' },
  partnership: { to: 'contact@lavaall.com', tag: '[Lavaall Website – Partnership Inquiry]' },
  general:     { to: 'info@lavaall.com',    tag: '[Lavaall Website – General Inquiry]' },
};
const PREFERRED_CONTACT = ['email', 'phone', 'whatsapp'];

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().replace(/[<>"'`]/g, '').slice(0, max) : '';
}
function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

async function contact(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const raw = JSON.stringify(req.body || '');
  if (raw.length > MAX_BODY) return json(res, 413, { error: 'payload_too_large' });
  const body = req.body || {};

  // Honeypot: real visitors never populate this hidden field.
  if (body.website) return json(res, 200, { accepted: true });

  // Basic per-IP rate limit (in-memory; resets on cold start, same as quote.js).
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const last = recent.get(ip) || 0;
  if (now - last < 30_000) return json(res, 429, { error: 'rate_limited', message: 'Please wait a moment before submitting again.' });

  const inquiryType = clean(body.inquiryType, 32);
  const name = clean(body.name, 100);
  const email = clean(body.email, 100);
  const phone = clean(body.phone, 20);
  const country = clean(body.country, 50);
  const company = clean(body.company, 100);
  const subject = clean(body.subject, 150);
  const message = clean(body.message, 2000);
  const preferredContact = clean(body.preferredContact, 20);
  const preferredCallback = clean(body.preferredCallback, 100);
  const consent = body.consent === true || body.consent === 'yes';

  const errors = [];
  if (!ROUTES[inquiryType]) errors.push('A valid inquiry type is required.');
  if (name.length < 2) errors.push('Full name is required.');
  if (!EMAIL.test(email)) errors.push('A valid email address is required.');
  if (phone && !PHONE.test(phone)) errors.push('Phone number format is invalid.');
  if (!country) errors.push('Country is required.');
  if (!subject) errors.push('Subject is required.');
  if (message.length < 5) errors.push('Message is required.');
  if (!PREFERRED_CONTACT.includes(preferredContact)) errors.push('A valid preferred contact method is required.');
  if (inquiryType === 'callback' && !preferredCallback) errors.push('Preferred callback date/time is required for callback requests.');
  if (!consent) errors.push('Consent is required.');
  if (errors.length) return json(res, 400, { error: 'invalid_contact_request', errors });

  recent.set(ip, now);

  const route = ROUTES[inquiryType];
  const emailSubject = `${route.tag} ${subject}`.slice(0, 180);

  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (webhook) {
    try {
      // Apps Script Web Apps cannot reliably read custom HTTP headers, so
      // the shared secret travels inside the JSON body instead (checked by
      // contact-router.gs against its own CONTACT_WEBHOOK_SECRET property).
      const delivery = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.CONTACT_WEBHOOK_SECRET || undefined,
          routeTo: route.to,
          subject: emailSubject,
          inquiryType, name, email, phone, country, company,
          preferredContact, preferredCallback, message,
          receivedAt: new Date().toISOString(),
        }),
      });
      if (delivery.ok) return json(res, 202, { accepted: true, routedTo: route.to });
    } catch {
      // fall through to delivery_failed below
    }
    return json(res, 502, { error: 'delivery_failed', message: 'We could not deliver your message. Please try again shortly or email us directly.' });
  }

  // Delivery is intentionally unavailable until CONTACT_WEBHOOK_URL is
  // configured in Vercel. Never acknowledge a message as sent without a
  // durable handoff — see scripts/email-router/contact-router.gs.
  return json(res, 503, {
    error: 'delivery_not_configured',
    message: 'Message delivery is not configured yet. Please email us directly using the address shown for your inquiry type.',
  });
}

module.exports = contact;
