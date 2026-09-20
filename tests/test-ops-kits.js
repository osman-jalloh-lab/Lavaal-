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
const TEST_SHEET_ID = 'test-kit-registry-sheet-id';

const FIXTURE_VALUES = [
  ['Kit Number', 'Name', 'Email', 'Status', 'Date Added', 'Notes'],
  ['kit000test01', 'Ada Example', 'ada.example@example.test', 'Active', '2026-09-20', 'Synthetic fixture'],
  ['KIT000TEST02', 'Ben Example', 'ben.example@example.test', 'Inactive', '9/18/2026', ''],
  ['', 'Missing Number', 'skip.example@example.test', 'Active', '2026-09-19', 'malformed'],
];

const FIXTURE_CSV = [
  'Kit Number,Name,Email,Status,Date Added,Notes',
  'kit000test01,Ada Example,ada.example@example.test,Active,2026-09-20,Synthetic fixture',
  'KIT000TEST02,Ben Example,ben.example@example.test,Inactive,9/18/2026,',
  ',Missing Number,skip.example@example.test,Active,2026-09-19,malformed',
].join('\n');

const QUOTED_CSV = [
  'Kit Number,Name,Email,Status,Date Added,Notes',
  '"KIT,01","Ada, Example","ada.example@example.test","Active","2026-09-20","He said ""ok"""',
].join('\n');

function zipStoreFiles(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  Object.keys(files).forEach((name) => {
    const data = Buffer.from(files[name]);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    const localFull = Buffer.concat([local, nameBuf, data]);
    locals.push(localFull);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += localFull.length;
  });
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(centrals.length, 8);
  eocd.writeUInt16LE(centrals.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([cd, eocd]));
}

function colLetter(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function buildXlsx(values, tabName) {
  const shared = [];
  const indexOf = (text) => {
    const value = String(text == null ? '' : text);
    const found = shared.indexOf(value);
    if (found !== -1) return found;
    shared.push(value);
    return shared.length - 1;
  };
  const rowsXml = values.map((row, rowIndex) => {
    const cells = row.map((cell, col) => {
      const ref = `${colLetter(col)}${rowIndex + 1}`;
      return `<c r="${ref}" t="s"><v>${indexOf(cell)}</v></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const sst = shared.map((item) => `<si><t>${item.replace(/&/g, '&amp;')}</t></si>`).join('');
  return zipStoreFiles({
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${tabName || 'Registry'}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sst}</sst>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`,
  });
}

function jsonOk(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    arrayBuffer: async () => Buffer.from(JSON.stringify(payload)),
  };
}

function textOk(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => text,
    arrayBuffer: async () => Buffer.from(text),
  };
}

function bufferOk(buffer) {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
    arrayBuffer: async () => buffer,
  };
}

function notOk(status) {
  return {
    ok: false,
    status: status || 403,
    json: async () => ({}),
    text: async () => '',
    arrayBuffer: async () => Buffer.alloc(0),
  };
}

