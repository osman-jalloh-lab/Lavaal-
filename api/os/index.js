// api/os/index.js — LAVAALL OS, founders only. Preview only. Read-only.
// Reached through the single /os rewrite in vercel.json:
//   /os/:path*  ->  /api/os?area=:path*
// "" serves the app shell; app.css and app.js are the shell's own assets.
// Same sign-in as /ops. No writes, no model calls, no new env vars.

const fs = require('fs');
const path = require('path');

const { json, queryOf } = require('../ops/_lib');
const { loadOsData } = require('../ops/_os_data');
const { osGuard } = require('../ops/_os_guard');
const { OS_CSP, osPage } = require('./_page');

const assetCache = new Map();

// Literal paths so the function tracer ships these files with the function.
function readAsset(name) {
  switch (name) {
    case 'app.css':
      return fs.readFileSync(path.join(__dirname, '_client/os.css'), 'utf8');
    case 'app.js':
      return [
        fs.readFileSync(path.join(__dirname, '_client/core.js'), 'utf8'),
      ].join('\n');
    default:
      return null;
  }
}

const ASSET_TYPES = Object.freeze({
  'app.css': 'text/css; charset=utf-8',
  'app.js': 'application/javascript; charset=utf-8',
});

function assetBody(name) {
  if (!assetCache.has(name)) assetCache.set(name, readAsset(name));
  return assetCache.get(name);
}

function baseHeaders(res, type) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Security-Policy', OS_CSP);
  res.setHeader('Content-Type', type);
}

function firstQuery(query, key) {
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function areaOf(req) {
  const raw = String(firstQuery(queryOf(req), 'area') || '').replace(/^\/+|\/+$/g, '');
  return raw.toLowerCase();
}

function deny(req, res, access) {
  if (access.status === 401 && req.method === 'GET' && !String(req.headers && req.headers.accept || '').includes('json')) {
    // Same sign-in as /ops: send the founder to the existing login page.
    baseHeaders(res, 'text/plain; charset=utf-8');
    res.status(302).setHeader('Location', '/ops').send('');
    return;
  }
  json(res, access.status, { error: access.error });
}

async function os(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'method_not_allowed' });
  }
  const access = await osGuard(req);
  if (!access.session) return deny(req, res, access);

  const area = areaOf(req);
  if (area === 'app.css' || area === 'app.js') {
    baseHeaders(res, ASSET_TYPES[area]);
    return res.status(200).send(assetBody(area));
  }
  if (area !== '') {
    baseHeaders(res, 'text/plain; charset=utf-8');
    return res.status(404).send('Not found');
  }

  const data = await loadOsData();
  baseHeaders(res, 'text/html; charset=utf-8');
  return res.status(200).send(osPage({ email: access.session.email, data }));
}

module.exports = os;
module.exports.default = os;
module.exports.assetBody = assetBody;
