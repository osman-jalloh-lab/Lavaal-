// api/starlink/index.js - LAVAALL Starlink v4 page + backend (one function).
//
// Off-by-default: on Production every /starlink URL is a plain 404 unless
// STARLINK_ENABLED=1 (see _lib/flag.js). No nav link, menu item or card on
// lavaall.com points here. Delivery is TEST MODE ONLY (see _lib/delivery.js).
//
// Routes (vercel.json rewrites /starlink/:path* -> /api/starlink?area=:path*):
//   GET  /starlink/                          the v4 page (_site/v4/index.html, base /starlink/v4/)
//   GET  /starlink/v4/*, /starlink/assets/*  static files in _site/ (v4 layout kept as-is)
//   GET  /starlink/api/health                flag, store and delivery status
//   GET  /starlink/api/config                contact links the page uses (server-configured)
//   POST /starlink/api/setups                builder answers -> stored setup code
//   GET  /starlink/api/setups/:code          look a setup code up (no contact details)
//   POST /starlink/api/setups/:code/connect  "Get connected": record lead, prepare delivery
//   GET  /starlink/api/outbox                test outbox, masked (never on Production)
const fs = require('fs');
const path = require('path');
const { isEnabled, isProduction, deployEnv } = require('./_lib/flag');
const store = require('./_lib/store');
const delivery = require('./_lib/delivery');
const { validateAnswers, normalizePhone, normalizeEmail, clean } = require('./_lib/validate');
const { recommend } = require('./_lib/recommend');
const { newCode, normalizeCode } = require('./_lib/codes');

const SITE = path.join(__dirname, '_site');
const BASE_HREF = '/starlink/v4/';
const PAGE = 'v4/index.html';
const PAGE_AREAS = new Set(['', 'index.html', 'v4', 'v4/index.html']);
const OG_DEFAULT = 'https://lavaall.com/starlink/';
const MAX_BODY = 8_000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const hits = new Map();
function limited(bucket, ip, max, windowMs) {
  const key = bucket + ':' + ip;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  return false;
}

function send(res, status, body, type) {
  res.statusCode = status;
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (type) res.setHeader('Content-Type', type);
  res.end(body);
}
function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}
function notFound(res) {
  res.setHeader('Cache-Control', 'no-store');
  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
}

function clientIp(req) {
  return String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();
}

function areaOf(req) {
  let area = req.query && typeof req.query.area !== 'undefined' ? req.query.area : null;
  if (area == null) {
    try { area = new URL(req.url || '/', 'http://local').searchParams.get('area'); } catch { area = ''; }
  }
  if (Array.isArray(area)) area = area.join('/');
  return String(area || '').replace(/^\/+|\/+$/g, '');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else if (typeof req.on === 'function') {
    raw = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (c) => { data += c; if (data.length > MAX_BODY) { reject(Object.assign(new Error('too_large'), { code: 'too_large' })); } });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }
  if (raw.length > MAX_BODY) throw Object.assign(new Error('too_large'), { code: 'too_large' });
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('bad_json'), { code: 'bad_json' }); }
}

function publicView(rec) {
  return {
    code: rec.code,
    status: rec.status,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    answers: rec.answers,
    recommendation: { title: rec.recommendation.title, items: rec.recommendation.items, labels: rec.recommendation.labels, note: rec.recommendation.note },
    contact: rec.lead ? { whatsapp: Boolean(rec.lead.whatsapp), email: Boolean(rec.lead.email) } : null,
  };
}

async function createSetup(req, res) {
  if (limited('create', clientIp(req), 30, 10 * 60_000)) return json(res, 429, { error: 'rate_limited', message: 'Please wait a moment and try again.' });
  const body = await readBody(req);
  if (body.website) return json(res, 200, { accepted: true });
  const v = validateAnswers(body);
  if (!v.ok) return json(res, 400, { error: 'invalid_answers', fields: v.errors });
  const now = new Date().toISOString();
  const rec = {
    code: '',
    answers: v.answers,
    recommendation: recommend(v.answers),
    status: 'new',
    createdAt: now,
    updatedAt: now,
    source: 'starlink-v4',
    env: deployEnv(),
    lead: null,
    connectCount: 0,
  };
  for (let i = 0; i < 8; i++) {
    rec.code = newCode();
    if (await store.createSetup(rec)) return json(res, 201, publicView(rec));
  }
  return json(res, 503, { error: 'code_unavailable', message: 'Could not create a setup code. Please try again.' });
}

async function getSetup(res, code) {
  const c = normalizeCode(code);
  if (!c) return json(res, 400, { error: 'invalid_code' });
  const rec = await store.getSetup(c);
  if (!rec) return json(res, 404, { error: 'not_found' });
  return json(res, 200, publicView(rec));
}

