// Local runner for the Starlink page + API (no Vercel CLI, no npm deps).
//   node scripts/starlink/dev-server.js            -> http://localhost:8787/starlink/
//   PORT=8790 node scripts/starlink/dev-server.js
// Mirrors the vercel.json rewrite /starlink/:path* -> /api/starlink?area=:path*.
// Stores setups + outbox in STARLINK_STORE_FILE (defaults to a temp file).
// Delivery is test mode: nothing is sent; see GET /starlink/api/outbox.
const http = require('http');
const os = require('os');
const path = require('path');

if (!process.env.STARLINK_STORE_FILE) process.env.STARLINK_STORE_FILE = path.join(os.tmpdir(), 'lavaall-starlink-dev.json');
delete process.env.VERCEL;

const handler = require('../../api/starlink/index.js');
const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || '127.0.0.1';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  if (url.pathname === '/' ) { res.statusCode = 302; res.setHeader('Location', '/starlink/'); return res.end(); }
  const m = url.pathname.match(/^\/starlink(?:\/(.*))?$/);
  if (!m) { res.statusCode = 404; return res.end('Not found'); }
  const params = new URLSearchParams(url.search);
  params.set('area', decodeURIComponent(m[1] || ''));
  req.url = '/api/starlink?' + params.toString();
  req.query = Object.fromEntries(params.entries());
  Promise.resolve(handler(req, res)).catch(() => { res.statusCode = 500; res.end('error'); });
});

server.listen(port, host, () => {
  console.log(`LAVAALL Starlink (test mode) on http://${host}:${port}/starlink/`);
  console.log(`store: ${process.env.STARLINK_STORE_FILE}`);
});
