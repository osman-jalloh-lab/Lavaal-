// Ticket 10 — Kit Registry → private /ops mirror via Google Drive export.
// Sheet remains source of truth. Status deactivate may try a Sheet write; if
// the token is drive.readonly, the mirror updates and a banner says so.
// Agents default-deny. Underscore prefix: not a Vercel function. No npm. Never log emails.

const { refreshGmailAccessToken } = require('./_gmail');
const {
  looksLikeHtml,
  parseCsvToValues,
  parseSheetValues,
  parseXlsxToValues,
} = require('./_kits_file');
const {
  applyKitsSync,
  KIT_STATUSES,
  lastKitsSync,
  listKits,
  normalizeKitStatus,
  readStore,
  searchKits,
  updateKitStatus,
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
const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const CSV_MIME = 'text/csv';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PREVIEW_KIT_REGISTRY_FILE_ID = '155IRHtVgDcAVXeeW6EU8X4fw7eOpjX4pgSejR92Ch_4';
const HYDRATE_COOLDOWN_MS = 15000;
const SHEET_WRITE_BANNER = 'Updated here. The Sheet was not updated — this needs a broader Sheets or Drive write permission. Refresh will take the Sheet’s status until then.';
const SHEETS_VALUES_API = 'https://sheets.googleapis.com/v4/spreadsheets';

let sheetReader = fetchDriveRows;
let sheetWriter = writeSheetStatusCell;
let lastHydrateAttempt = 0;

function sheetId() {
  const raw = typeof process.env.KIT_REGISTRY_SHEET_ID === 'string'
    ? process.env.KIT_REGISTRY_SHEET_ID.trim()
    : '';
  return raw || PREVIEW_KIT_REGISTRY_FILE_ID;
}

function sheetTab() {
  const raw = typeof process.env.KIT_REGISTRY_SHEET_TAB === 'string'
    ? process.env.KIT_REGISTRY_SHEET_TAB.trim()
    : '';
  return raw;
}

function driveRefreshToken() {
  return process.env.KIT_REGISTRY_REFRESH_TOKEN || process.env.OPS_GMAIL_REFRESH_TOKEN || '';
}

function driveOAuthConfigured() {
  return Boolean(
    process.env.OPS_GMAIL_CLIENT_ID
    && process.env.OPS_GMAIL_CLIENT_SECRET
    && driveRefreshToken()
  );
}

function sheetConfigured() {
  return Boolean(sheetId()) && driveOAuthConfigured();
}

function sheetUrl() {
  const id = sheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit` : '';
}

function describeKitsSetup() {
  return {
    sheetConfigured: sheetConfigured(),
    sheetIdSet: Boolean(sheetId()),
    oauthSet: driveOAuthConfigured(),
    via: 'drive',
    driveScope: DRIVE_READONLY_SCOPE,
    sheetUrl: sheetUrl(),
  };
}

function logKits(event, extra) {
  const payload = Object.assign({ type: 'OpsKits', event }, extra || {});
  console.log(JSON.stringify(payload));
}

async function withKitsRefreshToken(fn) {
  const previous = process.env.OPS_GMAIL_REFRESH_TOKEN;
  const override = process.env.KIT_REGISTRY_REFRESH_TOKEN;
  if (override) process.env.OPS_GMAIL_REFRESH_TOKEN = override;
  try {
    return await fn();
  } finally {
    if (previous == null) delete process.env.OPS_GMAIL_REFRESH_TOKEN;
    else process.env.OPS_GMAIL_REFRESH_TOKEN = previous;
  }
}

async function driveFetch(url) {
  return withKitsRefreshToken(async () => {
    const accessToken = await refreshGmailAccessToken();
    return fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  });
}

function driveFileUrl(id, query) {
  return `${DRIVE_API}/files/${encodeURIComponent(id)}?${query}`;
}

function driveExportUrl(id, mimeType) {
  return `${DRIVE_API}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mimeType)}`;
}

function docsCsvUrl(id) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv`;
}

async function readCsvResponse(response) {
  if (!response || !response.ok) return '';
  const text = await response.text();
  if (!text || looksLikeHtml(text)) return '';
  return text;
}

