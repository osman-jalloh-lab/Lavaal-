// Starlink v4 backend: flag, builder -> code, lookup, Get connected -> test
// outbox, static serving, and "never public, never sends" guarantees.
//   node tests/test-starlink.js
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const root = path.join(__dirname, '..');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const ENV_KEYS = ['VERCEL', 'VERCEL_ENV', 'STARLINK_ENABLED', 'STARLINK_STORE', 'STARLINK_STORE_FILE', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function env(vars) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
}

const handler = require('../api/starlink/index.js');
const store = require('../api/starlink/_lib/store');
const { normalizePhone } = require('../api/starlink/_lib/validate');

let ipSeq = 0;
function call(method, area, body, opts = {}) {
  const raw = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  const req = Readable.from(raw ? [raw] : []);
  req.method = method;
  req.url = '/api/starlink?area=' + encodeURIComponent(area);
  req.query = { area };
  req.headers = { 'x-forwarded-for': opts.ip || '10.0.0.' + (++ipSeq % 250) };
  if (opts.parsed) req.body = body;
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(chunk) {
        const text = chunk == null ? '' : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        let json = null; try { json = JSON.parse(text); } catch {}
        resolve({ status: this.statusCode, headers: this.headers, text, json });
      },
    };
    handler(req, res);
  });
}

const ANSWERS = { place: 'Home', country: 'Sierra Leone', city: 'Freetown', need: 'New complete setup', size: 'Small', priority: 'Lowest starting cost' };

