// scripts/os-dev-server.js — run /os on this PC, nothing else.
//   node scripts/os-dev-server.js            (default port 3100)
//   PORT=3200 node scripts/os-dev-server.js
// Reads .env.local (gitignored). With no store configured it uses an empty temp-file store. Binds to 127.0.0.1 only. Serves the same handlers
// the vercel.json rewrites reach: /os, /os/, /os/app.css, /os/app.js and the
// /api/os/ingest/<feed> feeds. Nothing else is served, and /ops is not mounted.
// Set OS_DEV_BYPASS=1 in .env.local to skip the founder sign-in on loopback only
// (see api/ops/_os_guard.js); without it /os redirects to /ops as it does online.

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) return;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
}

loadEnvFile(path.join(root, '.env.local'));

if (process.env.NODE_ENV === 'production') {
  console.error('os-dev-server: refusing to run with NODE_ENV=production');
  process.exit(1);
}

// Local only: with no store configured, give /os an empty one so Home shows normal empty states
// instead of "store could not be read". An ephemeral file in the OS temp folder, removed on exit.
// Never used when KV or OPS_STORE_FILE is set, and this script is not part of any deploy.
if (!process.env.OPS_STORE_FILE && !(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)) {
  const tmp = path.join(require('os').tmpdir(), `lavaall-os-dev-store-${process.pid}.json`);
  fs.writeFileSync(tmp, '{}');
  process.env.OPS_STORE_FILE = tmp;
  process.on('exit', () => { try { fs.unlinkSync(tmp); } catch { /* already gone */ } });
  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => process.exit(0)));
}

const os = require(path.join(root, 'api/os/index.js'));
const ingest = require(path.join(root, 'api/os/ingest/[feed].js'));

function wrap(req, res, query) {
  req.query = query;
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body) => { res.end(body == null ? '' : body); return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/os' || p === '/os/') {
      wrap(req, res, { area: '' });
      return await os(req, res);
    }
    if (p.startsWith('/os/')) {
      wrap(req, res, { area: p.slice(4) });
      return await os(req, res);
    }
    const feed = /^\/api\/os\/ingest\/([a-z-]+)$/.exec(p);
    if (feed) {
      const raw = req.method === 'POST' ? await readBody(req) : '';
      let body;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
      req.body = body;
      wrap(req, res, { feed: feed[1] });
      return await ingest(req, res);
    }
    if (/^\/images\/[\w./-]+$/.test(p) && !p.includes('..')) {
      const file = path.join(root, p);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const types = { '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
        res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
        return res.end(fs.readFileSync(file));
      }
    }
    if (p === '/') {
      res.statusCode = 302;
      res.setHeader('Location', '/os');
      return res.end();
    }
    res.statusCode = 404;
    res.end('Not found');
  } catch (err) {
    console.error(err && err.message);
    res.statusCode = 500;
    res.end('error');
  }
});

const port = Number(process.env.PORT) || 3100;
server.listen(port, '127.0.0.1', () => {
  const bypass = process.env.OS_DEV_BYPASS === '1';
  console.log(`LAVAALL OS (local): http://localhost:${port}/os  [dev bypass ${bypass ? 'ON' : 'off'}]`);
});
