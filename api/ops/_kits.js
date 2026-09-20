// Ticket 10 — Kit Registry Drive file → private /ops mirror.
// Drive files.export (CSV) is the primary pull. Sheet file remains SoT.
// /ops is read-only. Agents default-deny. Never log emails.

const { refreshGmailAccessToken } = require('./_gmail');
const {
  applyKitsSync,
  KIT_STATUSES,
  lastKitsSync,
  listKits,
  readStore,
  searchKits,
} = require('./_store');
const {
  createCsrfToken,
  header,
  isAllowlisted,
  looksLikeAgentRequest,
  normalizeEmail,
  peekSessionEmail,
  readCsrfToken,
  readSession,
} = require('./_lib');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4';
const CSV_MIME = 'text/csv';
const HEADER_ALIASES = Object.freeze({
  kitnumber: 'kit_number',
  kitno: 'kit_number',
  kit: 'kit_number',
  kitid: 'kit_number',
  name: 'person_name',
  personname: 'person_name',
  person: 'person_name',
  email: 'email',
  status: 'status',
  dateadded: 'date_added',
  date: 'date_added',
  added: 'date_added',
  notes: 'notes',
  note: 'notes',
});

let sheetReader = fetchSheetRows;

function sheetId() {
  const raw = typeof process.env.KIT_REGISTRY_SHEET_ID === 'string'
    ? process.env.KIT_REGISTRY_SHEET_ID.trim()
    : '';
  return raw;
}

function sheetTab() {
  const raw = typeof process.env.KIT_REGISTRY_SHEET_TAB === 'string'
    ? process.env.KIT_REGISTRY_SHEET_TAB.trim()
    : '';
  return raw;
}

function sheetsRefreshToken() {
  return process.env.KIT_REGISTRY_REFRESH_TOKEN || process.env.OPS_GMAIL_REFRESH_TOKEN || '';
}

function sheetsOAuthConfigured() {
  return Boolean(
    process.env.OPS_GMAIL_CLIENT_ID
    && process.env.OPS_GMAIL_CLIENT_SECRET
    && sheetsRefreshToken()
  );
}

function sheetConfigured() {
  return Boolean(sheetId()) && sheetsOAuthConfigured();
}

