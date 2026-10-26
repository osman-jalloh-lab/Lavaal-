// scripts/dev-server.js — dependency-free local runner for the LAVAALL site.
//
// This is a DEV-ONLY convenience for Cloud Agent / local verification. It is
// not used by production: Vercel serves the static files and runs api/**.js as
// serverless functions there. This runner reproduces that locally so an agent
// can browse the public marketplace, exercise the api/ endpoints, and open the
// private /ops LAVAALL OS without the Vercel CLI or any npm install.
//
// It reads vercel.json for the same rewrites production uses, serves static
// files from the repo root, and dispatches /api/** to the matching handler
// module with a minimal Vercel-compatible (req,res) adapter.
//
// Usage: node scripts/dev-server.js [port]   (default 3000)

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 3000);

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const REWRITES = (vercel.rewrites || []).map(compileRewrite);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Convert a vercel rewrite `source` (supporting :param and :path*) into a
// matcher plus the destination template.
function compileRewrite(rule) {
  const names = [];
  const pattern = String(rule.source).replace(/:([A-Za-z0-9_]+)(\*?)/g, (_m, name, star) => {
    names.push(name);
    return star ? '(.*)' : '([^/]+)';
  });
  return { re: new RegExp('^' + pattern + '$'), names, dest: rule.destination };
}

// Apply the first matching rewrite. Returns { pathname, query } where query is
// the params injected by the rewrite destination.
function applyRewrites(pathname) {
  for (const rule of REWRITES) {
    const m = rule.re.exec(pathname);
    if (!m) continue;
    const captures = {};
    rule.names.forEach((name, i) => { captures[name] = m[i + 1]; });
    let dest = rule.dest;
    for (const name of rule.names) {
      dest = dest.split(':' + name + '*').join(captures[name]);
      dest = dest.split(':' + name).join(captures[name]);
    }
    const qIndex = dest.indexOf('?');
    const destPath = qIndex === -1 ? dest : dest.slice(0, qIndex);
    const query = {};
    if (qIndex !== -1) {
      for (const [k, v] of new URLSearchParams(dest.slice(qIndex + 1))) query[k] = v;
    }
    return { pathname: destPath, query };
  }
  return { pathname, query: {} };
}

function resolveHandler(pathname) {
  const rel = pathname.replace(/^\/+/, '');
  if (!rel.startsWith('api/')) return null;
  for (const candidate of [rel + '.js', path.join(rel, 'index.js')]) {
    const abs = path.join(ROOT, candidate);
    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

// Give the raw node response the small Vercel-style helpers the handlers use.
function adaptRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  const nativeSend = res.end.bind(res);
  res.send = (body) => {
    if (body === undefined || body === null) return nativeSend();
    if (typeof body === 'string' || Buffer.isBuffer(body)) return nativeSend(body);
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return nativeSend(JSON.stringify(body));
  };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return nativeSend(JSON.stringify(body));
  };
  return res;
}

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname.replace(/^\/+/, ''));
  if (rel === '') rel = 'index.html';
  const abs = path.join(ROOT, rel);
  if (!abs.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.stat(abs, (err, stat) => {
    if (err || !stat.isFile()) { res.statusCode = 404; return res.end('Not found'); }
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream');
    fs.createReadStream(abs).pipe(res);
  });
}

async function dispatchApi(handlerPath, req, res, injectedQuery) {
  const url = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(url.searchParams);
  Object.assign(query, injectedQuery);
  req.query = query;

  const rawBody = await readBody(req);
  const ct = String(req.headers['content-type'] || '');
  if (rawBody.length) {
    if (ct.includes('application/json')) {
      try { req.body = JSON.parse(rawBody.toString('utf8')); } catch { req.body = rawBody.toString('utf8'); }
    } else {
      req.body = rawBody.toString('utf8');
    }
  } else {
    req.body = {};
  }

  adaptRes(res);
  let handler;
  try {
    handler = require(handlerPath);
  } catch (err) {
    res.statusCode = 500;
    return res.end('Handler load error: ' + err.message);
  }
  const fn = typeof handler === 'function' ? handler : handler && handler.default;
  if (typeof fn !== 'function') { res.statusCode = 500; return res.end('Handler is not a function'); }
  try {
    await fn(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'handler_exception', message: String(err && err.message || err) }));
    }
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname, query } = applyRewrites(url.pathname);
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${url.pathname} -> ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
  });

  const handlerPath = resolveHandler(pathname);
  if (handlerPath) return void dispatchApi(handlerPath, req, res, query);
  return serveStatic(pathname, res);
});

server.listen(PORT, () => {
  console.log(`LAVAALL dev server on http://localhost:${PORT}`);
  console.log(`  public site : http://localhost:${PORT}/`);
  console.log(`  ops OS      : http://localhost:${PORT}/ops`);
});
