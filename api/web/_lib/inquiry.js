// LAVAALL Web inquiry: validate the /web/ form and hand it to the SAME
// server-side email path the main site's "Send an Inquiry" form uses
// (api/contact.js -> CONTACT_WEBHOOK_URL -> scripts/email-router/contact-router.gs,
// which sends from the LAVAALL Google Workspace with GmailApp). Always to
// support@lavaall.com. No email provider SDK, no credentials in code: the
// webhook URL and its shared secret come from the existing env vars.
//
// Switch: WEB_INQUIRY_ENABLED. Production default OFF (form answers 503 with
// an honest message); Preview/local default on. WEB_INQUIRY_TRANSPORT=mock
// records instead of sending (never honoured on Production). Tests replace
// the transport with setTransport() so nothing is ever sent from a test.
const { envFlag, isProduction, deployEnv } = require('./flag');

const SUPPORT_EMAIL = 'support@lavaall.com';
const TAG = '[Lavaall Website – LAVAALL Web Inquiry]';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+]?[0-9\s\-().]{7,22}$/;
// Keep in sync with the <select> options in _site/index.html #web-inquiry.
const OPTIONS = {
  type: ['Restaurant', 'Hotel or guesthouse', 'Online shop', 'Marketing or agency', 'Other'],
  country: ['Sierra Leone', 'Liberia', 'Other'],
  need: ['Website', 'Animated website', 'Automation', 'AI agent', 'Full business system', 'Not sure yet'],
};

function isEnabled() {
  const v = envFlag('WEB_INQUIRY_ENABLED');
  if (v !== null) return v;
  return !isProduction();
}

function mode() {
  if (!isProduction() && String(process.env.WEB_INQUIRY_TRANSPORT || '').trim().toLowerCase() === 'mock') return 'mock';
  return 'webhook';
}

function clean(value, max = 200) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().replace(/[<>"'`]/g, '').slice(0, max) : '';
}

function validate(body) {
  const v = {
    name: clean(body.name, 100),
    business: clean(body.business, 100),
    type: clean(body.type, 40),
    country: clean(body.country, 40),
    need: clean(body.need, 40),
    contact: clean(body.contact, 120),
    message: clean(body.message, 2000),
  };
  const fields = [];
  if (v.name.length < 2) fields.push('name');
  const isEmail = EMAIL.test(v.contact);
  const isPhone = !isEmail && PHONE.test(v.contact) && v.contact.replace(/\D/g, '').length >= 7;
  if (!isEmail && !isPhone) fields.push('contact');
  for (const k of ['type', 'country', 'need']) if (v[k] && !OPTIONS[k].includes(v[k])) fields.push(k);
  return { ok: fields.length === 0, fields, value: v, email: isEmail ? v.contact : '', phone: isPhone ? v.contact : '' };
}

// The payload contact-router.gs expects (same shape api/contact.js sends).
function payload(v, email, phone) {
  const testPrefix = isProduction() ? '' : 'Test: ';
  const who = v.business ? `${v.name}, ${v.business}` : v.name;
  const lines = [
    'Sent from the LAVAALL Web page (lavaall.com/web).',
    `Type of business: ${v.type || '(not given)'}`,
    `Needs: ${v.need || '(not given)'}`,
    `Contact: ${v.contact}${phone ? ' (phone / WhatsApp)' : ''}`,
    '',
    v.message || '(no message)',
  ];
  return {
    secret: process.env.CONTACT_WEBHOOK_SECRET || undefined,
    routeTo: SUPPORT_EMAIL,
    subject: `${testPrefix}${TAG} ${v.need || 'Inquiry'} · ${who}`.slice(0, 180),
    inquiryType: 'lavaall-web',
    name: v.name,
    email,
    phone,
    country: v.country,
    company: v.business,
    preferredContact: email ? 'email' : 'phone / WhatsApp',
    preferredCallback: '',
    message: lines.join('\n'),
    receivedAt: new Date().toISOString(),
  };
}

const outbox = [];
async function webhookTransport(p) {
  const url = process.env.CONTACT_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'delivery_not_configured' };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    // contact-router.gs answers HTTP 200 even for its own errors, so also read the body.
    let j = null; try { j = await r.json(); } catch {}
    if (r.ok && j && j.ok === true) return { ok: true };
    return { ok: false, error: 'delivery_failed' };
  } catch {
    return { ok: false, error: 'delivery_failed' };
  }
}
async function mockTransport(p) {
  const { secret, ...rest } = p;
  outbox.unshift({ at: new Date().toISOString(), ...rest });
  outbox.length = Math.min(outbox.length, 50);
  return { ok: true };
}
let override = null;
function setTransport(fn) { override = fn; }
function transport() {
  if (override) return override;
  return mode() === 'mock' ? mockTransport : webhookTransport;
}

const hits = new Map();
function limited(ip, max = 5, windowMs = 10 * 60_000) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  return false;
}
function resetLimits() { hits.clear(); }

const MESSAGES = {
  inquiry_off: 'Online inquiries are not switched on yet.',
  delivery_not_configured: 'Online inquiries are not set up yet.',
  delivery_failed: 'We could not deliver your inquiry just now.',
  rate_limited: 'Too many inquiries from this connection. Please wait a few minutes.',
};

// Returns { status, body } for the handler to send.
async function handleInquiry(body, ip) {
  if (!isEnabled()) return { status: 503, body: { error: 'inquiry_off', message: MESSAGES.inquiry_off } };
  if (body.website) return { status: 200, body: { ok: true, accepted: true } }; // honeypot: say nothing
  if (limited(ip)) return { status: 429, body: { error: 'rate_limited', message: MESSAGES.rate_limited } };
  const v = validate(body);
  if (!v.ok) {
    const msg = v.fields.includes('contact') ? 'Please add your name and a phone, WhatsApp number or email we can reply to.' : 'Please check the highlighted fields.';
    return { status: 400, body: { error: 'invalid_inquiry', fields: v.fields, message: msg } };
  }
  const p = payload(v.value, v.email, v.phone);
  const send = transport();
  const result = await send(p);
  if (result && result.ok) return { status: 200, body: { ok: true, mode: override ? 'test' : mode(), to: SUPPORT_EMAIL } };
  const err = (result && result.error) || 'delivery_failed';
  return { status: err === 'delivery_not_configured' ? 503 : 502, body: { error: err, message: MESSAGES[err] || MESSAGES.delivery_failed } };
}

function status() {
  return { enabled: isEnabled(), env: deployEnv(), transport: mode(), configured: mode() === 'mock' || Boolean(process.env.CONTACT_WEBHOOK_URL), to: SUPPORT_EMAIL };
}

module.exports = { handleInquiry, validate, payload, status, isEnabled, mode, setTransport, resetLimits, outbox, SUPPORT_EMAIL, OPTIONS };
