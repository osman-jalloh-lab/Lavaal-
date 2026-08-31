// api/schedule.js — LAVAALL "Schedule a Call" widget: Vercel serverless
// function. Same pattern as api/contact.js (validate + sanitize server-side,
// never trust client-supplied routing, never acknowledge success without a
// durable handoff) but proxies to the Google Calendar booking backend
// (scripts/booking-scheduler/booking-router.gs) instead of the email
// router. One file, three actions, dispatched by ?action= (GET) or
// body.action (POST) so the front end only has one endpoint to know about.

const MAX_BODY = 8_000;
const recentByEmail = new Map(); // mirrors contact.js's per-IP map, keyed by email here

const REASONS = [
  'sales', 'quotation', 'availability', 'procurement', 'routers', 'servers',
  'computers', 'fiber', 'cabling', 'support', 'technical', 'order',
  'partnership', 'general', 'other',
];
const CALL_METHODS = ['phone', 'meet'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+]?[0-9\s\-()]{7,20}$/;

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().replace(/[<>"'`]/g, '').slice(0, max) : '';
}
function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}
function rateLimited(key, windowMs = 30_000) {
  const now = Date.now();
  const last = recentByEmail.get(key) || 0;
  if (now - last < windowMs) return true;
  recentByEmail.set(key, now);
  return false;
}
async function callBackend(action, params, isPost) {
  const base = process.env.BOOKING_WEBHOOK_URL;
  if (!base) return { ok: false, status: 503, body: { error: 'scheduling_not_configured', message: 'Scheduling is not configured yet. Please email us directly or use Send an Inquiry.' } };

  try {
    let response;
    if (isPost) {
      response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, action, secret: process.env.BOOKING_WEBHOOK_SECRET || undefined }),
      });
    } else {
      const url = new URL(base);
      url.searchParams.set('action', action);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      response = await fetch(url.toString());
    }
    const body = await response.json();
    return { ok: response.ok, status: response.status, body };
  } catch {
    return { ok: false, status: 502, body: { error: 'delivery_failed', message: 'We could not reach the scheduler. Please try again shortly.' } };
  }
}

async function schedule(req, res) {
  const action = req.method === 'GET' ? req.query.action : req.body?.action;

  if (action === 'availability') {
    const date = clean(req.query.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'invalid_date' });
    const result = await callBackend('availability', { date }, false);
    return json(res, result.status, result.body);
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const raw = JSON.stringify(req.body || '');
  if (raw.length > MAX_BODY) return json(res, 413, { error: 'payload_too_large' });
  const body = req.body || {};
  if (body.website) return json(res, 200, { accepted: true }); // honeypot

  if (action === 'register') {
    const firstName = clean(body.firstName, 60);
    const lastName = clean(body.lastName, 60);
    const email = clean(body.email, 100);
    const phone = clean(body.phone, 20);
    const country = clean(body.country, 50);
    const reason = clean(body.reason, 30);
    const preferredCallMethod = clean(body.preferredCallMethod, 20);
    const note = clean(body.note, 500);
    const language = clean(body.language, 5) || 'en';
    const consent = body.consent === true || body.consent === 'yes';

    const errors = [];
    if (firstName.length < 1) errors.push('First name is required.');
    if (lastName.length < 1) errors.push('Last name is required.');
    if (!EMAIL.test(email)) errors.push('A valid email address is required.');
    if (!PHONE.test(phone)) errors.push('A valid phone number is required.');
    if (!country) errors.push('Country is required.');
    if (!REASONS.includes(reason)) errors.push('A valid reason for the call is required.');
    if (!CALL_METHODS.includes(preferredCallMethod)) errors.push('A valid preferred call method is required.');
    if (!consent) errors.push('Consent is required.');
    if (errors.length) return json(res, 400, { error: 'invalid_registration', errors });

    if (rateLimited('reg_' + email.toLowerCase())) {
      return json(res, 429, { error: 'rate_limited', message: 'Please wait a moment before trying again.' });
    }

    const result = await callBackend('register', {
      firstName, lastName, email, phone, country, reason, preferredCallMethod, note,
      language, consent: true, customerTimezone: clean(body.customerTimezone, 60),
      sourcePage: clean(body.sourcePage, 200) || 'lavaall.com',
      bookingBaseUrl: `https://${req.headers.host || 'www.lavaall.com'}/schedule`,
    }, true);
    return json(res, result.status, result.body);
  }

  if (action === 'book') {
    const leadId = clean(body.leadId, 60);
    const token = clean(body.token, 80);
    const date = clean(body.date, 10);
    const time = clean(body.time, 5);
    if (!leadId || !token) return json(res, 400, { error: 'missing_lead_or_token' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return json(res, 400, { error: 'invalid_date_or_time' });

    if (rateLimited('book_' + leadId, 5_000)) {
      return json(res, 429, { error: 'rate_limited', message: 'Please wait a moment before trying again.' });
    }

    const result = await callBackend('book', { leadId, token, date, time }, true);
    return json(res, result.status, result.body);
  }

  return json(res, 400, { error: 'unknown_action' });
}

module.exports = schedule;
