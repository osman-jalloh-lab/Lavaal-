// No-runs alarm: a Vercel cron checks when the latest routine-health
// snapshot and the latest support@ inbox push landed. If neither has
// landed within the threshold (default 6 hours), email support@ once
// until a signal lands again. Flag OPS_NO_RUNS_ALARM_ENABLED defaults
// off, so a merge changes nothing. Protected by CRON_SECRET bearer.
// Underscore prefix: not a Vercel function. No npm. Never log secrets.

const fs = require('fs');
const path = require('path');
const {
  deliverEmail,
  header,
  noStore,
  timingSafeEqualString,
} = require('./_lib');
const { readRoutineHealthLandedAt } = require('./_routine_health');
const { readInboxTriageLandedAt } = require('./_inbox_triage');

const STATE_KEY = 'lavaall-ops-no-runs-alarm-v1';
const ENDPOINT = '/api/no-runs-alarm';
const MAILBOX = 'support@lavaall.com';
const DEFAULT_STALE_HOURS = 6;
const MAX_STALE_HOURS = 168;
const DEFAULT_STALE_MS = DEFAULT_STALE_HOURS * 60 * 60 * 1000;
const CHICAGO = 'America/Chicago';

let memory = null;
let sendImpl = deliverEmail;

function noRunsAlarmEnabled() {
  const flag = String(process.env.OPS_NO_RUNS_ALARM_ENABLED || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function staleThresholdMs() {
  const raw = String(process.env.OPS_NO_RUNS_ALARM_STALE_HOURS || '').trim();
  if (!raw) return DEFAULT_STALE_MS;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_STALE_HOURS) return DEFAULT_STALE_MS;
  return Math.round(hours * 60 * 60 * 1000);
}

function staleThresholdHours() {
  return staleThresholdMs() / (60 * 60 * 1000);
}

function noRunsAlarmKey() {
  const env = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  const prefix = !env || env === 'production'
    ? ''
    : env.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return prefix ? `${prefix}:${STATE_KEY}` : STATE_KEY;
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function filePath() {
  if (kvConfigured()) return '';
  if (process.env.VERCEL) return '';
  const custom = process.env.OPS_STORE_FILE;
  return typeof custom === 'string' && custom.trim() ? `${custom.trim()}.no-runs-alarm.json` : '';
}

function sendJson(res, status, body) {
  noStore(res, 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function getCronSecret() {
  const secret = process.env.CRON_SECRET;
  return typeof secret === 'string' && secret.length > 0 ? secret : '';
}

function readBearer(req) {
  const raw = String(header(req, 'authorization') || '');
  const match = raw.match(/^\s*Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : '';
}

function verifyCronSecret(req) {
  const expected = getCronSecret();
  if (!expected) return false;
  const got = readBearer(req);
  if (!got || !timingSafeEqualString(got, expected)) return false;
  return true;
}

function formatChicagoFromMs(ms) {
  if (!Number.isFinite(ms)) return 'never';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return 'never';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const pick = (type) => {
    const part = parts.find((item) => item.type === type);
    return part ? part.value : '';
  };
  return `${pick('weekday')} ${pick('month')} ${pick('day')}, ${pick('year')}, ${pick('hour')}:${pick('minute')} ${pick('dayPeriod').toUpperCase()} CT`;
}

function describeSignal(row, now, thresholdMs) {
  if (row && row.error) return { error: 'store_unavailable', stale: false, landedAt: null, ageMs: null };
  const landedAt = row && Number.isFinite(row.landedAt) ? row.landedAt : null;
  if (landedAt == null) {
    return { present: false, stale: true, landedAt: null, ageMs: null };
  }
  const ageMs = now - landedAt;
  return { present: true, stale: ageMs > thresholdMs, landedAt, ageMs };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.open !== true && raw.open !== false) return null;
  if (raw.open === false) return { open: false };
  if (!Number.isFinite(raw.sentAt)) return null;
  const routineLandedAt = raw.routineLandedAt == null || Number.isFinite(raw.routineLandedAt)
    ? (raw.routineLandedAt == null ? null : raw.routineLandedAt)
    : null;
  const inboxLandedAt = raw.inboxLandedAt == null || Number.isFinite(raw.inboxLandedAt)
    ? (raw.inboxLandedAt == null ? null : raw.inboxLandedAt)
    : null;
  if (raw.routineLandedAt != null && !Number.isFinite(raw.routineLandedAt)) return null;
  if (raw.inboxLandedAt != null && !Number.isFinite(raw.inboxLandedAt)) return null;
  return { open: true, sentAt: raw.sentAt, routineLandedAt, inboxLandedAt };
}

function decodeJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

async function readState() {
  if (kvConfigured()) {
    const payload = await kvCommand(['GET', noRunsAlarmKey()]);
    return normalizeState(decodeJson(payload && payload.result));
  }
  const target = filePath();
  if (target) {
    if (!fs.existsSync(target)) return null;
    try {
      return normalizeState(JSON.parse(fs.readFileSync(target, 'utf8')));
    } catch {
      return null;
    }
  }
  return memory ? normalizeState(memory) : null;
}

async function writeState(state) {
  const clean = normalizeState(state);
  if (!clean) throw new Error('invalid_state');
  if (kvConfigured()) {
    await kvCommand(['SET', noRunsAlarmKey(), JSON.stringify(clean)]);
    memory = clean;
    return clean;
  }
  const target = filePath();
  if (target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(clean));
  }
  memory = clean;
  return clean;
}

function buildAlertMessage(routine, inbox, now, thresholdMs) {
  const hours = thresholdMs / (60 * 60 * 1000);
  const hoursLabel = Number.isInteger(hours) ? String(hours) : String(hours);
  const subject = `LAVAALL no-runs alarm: no agent signal in ${hoursLabel} hours`;
  const routineWhen = formatChicagoFromMs(routine.landedAt);
  const inboxWhen = formatChicagoFromMs(inbox.landedAt);
  const text = [
    `Neither a routine-health snapshot nor a support@ inbox push has landed in the last ${hoursLabel} hours.`,
    '',
    `Routine health last landed: ${routineWhen}`,
    `Inbox push last landed: ${inboxWhen}`,
    `Checked: ${formatChicagoFromMs(now)}`,
    '',
    'This is a one-time alert for this outage. It will not send again until at least one of those signals lands and then both go quiet again.',
    'This catch is meant for a full agent stop, like the 17–19 Nov 2026 usage blackout.',
  ].join('\n');
  const html = [
    `<p>Neither a routine-health snapshot nor a support@ inbox push has landed in the last ${hoursLabel} hours.</p>`,
    `<p>Routine health last landed: ${routineWhen}<br>Inbox push last landed: ${inboxWhen}<br>Checked: ${formatChicagoFromMs(now)}</p>`,
    '<p>This is a one-time alert for this outage. It will not send again until at least one of those signals lands and then both go quiet again.</p>',
    '<p>This catch is meant for a full agent stop, like the 17–19 Nov 2026 usage blackout.</p>',
  ].join('');
  return { to: MAILBOX, subject, text, html };
}

function evaluateNoRuns({ now, thresholdMs, routine, inbox, lastAlert }) {
  const clock = Number.isFinite(now) ? now : Date.now();
  const limit = Number.isFinite(thresholdMs) ? thresholdMs : DEFAULT_STALE_MS;
  const health = describeSignal(routine, clock, limit);
  const feed = describeSignal(inbox, clock, limit);
  if (health.error || feed.error) {
    return { action: 'store_unavailable', routine: health, inbox: feed, nextAlert: lastAlert || null };
  }
  const bothStale = health.stale && feed.stale;
  if (!bothStale) {
    const reason = health.stale || feed.stale ? 'one_fresh' : 'fresh';
    return { action: 'skip', reason, routine: health, inbox: feed, nextAlert: { open: false } };
  }
  if (lastAlert && lastAlert.open === true) {
    return { action: 'dedupe', reason: 'already_alerted', routine: health, inbox: feed, nextAlert: lastAlert };
  }
  return {
    action: 'alert',
    reason: 'stale',
    routine: health,
    inbox: feed,
    nextAlert: {
      open: true,
      sentAt: clock,
      routineLandedAt: health.landedAt,
      inboxLandedAt: feed.landedAt,
    },
  };
}

function logAlarm(event, extra) {
  console.log(JSON.stringify(Object.assign({ type: 'OpsNoRunsAlarm', event }, extra || {})));
}

function signalSummary(row) {
  return {
    present: Boolean(row && row.present),
    stale: Boolean(row && row.stale),
    landedAt: row && Number.isFinite(row.landedAt) ? row.landedAt : null,
  };
}

async function runNoRunsAlarm({ now } = {}) {
  const clock = Number.isFinite(now) ? now : Date.now();
  const thresholdMs = staleThresholdMs();
  const [routine, inbox] = await Promise.all([
    readRoutineHealthLandedAt(),
    readInboxTriageLandedAt(),
  ]);
  let lastAlert = null;
  try {
    lastAlert = await readState();
  } catch {
    logAlarm('store_unavailable', { which: 'state' });
    return { status: 503, body: { error: 'store_unavailable' } };
  }
  const decision = evaluateNoRuns({ now: clock, thresholdMs, routine, inbox, lastAlert });
  if (decision.action === 'store_unavailable') {
    logAlarm('store_unavailable', { which: 'signals' });
    return { status: 503, body: { error: 'store_unavailable' } };
  }
  if (decision.action === 'skip') {
    try {
      if (!lastAlert || lastAlert.open !== false) await writeState({ open: false });
    } catch {
      logAlarm('store_unavailable', { which: 'state' });
      return { status: 503, body: { error: 'store_unavailable' } };
    }
    logAlarm('skipped', { reason: decision.reason });
    return {
      status: 200,
      body: {
        ok: true,
        skipped: true,
        reason: decision.reason,
        thresholdMs,
        routine: signalSummary(decision.routine),
        inbox: signalSummary(decision.inbox),
      },
    };
  }
  if (decision.action === 'dedupe') {
    logAlarm('deduped', { reason: decision.reason });
    return {
      status: 200,
      body: {
        ok: true,
        skipped: true,
        reason: decision.reason,
        thresholdMs,
        routine: signalSummary(decision.routine),
        inbox: signalSummary(decision.inbox),
      },
    };
  }

  const message = buildAlertMessage(decision.routine, decision.inbox, clock, thresholdMs);
  let sent;
  try {
    sent = await sendImpl(message);
  } catch {
    sent = { ok: false, code: 'delivery_failed' };
  }
  if (!sent || !sent.ok) {
    logAlarm('delivery_failed', { code: sent && sent.code ? sent.code : 'delivery_failed' });
    return { status: 503, body: { error: sent && sent.code ? sent.code : 'delivery_failed' } };
  }
  try {
    await writeState(decision.nextAlert);
  } catch {
    logAlarm('store_unavailable', { which: 'state_after_send' });
    return { status: 503, body: { error: 'store_unavailable' } };
  }
  logAlarm('sent', { via: sent.via || 'unknown' });
  return {
    status: 200,
    body: {
      ok: true,
      alerted: true,
      reason: 'stale',
      via: sent.via || 'unknown',
      thresholdMs,
      routine: signalSummary(decision.routine),
      inbox: signalSummary(decision.inbox),
    },
  };
}

async function handleNoRunsAlarm(req, res) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (!verifyCronSecret(req)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (!noRunsAlarmEnabled()) {
    sendJson(res, 200, { ok: true, skipped: true, reason: 'disabled' });
    return true;
  }
  const result = await runNoRunsAlarm();
  sendJson(res, result.status, result.body);
  return true;
}

function setNoRunsAlarmSender(fn) {
  sendImpl = typeof fn === 'function' ? fn : deliverEmail;
}

function resetNoRunsAlarm() {
  memory = null;
  sendImpl = deliverEmail;
}

module.exports = {
  DEFAULT_STALE_HOURS,
  DEFAULT_STALE_MS,
  ENDPOINT,
  MAILBOX,
  STATE_KEY,
  evaluateNoRuns,
  formatChicagoFromMs,
  handleNoRunsAlarm,
  noRunsAlarmEnabled,
  noRunsAlarmKey,
  resetNoRunsAlarm,
  runNoRunsAlarm,
  setNoRunsAlarmSender,
  staleThresholdMs,
  verifyCronSecret,
};
