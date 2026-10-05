// Local runner for LAVAALL Web inside the umbrella site (no Vercel CLI, no npm deps).
//   node scripts/web/dev-server.js            -> http://127.0.0.1:8788/web/
//   PORT=8851 node scripts/web/dev-server.js
// Mirrors vercel.json: /web/:path* -> /api/web?area=:path*, and (when the
// Starlink branch is present) /starlink/:path* -> /api/starlink?area=:path*.
// Everything else is the umbrella's static files from the repo root
// (/ -> index.html), so the vertical can be checked next to lavaall.com.
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

delete process.env.VERCEL;
const root = path.join(__dirname, '..', '..');
const web = require('../../api/web/index.js');
const starlinkPath = path.join(root, 'api/starlink/index.js');
let starlink = null;
if (fs.existsSync(starlinkPath)) {
  if (!process.env.STARLINK_STORE_FILE) process.env.STARLINK_STORE_FILE = path.join(os.tmpdir(), 'lavaall-starlink-dev.json');
  starlink = require(starlinkPath);
}
const port = Number(process.env.PORT) || 8788;
const host = process.env.HOST || '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

function viaFunction(fn, name, rest, req, res, url) {
  const params = new URLSearchParams(url.search);
  params.set('area', decodeURIComponent(rest || ''));
  req.url = `/api/${name}?` + params.toString();
  req.query = Object.fromEntries(params.entries());
  Promise.resolve(fn(req, res)).catch(() => { res.statusCode = 500; res.end('error'); });
}

function staticFile(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel === '' || rel === 'schedule') rel = 'index.html';
  // Same as Vercel: api/, dot-folders and underscore folders are not static files.
  if (/^(api|node_modules)\//.test(rel) || rel.split('/').some((s) => s.startsWith('.') || s.startsWith('_') || s === '..')) {
    res.statusCode = 404; return res.end('Not found');
  }
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404; return res.end('Not found');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  const w = url.pathname.match(/^\/web(?:\/(.*))?$/);
  if (w) return viaFunction(web, 'web', w[1], req, res, url);
  const s = url.pathname.match(/^\/starlink(?:\/(.*))?$/);
  if (s) {
    if (!starlink) { res.statusCode = 404; return res.end('Not found'); }
    return viaFunction(starlink, 'starlink', s[1], req, res, url);
  }
  return staticFile(req, res, url.pathname);
});

server.listen(port, host, () => {
  console.log(`LAVAALL umbrella + Web on http://${host}:${port}/  (Web: /web/${starlink ? ', Starlink: /starlink/v4/' : ''})`);
});