function sheetUrl() {
  const id = sheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit` : '';
}

function describeKitsSetup() {
  return {
    sheetConfigured: sheetConfigured(),
    sheetIdSet: Boolean(sheetId()),
    oauthSet: sheetsOAuthConfigured(),
    sheetUrl: sheetUrl(),
    via: 'drive_export',
  };
}

function headerKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function mapHeader(value) {
  return HEADER_ALIASES[headerKey(value)] || '';
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === ',' && !inQuotes)) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsvText(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let line = '';
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === '\n' && !inQuotes) {
      if (line.length) rows.push(splitCsvLine(line));
      line = '';
    } else {
      line += ch;
    }
  }
  if (line.length) rows.push(splitCsvLine(line));
  return parseSheetValues(rows);
}

function parseSheetValues(values) {
  const rows = Array.isArray(values) ? values : [];
  if (!rows.length) return { rows: [], skipped: [] };
  const headers = (rows[0] || []).map(mapHeader);
  const parsed = [];
  const skipped = [];
  rows.slice(1).forEach((cells, index) => {
    const sheetRow = index + 2;
    const raw = {};
    headers.forEach((key, col) => {
      if (!key) return;
      raw[key] = cells && cells[col] != null ? String(cells[col]) : '';
    });
    const kitNumber = String(raw.kit_number || '').trim().toUpperCase();
    const personName = String(raw.person_name || '').trim();
    if (!kitNumber || !personName) {
      skipped.push({ sheet_row: sheetRow, kit_number: kitNumber });
      return;
    }
    parsed.push({
      kit_number: kitNumber,
      person_name: personName,
      email: raw.email || '',
      status: raw.status || '',
      date_added: raw.date_added || '',
      notes: raw.notes || '',
      sheet_row: sheetRow,
    });
  });
  return { rows: parsed, skipped };
}

function logKits(event, extra) {
  const payload = Object.assign({ type: 'OpsKits', event }, extra || {});
  console.log(JSON.stringify(payload));
}

async function googleAccessToken() {
  const previous = process.env.OPS_GMAIL_REFRESH_TOKEN;
  const override = process.env.KIT_REGISTRY_REFRESH_TOKEN;
  if (override) process.env.OPS_GMAIL_REFRESH_TOKEN = override;
  try {
    return await refreshGmailAccessToken();
  } finally {
    if (previous == null) delete process.env.OPS_GMAIL_REFRESH_TOKEN;
    else process.env.OPS_GMAIL_REFRESH_TOKEN = previous;
  }
}

function driveExportUrl(id) {
  return `${DRIVE_API}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(CSV_MIME)}`;
}

async function googleGet(url) {
  const accessToken = await googleAccessToken();
  return fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function fetchDriveExportRows() {
  const id = sheetId();
  if (!id) throw new Error('sheet_unconfigured');
  const response = await googleGet(driveExportUrl(id));
  const text = await response.text();
  if (!response.ok) {
    logKits('drive_export_failed', { status: response.status });
    throw new Error('sheet_unavailable');
  }
  if (!text || text.trim().charAt(0) === '{') {
    logKits('drive_export_failed', { status: response.status, reason: 'not_csv' });
    throw new Error('sheet_unavailable');
  }
  const parsed = parseCsvText(text);
  logKits('drive_export_ok', { rows: parsed.rows.length, skipped: parsed.skipped.length });
  return parsed;
}

async function fetchSheetsApiRows() {
  const id = sheetId();
  if (!id) throw new Error('sheet_unconfigured');
  const configured = sheetTab();
  let title = configured;
  if (!title) {
    const meta = await googleGet(`${SHEETS_API}/spreadsheets/${encodeURIComponent(id)}?fields=sheets.properties.title`);
    if (!meta.ok) throw new Error('sheet_unavailable');
    const payload = await meta.json();
    title = payload && payload.sheets && payload.sheets[0] && payload.sheets[0].properties
      ? payload.sheets[0].properties.title
      : '';
  }
  if (!title) throw new Error('sheet_unavailable');
  const range = encodeURIComponent(`'${title}'!A:F`);
  const response = await googleGet(`${SHEETS_API}/spreadsheets/${encodeURIComponent(id)}/values/${range}`);
  if (!response.ok) throw new Error('sheet_unavailable');
  const payload = await response.json();
  return parseSheetValues(payload && payload.values);
}

async function fetchSheetRows() {
  try {
    return await fetchDriveExportRows();
  } catch (err) {
    if (err && err.message === 'sheet_unconfigured') throw err;
    try {
      return await fetchSheetsApiRows();
    } catch {
      throw err;
    }
  }
}

function setSheetReader(fn) {
  sheetReader = typeof fn === 'function' ? fn : fetchSheetRows;
}

function resetSheetReader() {
  sheetReader = fetchSheetRows;
}

async function syncKitsFromSheet({ syncedBy, now } = {}) {
  if (!sheetId()) return { error: 'sheet_unconfigured' };
  let parsed;
  try {
    parsed = await sheetReader();
  } catch (err) {
    const code = err && err.message === 'sheet_unconfigured' ? 'sheet_unconfigured' : 'sheet_unavailable';
    logKits(code, { founder: Boolean(syncedBy) });
    return { error: code };
  }
  const incoming = parsed && Array.isArray(parsed.rows) ? parsed.rows : [];
  const skippedRows = parsed && Array.isArray(parsed.skipped) ? parsed.skipped : [];
  skippedRows.forEach((row) => {
    logKits('row_skipped', { kit_number: row && row.kit_number ? row.kit_number : '', reason: 'malformed' });
  });
  const result = await applyKitsSync({ rows: incoming, syncedBy, now });
  if (result.error) return result;
  logKits('sync_ok', {
    founder: Boolean(syncedBy),
    upserted: result.upserted,
    unknown: result.unknown,
    skipped: result.skipped + skippedRows.length,
  });
  return Object.assign({}, result, { skipped: result.skipped + skippedRows.length });
}

async function ensureKitsMirrored(session) {
  const current = await readStore();
  if (listKits(current).length > 0) return { store: current, error: '' };
  if (!sheetId()) return { store: current, error: '' };
  const result = await syncKitsFromSheet({ syncedBy: session && session.email });
  const store = await readStore();
  return { store, error: result.error || '' };
}

function kitsGuard(req) {
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  const session = readSession(req);
  if (session) return { session };
  const claimed = peekSessionEmail(req) || normalizeEmail(header(req, 'x-ops-email') || '');
  if (claimed && !isAllowlisted(claimed)) return { status: 403, error: 'forbidden' };
  return { status: 401, error: 'sign_in_required' };
}

function csrfFrom(req, body) {
  return (body && body.csrf)
    || header(req, 'x-csrf-token')
    || header(req, 'x-csrf');
}

function kitsListPayload(storeData, session, query) {
  const meta = storeData && storeData.kitsMeta ? storeData.kitsMeta : null;
  const syncedAt = lastKitsSync(storeData);
  return {
    kits: searchKits(storeData, query),
    allKits: listKits(storeData),
    statuses: KIT_STATUSES.slice(),
    count: listKits(storeData).length,
    synced_at: syncedAt ? new Date(syncedAt).toISOString() : '',
    upserted: meta ? meta.upserted : 0,
    unknown: meta ? meta.unknown : 0,
    setup: describeKitsSetup(),
    csrf: session && session.email ? createCsrfToken(session.email) : '',
    readOnly: true,
  };
}

function verifyKitsCsrf(session, req, body) {
  return Boolean(readCsrfToken(csrfFrom(req, body), session.email));
}

module.exports = {
  KIT_STATUSES,
  csrfFrom,
  describeKitsSetup,
  driveExportUrl,
  ensureKitsMirrored,
  fetchDriveExportRows,
  fetchSheetRows,
  kitsGuard,
  kitsListPayload,
  parseCsvText,
  parseSheetValues,
  resetSheetReader,
  setSheetReader,
  sheetConfigured,
  sheetId,
  sheetUrl,
  syncKitsFromSheet,
  verifyKitsCsrf,
};
