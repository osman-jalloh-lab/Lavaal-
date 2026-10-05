// LAVAALL Web front end in the umbrella: flag, static serving under /web/,
// work folders never served, folder rules (no fake prices, hidden WhatsApp,
// support@ only), byte-identical snapshot, and "never public" guarantees.
//   node tests/test-web.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const ENV_KEYS = ['VERCEL', 'VERCEL_ENV', 'WEB_ENABLED'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function env(vars) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
}

const handler = require('../api/web/index.js');
const SITE = path.join(root, 'api/web/_site');
const TEXT = /(\.(html|css|js|mjs|json|md|txt|svg|example)|[\\/]\.gitignore)$/i;
// Text files hashed with line endings normalised to LF (Windows checkouts still match).
const sha = (f) => {
  let buf = fs.readFileSync(f);
  if (TEXT.test(f)) buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
};
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}
const rel = (f) => path.relative(SITE, f).split(path.sep).join('/');

function call(method, area, opts = {}) {
  const req = { method, url: '/api/web?area=' + encodeURIComponent(area), query: { area }, headers: { ...(opts.headers || {}) } };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(chunk) {
        const buf = chunk == null ? Buffer.alloc(0) : Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        resolve({ status: this.statusCode, headers: this.headers, buf, text: buf.toString('utf8') });
      },
    };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 'threw', error: e }));
  });
}

