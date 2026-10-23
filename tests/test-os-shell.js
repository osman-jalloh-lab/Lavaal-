// LAVAALL OS shell: founders-only guard, CSP, no inline scripts, /os-only palette,
// single vercel.json rewrite, no secret values in the page. No network, no KV.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const lib = require(path.join(root, 'api/ops/_lib.js'));
const os = require(path.join(root, 'api/os/index.js'));
const { embedJson } = require(path.join(root, 'api/os/_page.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const STRANGER = 'stranger@example.com';

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; return res; };
  res.send = (b) => { res.body = b == null ? '' : String(b); return res; };
  return res;
}

function request(area, extra) {
  const e = extra || {};
  const headers = Object.assign({ host: 'preview.example.test', accept: 'text/html' }, e.headers);
  if (e.email) headers.cookie = `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(e.email))}`;
  return { method: e.method || 'GET', headers, query: { area: area || '' }, url: '/os', body: e.body };
}

async function call(area, extra) {
  const res = mockRes();
  await os(request(area, extra), res);
  return res;
}

(async () => {
  process.env.OPS_AUTH_SECRET = SECRET;
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'OPS_STORE_FILE', 'VERCEL', 'OPS_SIGNIN_HARDENING_ENABLED'].forEach((k) => { delete process.env[k]; });
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; throw new Error('network is off in this test'); };

  // 1. Guard.
  const anon = await call('', {});
  check('anonymous page -> 302 to /ops login', anon.statusCode === 302 && anon.headers.location === '/ops');
  check('anonymous page leaks no app html', !anon.body.includes('os-data'));
  const anonJson = await call('', { headers: { accept: 'application/json' } });
  check('anonymous json -> 401', anonJson.statusCode === 401 && /sign_in_required/.test(anonJson.body));
  const anonAsset = await call('app.js', {});
  check('anonymous asset is not served', anonAsset.statusCode !== 200 && !anonAsset.body.includes('registerView'));
  const agent = await call('', { email: ALLOWED, headers: { authorization: 'Bearer abc' } });
  check('agent credentials -> 403 even with a valid cookie', agent.statusCode === 403);
  const slack = await call('', { email: ALLOWED, headers: { 'x-slack-signature': 'v0=x' } });
  check('slack-style request -> 403', slack.statusCode === 403);
  const claimed = await call('', { headers: { 'x-ops-email': ALLOWED } });
  check('header-claimed email is not a session', claimed.statusCode !== 200);
  const post = await call('', { email: ALLOWED, method: 'POST' });
  check('POST -> 405 (read-only)', post.statusCode === 405);
  const put = await call('', { email: ALLOWED, method: 'PUT' });
  check('PUT -> 405', put.statusCode === 405);
  let strangerMinted = true;
  try { lib.createSessionToken(STRANGER); const r = mockRes(); await os(request('', { headers: { cookie: `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(STRANGER))}` } }), r); strangerMinted = r.statusCode === 200; } catch { strangerMinted = false; }
  check('non-founder session is rejected', strangerMinted === false);

  // 2. Page for a founder.
  process.env.OPS_GMAIL_CLIENT_SECRET = 'SECRET-MAIL-VALUE-123';
  process.env.RESEND_API_KEY = 'SECRET-RESEND-VALUE-456';
  const page = await call('', { email: ALLOWED });
  const html = page.body;
  check('founder page 200 html', page.statusCode === 200 && /text\/html/.test(page.headers['content-type']));
  check('no-store + noindex', page.headers['cache-control'] === 'no-store' && /noindex/.test(page.headers['x-robots-tag']));
  const csp = page.headers['content-security-policy'] || '';
  check('CSP script-src is self only', /script-src 'self'(;|$)/.test(csp) && !/script-src[^;]*unsafe/.test(csp));
  check('CSP blocks framing and foreign form posts', /frame-ancestors 'none'/.test(csp) && /form-action 'self'/.test(csp) && /default-src 'self'/.test(csp));
  const scripts = html.match(/<script\b[^>]*>/g) || [];
  check('every script is an external self file or an inert JSON block', scripts.length >= 2 && scripts.every((t) => /src="\/os\/app\.js"/.test(t) || /type="application\/json"/.test(t)));
  check('no inline event handlers', !/\son[a-z]+\s*=/i.test(html));
  check('no third-party script or style host except Google Fonts', !/(?:src|href)="https?:\/\/(?!fonts\.(?:googleapis|gstatic)\.com)/.test(html));
  check('uses the existing LAVAALL logo files', /\/images\/logo\.webp/.test(html) && /\/images\/logo\.png/.test(html) && /alt="LAVAALL"/.test(html));
  check('Inter is the UI font', /family=Inter:wght@400;500;600/.test(html) && !/Clash|Bricolage/.test(html));
  check('sign-out reuses the ops form', /action="\/api\/ops\/auth"/.test(html) && /value="logout"/.test(html));
  const m = html.match(/<script type="application\/json" id="os-data">([\s\S]*?)<\/script>/);
  let data = null;
  try { data = JSON.parse(m && m[1]); } catch { data = null; }
  check('data block parses', data && typeof data === 'object');
  check('data block carries the founder email', data && data.me && data.me.email === ALLOWED);
  check('data block carries the KPIs and an honest live/empty flag per source', data && data.kpis && data.sources && data.sources.decisions.live === true && ['spend', 'council', 'outreach', 'brief', 'hotelBounceRate'].every((k) => data.sources[k].live === false) && data.kpis.hotelBounceRate === null && data.kpis.aiSpendMonth === null);
  check('settings carry names only, no secret values', !html.includes('SECRET-MAIL-VALUE-123') && !html.includes('SECRET-RESEND-VALUE-456'));
  check('page made no network call', fetched === 0);

  // 3. Assets.
  const css = await call('app.css', { email: ALLOWED });
  const js = await call('app.js', { email: ALLOWED });
  check('app.css served as css', css.statusCode === 200 && /text\/css/.test(css.headers['content-type']) && css.body.length > 1000);
  check('app.js served as javascript', js.statusCode === 200 && /javascript/.test(js.headers['content-type']) && js.body.length > 1000);
  const unknown = await call('nope', { email: ALLOWED });
  check('unknown /os path -> 404', unknown.statusCode === 404);
  const traversal = await call('../ops/_store.js', { email: ALLOWED });
  check('path traversal does not read files', traversal.statusCode === 404 && !traversal.body.includes('STORE_KEY'));
  let compiles = true;
  try { new vm.Script(js.body, { filename: 'app.js' }); } catch { compiles = false; }
  check('app.js compiles', compiles);

  // 4. /os palette stays inside /os.
  const cssText = css.body;
  const dark = [
    ['--bg', '#060D16'], ['--bg2', '#040B13'], ['--panel', '#0A1522'], ['--hover', '#0C1E30'], ['--text', '#E7EEF7'], ['--muted', '#8696AB'],
    ['--accent', '#1E9BFF'], ['--ok', '#22C37A'], ['--warn', '#E3AE2A'], ['--bad', '#F2554A'], ['--c-orange', '#F07A2A'], ['--c-violet', '#7C6CF2'],
    ['--c-amber', '#FFB904'], ['--c-skill', '#3D6BFF'], ['--c-note', '#D0A368'],
  ];
  const darkBlock = (cssText.match(/\.os-root\[data-theme=dark\]\{[^}]*\}/) || [''])[0];
  check('dark tokens match the brief', dark.every(([k, v]) => darkBlock.includes(`${k}:${v}`)));
  check('line token is rgba(140,170,210,.12)', darkBlock.includes('--line:rgba(140,170,210,.12)'));
  check('light theme tokens exist', /\.os-root\[data-theme=light\]\{[^}]*--bg:#F6F8FB/.test(cssText));
  check('no :root, html or body-level token leaks', !/(^|[}\s,]):root\b/.test(cssText));
  check('/ops palette v2 is not used', !/#2EC4FF|#3DDC97|#FCE7F3|#FAF8F5/i.test(cssText));
  check('no drop shadows (box-shadow only for the active-nav inset bar)', (cssText.match(/box-shadow:[^;}]*/g) || []).every((s) => /inset 2px 0 0 var\(--accent\)/.test(s)));
  check('card radius 10px, control radius 6px', /--r-card:10px/.test(cssText) && /--r-ctl:6px/.test(cssText));
  check('tabular numbers on KPIs', /\.kpi b\{[^}]*\}/.test(cssText) && /font-variant-numeric:tabular-nums/.test(cssText));
  check('mobile breakpoint under 760px', /@media\(max-width:759px\)/.test(cssText));
  check('no gradient purple-to-pink, no glass blur', !/backdrop-filter|blur\(/.test(cssText));

  // 5. Shell behaviour contract.
  const hints = ['G H', 'G D', 'G T', 'G J', 'G O', 'G R', 'G N', 'G B', 'G C', 'G S', 'G ,'];
  check('all eleven views with shortcuts', hints.every((h) => js.body.includes(`'${h}'`)));
  check('palette offers Open Brain graph and Search Brain', js.body.includes('Open Brain graph') && js.body.includes('Search Brain'));
  check('clock is Chicago time', js.body.includes('America/Chicago') && js.body.includes("' CT'"));
  check('theme is persisted defensively', /try \{[^}]*localStorage/.test(js.body));
  check('no eval, no new Function, no XHR or beacons', !/\beval\s*\(|new Function\(|XMLHttpRequest|sendBeacon/.test(js.body));
  // Talk (phase 5) is the one place that calls the server: same origin, the existing /ops Talk endpoints only.
  const talkSrc = fs.readFileSync(path.join(root, 'api/os/_client/talk.js'), 'utf8');
  check('the only fetch is in talk.js, same origin, to /ops Talk paths', (js.body.match(/fetch\(/g) || []).length === 1 && /window\.fetch\(url\(id, kind\)/.test(talkSrc) && /credentials: 'same-origin'/.test(talkSrc) && !/https?:\/\//.test(talkSrc.replace(/\/\*[\s\S]*?\*\//, '')) && /'\/ops\/ceo-bridge\/'/.test(talkSrc) && /'\/ops\/desk-talk\/'/.test(talkSrc));

  // 6. JSON embedding is inert.
  const hostile = embedJson({ t: '</script><script>alert(1)</script>' });
  check('embedded JSON cannot close its script tag', !hostile.includes('<'));
  check('embedded JSON round-trips', JSON.parse(hostile).t === '</script><script>alert(1)</script>');

  // 7. vercel.json: the two /os rewrites (/os/ and /os/:path*), /ops untouched.
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const osRewrites = cfg.rewrites.filter((r) => /^\/os(\/|$)/.test(r.source));
  check('exactly two /os rewrites: /os/ and /os/:path*', osRewrites.length === 2 && osRewrites.map((r) => r.source).join() === '/os/,/os/:path*');
  check('/os rewrite targets', osRewrites[0].destination === '/api/os' && osRewrites[1].destination === '/api/os?area=:path*');
  check('no functions entry for api/os (soul data deferred)', !Object.keys(cfg.functions || {}).some((k) => k.startsWith('api/os')));
  check('/ops rewrites still present', cfg.rewrites.some((r) => r.source === '/ops/:path*' && r.destination === '/api/ops?area=:path*'));

  // 8. Fence hygiene: only underscore files besides index.js under api/os.
  const files = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else files.push(path.relative(path.join(root, 'api/os'), p).replace(/\\/g, '/'));
    });
  })(path.join(root, 'api/os'));
  const functions = files.filter((f) => f.endsWith('.js') && !f.split('/').some((seg) => seg.startsWith('_')));
  check('api/os exposes exactly two functions: index.js (the app) and ingest/[feed].js (the feeds)', functions.length === 2 && functions.includes('index.js') && functions.includes('ingest/[feed].js'));

  globalThis.fetch = realFetch;
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