async function readBufferResponse(response) {
  if (!response || !response.ok) return null;
  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

async function fetchDriveMeta(id) {
  const response = await driveFetch(driveFileUrl(id, 'fields=id,name,mimeType'));
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchDriveRows() {
  const id = sheetId();
  if (!id) throw new Error('sheet_unconfigured');
  const tab = sheetTab();
  const meta = await fetchDriveMeta(id).catch(() => null);
  const mime = meta && typeof meta.mimeType === 'string' ? meta.mimeType : '';

  if (mime === 'text/csv' || mime === 'text/plain' || mime === 'text/tab-separated-values') {
    const text = await readCsvResponse(await driveFetch(driveFileUrl(id, 'alt=media')));
    if (text) return parseSheetValues(parseCsvToValues(text));
  }

  if (mime === XLSX_MIME || mime.includes('spreadsheetml.sheet')) {
    const buffer = await readBufferResponse(await driveFetch(driveFileUrl(id, 'alt=media')));
    if (buffer && buffer.length) return parseSheetValues(parseXlsxToValues(buffer, tab));
  }

  if (!mime || mime === GOOGLE_SHEET_MIME) {
    if (!tab) {
      const csv = await readCsvResponse(await driveFetch(driveExportUrl(id, CSV_MIME)));
      if (csv) return parseSheetValues(parseCsvToValues(csv));
    }
    const xlsx = await readBufferResponse(await driveFetch(driveExportUrl(id, XLSX_MIME)));
    if (xlsx && xlsx.length) return parseSheetValues(parseXlsxToValues(xlsx, tab));
    if (!tab) {
      const webCsv = await readCsvResponse(await driveFetch(docsCsvUrl(id)));
      if (webCsv) return parseSheetValues(parseCsvToValues(webCsv));
    }
  }

  throw new Error('sheet_unavailable');
}

function setSheetReader(fn) {
  sheetReader = typeof fn === 'function' ? fn : fetchDriveRows;
}

function resetSheetWriter() {
  sheetWriter = writeSheetStatusCell;
}

function resetSheetReader() {
  sheetReader = fetchDriveRows;
  lastHydrateAttempt = 0;
  resetSheetWriter();
}

function setSheetWriter(fn) {
  sheetWriter = typeof fn === 'function' ? fn : writeSheetStatusCell;
}

function a1Column(index) {
  let n = Math.floor(Number(index) || 0);
  if (n < 1) return '';
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function statusA1(kit) {
  if (!kit) return '';
  const col = a1Column(kit.status_col);
  const row = Number(kit.sheet_row);
  if (!col || !Number.isFinite(row) || row < 2) return '';
  const cell = `${col}${Math.floor(row)}`;
  const tab = sheetTab();
  if (!tab) return cell;
  return `'${String(tab).replace(/'/g, "''")}'!${cell}`;
}

async function writeSheetStatusCell({ kit, status } = {}) {
  const id = sheetId();
  const range = statusA1(kit);
  const nextStatus = normalizeKitStatus(status);
  if (!id || !range || (nextStatus !== 'Active' && nextStatus !== 'Inactive')) {
    return { error: 'sheet_write_unavailable' };
  }
  if (!driveOAuthConfigured()) return { error: 'sheet_write_unavailable' };
  try {
    const response = await withKitsRefreshToken(async () => {
      const accessToken = await refreshGmailAccessToken();
      const url = `${SHEETS_VALUES_API}/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
      return fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [[nextStatus]] }),
      });
    });
    if (!response) return { error: 'sheet_write_failed' };
    if (response.status === 401 || response.status === 403) return { error: 'sheet_write_denied' };
    if (!response.ok) return { error: 'sheet_write_failed' };
    return { ok: true };
  } catch {
    return { error: 'sheet_write_failed' };
  }
}

async function setKitStatus({ kitNumber, status, updatedBy } = {}) {
  const nextStatus = normalizeKitStatus(status);
  if (nextStatus !== 'Active' && nextStatus !== 'Inactive') return { error: 'invalid_status' };
  let storeData;
  try {
    storeData = await readStore();
  } catch {
    return { error: 'store_unavailable' };
  }
  const number = String(kitNumber || '').trim().toUpperCase();
  const kit = listKits(storeData).find((row) => row.kit_number === number);
  if (!kit) return { error: 'kit_not_found' };

  let sheetResult = { error: 'sheet_write_unavailable' };
  try {
    sheetResult = await sheetWriter({ kit, status: nextStatus });
  } catch {
    sheetResult = { error: 'sheet_write_failed' };
  }
  const sheetUpdated = Boolean(sheetResult && sheetResult.ok);
  const pending = sheetUpdated
    ? null
    : {
      kit_number: kit.kit_number,
      status: nextStatus,
      at: Date.now(),
      reason: (sheetResult && sheetResult.error) || 'needs_permission',
    };
  const updated = await updateKitStatus(kit.kit_number, nextStatus, {
    pendingSheetWrite: pending,
    updatedBy,
  });
  if (updated.error) return updated;
  logKits(sheetUpdated ? 'status_sheet_ok' : 'status_mirror_only', {
    founder: Boolean(updatedBy),
    via: 'drive',
  });
  return {
    ok: true,
    kit: updated.kit,
    sheetUpdated,
    pendingSheetWrite: updated.pendingSheetWrite || null,
    banner: sheetUpdated ? '' : SHEET_WRITE_BANNER,
  };
}

async function syncKitsFromSheet({ syncedBy, now } = {}) {
  if (!sheetId()) return { error: 'sheet_unconfigured' };
  let parsed;
  try {
    parsed = await sheetReader();
  } catch (err) {
    const code = err && err.message === 'sheet_unconfigured' ? 'sheet_unconfigured' : 'sheet_unavailable';
    logKits(code, { founder: Boolean(syncedBy), via: 'drive' });
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
    via: 'drive',
    upserted: result.upserted,
    unknown: result.unknown,
    skipped: result.skipped + skippedRows.length,
  });
  return Object.assign({}, result, { skipped: result.skipped + skippedRows.length });
}

async function hydrateKitsIfEmpty(session) {
  let storeData;
  try {
    storeData = await readStore();
  } catch {
    return { error: 'store_unavailable' };
  }
  if (lastKitsSync(storeData)) return { store: storeData };
  if (!sheetConfigured()) return { store: storeData };
  const now = Date.now();
  if (lastHydrateAttempt && now - lastHydrateAttempt < HYDRATE_COOLDOWN_MS) {
    return { store: storeData };
  }
  lastHydrateAttempt = now;
  const result = await syncKitsFromSheet({ syncedBy: session && session.email });
  if (result.error) return { store: storeData, error: result.error };
  try {
    return { store: await readStore(), hydrated: true };
  } catch {
    return { error: 'store_unavailable' };
  }
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
  const pending = meta ? meta.pendingSheetWrite : null;
  return {
    kits: searchKits(storeData, query),
    allKits: listKits(storeData),
    statuses: KIT_STATUSES.slice(),
    count: listKits(storeData).length,
    synced_at: syncedAt ? new Date(syncedAt).toISOString() : '',
    upserted: meta ? meta.upserted : 0,
    unknown: meta ? meta.unknown : 0,
    pendingSheetWrite: pending || null,
    sheetWriteBanner: pending ? SHEET_WRITE_BANNER : '',
    setup: describeKitsSetup(),
    csrf: session && session.email ? createCsrfToken(session.email) : '',
    readOnly: true,
    canSetStatus: true,
  };
}

function verifyKitsCsrf(session, req, body) {
  return Boolean(readCsrfToken(csrfFrom(req, body), session.email));
}

module.exports = {
  DRIVE_READONLY_SCOPE,
  KIT_STATUSES,
  PREVIEW_KIT_REGISTRY_FILE_ID,
  SHEET_WRITE_BANNER,
  csrfFrom,
  describeKitsSetup,
  fetchDriveRows,
  fetchSheetRows: fetchDriveRows,
  hydrateKitsIfEmpty,
  kitsGuard,
  kitsListPayload,
  parseCsvToValues,
  parseSheetValues,
  parseXlsxToValues,
  resetSheetReader,
  resetSheetWriter,
  setKitStatus,
  setSheetReader,
  setSheetWriter,
  sheetConfigured,
  sheetId,
  sheetUrl,
  syncKitsFromSheet,
  verifyKitsCsrf,
  writeSheetStatusCell,
};
