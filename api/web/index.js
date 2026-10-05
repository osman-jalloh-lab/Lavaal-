// api/web/index.js - LAVAALL Web (websites + AI automation) front end, one function.
//
// Same pattern as api/starlink: Osman's folder is kept as-is in _site/ and only
// served through this function. Off-by-default: on Production every /web URL
// is a plain 404 unless WEB_ENABLED=1 (see _lib/flag.js). No nav link, menu
// item or card on lavaall.com points here. The inquiry form has its own
// switch (WEB_INQUIRY_ENABLED, also OFF on Production by default).
//
// Routes (vercel.json rewrites /web/:path* -> /api/web?area=:path*):
//   GET  /web/                    the page (_site/index.html, base /web/)
//   GET  /web/work/               Our work page (_site/work/index.html, base /web/work/)
//   GET  /web/<dir>/              <dir>/index.html (showcase/terra/, ...)
//   GET  /web/<file>              static files in _site/ (folder layout kept)
//   POST /web/api/inquiry         the inquiry form -> support@lavaall.com via the
//                                 main site's email router (see _lib/inquiry.js)
//   GET  /web/api/health          flag + transport status (no secrets)
//   GET  /web/api/outbox          mock-transport outbox (never on Production)
//
// Work folders are committed with the snapshot but never served (404):
// see WORK_FOLDERS and docs/web/README.md ("Deploy-optional folders").
const fs = require('fs');
const path = require('path');
const { isEnabled, isProduction } = require('./_lib/flag');
const inquiry = require('./_lib/inquiry');
const MAX_BODY = 8_000;

const SITE = path.join(__dirname, '_site');
const BASE = '/web/';
const OG_DEFAULT = 'https://lavaall.com/web/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
};
// Deploy-optional work folders (kept in the repo, marked, not served):
// raw Higgsfield clips (Osman's TODO: "Do not deploy"), QA screenshots,
// Playwright scripts. Matched against the path inside _site/.
const WORK_FOLDERS = [
  /^assets\/video\/raw(\/|$)/,
  /^qa(\/|$)/,
  /^sections\/[^/]+\/qa(\/|$)/,
  /^tools(\/|$)/,
];

function send(res, status, body, type) {
  res.statusCode = status;
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  // The page shows templates/ and showcase/ inside same-origin iframes.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (type) res.setHeader('Content-Type', type);
  res.end(body);
}
function notFound(res) {
  res.setHeader('Cache-Control', 'no-store');
  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
}

function areaOf(req) {
  let area = req.query && typeof req.query.area !== 'undefined' ? req.query.area : null;
  if (area == null) {
    try { area = new URL(req.url || '/', 'http://local').searchParams.get('area'); } catch { area = ''; }
  }
  if (Array.isArray(area)) area = area.join('/');
  return String(area || '').replace(/^\/+/, '');
}

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

function clientIp(req) {
  return String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else if (typeof req.on === 'function') {
    raw = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (c) => { data += c; if (data.length > MAX_BODY) reject(Object.assign(new Error('too_large'), { code: 'too_large' })); });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }
  if (raw.length > MAX_BODY) throw Object.assign(new Error('too_large'), { code: 'too_large' });
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw Object.assign(new Error('bad_json'), { code: 'bad_json' }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('bad_json'), { code: 'bad_json' });
  return parsed;
}

// WhatsApp number for the page's WhatsApp buttons: content/en.json whatsapp.number
// (digits only). Empty -> the buttons stay hidden.
function whatsappNumber() {
  try {
    const en = JSON.parse(fs.readFileSync(path.join(SITE, 'content/en.json'), 'utf8'));
    return String((en.whatsapp && en.whatsapp.number) || '').replace(/\D/g, '').slice(0, 15);
  } catch { return ''; }
}

async function api(req, res, parts) {
  const m = req.method;
  if (parts[0] === 'health' && parts.length === 1 && m === 'GET') return json(res, 200, { ok: true, inquiry: inquiry.status() });
  if (parts[0] === 'inquiry' && parts.length === 1) {
    if (m !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'method_not_allowed' }); }
    const body = await readBody(req);
    const r = await inquiry.handleInquiry(body, clientIp(req));
    return json(res, r.status, r.body);
  }
  if (parts[0] === 'outbox' && parts.length === 1 && m === 'GET') {
    if (isProduction() || inquiry.mode() !== 'mock') return json(res, 404, { error: 'not_found' });
    return json(res, 200, { mode: 'mock', count: inquiry.outbox.length, rows: inquiry.outbox });
  }
  return json(res, 404, { error: 'not_found' });
}