function mockDriveFetch({ csv, xlsx, mime } = {}) {
  const seen = [];
  const fn = async (url) => {
    const href = String(url);
    seen.push(href);
    if (href.includes('sheets.googleapis.com')) throw new Error('sheets_api_used');
    if (href.includes('oauth2.googleapis.com/token')) return jsonOk({ access_token: 'ya29.test-drive' });
    if (href.includes('/files/') && href.includes('fields=')) {
      return jsonOk({
        id: TEST_SHEET_ID,
        name: 'Kit Registry',
        mimeType: mime || 'application/vnd.google-apps.spreadsheet',
      });
    }
    if (href.includes('/export?') && href.includes('text%2Fcsv')) {
      return csv ? textOk(csv) : notOk(403);
    }
    if (href.includes('/export?format=csv')) return csv ? textOk(csv) : notOk(403);
    if (href.includes('/export?') && href.includes('spreadsheetml')) {
      return xlsx ? bufferOk(xlsx) : notOk(403);
    }
    if (href.includes('alt=media')) {
      if (xlsx) return bufferOk(xlsx);
      if (csv) return textOk(csv);
      return notOk(404);
    }
    return notOk(404);
  };
  fn.seen = seen;
  return fn;
}

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
  process.env.KIT_REGISTRY_SHEET_ID = TEST_SHEET_ID;
  process.env.OPS_GMAIL_CLIENT_ID = 'kits-client';
  process.env.OPS_GMAIL_CLIENT_SECRET = 'kits-secret';
  process.env.OPS_GMAIL_REFRESH_TOKEN = 'kits-refresh';
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();
  kits.resetSheetReader();
  global.fetch = mockDriveFetch();

  check('nav includes Kits after Calendar',
    NAV.some((item) => item.id === 'kits' && item.href === '/ops/kits' && item.label === 'Kits'));

  {
    const prev = process.env.KIT_REGISTRY_SHEET_ID;
    delete process.env.KIT_REGISTRY_SHEET_ID;
    check('Preview defaults to the founder Kit Registry Drive file',
      kits.sheetId() === '155IRHtVgDcAVXeeW6EU8X4fw7eOpjX4pgSejR92Ch_4'
      && kits.DRIVE_READONLY_SCOPE === 'https://www.googleapis.com/auth/drive.readonly');
    process.env.KIT_REGISTRY_SHEET_ID = prev;
  }

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
    const fromCsv = kits.parseSheetValues(kits.parseCsvToValues(FIXTURE_CSV));
    check('CSV export parser matches the synthetic sheet fixture',
      fromCsv.rows.length === 2
      && fromCsv.skipped.length === 1
      && fromCsv.rows[0].kit_number === 'KIT000TEST01'
      && fromCsv.rows[1].person_name === 'Ben Example');
    const quoted = kits.parseCsvToValues(QUOTED_CSV);
    check('CSV parser keeps quoted commas and escaped quotes',
      quoted[1][0] === 'KIT,01'
      && quoted[1][1] === 'Ada, Example'
      && quoted[1][5] === 'He said "ok"');
    const fromXlsx = kits.parseSheetValues(kits.parseXlsxToValues(buildXlsx(FIXTURE_VALUES, 'Registry'), 'Registry'));
    check('XLSX export parser matches the synthetic sheet fixture',
      fromXlsx.rows.length === 2
      && fromXlsx.rows[0].person_name === 'Ada Example'
      && fromXlsx.rows[1].kit_number === 'KIT000TEST02');
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
    check('logged-out /ops/kits is the login page', page.statusCode === 401 && String(page.raw).includes('Enter your work email'));
    check('logged-out Kits HTML has no kit emails', noKitPii(page.raw) && !String(page.raw).includes('KIT000TEST01'));
    check('logged-out /ops/kits shows no kit rows in DOM',
      !String(page.raw).includes('kits-row')
      && !String(page.raw).includes('id="kits-table"')
      && !String(page.raw).includes('Ada Example'));
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
    const savedSecret = process.env.OPS_GMAIL_CLIENT_SECRET;
    delete process.env.OPS_GMAIL_CLIENT_SECRET;
    kits.resetSheetReader();
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/kits', query: { area: 'kits' } }), page);
    const html = String(page.raw);
    process.env.OPS_GMAIL_CLIENT_SECRET = savedSecret;
    check('Kits page is real, not a ticket stub',
      page.statusCode === 200
      && html.includes('Kits')
      && html.includes('Sheet is source of truth')
      && html.includes('Refresh')
      && !html.includes('coming in ticket 10'));
    check('Kits banner names last sync and Open Sheet',
      html.includes('Sheet is SoT')
      && html.includes('last sync never')
      && html.includes('Open Sheet')
      && html.includes('docs.google.com/spreadsheets/d/' + TEST_SHEET_ID));
    check('Kits table columns are Kit Number, Name, Status, Date Added',
      html.includes('>Kit Number<')
      && html.includes('>Name<')
      && html.includes('>Status<')
      && html.includes('>Date Added<'));
    check('empty Kits copy has no fake demo kits when Drive auth is missing',
      html.includes('No kits in mirror yet · Refresh or check Sheet')
      && html.includes('Google Drive access is not connected yet')
      && !html.includes('KIT00384515')
      && !/19 kits/.test(html)
      && !html.includes("Couldn't load kits · try Refresh"));
    check('Kits page is table-first with no vanity KPIs',
      html.includes('kits-table')
      && !/productivity|streak|points|kpi/i.test(html));
    check('Kits search and status filter are present',
      html.includes('id="kits-search"')
      && html.includes('Search name or kit #')
      && html.includes('data-status="Active"'));
    check('logged-in nav includes Kits', html.includes('href="/ops/kits"') && html.includes('aria-current="page"'));
    check('Kits Option I board is cream table-first not navy fortress',
      html.includes('kits-board')
      && html.includes('--canvas:#EDE7E0')
      && html.includes('--surface:#F3EEE7')
      && html.includes('.kit-status.is-active{background:var(--emerald-wash)')
      && html.includes('.kit-status.is-inactive{background:var(--chip-idle)')
      && !html.includes('#0B1424'));
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
    const logs = [];
    const origLog = console.log;
    console.log = (line) => { logs.push(String(line)); };
    try {
      await ops(apiReq({ json: true, method: 'POST', sync: true, body: { csrf } }), sync);
    } finally {
      console.log = origLog;
    }
    check('founder sync upserts synthetic rows and skips malformed',
      sync.statusCode === 200
      && sync.body.ok === true
      && sync.body.upserted === 2
      && sync.body.kits.length === 2
      && sync.body.kits.some((row) => row.kit_number === 'KIT000TEST01' && row.person_name === 'Ada Example' && row.status === 'Active')
      && sync.body.kits.some((row) => row.kit_number === 'KIT000TEST02' && row.date_added === '2026-09-18'));
    check('sync response includes last sync and does not invent a third kit',
      Boolean(sync.body.synced_at) && !sync.body.kits.some((row) => row.person_name === 'Missing Number'));
    check('sync logs omit kit and founder emails',
      logs.some((line) => line.includes('OpsKits') && line.includes('sync_ok'))
      && logs.every((line) => !line.includes('@example.test') && !line.includes(ALLOWED)));
    check('GET /ops/api/kits is date_added DESC',
      sync.body.kits[0].date_added >= sync.body.kits[1].date_added
      && sync.body.kits[0].kit_number === 'KIT000TEST01');
    check('mirror rows keep schema fields',
      sync.body.kits.every((row) => (
        row.kit_number
        && row.person_name
        && Object.prototype.hasOwnProperty.call(row, 'email')
        && ['Active', 'Inactive', 'Returned', 'Lost', 'Unknown'].includes(row.status)
        && Object.prototype.hasOwnProperty.call(row, 'sheet_row')
        && Object.prototype.hasOwnProperty.call(row, 'synced_at')
        && Object.prototype.hasOwnProperty.call(row, 'updated_at')
      )));

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
    const drawer = String(html.raw).match(/<aside class="kit-drawer"[\s\S]*?<\/aside>/);
    check('list columns hide email; drawer data keeps it',
      cells.includes('KIT000TEST01')
      && cells.includes('Ada Example')
      && !cells.includes('ada.example@example.test')
      && String(html.raw).includes('data-email="ada.example@example.test"')
      && String(html.raw).includes('id="kit-drawer"')
      && String(html.raw).includes('id="kit-drawer-notes"'));
    check('kit drawer is read-only with no edit fields',
      Boolean(drawer)
      && !/<(input|textarea|select)\b/i.test(drawer[0])
      && drawer[0].includes('Open Sheet'));
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
    const savedSecret = process.env.OPS_GMAIL_CLIENT_SECRET;
    delete process.env.OPS_GMAIL_CLIENT_SECRET;
    kits.resetSheetReader();
    const html = mockRes();
    await ops(authed({ json: false, url: '/ops/kits', query: { area: 'kits' } }), html);
    process.env.OPS_GMAIL_CLIENT_SECRET = savedSecret;
    check('error copy is reserved for failures, empty state is not a fake load',
      String(html.raw).includes("No kits in mirror yet · Refresh or check Sheet")
      && !String(html.raw).includes("Couldn't load kits · try Refresh"));
  }

  {
    store.resetStore();
    kits.resetSheetReader();
    const drive = mockDriveFetch({ csv: FIXTURE_CSV });
    global.fetch = drive;
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/kits', query: { area: 'kits' } }), page);
    const html = String(page.raw);
    check('first Kits page load hydrates from Drive CSV export',
      page.statusCode === 200
      && html.includes('KIT000TEST01')
      && html.includes('Ada Example')
      && html.includes('KIT000TEST02')
      && html.includes('Ben Example')
      && !html.includes("Couldn't load kits · try Refresh"));
    check('first-load Drive path never calls Sheets API',
      drive.seen.some((url) => url.includes('googleapis.com/drive/v3/files/'))
      && drive.seen.every((url) => !url.includes('sheets.googleapis.com')));
    const cells = tableCells(html);
    check('first-load list shows kit number, name, status, date and hides email',
      cells.includes('KIT000TEST01')
      && cells.includes('Ada Example')
      && cells.includes('Active')
      && !cells.includes('ada.example@example.test'));
    kits.resetSheetReader();
  }

  {
    store.resetStore();
    kits.resetSheetReader();
    const xlsx = buildXlsx(FIXTURE_VALUES, 'Registry');
    process.env.KIT_REGISTRY_SHEET_TAB = 'Registry';
    const drive = mockDriveFetch({
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xlsx,
    });
    global.fetch = drive;
    const csrf = lib.createCsrfToken(ALLOWED);
    const sync = mockRes();
    await ops(apiReq({ json: true, method: 'POST', sync: true, body: { csrf } }), sync);
    check('Refresh upserts from Drive XLSX without Sheets API',
      sync.statusCode === 200
      && sync.body.ok === true
      && sync.body.upserted === 2
      && sync.body.kits.some((row) => row.kit_number === 'KIT000TEST01')
      && drive.seen.every((url) => !url.includes('sheets.googleapis.com')));
    delete process.env.KIT_REGISTRY_SHEET_TAB;
    kits.resetSheetReader();
    global.fetch = mockDriveFetch();
  }

  {
    store.resetStore();
    kits.resetSheetReader();
    global.fetch = mockDriveFetch();
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/kits', query: { area: 'kits' } }), page);
    check('Drive export failure on first load shows error and invents no kits',
      page.statusCode === 200
      && String(page.raw).includes('load kits')
      && String(page.raw).includes('try Refresh')
      && !String(page.raw).includes('KIT000TEST01')
      && !String(page.raw).includes('KIT00384515')
      && !/19 kits/.test(String(page.raw)));
    kits.resetSheetReader();
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
    check('.env.example documents Drive export scope, not Sheets API',
      /^KIT_REGISTRY_SHEET_ID=\s*$/m.test(env)
      && env.includes('KIT_REGISTRY_REFRESH_TOKEN')
      && env.includes('https://www.googleapis.com/auth/drive.readonly')
      && env.includes('155IRHtVgDcAVXeeW6EU8X4fw7eOpjX4pgSejR92Ch_4')
      && !env.includes('https://www.googleapis.com/auth/spreadsheets'));
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
