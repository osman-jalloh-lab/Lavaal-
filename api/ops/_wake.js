// Box wake — tell the Grok Bot box that a queue has work, without Slack.
// POSTs only { queue, pendingId } to OPS_BOX_WAKE_URL (a webhook-triggered
// box routine). Never sends brief text, founder email, or any secret in the
// body. OPS_BOX_WAKE_TOKEN (optional) goes in the Authorization header only.
// Unset URL = no-op. Failures and timeouts are logged and ignored: the
// queue row already exists and the standing box poll is the backup.
// Underscore prefix: not a Vercel function. No npm. Never log URLs or secrets.

const QUEUES = Object.freeze(['ceo', 'researchy']);
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_ATTEMPTS = 3;
const ATTEMPTS_KEY = 'ops:wake:attempts';

let memoryAttempts = {};

function cleanId(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
    : '';
}

function wakeUrl() {
  const raw = typeof process.env.OPS_BOX_WAKE_URL === 'string' ? process.env.OPS_BOX_WAKE_URL.trim() : '';
  return /^https:\/\//i.test(raw) ? raw : '';
}

function wakeConfigured() {
  return Boolean(wakeUrl());
}

function maxAttempts() {
  const n = Number(process.env.OPS_WAKE_MAX_ATTEMPTS);
  return Number.isInteger(n) && n > 0 && n <= 20 ? n : DEFAULT_MAX_ATTEMPTS;
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
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

async function readAttempts() {
  if (!kvConfigured()) return Object.assign({}, memoryAttempts);
  try {
    const out = await kvCommand(['GET', ATTEMPTS_KEY]);
    const parsed = out && typeof out.result === 'string' ? JSON.parse(out.result) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAttempts(map) {
  const next = {};
  Object.keys(map || {}).slice(-200).forEach((key) => {
    const n = Number(map[key]);
    if (cleanId(key) && Number.isFinite(n) && n > 0) next[cleanId(key)] = n;
  });
  if (!kvConfigured()) {
    memoryAttempts = next;
    return;
  }
  try {
    await kvCommand(['SET', ATTEMPTS_KEY, JSON.stringify(next)]);
  } catch {
    // Ledger is best effort; worst case the sweep wakes once more.
  }
}

async function recordAttempt(pendingId) {
  const id = cleanId(pendingId);
  if (!id) return;
  const map = await readAttempts();
  map[id] = (Number(map[id]) || 0) + 1;
  await writeAttempts(map);
}

// Drop ledger rows for ids no longer pending so the map stays small.
async function pruneAttempts(liveIds) {
  const keep = new Set((liveIds || []).map(cleanId).filter(Boolean));
  const map = await readAttempts();
  const next = {};
  Object.keys(map).forEach((key) => { if (keep.has(key)) next[key] = map[key]; });
  await writeAttempts(next);
  return next;
}

async function wakeBox({ queue, pendingId, timeoutMs } = {}) {
  const q = typeof queue === 'string' ? queue.trim().toLowerCase() : '';
  const id = cleanId(pendingId);
  if (!QUEUES.includes(q) || !id) return { ok: false, skipped: true, reason: 'invalid_input' };
  const url = wakeUrl();
  if (!url) return { ok: true, skipped: true, reason: 'unconfigured' };
  const headers = { 'Content-Type': 'application/json' };
  const token = typeof process.env.OPS_BOX_WAKE_TOKEN === 'string' ? process.env.OPS_BOX_WAKE_TOKEN.trim() : '';
  if (token) headers.Authorization = `Bearer ${token}`;
  const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      resolve({ timedOut: true });
    }, limit);
  });
  try {
    const call = fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ queue: q, pendingId: id }),
      signal: controller ? controller.signal : undefined,
    });
    const outcome = await Promise.race([call, timeout]);
    if (outcome && outcome.timedOut) {
      console.log(JSON.stringify({ type: 'OpsBoxWake', event: 'timeout', queue: q }));
      return { ok: false, error: 'timeout' };
    }
    if (!outcome || !outcome.ok) {
      console.log(JSON.stringify({ type: 'OpsBoxWake', event: 'http_error', queue: q, status: outcome && outcome.status }));
      return { ok: false, error: 'http_error', status: outcome && outcome.status };
    }
    await recordAttempt(id);
    return { ok: true, queue: q, pendingId: id };
  } catch {
    console.log(JSON.stringify({ type: 'OpsBoxWake', event: 'failed', queue: q }));
    return { ok: false, error: 'wake_failed' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resetWake() {
  memoryAttempts = {};
}

module.exports = {
  ATTEMPTS_KEY,
  DEFAULT_TIMEOUT_MS,
  QUEUES,
  maxAttempts,
  pruneAttempts,
  readAttempts,
  resetWake,
  wakeBox,
  wakeConfigured,
};