async function run() {
  // ---- Off on Production by default ----
  env({ VERCEL: '1', VERCEL_ENV: 'production' });
  for (const area of ['', 'index.html', 'app.js', 'api/health', 'api/outbox']) {
    const r = await call('GET', area);
    check(`production default: /starlink/${area} is 404`, r.status === 404 && r.text === 'Not found');
  }
  check('production default: POST setups is 404', (await call('POST', 'api/setups', ANSWERS)).status === 404);
  env({ VERCEL: '1' });
  check('VERCEL without VERCEL_ENV counts as production (off)', (await call('GET', '')).status === 404);
  env({ VERCEL: '1', VERCEL_ENV: 'preview', STARLINK_ENABLED: '0' });
  check('STARLINK_ENABLED=0 turns Preview off', (await call('GET', 'api/health')).status === 404);
  env({ VERCEL: '1', VERCEL_ENV: 'production', STARLINK_ENABLED: '1' });
  const prodOn = await call('GET', 'api/health');
  check('STARLINK_ENABLED=1 is the only way to turn Production on', prodOn.status === 200);
  check('outbox viewer never on Production, even when enabled', (await call('GET', 'api/outbox')).status === 404);

  // ---- Preview / local: on, test mode ----
  env({ VERCEL: '1', VERCEL_ENV: 'preview' });
  store._resetMemory();
  const health = await call('GET', 'api/health');
  check('preview: health ok', health.status === 200 && health.json.enabled === true);
  check('health: delivery is test mode and never sends', health.json.delivery.mode === 'test' && health.json.delivery.sends === false
    && Object.values(health.json.delivery.channels).every((c) => c.live === false));
  check('health: store defaults to memory on Vercel (KV is opt-in)', health.json.store.mode === 'memory');

  // ---- Builder -> setup code ----
  const created = await call('POST', 'api/setups', ANSWERS);
  check('POST setups returns 201', created.status === 201);
  const code = created.json && created.json.code;
  check('setup code looks like LV-XXXXX', /^LV-[A-HJ-NP-Z2-9]{5}$/.test(code || ''));
  check('stored status is new', created.json.status === 'new');
  check('recommendation matches v4 rules (lean home: kit, mount, install, support)',
    JSON.stringify(created.json.recommendation.items) === JSON.stringify(['kit', 'mount', 'install', 'support']));
  check('createdAt is ISO', !Number.isNaN(Date.parse(created.json.createdAt)));
  const parsedBody = await call('POST', 'api/setups', ANSWERS, { parsed: true });
  check('accepts Vercel pre-parsed JSON body', parsedBody.status === 201 && parsedBody.json.code !== code);

  const bad = await call('POST', 'api/setups', { ...ANSWERS, country: 'Atlantis', size: '' });
  check('invalid answers rejected with field list', bad.status === 400 && bad.json.fields.includes('country') && bad.json.fields.includes('size'));
  check('bad JSON rejected', (await call('POST', 'api/setups', '{nope')).status === 400);
  check('oversized body rejected', (await call('POST', 'api/setups', JSON.stringify({ ...ANSWERS, city: 'x'.repeat(9000) }))).status === 413);
  const hp = await call('POST', 'api/setups', { ...ANSWERS, website: 'spam' });
  check('honeypot accepted silently, no code issued', hp.status === 200 && !hp.json.code);

  // ---- Lookup ----
  const got = await call('GET', 'api/setups/' + code);
  check('GET setup by code', got.status === 200 && got.json.code === code && got.json.answers.city === 'Freetown');
  check('lookup is case-insensitive', (await call('GET', 'api/setups/' + code.toLowerCase())).status === 200);
  check('unknown code is 404', (await call('GET', 'api/setups/LV-ZZZZZ')).status === 404);
  check('malformed code is 400', (await call('GET', 'api/setups/hello')).status === 400);

  // ---- Get connected ----
  const none = await call('POST', `api/setups/${code}/connect`, {});
  check('connect needs WhatsApp or email', none.status === 400 && none.json.error === 'contact_required');
  const badc = await call('POST', `api/setups/${code}/connect`, { whatsapp: 'call me', email: 'nope' });
  check('connect rejects bad contact', badc.status === 400 && badc.json.fields.length === 2);
  const conn = await call('POST', `api/setups/${code}/connect`, { whatsapp: '076 123 456', email: 'Test.Customer@Example.com' });
  check('connect records the lead', conn.status === 200 && conn.json.status === 'lead');
  check('connect reports test mode, nothing sent', conn.json.delivery.mode === 'test' && conn.json.delivery.sent === false);
  check('connect records whatsapp + email + team entries', conn.json.delivery.recorded.map((r) => r.channel).join() === 'whatsapp,email,team');
  check('connect returns wa.me + Gmail + mailto links', conn.json.links.whatsapp.startsWith('https://wa.me/')
    && conn.json.links.email.startsWith('https://mail.google.com/mail/?view=cm') && conn.json.links.mailto.startsWith('mailto:support@lavaall.com'));
  check('wa.me text carries the setup code', decodeURIComponent(conn.json.links.whatsapp).includes(code));
  const after = await call('GET', 'api/setups/' + code);
  check('lookup now shows lead status, contact as booleans only', after.json.status === 'lead'
    && after.json.contact.whatsapp === true && after.json.contact.email === true && !after.text.includes('123456') && !after.text.includes('example.com'));

  const ob = await call('GET', 'api/outbox');
  check('outbox lists the 3 test entries', ob.status === 200 && ob.json.rows.filter((r) => r.code === code).length === 3);
  check('every outbox row is unsent test mode', ob.json.rows.every((r) => r.sent === false && r.mode === 'test' && r.status === 'recorded_test_mode'));
  const wa = ob.json.rows.find((r) => r.channel === 'whatsapp');
  check('outbox masks the customer number', wa && wa.to.startsWith('+232') && wa.to.includes('****') && !JSON.stringify(ob.json).includes('76123456'));
  check('outbox masks the customer email', !JSON.stringify(ob.json).toLowerCase().includes('test.customer@example.com'));
  check('outbox never contains provider secrets', !/re_[A-Za-z0-9]{8}|EAA[A-Za-z0-9]{10}|script\.google\.com/.test(JSON.stringify(ob.json))
    && JSON.stringify(ob.json).includes('<RESEND_API_KEY>'));
  const email = ob.json.rows.find((r) => r.channel === 'email');
  check('customer message has the code and the non-affiliation line', email && email.text.includes(code) && email.text.includes('not affiliated with or endorsed by Starlink or SpaceX'));
  check('no prices in any message', !/\b(SLE|SLL|USD|GNF|LRD)\s?[0-9]|[$€£]\s?[0-9]|\bLe\s?[0-9]/.test(JSON.stringify(ob.json)));
  const team = ob.json.rows.find((r) => r.channel === 'team');
  check('team handoff uses the contact-webhook payload shape', team && team.request.body.routeTo === 'support@lavaall.com' && team.request.body.inquiryType === 'installation-services');
  check('unknown code cannot connect', (await call('POST', 'api/setups/LV-ZZZZZ/connect', { email: 'a@b.co' })).status === 404);

  // ---- Phone normalisation ----
  check('SL local 076... -> +23276...', normalizePhone('076 123 456', 'Sierra Leone') === '+23276123456');
  check('00 prefix -> +', normalizePhone('00231 88 123 4567', 'Liberia') === '+231881234567');
  check('international kept', normalizePhone('+1 (512) 555-0100', 'Somewhere else') === '+15125550100');
  check('letters rejected', normalizePhone('abc', 'Guinea') === null);

  // ---- Rate limit ----
  let last;
  for (let i = 0; i < 31; i++) last = await call('POST', 'api/setups', ANSWERS, { ip: '9.9.9.9' });
  check('create is rate limited per IP', last.status === 429);

  // ---- Static page ----
  const page = await call('GET', '');
  check('page served with base href /starlink/', page.status === 200 && page.text.includes('<base href="/starlink/">') && page.headers['content-type'].startsWith('text/html'));
  check('page is noindex', page.headers['x-robots-tag'] === 'noindex, nofollow' && page.text.includes('name="robots" content="noindex, nofollow"'));
  check('page keeps the non-affiliation footer', page.text.includes('Not affiliated with or endorsed by Starlink or SpaceX'));
  check('page has the Get connected contact fields', page.text.includes('id="connectWhatsapp"') && page.text.includes('id="connectEmail"'));
  check('page has no ../assets paths left', !page.text.includes('../assets/'));
  const css = await call('GET', 'styles.css');
  check('styles.css served', css.status === 200 && css.headers['content-type'].startsWith('text/css'));
  const img = await call('GET', 'assets/product/perk-cut/dish.webp');
  check('product image served', img.status === 200 && img.headers['content-type'] === 'image/webp');
  const html = page.text;
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+?)(?:\?[^"]*)?"/g)].map((m) => m[1]).filter((u) => !u.startsWith('/') && !u.startsWith('data'));
  const missing = refs.filter((u) => !fs.existsSync(path.join(root, 'api/starlink/_site', u)));
  check('every relative src/href in the page exists in _site', refs.length > 20 && missing.length === 0);
  check('path traversal blocked', (await call('GET', '../index.js')).status === 404 && (await call('GET', '_lib/flag.js')).status === 404
    && (await call('GET', 'assets/../../index.js')).status === 404);
  check('hidden files blocked', (await call('GET', '.env')).status === 404);

  // ---- Never public on lavaall.com ----
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  check('vercel.json rewrites /starlink to the function', vercel.rewrites.some((r) => r.source === '/starlink/:path*' && r.destination.startsWith('/api/starlink')));
  check('vercel.json bundles _site into the function', vercel.functions['api/starlink/index.js'] && vercel.functions['api/starlink/index.js'].includeFiles === 'api/starlink/_site/**');
  for (const f of ['index.html', 'privacy.html', 'terms.html', 'assets/js/catalog.js']) {
    check(`${f} has no link to /starlink`, !/href=["'][^"']*\/?starlink/i.test(fs.readFileSync(path.join(root, f), 'utf8')));
  }
  const ignore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  check('.vercelignore keeps Starlink docs, dev runner and test off the public site', ['docs/starlink/', 'scripts/starlink/', 'tests/test-starlink.js'].every((e) => ignore.includes(e)));
  check('.vercelignore does not hide anything the site or functions need', !ignore.some((l) => /^(api|assets|images|index\.html|docs\/ops)/.test(l)));
  const client = fs.readFileSync(path.join(root, 'api/starlink/_site/app.js'), 'utf8');
  check('client keeps offline fallback to client-side code', client.includes('state.code = code(); state.server = false;'));

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
