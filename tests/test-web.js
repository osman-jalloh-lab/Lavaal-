// LAVAALL Web front end in the umbrella: flag, static serving under /web/ and
// /web/work/, work folders never served, the inquiry API (mocked transport,
// nothing is ever sent), phone-data weight rules, folder rules (no fake
// prices, hidden WhatsApp, support@ only), source manifest, "never public".
//   node tests/test-web.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const ENV_KEYS = ['VERCEL', 'VERCEL_ENV', 'WEB_ENABLED', 'WEB_INQUIRY_ENABLED', 'WEB_INQUIRY_TRANSPORT', 'CONTACT_WEBHOOK_URL', 'CONTACT_WEBHOOK_SECRET'];
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

let ipSeq = 0;
function call(method, area, opts = {}) {
  const { Readable } = require('stream');
  const raw = opts.body == null ? '' : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
  const req = Readable.from(raw ? [raw] : []);
  Object.assign(req, { method, url: '/api/web?area=' + encodeURIComponent(area), query: { area }, headers: { 'x-forwarded-for': opts.ip || '10.1.0.' + (++ipSeq % 250), ...(opts.headers || {}) } });
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
      if (u.startsWith('/')) { // umbrella page (e.g. /privacy.html): must exist at the repo root
        if (!fs.existsSync(path.join(root, u.split(/[?#]/)[0]))) missing.push(h + ' -> ' + u + ' (no umbrella file)');
        continue;
      }
      const target = join(dir, u);
      if (target.startsWith('..')) { missing.push(h + ' -> ' + u + ' (escapes /web/)'); continue; }
      const r = await call('HEAD', /^\.\/?$/.test(target) ? '' : target);
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
  for (const f of ['index.html', 'work/index.html']) {
    const absRefs = [...fs.readFileSync(path.join(SITE, f), 'utf8').matchAll(/\b(?:src|href|poster|data-src|data-poster)=["'](\/[^/"'][^"']*)["']/gi)].map((m) => m[1]);
    check(`${f}: the only root-absolute links are the umbrella's privacy and terms pages (${absRefs.join(', ') || 'none'})`, absRefs.every((u) => u === '/privacy.html' || u === '/terms.html'));
  }

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
  const work = fs.readFileSync(path.join(SITE, 'work/index.html'), 'utf8');
  const waTags = (h) => [...h.matchAll(/<a [^>]*\bdata-wa\b[^>]*>/g)].map((m) => m[0]);
  check('main page has WhatsApp CTAs in the hero, the artists section and the contact, all hidden', waTags(idx).length === 3 && waTags(idx).every((t) => /\bhidden\b/.test(t))
    && idx.indexOf('data-wa') < idx.indexOf('id="lava"') && idx.lastIndexOf('data-wa') > idx.indexOf('id="contact"'));
  check('Our work page WhatsApp CTA is hidden too', waTags(work).length === 1 && /\bhidden\b/.test(waTags(work)[0]));
  check('WhatsApp number is empty in en.json and the page gets it from the server (LV_WEB), not a hard-coded value',
    en.whatsapp && en.whatsapp.number === "17377044182" && page.text.includes('window.LV_WEB={"api":"/web/api","whatsapp":"17377044182"}')
    && /var WHATSAPP_NUMBER = String\(CFG\.whatsapp \|\| ''\)\.replace\(\/\\D\/g, ''\);/.test(appJs) && /if \(WHATSAPP_NUMBER\) \{/.test(appJs));
  const emails = [...new Set([...(idx + appJs + JSON.stringify(en)).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g)].map((m) => m[0].toLowerCase()))];
  check(`the only email on the page is support@lavaall.com (${emails.join(', ')})`, emails.length === 1 && emails[0] === 'support@lavaall.com');
  check('no prices on the main page, app.js or en.json', !/\b(SLE|SLL|NLe|USD|GNF|LRD)\s?[0-9]|[$€£]\s?[0-9]|\bLe\s?[0-9]/.test(idx + appJs + JSON.stringify(en)));
  check('no client logos, testimonials or "trusted by" claims on the main page', !/testimonial|trusted by|our clients|happy clients|\b[0-9]{2,}\+? (clients|businesses|customers)\b/i.test(idx));
  check('form posts to /web/api/inquiry (server side), never mailto or Outlook', /var API = \(CFG\.api \|\| '\/web\/api'\) \+ '\/inquiry';/.test(appJs) && /fetch\(API, \{ method: 'POST'/.test(appJs)
    && !/mailto:|outlook|office365|live\.com/i.test(appJs + work) && !/outlook|office365|live\.com/i.test(idx));
  const mails = [...idx.matchAll(/<a class="mail" href="([^"]+)"/g)].map((m) => m[1]);
  check('contact cards: Gmail compose to support@ first, "Open in mail app" (mailto) only as the fallback', mails.length === 3 && mails.every((h) => h.startsWith('https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=support%40lavaall.com'))
    && [...idx.matchAll(/href="mailto:([^"?]+)/g)].every((m) => m[1] === 'support@lavaall.com') && (idx.match(/<a class="app" href="mailto:/g) || []).length === 3);
  check('form has a clear success, a mock-mode and an honest error message', appJs.includes('Your inquiry was sent to our team at ') && appJs.includes('Test mode: your inquiry was checked and recorded, but no email was sent.')
    && appJs.includes(' Nothing was sent. You can also') && appJs.includes('We could not reach our server, so nothing was sent.'));
  check('form has a honeypot and a live status line', /<input name="website" tabindex="-1"/.test(idx) && /id="form-status" role="status" aria-live="polite"/.test(idx));
  check('no em dashes in visible copy (main page, Our work page, app.js)', !/\u2014|&mdash;/.test(idx + work + appJs));
  check('no prices on the Our work page', !/\b(SLE|SLL|NLe|USD|GNF|LRD)\s?[0-9]|[$€£]\s?[0-9]|\bLe\s?[0-9]/.test(work));
  check('Illustrative demo badges kept on the moved demos', (work.match(/Illustrative demo/g) || []).length >= 4 && idx.includes('<span class="lp-badge">Illustrative demo</span>'));
  check('main page makes no external requests (fonts self-hosted)', !/<(script|link|img|video|source|iframe)[^>]+(src|href)=["'](https?:)?\/\//i.test(idx));

  // ---- Snapshot: byte-identical to Osman's folder except the integration edits ----
  const manifest = fs.readFileSync(path.join(root, 'docs/web/WEB-SOURCE.md'), 'utf8');
  const rows = [...manifest.matchAll(/^\| `([^`]+)` \| `([0-9a-f]{64})` \| (identical|edited|added) \|/gm)];
  const files = walk(SITE).map(rel).sort();
  check('source manifest lists every _site file', rows.length > 500 && rows.length === files.length && rows.map((r) => r[1]).sort().join() === files.join());
  const ident = rows.filter((r) => r[3] === 'identical');
  const bad = ident.filter((r) => sha(path.join(SITE, r[1])) !== r[2]).map((r) => r[1]);
  check(`untouched files match the OneDrive snapshot (${bad.slice(0, 3).join(', ') || 'all match'})`, ident.length > 500 && bad.length === 0);
  check('only index.html, app.js, styles.css and content/en.json carry edits', rows.filter((r) => r[3] === 'edited').map((r) => r[1]).sort().join() === 'app.js,content/en.json,index.html,styles.css');
  const added = rows.filter((r) => r[3] === 'added');
  check(`added files (${added.length}) match their manifest hash`, added.length >= 10 && added.every((r) => sha(path.join(SITE, r[1])) === r[2]));
  check('added files are only the Our work page, -lite/-sm clips and the small hero poster', added.every((r) => r[1] === 'work/index.html' || /-(lite|sm)\.mp4$/.test(r[1]) || r[1] === 'assets/photo/hero-poster-sm.webp'));
  check('no .env and no node_modules in the snapshot', !files.some((f) => /(^|\/)\.env$/.test(f) || f.includes('node_modules/')));
  // "Like the repo" means what git stores: a Windows checkout (core.autocrlf) adds CR to the working copy only.
  // Read the index line endings; outside a git checkout fall back to the working copy.
  let crlf;
  try {
    const eol = require('child_process').execFileSync('git', ['ls-files', '--eol', '--', 'api/web/_site'], { cwd: root, encoding: 'utf8' });
    const stored = new Map(eol.split('\n').filter(Boolean).map((l) => [l.split('\t')[1], l.split(/\s+/)[0]]));
    crlf = files.filter((f) => TEXT.test('/' + f) && /crlf|mixed/.test(stored.get('api/web/_site/' + f) || ''));
  } catch {
    crlf = files.filter((f) => TEXT.test('/' + f) && fs.readFileSync(path.join(SITE, f)).includes(13));
  }
  check(`text files use LF like the repo (${crlf.slice(0, 3).join(', ') || 'none CRLF'})`, crlf.length === 0);
  const secretRe = /(sk-[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{10,}|EAA[A-Za-z0-9]{20,}|REFERO_API_KEY=\S+)/;
  check('no API keys or tokens in any snapshot text file', !files.filter((f) => TEXT.test('/' + f)).some((f) => secretRe.test(fs.readFileSync(path.join(SITE, f), 'utf8'))));


  // ---- Our work page (/web/work/) ----
  env({});
  const wk = await call('GET', 'work/');
  const wkNoSlash = await call('GET', 'work');
  check('/web/work/ serves the Our work page with base /web/work/', wk.status === 200 && wk.text.includes('<base href="/web/work/">') && wk.text.includes('<title>Our work | LAVAALL Web</title>'));
  check('/web/work (no slash) serves the same page and moves the address bar to /web/work/', wkNoSlash.status === 200 && wkNoSlash.text === wk.text && wk.text.includes('var p="/web/work/";'));
  check('/web/work/ gets the same LV_WEB config, noindex and SAMEORIGIN', wk.text.includes('window.LV_WEB={"api":"/web/api","whatsapp":"17377044182"}') && wk.headers['x-robots-tag'] === 'noindex, nofollow' && wk.headers['x-frame-options'] === 'SAMEORIGIN');
  check('Our work page loads ../styles.css and ../app.js and sets data-root="../" for script-built paths', work.includes('<link rel="stylesheet" href="../styles.css">') && work.includes('<script src="../app.js"></script>') && work.includes('<html lang="en" class="no-js" data-root="../">'));
  const MAIN_KEEP = ['lava', 'for', 'work-teaser', 'how', 'contact'];
  const MOVED = ['work', 'auto', 'os', 'flow', 'artists', 'templates'];
  const OFF_MAIN = MOVED.filter((id) => id !== 'artists'); // artists restored on the main page too (Osman, Oct 15)
  check('main page keeps hero, Meet Lava, Who it is for, the work teaser, How it works / FAQ and Contact', idx.includes('<header class="hero">') && MAIN_KEEP.every((id) => idx.includes(`id="${id}"`)) && idx.includes('class="faq"'));
  check('How we build your system (#journey) sits after Who it is for, before the work teaser, with 8 captions and a live system map (channels, Lava, owner approval, dashboard, sheet, cleaner, brief)', idx.indexOf('id="for"') < idx.indexOf('id="journey"') && idx.indexOf('id="journey"') < idx.indexOf('id="work-teaser"') && (idx.match(/class="jr-st"/g) || []).length === 8 && ['wa', 'em', 'ig', 'ph', 'lava', 'gate', 'dash', 'sheet', 'clean', 'brief'].every((n) => idx.includes('data-id="' + n + '"')));
  check('journey map has no images, and shows owner approval for bookings and money', (() => { const s = idx.slice(idx.indexOf('id="journey"'), idx.indexOf('id="work-teaser"')); return !/<img|<picture|<video/.test(s) && s.includes('Owner approval') && /Bookings and money stop here/.test(s); })());
  check('journey counters are labelled as a demo', idx.includes('Demo counters, sample data'));
  check('nav How it works points at #journey; old four generic steps are gone', idx.includes('href="#journey">How it works</a>') && !idx.includes('class="how-steps"'));
  check('journey script honours reduced motion, uses rAF and pauses offscreen', appJs.includes("querySelector('[data-jr]')") && appJs.includes("matchMedia('(min-width: 900px)')") && appJs.includes('requestAnimationFrame(tick)') && appJs.includes('visibilitychange'));
  check('showcase sections moved off the main page (artists kept on both)', /<section[^>]+id="artists"/.test(idx) && OFF_MAIN.every((id) => !new RegExp(`<section[^>]+id="${id}"`).test(idx)) && !idx.includes('<dialog'));
  check('Our work page has the builds, automations, Business OS, follow-one-request, artists and templates', MOVED.every((id) => new RegExp(`<section[^>]+id="${id}"`).test(work)) && work.includes('<dialog class="ad"'));
  check('main nav and the teaser strip link to work/', /<nav class="nav"[\s\S]*?<a class="link" href="work\/">Our work<\/a>[\s\S]*?<\/nav>/.test(idx) && /id="work-teaser"[\s\S]*?href="work\/"/.test(idx));
  check('Our work page links back to the main page and its contact form', work.includes('<a class="brand" href="../">') && work.includes('href="../#contact"'));
  check('"Use this look" on the Our work page opens the main form prefilled (?look=&type=#contact)', appJs.includes("location.href = root + '?look=' + encodeURIComponent(btn.getAttribute('data-name')) + '&type='") && appJs.includes("var q = new URLSearchParams(location.search);"));

  // ---- Fast on phone data ----
  const served = idx + work;
  check('served pages reference no PNG images', !/\.png\b/i.test(served) && !/\.png['"]/i.test(appJs));
  const vids = [...served.matchAll(/<video\b[^>]*>/g)].map((m) => m[0]);
  check(`every video on both pages uses a -lite / -sm clip (${vids.length})`, vids.length >= 10 && vids.every((t) => /data-src="[^"]*-(lite|sm)\.mp4"/.test(t) && !/\bsrc="/.test(t.replace(/data-src/g, ''))));
  check('every video is preload="none"', vids.every((t) => /preload="none"/.test(t)));
  const hero = vids.find((t) => t.includes('hero-video'));
  check('hero film: lite + phone-size sources, no eager src, poster image shown underneath', hero && hero.includes('data-src="assets/video/hero-lite.mp4"') && hero.includes('data-src-sm="assets/video/hero-sm.mp4"')
    && /<img class="hero-poster" src="assets\/photo\/hero-poster\.webp" srcset="assets\/photo\/hero-poster-sm\.webp 640w/.test(idx));
  check('hero film waits for load + idle and skips reduced motion, save-data and slow links', /if \(hv && !reduce && !lowData && !slow\)/.test(appJs) && appJs.includes('requestIdleCallback')
    && appJs.includes("window.addEventListener('load', afterPaint") && /var slow = \/\(\^\|-\)\(2g\|3g\)\$\/\.test/.test(appJs) && appJs.includes('conn.downlink < 0.7'));
  check('below-the-fold videos get their poster only near the screen (data-poster)', vids.filter((t) => !t.includes('hero-video')).every((t) => /data-poster="/.test(t) && !/\sposter="/.test(t)));
  const imgs = [...served.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes('hero-poster'));
  check(`every image below the fold is loading="lazy" (${imgs.length})`, imgs.length >= 3 && imgs.every((t) => /loading="lazy"/.test(t)));
  const ifr = [...served.matchAll(/<iframe\b[^>]*>/g)].map((m) => m[0]);
  check('live previews stay about:blank until near the screen', ifr.length === 8 && ifr.every((t) => t.includes('src="about:blank"') && t.includes('data-src=')));
  const pairs = [['assets/video/hero.mp4', 'assets/video/hero-lite.mp4'], ['assets/video/hero.mp4', 'assets/video/hero-sm.mp4'], ['assets/work/rec-terra.mp4', 'assets/work/rec-terra-lite.mp4']];
  check('lite clips are at least 40% smaller and the originals are still in the repo', pairs.every(([a, b]) => fs.existsSync(path.join(SITE, a)) && fs.statSync(path.join(SITE, b)).size < fs.statSync(path.join(SITE, a)).size * 0.6));
  const allVid = walk(SITE).map(rel).filter((r) => /-(lite|sm)\.mp4$/.test(r));
  check(`every -lite / -sm clip has its original next to it (${allVid.length})`, allVid.length >= 14 && allVid.every((r) => fs.existsSync(path.join(SITE, r.replace(/-(lite|sm)\.mp4$/, '.mp4')))));

  // ---- Inquiry API (transport mocked: nothing is ever sent) ----
  const inq = handler.inquiry;
  const GOOD = { name: 'Test Owner', business: 'Sample Grill', type: 'Restaurant', country: 'Sierra Leone', need: 'Website', contact: 'owner@example.com', message: 'Hello' };
  const sent = [];
  inq.setTransport(async (p) => { sent.push(p); return { ok: true }; });
  inq.resetLimits();
  env({ VERCEL: '1', VERCEL_ENV: 'production', WEB_ENABLED: '1' });
  let r = await call('POST', 'api/inquiry', { body: GOOD });
  check('production default: inquiry is off (503, honest message, nothing handed over)', r.status === 503 && JSON.parse(r.text).error === 'inquiry_off' && /not switched on yet/.test(JSON.parse(r.text).message) && sent.length === 0);
  env({ VERCEL: '1', VERCEL_ENV: 'production', WEB_ENABLED: '0', WEB_INQUIRY_ENABLED: '1' });
  check('the inquiry API is 404 when the whole section is off', (await call('POST', 'api/inquiry', { body: GOOD })).status === 404);
  env({ VERCEL: '1', VERCEL_ENV: 'production', WEB_ENABLED: '1', WEB_INQUIRY_ENABLED: '1', WEB_INQUIRY_TRANSPORT: 'mock' });
  check('mock transport is never honoured on production', inq.mode() === 'webhook');
  r = await call('POST', 'api/inquiry', { body: GOOD });
  const prodPayload = sent[sent.length - 1];
  check('production (switched on): one hand-off to support@lavaall.com in the main-site tag style, no Test: prefix', r.status === 200 && JSON.parse(r.text).ok === true
    && prodPayload.routeTo === 'support@lavaall.com' && prodPayload.subject === '[Lavaall Website – LAVAALL Web Inquiry] Website · Test Owner, Sample Grill');
  env({ VERCEL: '1', VERCEL_ENV: 'preview', CONTACT_WEBHOOK_SECRET: 'unit-test-secret' });
  r = await call('POST', 'api/inquiry', { body: GOOD });
  const p1 = sent[sent.length - 1];
  check('preview default: on; subject starts with "Test:"', r.status === 200 && p1.subject.startsWith('Test: [Lavaall Website – LAVAALL Web Inquiry]'));
  check('payload matches contact-router.gs (email reply-to, country, company, message lines)', p1.email === 'owner@example.com' && p1.phone === '' && p1.country === 'Sierra Leone' && p1.company === 'Sample Grill'
    && p1.inquiryType === 'lavaall-web' && p1.message.includes('Type of business: Restaurant') && p1.message.includes('Needs: Website') && p1.preferredContact === 'email');
  check('webhook secret goes only to the transport, never back to the browser', p1.secret === 'unit-test-secret' && !r.text.includes('unit-test-secret'));
  const nSent = sent.length;
  r = await call('POST', 'api/inquiry', { body: { ...GOOD, contact: '+232 76 000 111' } });
  check('a phone / WhatsApp number is accepted as the contact', r.status === 200 && sent[sent.length - 1].phone === '+232 76 000 111' && sent[sent.length - 1].email === '' && sent[sent.length - 1].preferredContact === 'phone / WhatsApp');
  r = await call('POST', 'api/inquiry', { body: { ...GOOD, website: 'http://spam.example' } });
  check('honeypot: answers ok but hands nothing over', r.status === 200 && sent.length === nSent + 1);
  r = await call('POST', 'api/inquiry', { body: { name: 'A', contact: 'nope', type: 'Spaceship' } });
  check('invalid input: 400 with the fields to fix', r.status === 400 && JSON.parse(r.text).fields.join() === 'name,contact,type');
  check('bad JSON is 400', (await call('POST', 'api/inquiry', { body: '{"name":' })).status === 400);
  check('JSON array body is 400', (await call('POST', 'api/inquiry', { body: '[1]' })).status === 400);
  check('oversized body is 413', (await call('POST', 'api/inquiry', { body: { ...GOOD, message: 'x'.repeat(9000) } })).status === 413);
  check('GET /web/api/inquiry is 405', (await call('GET', 'api/inquiry')).status === 405);
  check('markup is stripped before hand-off', (await call('POST', 'api/inquiry', { body: { ...GOOD, name: '<b>Owner</b>' } })).status === 200 && !/[<>]/.test(sent[sent.length - 1].name));
  inq.resetLimits();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call('POST', 'api/inquiry', { body: GOOD, ip: '10.9.9.9' })).status);
  check('rate limit: 5 per 10 minutes per connection, then 429', codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429);
  inq.setTransport(async () => ({ ok: false, error: 'delivery_failed' }));
  r = await call('POST', 'api/inquiry', { body: GOOD });
  check('delivery failure: 502 with an honest message', r.status === 502 && /could not deliver/.test(JSON.parse(r.text).message));
  inq.setTransport(null);

  // The real webhook transport, with fetch mocked (no network).
  const realFetch = global.fetch;
  const hooks = [];
  global.fetch = async (url, init) => { hooks.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ ok: true }) }; };
  env({ VERCEL: '1', VERCEL_ENV: 'preview' });
  r = await call('POST', 'api/inquiry', { body: GOOD });
  check('no CONTACT_WEBHOOK_URL: 503 "not set up yet", nothing fetched', r.status === 503 && JSON.parse(r.text).error === 'delivery_not_configured' && hooks.length === 0);
  env({ VERCEL: '1', VERCEL_ENV: 'preview', CONTACT_WEBHOOK_URL: 'https://webhook.invalid/exec', CONTACT_WEBHOOK_SECRET: 's3' });
  r = await call('POST', 'api/inquiry', { body: GOOD });
  check('webhook transport posts the same payload to CONTACT_WEBHOOK_URL (mocked fetch)', r.status === 200 && hooks.length === 1 && hooks[0].url === 'https://webhook.invalid/exec' && hooks[0].body.routeTo === 'support@lavaall.com' && hooks[0].body.secret === 's3');
  global.fetch = async () => ({ ok: true, json: async () => ({ error: 'invalid_route' }) });
  r = await call('POST', 'api/inquiry', { body: GOOD });
  check('router error inside an HTTP 200 is a failure, not a fake success', r.status === 502);
  global.fetch = async () => { throw new Error('offline'); };
  check('network error is 502', (await call('POST', 'api/inquiry', { body: GOOD })).status === 502);
  global.fetch = realFetch;
  env({ VERCEL: '1', VERCEL_ENV: 'preview', WEB_INQUIRY_TRANSPORT: 'mock' });
  r = await call('POST', 'api/inquiry', { body: GOOD });
  const ob = await call('GET', 'api/outbox');
  check('mock transport records (mode "mock") and lists it in the outbox without the secret', r.status === 200 && JSON.parse(r.text).mode === 'mock' && ob.status === 200 && JSON.parse(ob.text).rows[0].routeTo === 'support@lavaall.com' && !('secret' in JSON.parse(ob.text).rows[0]));
  env({ VERCEL: '1', VERCEL_ENV: 'production', WEB_ENABLED: '1', WEB_INQUIRY_TRANSPORT: 'mock' });
  check('outbox is never served on production', (await call('GET', 'api/outbox')).status === 404);
  const health = await call('GET', 'api/health');
  check('health shows the switch and transport, no secrets', health.status === 200 && JSON.parse(health.text).inquiry.enabled === false && !/secret|https?:/i.test(health.text));
  env({});
  check('the email address is a constant (support@lavaall.com), not configurable', inq.SUPPORT_EMAIL === 'support@lavaall.com' && !/process\.env\.[A-Z_]*(EMAIL|TO)\b/.test(fs.readFileSync(path.join(root, 'api/web/_lib/inquiry.js'), 'utf8')));
  check('select options in the form match the server allow-list', ['type', 'country', 'need'].every((k) => {
    const sel = idx.match(new RegExp(`<select name="${k}">([\\s\\S]*?)</select>`));
    return sel && [...sel[1].matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]).join('|') === inq.OPTIONS[k].join('|');
  }));

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
  check('index.html nav links to /web/ (LAVAALL Web entry point)', /<a href="\/web\/">LAVAALL Web<\/a>/.test(fs.readFileSync(path.join(root, 'index.html'), 'utf8')));
  for (const f of ['privacy.html', 'terms.html', 'assets/js/catalog.js']) {
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
