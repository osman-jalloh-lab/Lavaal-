// Ticket 10/10b/10c — Kit Registry /ops mirror, Kits page, default-deny.
// Synthetic fixture data only. No real kit emails.

const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const kits = require(path.join(opsDir, '_kits.js'));
const { NAV } = require(path.join(opsDir, '_shell.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const DENIED = 'stranger@example.com';
const REAL_EMAILS = ['osmanjalloh104@gmail.com', 'abdulhbah55@gmail.com'];

const FIXTURE_VALUES = [
  ['Kit Number', 'Name', 'Email', 'Status', 'Date Added', 'Notes'],
  ['kit000test01', 'Ada Example', 'ada.example@example.test', 'Active', '2026-09-20', 'Synthetic fixture'],
  ['KIT000TEST02', 'Ben Example', 'ben.example@example.test', 'Inactive', '9/18/2026', ''],
  ['', 'Missing Number', 'skip.example@example.test', 'Active', '2026-09-19', 'malformed'],
];

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.send = (b) => {
    res.raw = b;
    if (typeof b === 'string' && (b.startsWith('{') || b.startsWith('['))) {
      try { res.body = JSON.parse(b); } catch { res.body = b; }
    } else {
      res.body = b;
    }
    return res;
  };
  return res;
}

function cookieFor(email) {
  return `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(email))}`;
}

function authed(extra) {
  const asJson = extra && extra.json !== false;
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: {
      cookie: extra && extra.cookie ? extra.cookie : cookieFor(ALLOWED),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'application/x-www-form-urlencoded',
      ...(extra && extra.headers),
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/kits',
    body: extra && extra.body,
  };
}

function apiReq(extra) {
  const pathName = extra && extra.sync ? '/ops/api/kits/sync' : '/ops/api/kits';
  return authed(Object.assign({
    url: pathName,
    query: { area: extra && extra.sync ? 'api/kits/sync' : 'api/kits' },
  }, extra));
}

function tableCells(html) {
  const match = String(html).match(/<tbody>[\s\S]*?<\/tbody>/);
  if (!match) return '';
  return (match[0].match(/<td\b[^>]*>[\s\S]*?<\/td>/g) || []).join(' ');
}

function noKitPii(text) {
  const raw = String(text || '').toLowerCase();
  return !raw.includes('ada.example@example.test')
    && !raw.includes('ben.example@example.test')
    && !REAL_EMAILS.some((email) => raw.includes('kit') && raw.includes(email));
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.KIT_REGISTRY_SHEET_ID = '155IRHtVgDcAVXeeW6EU8X4fw7eOpjX4pgSejR92Ch_4';
  process.env.OPS_GMAIL_CLIENT_ID = 'kits-client';
  process.env.OPS_GMAIL_CLIENT_SECRET = 'kits-secret';
  process.env.OPS_GMAIL_REFRESH_TOKEN = 'kits-refresh';
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();
  kits.resetSheetReader();

  check('nav includes Kits after Calendar',
    NAV.some((item) => item.id === 'kits' && item.href === '/ops/kits' && item.label === 'Kits'));

  {
    const parsed = kits.parseSheetValues(FIXTURE_VALUES);
    check('sheet parser upserts two synthetic rows and skips malformed',
      parsed.rows.length === 2
      && parsed.skipped.length === 1
      && parsed.rows[0].kit_number === 'KIT000TEST01'
      && parsed.rows[0].email === 'ada.example@example.test'
      && parsed.rows[1].date_added === '9/18/2026');
    check('fixture emails are synthetic only',
      parsed.rows.every((row) => row.email.endsWith('@example.test'))
      && !REAL_EMAILS.some((email) => JSON.stringify(parsed).includes(email)));
  }

  {
    const res = mockRes();
    await ops({ method: 'GET', headers: { accept: 'application/json' }, query: { area: 'api/kits' }, url: '/ops/api/kits' }, res);
    check('unauthenticated GET /ops/api/kits is 401', res.statusCode === 401 && res.body && res.body.error === 'sign_in_required');
    check('unauthenticated kits API does not return rows', !res.body.kits);
  }

  {
    const res = mockRes();
    await ops({
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      query: { area: 'api/kits/sync' },
      url: '/ops/api/kits/sync',
      body: { csrf: 'nope' },
    }, res);
    check('unauthenticated POST /ops/api/kits/sync is 401', res.statusCode === 401 && res.body.error === 'sign_in_required');
  }

  {
    const res = mockRes();
    await ops(authed({
      json: true,
      cookie: cookieFor(DENIED),
      url: '/ops/api/kits',
      query: { area: 'api/kits' },
    }), res);
    check('non-allowlist session cannot GET kits', res.statusCode === 403 && res.body.error === 'forbidden' && !res.body.kits);
  }

  {
    const res = mockRes();
    await ops({
      method: 'GET',
      headers: { accept: 'application/json', 'x-ops-email': DENIED },
      query: { area: 'api/kits' },
      url: '/ops/api/kits',
    }, res);
    check('non-allowlist claimed email cannot GET kits', res.statusCode === 403 && res.body.error === 'forbidden');
  }

  {
    const res = mockRes();
    await ops({
      method: 'GET',
      headers: { accept: 'application/json', authorization: 'Bearer simulated-agent-token' },
      query: { area: 'api/kits' },
      url: '/ops/api/kits',
    }, res);
    check('simulated agent bearer cannot GET kits', res.statusCode === 403 && res.body.error === 'agent_denied' && !res.body.kits);
  }

  {
    const res = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/kits/sync',
      query: { area: 'api/kits/sync' },
      headers: { 'x-lavaall-agent': 'lavaall-ceo', authorization: 'Bearer simulated-agent-token' },
      body: { csrf: lib.createCsrfToken(ALLOWED) },
    }), res);
    check('simulated agent cannot POST sync even with a founder cookie',
      res.statusCode === 403 && res.body.error === 'agent_denied');
  }

  {
    const page = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'kits' }, url: '/ops/kits' }, page);
    check('logged-out /ops/kits is the login page', page.statusCode === 401 && String(page.raw).includes('Email me a sign-in link'));
    check('logged-out Kits HTML has no kit emails', noKitPii(page.raw) && !String(page.raw).includes('KIT000TEST01'));
  }

  {
    const page = mockRes();
    await ops({
      method: 'GET',
      headers: { 'x-lavaall-agent': 'sales-bot' },
      query: { area: 'kits' },
      url: '/ops/kits',
    }, page);
    check('agent hitting /ops/kits gets a hard deny page',
      page.statusCode === 403
      && String(page.raw).includes('Access denied')
      && String(page.raw).includes('founder-only')
      && !String(page.raw).includes('KIT000TEST'));
  }

  {
    store.resetStore();
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/kits', query: { area: 'kits' } }), page);
    const html = String(page.raw);
    check('Kits page is real, not a ticket stub',
      page.statusCode === 200
      && html.includes('Kits')
      && html.includes('Sheet is source of truth')
      && html.includes('Refresh')
      && !html.includes('coming in ticket 10'));
    check('Kits banner names last sync and Open Sheet',
      html.includes('Source of truth: Kit Registry Sheet')
      && html.includes('last sync never')
      && html.includes('Open Sheet')
      && html.includes('docs.google.com/spreadsheets/d/155IRHtVgDcAVXeeW6EU8X4fw7eOpjX4pgSejR92Ch_4'));
    check('Kits table columns are Kit Number, Name, Status, Date Added',
      html.includes('>Kit Number<')
      && html.includes('>Name<')
      && html.includes('>Status<')
      && html.includes('>Date Added<'));
    check('empty Kits copy has no fake demo kits',
      html.includes('No kits in mirror yet · Refresh or check Sheet')
      && !html.includes('KIT00384515')
      && !/19 kits/.test(html));
    check('Kits page is table-first with no vanity KPIs',
      html.includes('kits-table')
      && !/productivity|streak|points|kpi/i.test(html));
    check('Kits search and status filter are present',
      html.includes('id="kits-search"')
      && html.includes('Search name or kit #')
      && html.includes('data-status="Active"'));
    check('logged-in nav includes Kits', html.includes('href="/ops/kits"') && html.includes('aria-current="page"'));
  }

  {
    const list = mockRes();
    await ops(apiReq({ json: true }), list);
    check('founder GET /ops/api/kits is empty before sync',
      list.statusCode === 200 && Array.isArray(list.body.kits) && list.body.kits.length === 0 && list.body.csrf);
    const denied = mockRes();
    await ops(apiReq({ json: true, method: 'POST', sync: true, body: {} }), denied);
    check('founder sync without CSRF is 403', denied.statusCode === 403 && denied.body.error === 'csrf');
  }

  {
    store.resetStore();
    kits.setSheetReader(async () => kits.parseSheetValues(FIXTURE_VALUES));
    const csrf = lib.createCsrfToken(ALLOWED);
    const sync = mockRes();
    await ops(apiReq({ json: true, method: 'POST', sync: true, body: { csrf } }), sync);
    check('founder sync upserts synthetic rows and skips malformed',
      sync.statusCode === 200
      && sync.body.ok === true
      && sync.body.upserted === 2
      && sync.body.kits.length === 2
      && sync.body.kits.some((row) => row.kit_number === 'KIT000TEST01' && row.person_name === 'Ada Example' && row.status === 'Active')
      && sync.body.kits.some((row) => row.kit_number === 'KIT000TEST02' && row.date_added === '2026-09-18'));
    check('sync response includes last sync and does not invent a third kit',
      Boolean(sync.body.synced_at) && !sync.body.kits.some((row) => row.person_name === 'Missing Number'));

    const list = mockRes();
    await ops(apiReq({ json: true, query: { area: 'api/kits', q: 'ada', status: 'Active' } }), list);
    check('GET /ops/api/kits search+status filter stays on Ada',
      list.statusCode === 200
      && list.body.kits.length === 1
      && list.body.kits[0].kit_number === 'KIT000TEST01'
      && list.body.kits[0].email === 'ada.example@example.test');

    const html = mockRes();
    await ops(authed({ json: false, url: '/ops/kits', query: { area: 'kits' } }), html);
    const cells = tableCells(html.raw);
    check('list columns hide email; drawer data keeps it',
      cells.includes('KIT000TEST01')
      && cells.includes('Ada Example')
      && !cells.includes('ada.example@example.test')
      && String(html.raw).includes('data-email="ada.example@example.test"')
      && String(html.raw).includes('id="kit-drawer"')
      && String(html.raw).includes('id="kit-drawer-notes"'));
    kits.resetSheetReader();
  }

  {
    store.resetStore();
    await store.applyKitsSync({
      rows: [
        {
          kit_number: 'KIT000TEST01',
          person_name: 'Old Name',
          email: 'old.example@example.test',
          status: 'Inactive',
          date_added: '2026-01-01',
          notes: 'stale',
        },
        {
          kit_number: 'KIT000ORPHAN',
          person_name: 'Orphan Example',
          email: 'orphan.example@example.test',
          status: 'Active',
          date_added: '2026-09-01',
        },
      ],
      syncedBy: ALLOWED,
      now: 1,
    });
    kits.setSheetReader(async () => kits.parseSheetValues(FIXTURE_VALUES));
    const sync = mockRes();
    await ops(apiReq({ json: true, method: 'POST', sync: true, body: { csrf: lib.createCsrfToken(ALLOWED) } }), sync);
    const orphan = sync.body.kits.find((row) => row.kit_number === 'KIT000ORPHAN');
    const ada = sync.body.kits.find((row) => row.kit_number === 'KIT000TEST01');
    check('Sheet wins when a mirrored row changed',
      ada && ada.person_name === 'Ada Example' && ada.status === 'Active' && ada.email === 'ada.example@example.test');
    check('missing Sheet row is marked Unknown and kept',
      orphan && orphan.status === 'Unknown' && orphan.person_name === 'Orphan Example' && sync.body.unknown === 1);
    check('sync never deletes the orphan from /ops', sync.body.kits.length === 3);
    kits.resetSheetReader();
  }

  {
    store.resetStore();
    await store.applyKitsSync({
      rows: [{
        kit_number: 'KIT000KEEP',
        person_name: 'Keep Example',
        email: 'keep.example@example.test',
        status: 'Active',
        date_added: '2026-09-20',
      }],
      syncedBy: ALLOWED,
    });
    kits.setSheetReader(async () => { throw new Error('sheet_unavailable'); });
    const failed = mockRes();
    await ops(apiReq({ json: true, method: 'POST', sync: true, body: { csrf: lib.createCsrfToken(ALLOWED) } }), failed);
    const after = await store.readStore();
    check('sheet failure keeps the last good mirror',
      failed.statusCode === 503
      && failed.body.error === 'sheet_unavailable'
      && after.kits.length === 1
      && after.kits[0].kit_number === 'KIT000KEEP'
      && after.kits[0].status === 'Active');
    kits.resetSheetReader();
  }

  {
    store.resetStore();
    const html = mockRes();
    await ops(authed({ json: false, url: '/ops/kits', query: { area: 'kits' } }), html);
    check('error copy is reserved for failures, empty state is not a fake load',
      String(html.raw).includes("No kits in mirror yet · Refresh or check Sheet")
      && !String(html.raw).includes("Couldn't load kits · try Refresh"));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const catalog = fs.readFileSync(path.join(__dirname, '../assets/js/catalog-data.js'), 'utf8');
    assertPublicLogin(check, home);
    check('public catalog HTML has no kit mirror API or synthetic kit emails',
      !home.includes('/ops/api/kits')
      && !home.includes('KIT000TEST')
      && !home.includes('ada.example@example.test')
      && home.includes('Enterprise IT Hardware'));
    check('public catalog data is unchanged by kits mirror',
      !catalog.includes('/ops/api/kits') && !catalog.includes('KIT000TEST01'));
  }

  {
    const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    check('.env.example documents KIT_REGISTRY_SHEET_ID by name',
      env.includes('KIT_REGISTRY_SHEET_ID=') && env.includes('KIT_REGISTRY_REFRESH_TOKEN'));
  }

  kits.resetSheetReader();
  store.resetStore();
  global.fetch = origFetch;

  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
