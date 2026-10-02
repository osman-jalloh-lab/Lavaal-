// Starlink setup + outbox storage.
//
// Modes (see docs/starlink/README.md):
//   kv     - the repo's existing Vercel KV (Upstash REST, KV_REST_API_URL /
//            KV_REST_API_TOKEN) under the "starlink:" prefix. Opt-in only:
//            STARLINK_STORE=kv. Off by default because that KV may be shared
//            with Production data.
//   file   - local JSON file at STARLINK_STORE_FILE (ignored on Vercel).
//   memory - default. Per-instance, resets on cold start. Fine for tests.
const fs = require('fs');
const path = require('path');

const PREFIX = 'starlink:';
const OUTBOX_KEY = PREFIX + 'outbox';
const OUTBOX_MAX = 500;
const SETUP_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

let memory = { setups: {}, outbox: [] };

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function mode() {
  if (String(process.env.STARLINK_STORE || '').trim().toLowerCase() === 'kv' && kvConfigured()) return 'kv';
  if (!process.env.VERCEL && String(process.env.STARLINK_STORE_FILE || '').trim()) return 'file';
  return 'memory';
}

function isDurable() {
  return mode() !== 'memory';
}

async function kv(args) {
  const base = process.env.KV_REST_API_URL.replace(/\/$/, '');
  const response = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error('kv_command_failed');
  const payload = await response.json();
  return payload ? payload.result : null;
}

function fileRead() {
  const target = process.env.STARLINK_STORE_FILE.trim();
  try {
    const data = JSON.parse(fs.readFileSync(target, 'utf8'));
    return { setups: data.setups || {}, outbox: Array.isArray(data.outbox) ? data.outbox : [] };
  } catch {
    return { setups: {}, outbox: [] };
  }
}

function fileWrite(data) {
  const target = process.env.STARLINK_STORE_FILE.trim();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, target);
}

function local() {
  return mode() === 'file' ? fileRead() : memory;
}

function saveLocal(data) {
  if (mode() === 'file') fileWrite(data);
  else memory = data;
}

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

// Returns false when the code is already taken (caller picks a new code).
async function createSetup(record) {
  if (mode() === 'kv') {
    const r = await kv(['SET', PREFIX + 'setup:' + record.code, JSON.stringify(record), 'NX', 'EX', String(SETUP_TTL_SECONDS)]);
    return r === 'OK';
  }
  const data = local();
  if (data.setups[record.code]) return false;
  data.setups[record.code] = clone(record);
  saveLocal(data);
  return true;
}

async function getSetup(code) {
  if (mode() === 'kv') {
    const raw = await kv(['GET', PREFIX + 'setup:' + code]);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  return clone(local().setups[code] || null);
}

async function updateSetup(record) {
  if (mode() === 'kv') {
    await kv(['SET', PREFIX + 'setup:' + record.code, JSON.stringify(record), 'XX', 'EX', String(SETUP_TTL_SECONDS)]);
    return;
  }
  const data = local();
  data.setups[record.code] = clone(record);
  saveLocal(data);
}

async function appendOutbox(entry) {
  if (mode() === 'kv') {
    await kv(['LPUSH', OUTBOX_KEY, JSON.stringify(entry)]);
    await kv(['LTRIM', OUTBOX_KEY, '0', String(OUTBOX_MAX - 1)]);
    return;
  }
  const data = local();
  data.outbox.unshift(clone(entry));
  data.outbox = data.outbox.slice(0, OUTBOX_MAX);
  saveLocal(data);
}

async function listOutbox(limit = 50) {
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  if (mode() === 'kv') {
    const rows = (await kv(['LRANGE', OUTBOX_KEY, '0', String(n - 1)])) || [];
    return rows.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  }
  return clone(local().outbox.slice(0, n));
}

function _resetMemory() {
  memory = { setups: {}, outbox: [] };
}

module.exports = { mode, isDurable, createSetup, getSetup, updateSetup, appendOutbox, listOutbox, _resetMemory };