// Every relative URL a page asks for (src, href, poster, data-src, srcset, css url()).
function refsOf(html) {
  const out = new Set();
  for (const m of html.matchAll(/\b(?:src|href|poster|data-src)=["']([^"']+)["']/gi)) out.add(m[1]);
  for (const m of html.matchAll(/\bsrcset=["']([^"']+)["']/gi)) m[1].split(',').forEach((p) => out.add(p.trim().split(/\s+/)[0]));
  return [...out].filter((u) => u && !/^(#|https?:|mailto:|tel:|data:|about:|javascript:|\/\/)/i.test(u) && !u.includes('${'));
}
function cssRefs(css) {
  css = css.replace(/url\(\s*(["'])data:[\s\S]*?\1\s*\)/gi, '');
  return [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1]).filter((u) => !/^(data:|https?:|#)/i.test(u));
}
const join = (dir, u) => path.posix.normalize(path.posix.join(dir, u.split(/[?#]/)[0]));

async function run() {
  // ---- Off on Production by default ----
  env({ VERCEL: '1', VERCEL_ENV: 'production' });
  for (const area of ['', 'index.html', 'styles.css', 'showcase/terra/']) {
    const r = await call('GET', area);
    check(`production default: /web/${area} is 404`, r.status === 404 && r.text === 'Not found');
  }
  env({ VERCEL: '1' });
  check('VERCEL without VERCEL_ENV counts as production (404)', (await call('GET', '')).status === 404);
  env({ VERCEL: '1', VERCEL_ENV: 'production', WEB_ENABLED: '1' });
  check('WEB_ENABLED=1 turns it on in production', (await call('GET', '')).status === 200);
  env({ VERCEL: '1', VERCEL_ENV: 'preview', WEB_ENABLED: '0' });
  check('WEB_ENABLED=0 turns it off on preview', (await call('GET', '')).status === 404);
  env({ VERCEL: '1', VERCEL_ENV: 'preview' });
  check('preview default: on', (await call('GET', '')).status === 200);
  env({});

  // ---- The page ----
  const page = await call('GET', '');
  check('page served with base href /web/', page.status === 200 && page.text.includes('<base href="/web/">') && page.headers['content-type'].startsWith('text/html'));
  for (const area of ['index.html', '/']) {
    const r = await call('GET', area);
    check(`/web/${area} serves the same page`, r.status === 200 && r.text.includes('<base href="/web/">') && r.text.includes('id="web-inquiry"'));
  }
  check('page moves the address bar to /web/ so #anchors stay same-document', page.text.includes('var p="/web/";') && page.text.includes('history.replaceState(null,"",p+l.search+l.hash)'));
  check('page is noindex (meta + header) while hidden', page.text.includes('<meta name="robots" content="noindex, nofollow">') && page.headers['x-robots-tag'] === 'noindex, nofollow');
  check('responses allow same-origin framing (templates/showcase iframes)', page.headers['x-frame-options'] === 'SAMEORIGIN');
  check('page is not cached', page.headers['cache-control'] === 'no-store');

  const terra = await call('GET', 'showcase/terra');
  const terraSlash = await call('GET', 'showcase/terra/');
  check('/web/showcase/terra (no slash) serves TERRA with base /web/showcase/terra/', terra.status === 200 && terra.text.includes('<base href="/web/showcase/terra/">'));
  check('/web/showcase/terra/ serves the same page', terraSlash.status === 200 && terraSlash.text === terra.text);
  const t1 = await call('GET', 'templates/t1.html');
  check('templates/t1.html gets base /web/templates/ and keeps its own path', t1.status === 200 && t1.text.includes('<base href="/web/templates/">') && t1.text.includes('var p="/web/templates/t1.html";'));

  // ---- No 404s: every relative URL the served HTML/CSS asks for exists and is served ----
  const htmlFiles = walk(SITE).map(rel).filter((r) => r.endsWith('.html') && !handler.WORK_FOLDERS.some((re) => re.test(r)));
  const missing = [];
  for (const h of htmlFiles) {
    const dir = path.posix.dirname(h) === '.' ? '' : path.posix.dirname(h);
    const raw = fs.readFileSync(path.join(SITE, h), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const u of refsOf(raw)) {
      const target = join(dir, u);
      const r = await call('HEAD', target);
      if (r.status !== 200) missing.push(h + ' -> ' + u + ' (' + r.status + ')');
    }
  }
  for (const c of walk(SITE).map(rel).filter((r) => r.endsWith('.css') && !handler.WORK_FOLDERS.some((re) => re.test(r)))) {
    const dir = path.posix.dirname(c) === '.' ? '' : path.posix.dirname(c);
    for (const u of cssRefs(fs.readFileSync(path.join(SITE, c), 'utf8'))) {
      const r = await call('HEAD', join(dir, u));
      if (r.status !== 200) missing.push(c + ' -> ' + u + ' (' + r.status + ')');
    }
  }
  check(`every relative URL in ${htmlFiles.length} served HTML pages + their CSS resolves (${missing.slice(0, 5).join('; ') || 'none missing'})`, htmlFiles.length >= 10 && missing.length === 0);
  const appJs = fs.readFileSync(path.join(SITE, 'app.js'), 'utf8');
  const jsRefs = [...new Set([...appJs.matchAll(/['"]((?:assets|templates|showcase|videos|content)\/[A-Za-z0-9._\-/]+\.[a-z0-9]{2,5})['"]/g)].map((m) => m[1]))];
  const jsMissing = [];
  for (const u of jsRefs) { if ((await call('HEAD', u)).status !== 200) jsMissing.push(u); }
  check(`asset paths named in app.js are served (${jsRefs.length} checked${jsMissing.length ? ': ' + jsMissing.join(', ') : ''})`, jsMissing.length === 0);
  check('no root-absolute asset URLs on the main page (would escape /web/)', !/\b(?:src|href|poster|data-src)=["']\/(?!\/)/i.test(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')));

  // ---- Static file types, caching, ranges ----
  const css = await call('GET', 'styles.css');
  check('styles.css served as CSS with caching', css.status === 200 && css.headers['content-type'].startsWith('text/css') && /max-age=/.test(css.headers['cache-control']));
  const font = await call('HEAD', 'assets/fonts/inter-tight-600.woff2');
  check('self-hosted font served as font/woff2', font.status === 200 && font.headers['content-type'] === 'font/woff2');
  const heroSize = fs.statSync(path.join(SITE, 'assets/video/hero.mp4')).size;
  const range = await call('GET', 'assets/video/hero.mp4', { headers: { range: 'bytes=0-1023' } });
  check('video answers byte ranges (206) for Safari', range.status === 206 && range.buf.length === 1024 && range.headers['content-range'] === `bytes 0-1023/${heroSize}` && range.headers['content-type'] === 'video/mp4');
  const tail = await call('GET', 'assets/video/hero.mp4', { headers: { range: 'bytes=-100' } });
  check('suffix byte range works', tail.status === 206 && tail.buf.length === 100);
  check('out-of-range request is 416', (await call('GET', 'assets/video/hero.mp4', { headers: { range: `bytes=${heroSize + 10}-` } })).status === 416);
  check('POST is 405 (no backend)', (await call('POST', '')).status === 405);

  // ---- Work folders, docs and dot files are never served ----
  for (const area of ['qa/full-1440.png', 'assets/video/raw/shop.mp4', 'assets/video/raw/', 'tools/package.json', 'sections/os/qa/', 'qa/',
    'PLAN.md', 'TODO.md', 'AGENT-BRIEF.md', '.env', '.env.example', '.gitignore', '.vscode/settings.json', 'tools/', '../index.js', 'showcase/../../index.js', '..%2findex.js']) {
    const r = await call('GET', area);
    check(`/web/${area} is 404`, r.status === 404);
  }
  const anyWork = walk(SITE).map(rel).filter((r) => handler.WORK_FOLDERS.some((re) => re.test(r)));
  let workServed = 0;
  for (const r of anyWork) { if ((await call('HEAD', r)).status !== 404) workServed++; }
  check(`none of the ${anyWork.length} work-folder files is served`, anyWork.length > 300 && workServed === 0);

  // ---- Folder rules ----
  const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const en = JSON.parse(fs.readFileSync(path.join(SITE, 'content/en.json'), 'utf8'));
  check('WhatsApp button is hidden in the HTML', /<a [^>]*id="wa"[^>]*\bhidden\b/.test(idx));
  check('WhatsApp number is empty in app.js and en.json, and app.js only shows the button when set',
    /var WHATSAPP_NUMBER = '';/.test(appJs) && en.whatsapp && en.whatsapp.number === '' && /if \(WHATSAPP_NUMBER\) \{/.test(appJs));
  const emails = [...new Set([...(idx + appJs + JSON.stringify(en)).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g)].map((m) => m[0].toLowerCase()))];
  check(`the only email on the page is support@lavaall.com (${emails.join(', ')})`, emails.length === 1 && emails[0] === 'support@lavaall.com');
  check('no prices on the main page, app.js or en.json', !/\b(SLE|SLL|NLe|USD|GNF|LRD)\s?[0-9]|[$€£]\s?[0-9]|\bLe\s?[0-9]/.test(idx + appJs + JSON.stringify(en)));
  check('no client logos, testimonials or "trusted by" claims on the main page', !/testimonial|trusted by|our clients|happy clients|\b[0-9]{2,}\+? (clients|businesses|customers)\b/i.test(idx));
  check('form says nothing is sent (no backend)', appJs.includes('Preview only: this form is not connected yet, so nothing was sent.') && !/fetch\(|XMLHttpRequest|sendBeacon/.test(appJs));
  check('main page makes no external requests (fonts self-hosted)', !/<(script|link|img|video|source|iframe)[^>]+(src|href)=["'](https?:)?\/\//i.test(idx));

  // ---- Snapshot: byte-identical to Osman's folder except the integration edits ----
  const manifest = fs.readFileSync(path.join(root, 'docs/web/WEB-SOURCE.md'), 'utf8');
  const rows = [...manifest.matchAll(/^\| `([^`]+)` \| `([0-9a-f]{64})` \| (identical|edited) \|/gm)];
  const files = walk(SITE).map(rel).sort();
  check('source manifest lists every _site file', rows.length > 500 && rows.length === files.length && rows.map((r) => r[1]).sort().join() === files.join());
  const ident = rows.filter((r) => r[3] === 'identical');
  const bad = ident.filter((r) => sha(path.join(SITE, r[1])) !== r[2]).map((r) => r[1]);
  check(`untouched files match the OneDrive snapshot (${bad.slice(0, 3).join(', ') || 'all match'})`, ident.length > 500 && bad.length === 0);
  check('only index.html and content/en.json carry edits', rows.filter((r) => r[3] === 'edited').map((r) => r[1]).sort().join() === 'content/en.json,index.html');
  check('no .env and no node_modules in the snapshot', !files.some((f) => /(^|\/)\.env$/.test(f) || f.includes('node_modules/')));
  const crlf = files.filter((f) => TEXT.test('/' + f) && fs.readFileSync(path.join(SITE, f)).includes(13));
  check(`text files use LF like the repo (${crlf.slice(0, 3).join(', ') || 'none CRLF'})`, crlf.length === 0);
  const secretRe = /(sk-[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{10,}|EAA[A-Za-z0-9]{20,}|REFERO_API_KEY=\S+)/;
  check('no API keys or tokens in any snapshot text file', !files.filter((f) => TEXT.test('/' + f)).some((f) => secretRe.test(fs.readFileSync(path.join(SITE, f), 'utf8'))));

  // ---- Wiring + never public on lavaall.com ----
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  check('vercel.json rewrites /web, /web/ and /web/:path* to the function', ['/web', '/web/', '/web/:path*'].every((s) => vercel.rewrites.some((r) => r.source === s && r.destination.startsWith('/api/web?area='))));
  check('/web rewrites come before the "/" catch-all', vercel.rewrites.findIndex((r) => r.source === '/web/:path*') < vercel.rewrites.findIndex((r) => r.source === '/'));
  check('vercel.json bundles _site into the function', vercel.functions['api/web/index.js'] && vercel.functions['api/web/index.js'].includeFiles === 'api/web/_site/**');
  const hdr = vercel.headers.find((h) => h.source === '/web/(.*)');
  const globalIdx = vercel.headers.findIndex((h) => h.source === '/(.*)');
  check('vercel.json allows same-origin framing under /web/ after the site-wide DENY', hdr && hdr.headers.some((h) => h.key === 'X-Frame-Options' && h.value === 'SAMEORIGIN') && vercel.headers.indexOf(hdr) > globalIdx);
  const fnCount = walk(path.join(root, 'api')).filter((f) => f.endsWith('.js') && !rel(f).split('/').some((s) => s.startsWith('_')) && !path.relative(path.join(root, 'api'), f).split(path.sep).some((s) => s.startsWith('_'))).length;
  check(`serverless function count stays within Hobby's 12 (${fnCount})`, fnCount <= 12);
  for (const f of ['index.html', 'privacy.html', 'terms.html', 'assets/js/catalog.js']) {
    check(`${f} has no link to /web`, !/href=["'](\/web\b|https?:\/\/(www\.)?lavaall\.com\/web\b)/i.test(fs.readFileSync(path.join(root, f), 'utf8')));
  }
  const ignore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  check('.vercelignore keeps Web docs, dev runner and test off the public site', ['docs/web/', 'scripts/web/', 'tests/test-web.js'].every((e) => ignore.includes(e)));
  check('.vercelignore does not hide anything the site or functions need', !ignore.some((l) => /^(api|assets|images|index\.html|docs\/ops)/.test(l)));
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }

  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
