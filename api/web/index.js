// api/web/index.js - LAVAALL Web (websites + AI automation) front end, one function.
//
// Same pattern as api/starlink: Osman's folder is kept as-is in _site/ and only
// served through this function. Off-by-default: on Production every /web URL
// is a plain 404 unless WEB_ENABLED=1 (see _lib/flag.js). No nav link, menu
// item or card on lavaall.com points here. There is no backend: the inquiry
// form says "Preview only ... nothing was sent" (app.js) and posts nowhere.
//
// Routes (vercel.json rewrites /web/:path* -> /api/web?area=:path*):
//   GET /web/                     the page (_site/index.html, base /web/)
//   GET /web/<dir>/               <dir>/index.html (showcase/terra/, ...)
//   GET /web/<file>               static files in _site/ (folder layout kept)
//
// Work folders are committed with the snapshot but never served (404):
// see WORK_FOLDERS and docs/web/README.md ("Deploy-optional folders").
const fs = require('fs');
const path = require('path');
const { isEnabled } = require('./_lib/flag');

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
  html = html.replace(/<head>/i, `<head>\n<base href="${base}">\n<script>(function(l){var p=${canon};if(l.pathname!==p&&window.history&&history.replaceState)history.replaceState(null,"",p+l.search+l.hash);})(location);</script>`);
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
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
  }
  try {
    const hit = resolve(areaOf(req));
    if (!hit) return notFound(res);
    return serveFile(req, res, hit);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 500, 'Server error', 'text/plain; charset=utf-8');
  }
}

module.exports = handler;
module.exports.WORK_FOLDERS = WORK_FOLDERS;