async function connect(req, res, code) {
  if (limited('connect', clientIp(req), 6, 10 * 60_000)) return json(res, 429, { error: 'rate_limited', message: 'Please wait a moment and try again.' });
  const c = normalizeCode(code);
  if (!c) return json(res, 400, { error: 'invalid_code' });
  const body = await readBody(req);
  if (body.website) return json(res, 200, { accepted: true });
  const rec = await store.getSetup(c);
  if (!rec) return json(res, 404, { error: 'not_found', message: 'That setup code was not found. Please build your setup again.' });
  if ((rec.connectCount || 0) >= 5) return json(res, 429, { error: 'too_many_requests', message: 'We already have your details for this setup.' });

  const whatsapp = normalizePhone(body.whatsapp, rec.answers.country);
  const email = normalizeEmail(body.email);
  const errors = [];
  if (whatsapp === null) errors.push('whatsapp');
  if (email === null) errors.push('email');
  if (errors.length) return json(res, 400, { error: 'invalid_contact', fields: errors, message: 'Check the WhatsApp number or email and try again.' });
  if (!whatsapp && !email) return json(res, 400, { error: 'contact_required', message: 'Add a WhatsApp number or email so we can reach you.' });

  const now = new Date().toISOString();
  rec.lead = { whatsapp: whatsapp || '', email: email || '', name: clean(body.name, 100), at: now };
  rec.status = 'lead';
  rec.updatedAt = now;
  rec.connectCount = (rec.connectCount || 0) + 1;
  const result = await delivery.prepare(rec);
  rec.deliveries = [...(rec.deliveries || []), ...result.recorded.map((r) => r.id)].slice(-20);
  await store.updateSetup(rec);
  return json(res, 200, {
    ok: true,
    code: rec.code,
    status: rec.status,
    contact: { whatsapp: Boolean(whatsapp), email: Boolean(email) },
    delivery: { mode: result.mode, sent: false, recorded: result.recorded },
    links: result.links,
  });
}

async function outbox(req, res) {
  if (isProduction()) return notFound(res);
  let limit = 50;
  try { limit = Number(new URL(req.url || '/', 'http://local').searchParams.get('limit')) || 50; } catch {}
  const rows = await store.listOutbox(limit);
  return json(res, 200, { mode: 'test', count: rows.length, rows: rows.map(delivery.masked) });
}

// The request's own origin, for absolute og:image URLs on Preview/local.
function requestOrigin(req) {
  const h = req.headers || {};
  const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
  if (!/^[A-Za-z0-9.-]+(:[0-9]{1,5})?$/.test(host)) return '';
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = String(h['x-forwarded-proto'] || (local ? 'http' : 'https')).split(',')[0].trim();
  return (proto === 'http' || proto === 'https') ? proto + '://' + host : '';
}

function pageConfig() {
  const c = delivery.publicContact();
  return { api: '/starlink/api', contact: { whatsapp: c.whatsapp, call: c.call, email: c.email } };
}

function renderPage(req, raw) {
  let html = raw.toString('utf8');
  const cfg = JSON.stringify(pageConfig()).replace(/</g, '\\u003c');
  html = html.replace('<head>', `<head>\n<base href="${BASE_HREF}">\n<script>window.LV_CONFIG=${cfg};(function(l){var p="${BASE_HREF}";if(l.pathname!==p&&window.history&&history.replaceState)history.replaceState(null,"",p+l.search+l.hash);})(location);</script>`);
  const origin = requestOrigin(req);
  if (origin) html = html.split(OG_DEFAULT).join(origin + '/starlink/');
  return Buffer.from(html);
}

function serveStatic(req, res, area) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
  const rel = PAGE_AREAS.has(area) ? PAGE : area;
  if (!/^[A-Za-z0-9._\-/]+$/.test(rel) || rel.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) return notFound(res);
  const file = path.join(SITE, rel);
  if (!file.startsWith(SITE + path.sep)) return notFound(res);
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type || !fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound(res);
  let body = fs.readFileSync(file);
  if (rel === PAGE) {
    // The page is served from /starlink/ (and /starlink/v4/). Pin relative
    // URLs to /starlink/v4/ so the v4 files keep their ../assets/ paths, and
    // move the address bar there too so in-page #anchors stay same-document.
    body = renderPage(req, body);
    res.setHeader('Cache-Control', 'no-store');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  if (req.method === 'HEAD') return send(res, 200, '', type);
  return send(res, 200, body, type);
}

async function handler(req, res) {
  if (!isEnabled()) return notFound(res);
  const area = areaOf(req);
  try {
    if (area === 'api' || area.startsWith('api/')) {
      const parts = area.split('/').slice(1);
      const m = req.method;
      if (parts[0] === 'health' && parts.length === 1 && m === 'GET') {
        return json(res, 200, { ok: true, enabled: true, env: deployEnv(), store: { mode: store.mode(), durable: store.isDurable() }, delivery: delivery.status() });
      }
      if (parts[0] === 'config' && parts.length === 1 && m === 'GET') {
        const c = delivery.publicContact();
        return json(res, 200, { ...pageConfig(), placeholders: c.placeholders });
      }
      if (parts[0] === 'setups' && parts.length === 1 && m === 'POST') return await createSetup(req, res);
      if (parts[0] === 'setups' && parts.length === 2 && m === 'GET') return await getSetup(res, parts[1]);
      if (parts[0] === 'setups' && parts.length === 3 && parts[2] === 'connect' && m === 'POST') return await connect(req, res, parts[1]);
      if (parts[0] === 'outbox' && parts.length === 1 && m === 'GET') return await outbox(req, res);
      return json(res, 404, { error: 'not_found' });
    }
    return serveStatic(req, res, area);
  } catch (err) {
    if (err && err.code === 'too_large') return json(res, 413, { error: 'payload_too_large' });
    if (err && err.code === 'bad_json') return json(res, 400, { error: 'invalid_json' });
    return json(res, 500, { error: 'server_error' });
  }
}

module.exports = handler;