function isWorkFile(rel) {
  return WORK_FOLDERS.some((re) => re.test(rel));
}

// Resolve an area to a file inside _site, or null. Directories serve their
// index.html. Returns { rel, file, dir } where dir is the URL folder for <base>.
function resolve(area) {
  let rel = area.replace(/\/+$/, '');
  if (rel !== '' && !/^[A-Za-z0-9._\-/]+$/.test(rel)) return null;
  if (rel.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) return null;
  let file = rel ? path.join(SITE, rel) : SITE;
  if (file !== SITE && !file.startsWith(SITE + path.sep)) return null;
  if (!fs.existsSync(file)) return null;
  let dir;
  if (fs.statSync(file).isDirectory()) {
    dir = rel ? rel + '/' : '';
    rel = dir + 'index.html';
    file = path.join(SITE, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  } else {
    dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
  }
  if (isWorkFile(rel)) return null;
  return { rel, file, dir, canonical: BASE + (rel.endsWith('index.html') ? dir : rel) };
}

// The request's own origin, for absolute og:url on Preview/local.
function requestOrigin(req) {
  const h = req.headers || {};
  const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
  if (!/^[A-Za-z0-9.-]+(:[0-9]{1,5})?$/.test(host)) return '';
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = String(h['x-forwarded-proto'] || (local ? 'http' : 'https')).split(',')[0].trim();
  return (proto === 'http' || proto === 'https') ? proto + '://' + host : '';
}

// Pin relative URLs to the page's own folder under /web/ (so /web and
// /web/showcase/terra without a trailing slash still load their files), and
// move the address bar there so in-page #anchors stay same-document.
function renderPage(req, raw, hit) {
  let html = raw.toString('utf8');
  const base = BASE + hit.dir;
  const canon = JSON.stringify(hit.canonical);
  const cfg = JSON.stringify({ api: BASE + 'api', whatsapp: whatsappNumber() }).replace(/</g, '\\u003c');
  html = html.replace(/<head>/i, `<head>\n<base href="${base}">\n<script>window.LV_WEB=${cfg};(function(l){var p=${canon};if(l.pathname!==p&&window.history&&history.replaceState)history.replaceState(null,"",p+l.search+l.hash);})(location);</script>`);
  const origin = requestOrigin(req);
  if (origin) html = html.split(OG_DEFAULT).join(origin + BASE);
  return Buffer.from(html);
}

function serveFile(req, res, hit) {
  const type = TYPES[path.extname(hit.file).toLowerCase()];
  if (!type) return notFound(res);
  if (type.startsWith('text/html')) {
    const body = renderPage(req, fs.readFileSync(hit.file), hit);
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') return send(res, 200, '', type);
    return send(res, 200, body, type);
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const size = fs.statSync(hit.file).size;
  // Byte ranges for video (Safari will not play an mp4 without them).
  const range = req.headers && req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    let [a, b] = range.slice(6).split('-');
    let start = a === '' ? Math.max(0, size - Number(b)) : Number(a);
    let end = a === '' || b === '' ? size - 1 : Math.min(Number(b), size - 1);
    if (start > end || start >= size) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return send(res, 416, '', type);
    }
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    if (req.method === 'HEAD') return send(res, 206, '', type);
    const buf = Buffer.alloc(end - start + 1);
    const fd = fs.openSync(hit.file, 'r');
    try { fs.readSync(fd, buf, 0, buf.length, start); } finally { fs.closeSync(fd); }
    return send(res, 206, buf, type);
  }
  res.setHeader('Content-Length', String(size));
  if (req.method === 'HEAD') return send(res, 200, '', type);
  return send(res, 200, fs.readFileSync(hit.file), type);
}

async function handler(req, res) {
  if (!isEnabled()) return notFound(res);
  const area = areaOf(req);
  if (area === 'api' || area.startsWith('api/')) {
    try {
      return await api(req, res, area.replace(/\/+$/, '').split('/').slice(1));
    } catch (err) {
      if (err && err.code === 'too_large') return json(res, 413, { error: 'payload_too_large' });
      if (err && err.code === 'bad_json') return json(res, 400, { error: 'invalid_json' });
      return json(res, 500, { error: 'server_error' });
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
  }
  try {
    const hit = resolve(area);
    if (!hit) return notFound(res);
    return serveFile(req, res, hit);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 500, 'Server error', 'text/plain; charset=utf-8');
  }
}

module.exports = handler;
module.exports.WORK_FOLDERS = WORK_FOLDERS;
module.exports.inquiry = inquiry;
