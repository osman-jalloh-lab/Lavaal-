// Read-only routine health for /ops. The box posts a snapshot from
// routine-check.py --json. Same bearer as CEO bridge reply
// (OPS_CEO_BRIDGE_SECRET). No new secret. Founder session reads.
// Text fields stay untrusted data and are escaped when rendered.
// Underscore prefix: not a Vercel function. No npm. Never log snapshot text.

const fs = require('fs');
const path = require('path');
const {
  escapeHtml,
  header,
  isAllowlisted,
  looksLikeAgentRequest,
  noStore,
  readSession,
  timingSafeEqualString,
} = require('./_lib');

const SNAPSHOT_KEY = 'lavaall-ops-routine-health-v1';
const MAX_SNAPSHOT_BYTES = 20 * 1024;
const STALE_MS = 26 * 60 * 60 * 1000;
const SKEW_MS = 10 * 60 * 1000;
const MAX_ROUTINES = 40;
const MAX_REASON = 240;
const CHICAGO = 'America/Chicago';
const STATUSES = Object.freeze([
  'OK',
  'PARTIAL',
  'FAILED',
  'STARTED_NO_END',
  'RUNNING',
  'MISSING',
  'NOT_WIRED',
]);
const TOP_KEYS = Object.freeze(['generatedAt', 'routines']);
const ROW_KEYS = Object.freeze(['slug', 'status', 'lastRunAt', 'reason']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENDPOINT = '/ops/api/ceo-bridge/routine-health';

let memory = null;

function routineHealthEnabled() {
  const flag = String(process.env.OPS_ROUTINE_HEALTH_ENABLED || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function routineHealthKey() {
  const env = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  const prefix = !env || env === 'production'
    ? ''
    : env.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return prefix ? `${prefix}:${SNAPSHOT_KEY}` : SNAPSHOT_KEY;
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function filePath() {
  if (kvConfigured()) return '';
  if (process.env.VERCEL) return '';
  const custom = process.env.OPS_STORE_FILE;
  return typeof custom === 'string' && custom.trim() ? `${custom.trim()}.routine-health.json` : '';
}

function sendJson(res, status, body) {
  noStore(res, 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function getBridgeSecret() {
  const secret = process.env.OPS_CEO_BRIDGE_SECRET;
  return typeof secret === 'string' && secret.length >= 16 ? secret : '';
}

function readBearer(req) {
  const raw = String(header(req, 'authorization') || '');
  const match = raw.match(/^\s*Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : '';
}

function verifyBridgeSecret(req) {
  const expected = getBridgeSecret();
  if (!expected) return false;
  const got = readBearer(req);
  if (!got || !timingSafeEqualString(got, expected)) return false;
  return true;
}

function founderSession(req) {
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  const session = readSession(req);
  if (session && isAllowlisted(session.email)) return { session };
  return { status: 403, error: 'forbidden' };
}

function exactKeys(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const got = Object.keys(obj);
  if (got.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

function parseUtc(value) {
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const frac = value.match(/\.(\d+)Z$/);
  const millis = frac ? frac[1].padEnd(3, '0') : '000';
  const normalized = `${value.slice(0, 19)}.${millis}Z`;
  if (date.toISOString() !== normalized) return null;
  return date;
}

function cleanReason(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length > MAX_REASON) return null;
  if (/[\u0000-\u001F\u007F]/.test(text)) return null;
  return text;
}

function normalizeRow(row) {
  if (!exactKeys(row, ROW_KEYS)) return null;
  if (typeof row.slug !== 'string' || row.slug.length > 64 || !SLUG_RE.test(row.slug)) return null;
  if (!STATUSES.includes(row.status)) return null;
  if (row.lastRunAt !== null && !parseUtc(row.lastRunAt)) return null;
  const reason = cleanReason(row.reason);
  if (reason === null) return null;
  return {
    slug: row.slug,
    status: row.status,
    lastRunAt: row.lastRunAt,
    reason,
  };
}

function validateSnapshot(body, now) {
  const clock = Number.isFinite(now) ? now : Date.now();
  if (!exactKeys(body, TOP_KEYS)) return { error: 'invalid_shape' };
  const generated = parseUtc(body.generatedAt);
  if (!generated) return { error: 'invalid_shape' };
  if (generated.getTime() > clock + SKEW_MS) return { error: 'invalid_shape' };
  if (!Array.isArray(body.routines) || body.routines.length > MAX_ROUTINES) return { error: 'invalid_shape' };
  const routines = [];
  const seen = new Set();
  for (let i = 0; i < body.routines.length; i += 1) {
    const clean = normalizeRow(body.routines[i]);
    if (!clean || seen.has(clean.slug)) return { error: 'invalid_shape' };
    seen.add(clean.slug);
    routines.push(clean);
  }
  return {
    ok: true,
    snapshot: {
      generatedAt: body.generatedAt,
      routines,
    },
  };
}

function normalizeStored(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!parseUtc(raw.generatedAt)) return null;
  if (!Number.isFinite(raw.receivedAt)) return null;
  if (!Array.isArray(raw.routines) || raw.routines.length > MAX_ROUTINES) return null;
  const routines = [];
  const seen = new Set();
  for (let i = 0; i < raw.routines.length; i += 1) {
    const clean = normalizeRow(raw.routines[i]);
    if (!clean || seen.has(clean.slug)) return null;
    seen.add(clean.slug);
    routines.push(clean);
  }
  return {
    generatedAt: raw.generatedAt,
    receivedAt: raw.receivedAt,
    routines,
  };
}

function snapshotIsStale(generatedAt, now) {
  const generated = parseUtc(generatedAt);
  if (!generated) return false;
  const clock = Number.isFinite(now) ? now : Date.now();
  return clock - generated.getTime() > STALE_MS;
}

function toneFor(status) {
  switch (status) {
    case 'OK':
      return 'ok';
    case 'PARTIAL':
    case 'STARTED_NO_END':
    case 'NOT_WIRED':
      return 'warn';
    case 'FAILED':
    case 'MISSING':
      return 'bad';
    case 'RUNNING':
      return 'run';
    default: {
      const _never = status;
      void _never;
      return '';
    }
  }
}

function dotClass(tone) {
  switch (tone) {
    case 'ok':
      return 'rh-dot rh-ok';
    case 'warn':
      return 'rh-dot rh-warn';
    case 'bad':
      return 'rh-dot rh-bad';
    case 'run':
      return 'rh-dot rh-run';
    default: {
      const _never = tone;
      void _never;
      return 'rh-dot rh-warn';
    }
  }
}

function formatChicago(iso) {
  const date = parseUtc(iso);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const pick = (type) => {
    const part = parts.find((item) => item.type === type);
    return part ? part.value : '';
  };
  return `${pick('month')} ${pick('day')}, ${pick('hour')}:${pick('minute')} ${pick('dayPeriod').toUpperCase()} CT`;
}

function toView(record, now) {
  const clock = Number.isFinite(now) ? now : Date.now();
  const clean = record ? normalizeStored(record) : null;
  if (!clean) return { ok: true, empty: true, stale: false, routines: [] };
  return {
    ok: true,
    empty: false,
    stale: snapshotIsStale(clean.generatedAt, clock),
    generatedAt: clean.generatedAt,
    receivedAt: clean.receivedAt,
    checkedLabel: formatChicago(clean.generatedAt),
    routines: clean.routines.map((row) => ({
      slug: row.slug,
      status: row.status,
      tone: toneFor(row.status),
      lastRunAt: row.lastRunAt,
      lastRunLabel: row.lastRunAt ? formatChicago(row.lastRunAt) : '',
      reason: row.reason,
    })),
  };
}

function renderItem(row) {
  const when = row.lastRunLabel ? escapeHtml(row.lastRunLabel) : 'no run';
  const datetime = row.lastRunAt ? ` datetime="${escapeHtml(row.lastRunAt)}"` : '';
  const reason = row.reason ? escapeHtml(row.reason) : 'No reason recorded';
  return `<details class="routine-health-item">
    <summary>
      <span class="${dotClass(row.tone || toneFor(row.status))}" aria-hidden="true"></span>
      <span class="rh-slug">${escapeHtml(row.slug)}</span>
      <span class="rh-status">${escapeHtml(row.status)}</span>
      <time class="rh-time"${datetime}>${when}</time>
    </summary>
    <p class="rh-reason">${reason}</p>
  </details>`;
}

function renderRoutineHealthStrip(view) {
  const failed = Boolean(view && view.error);
  const empty = !view || view.empty || failed;
  const state = failed
    ? "Couldn't load routine health"
    : empty
      ? 'No data yet'
      : `Checked ${view.checkedLabel || ''}`;
  const stale = Boolean(view && view.stale && !empty);
  const routines = !empty && view && Array.isArray(view.routines) ? view.routines : [];
  const noRoutines = !empty && routines.length === 0;
  return `<section class="routine-health" id="routine-health" data-endpoint="${ENDPOINT}" aria-label="Routine health">
  <div class="routine-health-head">
    <h2>Routine health</h2>
    <p class="routine-health-state" data-role="state">${escapeHtml(state)}</p>
    <p class="routine-health-stale" data-role="stale"${stale ? '' : ' hidden'}>stale</p>
  </div>
  <div class="routine-health-list" data-role="list">${routines.map((row) => renderItem(row)).join('')}</div>
  <p class="routine-health-empty" data-role="empty"${noRoutines ? '' : ' hidden'}>No routines reported</p>
</section>`;
}

function decodeJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

async function kvCommand(args) {
  const base = process.env.KV_REST_API_URL.replace(/\/$/, '');
  const response = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error('kv_command_failed');
  return response.json();
}

function readFileRecord() {
  const target = filePath();
  if (!target || !fs.existsSync(target)) return null;
  try {
    return normalizeStored(JSON.parse(fs.readFileSync(target, 'utf8')));
  } catch {
    return null;
  }
}

function writeFileRecord(record) {
  const target = filePath();
  if (!target) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(record));
}

async function readRecord() {
  if (kvConfigured()) {
    const payload = await kvCommand(['GET', routineHealthKey()]);
    return normalizeStored(decodeJson(payload && payload.result));
  }
  if (filePath()) return readFileRecord();
  return memory ? normalizeStored(memory) : null;
}

async function writeRecord(record) {
  const clean = normalizeStored(record);
  if (!clean) throw new Error('invalid_snapshot');
  if (kvConfigured()) {
    await kvCommand(['SET', routineHealthKey(), JSON.stringify(clean)]);
    return clean;
  }
  if (filePath()) {
    writeFileRecord(clean);
    memory = clean;
    return clean;
  }
  memory = clean;
  return clean;
}

async function readRoutineHealthView(now) {
  try {
    const record = await readRecord();
    return toView(record, now);
  } catch {
    console.log(JSON.stringify({ type: 'OpsRoutineHealth', event: 'store_unavailable' }));
    return { ok: false, error: 'store_unavailable', empty: true, stale: false, routines: [] };
  }
}

function declaredTooLarge(req) {
  const raw = header(req, 'content-length');
  if (raw == null || raw === '') return false;
  const size = Number(String(raw).trim());
  return Number.isFinite(size) && size > MAX_SNAPSHOT_BYTES;
}

function payloadBytes(req) {
  if (typeof req.body === 'string') return Buffer.byteLength(req.body, 'utf8');
  if (Buffer.isBuffer(req.body)) return req.body.length;
  if (req.body && typeof req.body === 'object') {
    return Buffer.byteLength(JSON.stringify(req.body), 'utf8');
  }
  return 0;
}

function parsePayload(req) {
  if (typeof req.body === 'string') {
    if (!req.body.trim()) return { error: 'invalid_json' };
    try {
      return { parsed: JSON.parse(req.body) };
    } catch {
      return { error: 'invalid_json' };
    }
  }
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8');
    if (!raw.trim()) return { error: 'invalid_json' };
    try {
      return { parsed: JSON.parse(raw) };
    } catch {
      return { error: 'invalid_json' };
    }
  }
  if (req.body && typeof req.body === 'object') return { parsed: req.body };
  return { error: 'invalid_json' };
}

async function handleRoutineHealth(req, res) {
  if (!routineHealthEnabled()) {
    sendJson(res, 404, { error: 'not_found' });
    return true;
  }
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    const access = founderSession(req);
    if (!access.session) {
      sendJson(res, access.status, { error: access.error });
      return true;
    }
    const view = await readRoutineHealthView();
    if (view.error) {
      sendJson(res, 503, { error: 'store_unavailable' });
      return true;
    }
    sendJson(res, 200, view);
    return true;
  }
  if (method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (!verifyBridgeSecret(req)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (declaredTooLarge(req) || payloadBytes(req) > MAX_SNAPSHOT_BYTES) {
    sendJson(res, 413, { error: 'payload_too_large' });
    return true;
  }
  const contentType = String(header(req, 'content-type') || '');
  if (contentType && !/^\s*application\/json\b/i.test(contentType)) {
    sendJson(res, 400, { error: 'invalid_json' });
    return true;
  }
  const parsed = parsePayload(req);
  if (parsed.error) {
    sendJson(res, 400, { error: parsed.error });
    return true;
  }
  const validated = validateSnapshot(parsed.parsed);
  if (validated.error) {
    sendJson(res, 400, { error: validated.error });
    return true;
  }
  try {
    const record = await writeRecord({
      generatedAt: validated.snapshot.generatedAt,
      receivedAt: Date.now(),
      routines: validated.snapshot.routines,
    });
    sendJson(res, 200, { ok: true, stored: true, count: record.routines.length });
  } catch {
    console.log(JSON.stringify({ type: 'OpsRoutineHealth', event: 'store_unavailable' }));
    sendJson(res, 503, { error: 'store_unavailable' });
  }
  return true;
}

function resetRoutineHealth() {
  memory = null;
}

module.exports = {
  ENDPOINT,
  MAX_REASON,
  MAX_ROUTINES,
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_KEY,
  STALE_MS,
  STATUSES,
  formatChicago,
  handleRoutineHealth,
  readRoutineHealthView,
  renderRoutineHealthStrip,
  resetRoutineHealth,
  routineHealthEnabled,
  routineHealthKey,
  snapshotIsStale,
  toneFor,
  validateSnapshot,
};
