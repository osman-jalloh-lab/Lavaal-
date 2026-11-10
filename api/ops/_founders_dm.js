// Private thread between the two founder accounts only.
// Same session cookie and Vercel KV (or the local file/memory fallback) as the
// rest of /ops. The live list and the monthly archive use their own keys so
// Office, Talk, Assign, routines, and chat never read these messages when they
// load the shared store. The archive is append-only and kept.
// Underscore prefix: not a Vercel function. No npm. Never log message text.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { layout, loginPage } = require('./_html');
const {
  ALLOWLIST,
  createCsrfToken,
  escapeHtml,
  header,
  isAllowlisted,
  looksLikeAgentRequest,
  normalizeEmail,
  noStore,
  peekSessionEmail,
  queryOf,
  readBody,
  readCsrfToken,
  redirect,
  wantsJson,
} = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');
const { persistenceBanner, shellPage } = require('./_shell');

const DM_KEY = 'lavaall-ops-founders-dm-v1';
const READ_KEY = 'lavaall-ops-founders-dm-v1:read';
const LEGACY_KEY = 'lavaall-ops-founders-dm-v1:legacy';
const DOCS_KEY = 'lavaall-ops-founders-docs-v1';

function foundersDmKeys() {
  const env = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  const prefix = !env || env === 'production'
    ? ''
    : env.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  const thread = prefix ? `${prefix}:${DM_KEY}` : DM_KEY;
  const docs = prefix ? `${prefix}:${DOCS_KEY}` : DOCS_KEY;
  return {
    thread,
    read: prefix ? `${thread}:read` : READ_KEY,
    legacy: prefix ? `${thread}:legacy` : LEGACY_KEY,
    docs,
    months: `${docs}:months`,
    migrated: `${docs}:migrated`,
  };
}

function docsMonthKey(month) {
  return `${foundersDmKeys().docs}:${month}`;
}
const FOUNDERS = Object.freeze([
  'osmanjalloh104@gmail.com',
  'abdulhbah55@gmail.com',
]);
const LABELS = Object.freeze({
  'osmanjalloh104@gmail.com': 'Osman',
  'abdulhbah55@gmail.com': 'Hameed',
});
const MAX_MESSAGES = 400;
const MAX_TEXT = 2000;
const DM_MAX_BODY = 5000;
const POLL_MS = 4000;
const BADGE_MS = 8000;
const HISTORY_LIMIT_DEFAULT = 50;
const HISTORY_LIMIT_MAX = 100;
const ENC_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PLACEHOLDER = 'Message could not be decrypted';
const SECRET_FIELDS = Object.freeze(['preview', 'draft', 'attachmentName', 'attachment']);

let memoryMessages = [];
let memoryRead = {};
let memoryArchive = {};
let localHydrated = false;
let docsReady = false;

function foundersDmEnabled() {
  const flag = String(process.env.FOUNDERS_DM_ENABLED || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function isFounderDmIdentity(email) {
  const who = normalizeEmail(email);
  if (!FOUNDERS.includes(who) || !isAllowlisted(who)) return false;
  if (ALLOWLIST.length !== FOUNDERS.length) return false;
  return FOUNDERS.every((item) => ALLOWLIST.includes(item));
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function filePath() {
  if (kvConfigured()) return '';
  if (process.env.VERCEL) return '';
  const custom = process.env.OPS_STORE_FILE;
  return typeof custom === 'string' && custom.trim() ? `${custom.trim()}.founders-dm.json` : '';
}

function foundersBodyTooLarge(req) {
  return JSON.stringify(req.body || '').length > DM_MAX_BODY;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, MAX_TEXT) : '';
}

function decodeKey(raw) {
  if (typeof raw !== 'string') return null;
  const compact = raw.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const buf = Buffer.from(compact, 'base64');
  if (buf.length !== KEY_BYTES) return null;
  const canonical = buf.toString('base64').replace(/=+$/, '');
  if (canonical !== compact.replace(/=+$/, '')) return null;
  return buf;
}

function readKeyEnv(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || !raw.trim()) return { set: false, key: null };
  return { set: true, key: decodeKey(raw) };
}

function keyId(key) {
  return crypto.createHash('sha256').update(key).digest('base64url').slice(0, 16);
}

function loadKeys() {
  const current = readKeyEnv('FOUNDERS_DM_ENC_KEY');
  const prev = readKeyEnv('FOUNDERS_DM_ENC_KEY_PREV');
  if (!current.key) return { ok: false };
  if (prev.set && !prev.key) return { ok: false };
  return {
    ok: true,
    current: current.key,
    prev: prev.key,
    kid: keyId(current.key),
    prevKid: prev.key ? keyId(prev.key) : '',
  };
}

function encryptionReady() {
  return loadKeys().ok;
}

function logDecryptFailed(id) {
  const safe = typeof id === 'string' && /^[a-f0-9]{8,32}$/.test(id) ? id : '';
  console.log(JSON.stringify({ type: 'OpsFoundersDm', event: 'decrypt_failed', id: safe }));
}

function secretPayload(message) {
  const payload = { text: message.text };
  SECRET_FIELDS.forEach((field) => {
    if (typeof message[field] === 'string' && message[field]) {
      payload[field] = message[field].slice(0, MAX_TEXT);
    }
  });
  return payload;
}

function copySecretFields(row, message) {
  SECRET_FIELDS.forEach((field) => {
    if (typeof row[field] === 'string' && row[field].trim()) {
      message[field] = row[field].trim().slice(0, MAX_TEXT);
    }
  });
  return message;
}

function aadFor(meta) {
  return Buffer.from(`${meta.id}\n${meta.from}\n${meta.createdAt}`, 'utf8');
}

function monthOf(createdAt) {
  const stamp = Number(createdAt);
  if (!Number.isFinite(stamp)) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

function monthOk(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function sealJson(payload, keys, aad) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.current, iv);
  cipher.setAAD(aad);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const envelope = {
    v: ENC_VERSION,
    kid: keys.kid,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
}

function openJson(enc, aad) {
  const keys = loadKeys();
  if (!keys.ok || typeof enc !== 'string' || !enc) return null;
  try {
    const envelope = JSON.parse(Buffer.from(enc, 'base64').toString('utf8'));
    if (!envelope || envelope.v !== ENC_VERSION || typeof envelope.kid !== 'string') return null;
    const key = envelope.kid === keys.kid
      ? keys.current
      : (keys.prev && envelope.kid === keys.prevKid ? keys.prev : null);
    if (!key) return null;
    const iv = Buffer.from(String(envelope.iv || ''), 'base64');
    const tag = Buffer.from(String(envelope.tag || ''), 'base64');
    const ct = Buffer.from(String(envelope.ct || ''), 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ct.length < 1) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    decipher.setAAD(aad);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plain);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sealStored(message, keys) {
  return {
    id: message.id,
    from: message.from,
    createdAt: message.createdAt,
    enc: sealJson(secretPayload(message), keys, aadFor(message)),
  };
}

function archivePayload(message) {
  const payload = {
    text: typeof message.text === 'string' ? message.text : '',
    from: message.from,
    createdAt: message.createdAt,
  };
  if (typeof message.priorEnc === 'string' && message.priorEnc) payload.priorEnc = message.priorEnc;
  SECRET_FIELDS.forEach((field) => {
    if (typeof message[field] === 'string' && message[field]) {
      payload[field] = message[field].slice(0, MAX_TEXT);
    }
  });
  return payload;
}

function sealArchive(message, keys, month) {
  return {
    id: message.id,
    month,
    enc: sealJson(archivePayload(message), keys, Buffer.from(`${message.id}\n${month}`, 'utf8')),
  };
}

function openEnvelope(enc, meta) {
  const parsed = openJson(enc, aadFor(meta));
  if (!parsed || typeof parsed.text !== 'string') {
    logDecryptFailed(meta.id);
    return { ok: false };
  }
  return { ok: true, text: parsed.text, payload: parsed };
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function authorLabel(email, viewer) {
  if (normalizeEmail(email) === normalizeEmail(viewer)) return 'You';
  return LABELS[normalizeEmail(email)] || 'Founder';
}

function normalizeMessage(row) {
  if (!row || typeof row !== 'object') return null;
  const from = normalizeEmail(row.from);
  const text = cleanText(row.text);
  if (!FOUNDERS.includes(from) || !text) return null;
  const createdAt = Number(row.createdAt);
  if (!Number.isFinite(createdAt)) return null;
  const id = typeof row.id === 'string' && /^[a-f0-9]{8,32}$/.test(row.id) ? row.id : newId();
  return copySecretFields(row, { id, from, text, createdAt });
}

function storedId(row) {
  return row && typeof row.id === 'string' && /^[a-f0-9]{8,32}$/.test(row.id) ? row.id : '';
}

function openStoredRow(row) {
  if (!row || typeof row !== 'object') return null;
  const from = normalizeEmail(row.from);
  if (!FOUNDERS.includes(from)) return null;
  const createdAt = Number(row.createdAt);
  if (!Number.isFinite(createdAt)) return null;
  const id = storedId(row);
  if (!id) return null;
  if (typeof row.enc !== 'string' || !row.enc) {
    logDecryptFailed(id);
    return { id, from, text: PLACEHOLDER, createdAt };
  }
  const opened = openEnvelope(row.enc, { id, from, createdAt });
  if (!opened.ok) return { id, from, text: PLACEHOLDER, createdAt };
  const text = cleanText(opened.text);
  if (!text) {
    logDecryptFailed(id);
    return { id, from, text: PLACEHOLDER, createdAt };
  }
  return { id, from, text, createdAt };
}

function openArchiveRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = storedId(row);
  const month = monthOk(row.month) ? row.month : '';
  if (!id || !month || typeof row.enc !== 'string' || !row.enc) return null;
  const parsed = openJson(row.enc, Buffer.from(`${id}\n${month}`, 'utf8'));
  if (!parsed) {
    logDecryptFailed(id);
    return { id, from: '', text: PLACEHOLDER, createdAt: 0 };
  }
  let text = typeof parsed.text === 'string' ? parsed.text : '';
  const from = normalizeEmail(parsed.from);
  const createdAt = Number(parsed.createdAt);
  if ((!text || !cleanText(text)) && typeof parsed.priorEnc === 'string' && parsed.priorEnc) {
    if (FOUNDERS.includes(from) && Number.isFinite(createdAt)) {
      const prior = openEnvelope(parsed.priorEnc, { id, from, createdAt });
      if (prior.ok) text = prior.text;
    }
  }
  if (!FOUNDERS.includes(from) || !Number.isFinite(createdAt)) {
    logDecryptFailed(id);
    return { id, from: '', text: PLACEHOLDER, createdAt: 0 };
  }
  const clean = cleanText(text);
  if (!clean) {
    logDecryptFailed(id);
    return { id, from, text: PLACEHOLDER, createdAt };
  }
  return { id, from, text: clean, createdAt };
}

function messageFromStoredRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.enc !== 'string') {
    return normalizeMessage(row);
  }
  const from = normalizeEmail(row.from);
  const createdAt = Number(row.createdAt);
  const id = storedId(row);
  if (!id || !FOUNDERS.includes(from) || !Number.isFinite(createdAt)) return null;
  const opened = openEnvelope(row.enc, { id, from, createdAt });
  if (!opened.ok) return { id, from, createdAt, text: '', priorEnc: row.enc };
  const text = cleanText(opened.text);
  if (!text) return null;
  return copySecretFields(opened.payload || {}, { id, from, text, createdAt });
}

function rowsToArchiveMessages(rawRows) {
  const out = [];
  (Array.isArray(rawRows) ? rawRows : []).forEach((row) => {
    const message = messageFromStoredRow(row);
    if (message && message.id) out.push(message);
  });
  return out;
}

function normalizeThread(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const messages = (Array.isArray(src.messages) ? src.messages : [])
    .map(normalizeMessage)
    .filter(Boolean)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_MESSAGES);
  const readAt = {};
  FOUNDERS.forEach((email) => {
    const stamp = src.readAt && Number(src.readAt[email]);
    if (Number.isFinite(stamp) && stamp > 0) readAt[email] = stamp;
  });
  return { messages, readAt };
}

function unreadCount(thread, email) {
  const who = normalizeEmail(email);
  const seen = thread.readAt && Number(thread.readAt[who]);
  const cursor = Number.isFinite(seen) ? seen : 0;
  return thread.messages.filter((row) => row.from !== who && row.createdAt > cursor).length;
}

function publicMessage(row, viewer) {
  return {
    id: row.id,
    mine: row.from === normalizeEmail(viewer),
    author: authorLabel(row.from, viewer),
    text: row.text,
    createdAt: row.createdAt,
  };
}

function publicPayload(thread, email, csrf) {
  const who = normalizeEmail(email);
  const messages = thread.messages.map((row) => publicMessage(row, who));
  return {
    ok: true,
    messages,
    cursor: messages.length ? messages[messages.length - 1].id : '',
    unread: unreadCount(thread, who),
    csrf: csrf || createCsrfToken(who),
  };
}

function messagesAfter(messages, after) {
  const token = typeof after === 'string' ? after.trim() : (after == null ? '' : String(after).trim());
  if (!token) return messages;
  const index = messages.findIndex((row) => row.id === token);
  if (index >= 0) return messages.slice(index + 1);
  if (/^\d+$/.test(token)) {
    const stamp = Number(token);
    return messages.filter((row) => row.createdAt > stamp);
  }
  return messages;
}

function etagFor(payload) {
  const last = payload.messages[payload.messages.length - 1];
  const tail = last ? `${last.id}.${last.createdAt}` : 'empty';
  return `W/"${tail}.${payload.messages.length}.${payload.unread}"`;
}

async function kvCommand(args) {
  const base = process.env.KV_REST_API_URL.replace(/\/$/, '');
  const pipelined = Array.isArray(args[0]);
  const response = await fetch(pipelined ? `${base}/pipeline` : base, {
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

function readCursorPath() {
  const target = filePath();
  if (!target) return '';
  return target.replace(/\.json$/, '.read.json');
}

function archiveFilePath() {
  const target = filePath();
  if (!target) return '';
  return target.replace(/\.founders-dm\.json$/, '.founders-docs.json');
}

function cloneArchive() {
  const copy = {};
  Object.keys(memoryArchive).forEach((month) => {
    copy[month] = memoryArchive[month].slice();
  });
  return copy;
}

function pushMemoryArchive(message, keys) {
  const month = monthOf(message.createdAt);
  if (!monthOk(month) || !message || !message.id) return;
  if (!memoryArchive[month]) memoryArchive[month] = [];
  if (memoryArchive[month].some((row) => row && row.id === message.id)) return;
  memoryArchive[month].push(sealArchive(message, keys, month));
}

function copyMessagesToMemory(messages) {
  const keys = loadKeys();
  if (!keys.ok) return false;
  (Array.isArray(messages) ? messages : []).forEach((message) => {
    pushMemoryArchive(message, keys);
  });
  return true;
}

function currentThread() {
  return {
    messages: memoryMessages.slice(-MAX_MESSAGES),
    readAt: Object.assign({}, memoryRead),
  };
}

function persistMessages() {
  const target = filePath();
  if (!target) return true;
  const keys = loadKeys();
  if (!keys.ok) return false;
  const sealed = memoryMessages.slice(-MAX_MESSAGES).map((row) => sealStored(row, keys));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(sealed));
  return true;
}

function persistRead() {
  const target = readCursorPath();
  if (!target) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(memoryRead));
}

function loadArchiveFile() {
  const target = archiveFilePath();
  memoryArchive = {};
  if (!target || !fs.existsSync(target)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    const months = parsed && parsed.months && typeof parsed.months === 'object' ? parsed.months : {};
    Object.keys(months).forEach((month) => {
      if (!monthOk(month) || !Array.isArray(months[month])) return;
      memoryArchive[month] = months[month].filter((row) => row && storedId(row) && typeof row.enc === 'string');
    });
    return Boolean(parsed && parsed.migrated === true);
  } catch {
    memoryArchive = {};
    return false;
  }
}

function persistArchive() {
  const target = archiveFilePath();
  if (!target) return true;
  if (!loadKeys().ok) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ migrated: true, months: memoryArchive }));
  fs.renameSync(tmp, target);
  return true;
}

function finishLocalArchive(rawRows) {
  const already = loadArchiveFile();
  if (already) {
    docsReady = true;
    return;
  }
  if (!encryptionReady()) return;
  if (!copyMessagesToMemory(rowsToArchiveMessages(rawRows))) return;
  docsReady = true;
  persistArchive();
}

function rememberReadMap(readAt) {
  memoryRead = {};
  FOUNDERS.forEach((email) => {
    const stamp = readAt && Number(readAt[email]);
    if (Number.isFinite(stamp) && stamp > 0) memoryRead[email] = stamp;
  });
}

function rememberMessages(rows) {
  memoryMessages = (Array.isArray(rows) ? rows : [])
    .map(normalizeMessage)
    .filter(Boolean)
    .slice(-MAX_MESSAGES);
}

function rowNeedsSeal(row) {
  return Boolean(row && typeof row === 'object' && typeof row.enc !== 'string' && typeof row.text === 'string');
}

function hydrateLocal() {
  if (localHydrated || kvConfigured()) return;
  localHydrated = true;
  const target = filePath();
  if (!target || !fs.existsSync(target)) {
    finishLocalArchive([]);
    return;
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    memoryMessages = [];
    memoryRead = {};
    finishLocalArchive([]);
    return;
  }
  if (Array.isArray(raw)) {
    if (raw.some(rowNeedsSeal)) {
      rememberMessages(raw);
      if (encryptionReady()) persistMessages();
      else memoryMessages = memoryMessages.map((row) => ({ id: row.id, from: row.from, text: PLACEHOLDER, createdAt: row.createdAt }));
    } else {
      memoryMessages = raw.map(openStoredRow).filter(Boolean).slice(-MAX_MESSAGES);
    }
    const cursorFile = readCursorPath();
    if (cursorFile && fs.existsSync(cursorFile)) {
      try {
        rememberReadMap(JSON.parse(fs.readFileSync(cursorFile, 'utf8')));
      } catch {
        memoryRead = {};
      }
    }
    if (encryptionReady()) finishLocalArchive(raw);
    return;
  }
  const legacy = normalizeThread(raw);
  rememberMessages(legacy.messages);
  rememberReadMap(legacy.readAt);
  if (!encryptionReady()) {
    memoryMessages = memoryMessages.map((row) => ({ id: row.id, from: row.from, text: PLACEHOLDER, createdAt: row.createdAt }));
    return;
  }
  persistMessages();
  persistRead();
  finishLocalArchive(Array.isArray(raw.messages) ? raw.messages : []);
}

function decodeHash(result) {
  const readAt = {};
  if (Array.isArray(result)) {
    for (let i = 0; i < result.length; i += 2) {
      const email = normalizeEmail(result[i]);
      const stamp = Number(result[i + 1]);
      if (FOUNDERS.includes(email) && Number.isFinite(stamp) && stamp > 0) readAt[email] = stamp;
    }
    return readAt;
  }
  if (result && typeof result === 'object') {
    Object.keys(result).forEach((key) => {
      const email = normalizeEmail(key);
      const stamp = Number(result[key]);
      if (FOUNDERS.includes(email) && Number.isFinite(stamp) && stamp > 0) readAt[email] = stamp;
    });
  }
  return readAt;
}

function messagesFromList(result) {
  const rows = Array.isArray(result) ? result : [];
  return rows.map((item) => {
    if (typeof item !== 'string') return openStoredRow(item);
    try {
      return openStoredRow(JSON.parse(item));
    } catch {
      return null;
    }
  }).filter(Boolean).slice(-MAX_MESSAGES);
}

function parseStoredItems(result) {
  const rows = Array.isArray(result) ? result : [];
  return rows.map((item) => {
    if (item == null) return null;
    if (typeof item !== 'string') return item;
    try {
      return JSON.parse(item);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function commandFailed(payload) {
  if (!payload) return true;
  if (Array.isArray(payload)) return payload.some((item) => item && item.error);
  return Boolean(payload.error);
}

async function kvList() {
  const payload = await kvCommand(['LRANGE', foundersDmKeys().thread, '0', '-1']);
  return messagesFromList(payload && payload.result);
}

async function kvRawRows() {
  const payload = await kvCommand(['LRANGE', foundersDmKeys().thread, '0', '-1']);
  return parseStoredItems(payload && payload.result);
}

async function readMonthRaw(month) {
  if (kvConfigured()) {
    const payload = await kvCommand(['LRANGE', docsMonthKey(month), '0', '-1']);
    return parseStoredItems(payload && payload.result);
  }
  hydrateLocal();
  return (memoryArchive[month] || []).slice();
}

async function listMonthNames() {
  if (kvConfigured()) {
    const payload = await kvCommand(['SMEMBERS', foundersDmKeys().months]);
    const rows = Array.isArray(payload && payload.result) ? payload.result : [];
    return rows.map((item) => String(item)).filter(monthOk).sort();
  }
  hydrateLocal();
  return Object.keys(memoryArchive).filter(monthOk).sort();
}

async function copyMessagesToKv(messages) {
  const keys = loadKeys();
  if (!keys.ok) {
    const err = new Error('encryption_not_configured');
    err.code = 'encryption_not_configured';
    throw err;
  }
  const grouped = {};
  (Array.isArray(messages) ? messages : []).forEach((message) => {
    const month = monthOf(message && message.createdAt);
    if (!message || !message.id || !monthOk(month)) return;
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(message);
  });
  const storeKeys = foundersDmKeys();
  const months = Object.keys(grouped);
  for (let i = 0; i < months.length; i += 1) {
    const month = months[i];
    const existing = new Set((await readMonthRaw(month)).map((row) => storedId(row)).filter(Boolean));
    const fresh = [];
    grouped[month].forEach((message) => {
      if (existing.has(message.id)) return;
      existing.add(message.id);
      fresh.push(JSON.stringify(sealArchive(message, keys, month)));
    });
    if (!fresh.length) continue;
    const written = await kvCommand(['RPUSH', docsMonthKey(month)].concat(fresh));
    if (commandFailed(written)) throw new Error('kv_command_failed');
    const indexed = await kvCommand(['SADD', storeKeys.months, month]);
    if (commandFailed(indexed)) throw new Error('kv_command_failed');
  }
}

async function ensureDocsMigrated() {
  if (docsReady) return;
  if (!encryptionReady()) return;
  if (kvConfigured()) {
    const storeKeys = foundersDmKeys();
    const marker = await kvCommand(['GET', storeKeys.migrated]);
    if (marker && marker.result === '1') {
      docsReady = true;
      return;
    }
    let rawRows;
    try {
      rawRows = await kvRawRows();
    } catch {
      await migrateLegacyBlob();
      rawRows = await kvRawRows();
    }
    await copyMessagesToKv(rowsToArchiveMessages(rawRows));
    const stamped = await kvCommand(['SET', storeKeys.migrated, '1']);
    if (commandFailed(stamped)) throw new Error('kv_command_failed');
    docsReady = true;
    return;
  }
  hydrateLocal();
}

async function kvReadMap() {
  const payload = await kvCommand(['HGETALL', foundersDmKeys().read]);
  return decodeHash(payload && payload.result);
}

async function migrateLegacyBlob() {
  const keys = loadKeys();
  if (!keys.ok) return;
  const storeKeys = foundersDmKeys();
  const payload = await kvCommand(['GET', storeKeys.thread]);
  const raw = payload && payload.result;
  if (typeof raw !== 'string' || !raw.trim().startsWith('{')) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) return;
  const thread = normalizeThread(parsed);
  await kvCommand(['RENAME', storeKeys.thread, storeKeys.legacy]);
  if (thread.messages.length) {
    const sealed = thread.messages.map((row) => JSON.stringify(sealStored(row, keys)));
    await kvCommand(['RPUSH', storeKeys.thread].concat(sealed));
    await kvCommand(['LTRIM', storeKeys.thread, '-400', '-1']);
  }
  const fields = [];
  FOUNDERS.forEach((email) => {
    if (thread.readAt[email]) fields.push(email, String(thread.readAt[email]));
  });
  if (fields.length) await kvCommand(['HSET', storeKeys.read].concat(fields));
  await kvCommand(['DEL', storeKeys.legacy]);
}

async function readThread() {
  if (kvConfigured()) {
    let messages;
    try {
      messages = await kvList();
    } catch {
      await migrateLegacyBlob();
      messages = await kvList();
    }
    await ensureDocsMigrated();
    const readAt = await kvReadMap();
    return { messages, readAt };
  }
  hydrateLocal();
  return currentThread();
}

async function appendMessage(message) {
  const keys = loadKeys();
  if (!keys.ok) {
    const err = new Error('encryption_not_configured');
    err.code = 'encryption_not_configured';
    throw err;
  }
  const month = monthOf(message.createdAt);
  const storeKeys = foundersDmKeys();
  if (kvConfigured()) {
    await ensureDocsMigrated();
    const pipe = [
      ['RPUSH', docsMonthKey(month), JSON.stringify(sealArchive(message, keys, month))],
      ['SADD', storeKeys.months, month],
      ['RPUSH', storeKeys.thread, JSON.stringify(sealStored(message, keys))],
      ['LTRIM', storeKeys.thread, String(-MAX_MESSAGES), '-1'],
    ];
    try {
      const written = await kvCommand(pipe);
      if (commandFailed(written)) throw new Error('kv_command_failed');
    } catch (err) {
      if (err && err.code === 'encryption_not_configured') throw err;
      await migrateLegacyBlob();
      const written = await kvCommand(pipe);
      if (commandFailed(written)) throw new Error('kv_command_failed');
    }
    await kvCommand(['HSET', storeKeys.read, message.from, String(message.createdAt)]);
    return readThread();
  }
  hydrateLocal();
  const archiveSnapshot = cloneArchive();
  const messageSnapshot = memoryMessages.slice();
  const readSnapshot = Object.assign({}, memoryRead);
  pushMemoryArchive(message, keys);
  memoryMessages.push(message);
  if (memoryMessages.length > MAX_MESSAGES) {
    memoryMessages = memoryMessages.slice(-MAX_MESSAGES);
  }
  memoryRead[message.from] = message.createdAt;
  if (!persistArchive() || !persistMessages()) {
    memoryArchive = archiveSnapshot;
    memoryMessages = messageSnapshot;
    memoryRead = readSnapshot;
    if (archiveFilePath()) persistArchive();
    const err = new Error('encryption_not_configured');
    err.code = 'encryption_not_configured';
    throw err;
  }
  persistRead();
  return currentThread();
}

function hexId(value) {
  const token = typeof value === 'string' ? value.trim() : (value == null ? '' : String(value).trim());
  return /^[a-f0-9]{8,32}$/.test(token) ? token : '';
}

function historyLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return HISTORY_LIMIT_DEFAULT;
  return Math.min(HISTORY_LIMIT_MAX, Math.floor(parsed));
}

function paginateHistory(rows, query) {
  const limit = historyLimit(query && query.limit);
  const after = hexId(query && query.after);
  const before = hexId(query && query.before);
  let start = 0;
  let end = rows.length;
  if (before) {
    const index = rows.findIndex((row) => row.id === before);
    end = index >= 0 ? index : rows.length;
    start = Math.max(0, end - limit);
  } else if (after) {
    const index = rows.findIndex((row) => row.id === after);
    start = index >= 0 ? index + 1 : 0;
    end = Math.min(rows.length, start + limit);
  } else {
    start = Math.max(0, rows.length - limit);
    end = rows.length;
  }
  const slice = rows.slice(start, end);
  return {
    rows: slice,
    prev: start > 0 && slice.length ? slice[0].id : '',
    next: end < rows.length && slice.length ? slice[slice.length - 1].id : '',
  };
}

async function listHistory(email, query) {
  if (!encryptionReady()) return { error: 'encryption_not_configured' };
  const who = normalizeEmail(email);
  if (!isFounderDmIdentity(who)) return { error: 'forbidden' };
  const requested = query && query.month != null ? String(query.month).trim() : '';
  if (requested && !monthOk(requested)) return { error: 'invalid_month' };
  return mutate(async () => {
    await ensureDocsMigrated();
    let months = await listMonthNames();
    const selected = requested || months[months.length - 1] || monthOf(Date.now());
    if (!monthOk(selected)) return { error: 'invalid_month' };
    const opened = (await readMonthRaw(selected))
      .map(openArchiveRow)
      .filter(Boolean)
      .sort((a, b) => a.createdAt - b.createdAt);
    if (opened.length && months.indexOf(selected) < 0) months = months.concat(selected).sort();
    const page = paginateHistory(opened, query || {});
    return {
      ok: true,
      month: selected,
      months,
      messages: page.rows.map((row) => publicMessage(row, who)),
      prev: page.prev,
      next: page.next,
    };
  });
}

async function mutate(work) {
  try {
    return await work();
  } catch (err) {
    if (err && err.code === 'encryption_not_configured') return { error: 'encryption_not_configured' };
    console.log(JSON.stringify({ type: 'OpsFoundersDm', event: 'store_unavailable' }));
    return { error: 'store_unavailable' };
  }
}

async function countUnread(email) {
  return mutate(async () => {
    const thread = await readThread();
    return { ok: true, unread: unreadCount(thread, email) };
  });
}

async function listMessages(email) {
  if (!encryptionReady()) return { error: 'encryption_not_configured' };
  return mutate(async () => publicPayload(await readThread(), email));
}

async function markRead(email) {
  const who = normalizeEmail(email);
  if (!isFounderDmIdentity(who)) return { error: 'forbidden' };
  const now = Date.now();
  return mutate(async () => {
    if (kvConfigured()) {
      await kvCommand(['HSET', foundersDmKeys().read, who, String(now)]);
    } else {
      hydrateLocal();
      memoryRead[who] = now;
      persistRead();
    }
    const thread = await readThread();
    return { ok: true, unread: unreadCount(thread, who) };
  });
}

async function sendMessage(email, text) {
  if (!foundersDmEnabled()) return { error: 'not_found' };
  const who = normalizeEmail(email);
  if (!isFounderDmIdentity(who)) return { error: 'forbidden' };
  const body = cleanText(text);
  if (!body) return { error: 'invalid_message' };
  if (!encryptionReady()) return { error: 'encryption_not_configured' };
  return mutate(async () => {
    const message = {
      id: newId(),
      from: who,
      text: body,
      createdAt: Date.now(),
    };
    const thread = await appendMessage(message);
    return publicPayload(thread, who);
  });
}

function resetFoundersDm() {
  memoryMessages = [];
  memoryRead = {};
  memoryArchive = {};
  localHydrated = false;
  docsReady = false;
}

function firstQuery(req, key) {
  const query = queryOf(req);
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function foundersDmKind(req) {
  const area = String(firstQuery(req, 'area') || '').toLowerCase();
  const pathOnly = String(req.url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  const scope = `${area} ${pathOnly}`;
  if (scope.includes('api/founders-dm')) return 'api';
  if (area === 'founders' || pathOnly === '/ops/founders' || pathOnly === '/founders') return 'page';
  return '';
}

async function guard(req) {
  if (!foundersDmEnabled()) return { status: 404, error: 'not_found' };
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  const session = await readLiveSession(req);
  if (session && isFounderDmIdentity(session.email)) return { session };
  const claimed = peekSessionEmail(req) || normalizeEmail(header(req, 'x-ops-email') || '');
  if ((session && !isFounderDmIdentity(session.email)) || (claimed && !isFounderDmIdentity(claimed))) {
    return { status: 403, error: 'forbidden' };
  }
  return { status: 401, error: 'sign_in_required' };
}

function csrfFrom(req, body) {
  return (body && body.csrf)
    || header(req, 'x-csrf-token')
    || header(req, 'x-csrf');
}

function sendJson(res, status, body) {
  noStore(res, 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function sendHtml(res, status, html) {
  noStore(res, 'text/html; charset=utf-8');
  res.status(status).send(html);
}

function notFoundPage() {
  return layout({
    title: 'LAVAALL OS',
    body: `
      <h1>Not found</h1>
      <p><a href="/ops">Back</a></p>
    `,
  });
}

function deniedPage() {
  return layout({
    title: 'LAVAALL OS — Access denied',
    body: `
      <div class="kicker"><span class="dot" aria-hidden="true"></span> Internal</div>
      <h1>Access denied</h1>
      <p>This area is founder-only.</p>
    `,
  });
}

function deny(req, res, access, kind) {
  const asJson = kind === 'api' || wantsJson(req);
  if (asJson) {
    sendJson(res, access.status, { error: access.error });
    return;
  }
  if (access.status === 401) {
    sendHtml(res, 401, loginPage({ error: 'Sign in required.' }));
    return;
  }
  if (access.status === 404) {
    sendHtml(res, 404, notFoundPage());
    return;
  }
  sendHtml(res, access.status, deniedPage());
}

function messageListHtml(messages) {
  if (!messages.length) return '';
  return messages.map((item) => (
    `<li class="bubble ${item.mine ? 'user' : 'assistant'}" data-id="${escapeHtml(item.id)}">
      <div class="kicker">${escapeHtml(item.author)}</div>
      <p>${escapeHtml(item.text)}</p>
    </li>`
  )).join('');
}

function pageHtml(session, payload, extra) {
  const messages = payload && Array.isArray(payload.messages) ? payload.messages : [];
  const csrf = (payload && payload.csrf) || createCsrfToken(session.email);
  const island = JSON.stringify({ csrf, pollMs: POLL_MS, badgeMs: BADGE_MS }).replace(/</g, '\\u003c');
  const emptyHidden = messages.length ? ' hidden' : '';
  const durable = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
    || Boolean(filePath());
  return shellPage({
    title: 'LAVAALL OS — Private',
    email: session.email,
    area: 'founders',
    notice: extra && extra.notice,
    error: extra && extra.error,
    privateNav: { href: '/ops/founders', label: 'Private', unread: 0 },
    body: `
      ${persistenceBanner(durable)}
      <h1>Private</h1>
      <p class="dm-history"><a class="dm-history" href="/ops/founders?view=history">History</a></p>
      <p class="lead">Messages between Osman and Hameed only. Text only. They stay in this thread and are not sent to the office or any assistant.</p>
      <section class="card" id="founders-dm">
        <div class="kicker">Thread</div>
        <h2>Osman and Hameed</h2>
        <p class="empty" id="dm-empty"${emptyHidden}>No messages yet. Write the first one below.</p>
        <ol class="thread dm-thread" id="dm-thread" role="log" aria-live="polite">${messageListHtml(messages)}</ol>
        <button type="button" id="dm-new" class="dm-new" hidden>New messages</button>
        <form id="dm-form" class="dm-compose" method="POST" action="/ops/api/founders-dm">
          <input type="hidden" name="csrf" value="${escapeHtml(csrf)}"/>
          <label for="dm-text">Message</label>
          <textarea id="dm-text" name="text" maxlength="${MAX_TEXT}" required placeholder="Write a message"></textarea>
          <p id="dm-mic-status" class="empty" hidden></p>
          <div class="dm-actions">
            <button type="button" class="btn btn-mic" id="dm-mic" aria-pressed="false">Mic</button>
            <p class="dm-mic-note" id="dm-mic-note">Dictation uses your browser's speech service (in Chrome, Google), so spoken audio leaves your device.</p>
            <button class="btn" type="submit">Send</button>
          </div>
          <p id="dm-status" role="status"></p>
        </form>
      </section>
      <script type="application/json" id="founders-dm-data">${island}</script>
    `,
  });
}

function encryptionUnavailablePage(session) {
  return shellPage({
    title: 'LAVAALL OS — Private',
    email: session.email,
    area: 'founders',
    privateNav: { href: '/ops/founders', label: 'Private', unread: 0 },
    body: `
      <h1>Private</h1>
      <p>Private messages are unavailable because encryption is not configured.</p>
    `,
  });
}

function historyHref(month, extra) {
  const params = [`view=history`, `month=${month}`];
  if (extra && extra.before) params.push(`before=${extra.before}`);
  if (extra && extra.after) params.push(`after=${extra.after}`);
  return `/ops/founders?${params.join('&')}`;
}

function historyPageHtml(session, payload) {
  const month = payload && monthOk(payload.month) ? payload.month : '';
  const months = payload && Array.isArray(payload.months) ? payload.months.filter(monthOk) : [];
  const messages = payload && Array.isArray(payload.messages) ? payload.messages : [];
  const monthLinks = months.map((item) => {
    const current = item === month ? ' aria-current="page"' : '';
    return `<a href="${escapeHtml(historyHref(item))}"${current}>${escapeHtml(item)}</a>`;
  }).join(' ');
  const earlier = payload && payload.prev && month
    ? `<a href="${escapeHtml(historyHref(month, { before: payload.prev }))}">Earlier</a>`
    : '';
  const later = payload && payload.next && month
    ? `<a href="${escapeHtml(historyHref(month, { after: payload.next }))}">Later</a>`
    : '';
  const emptyHidden = messages.length ? ' hidden' : '';
  return shellPage({
    title: 'LAVAALL OS — History',
    email: session.email,
    area: 'founders',
    privateNav: { href: '/ops/founders', label: 'Private', unread: 0 },
    body: `
      <h1>History</h1>
      <p class="lead">Older messages between Osman and Hameed. Kept in the founders archive. Not sent to the office or anywhere else.</p>
      <p class="dm-history"><a href="/ops/founders">Back to Private</a></p>
      <section class="card">
        <div class="kicker">Archive</div>
        <h2>${month ? escapeHtml(month) : 'No messages yet'}</h2>
        <nav class="dm-months" aria-label="Months">${monthLinks}</nav>
        <p class="empty"${emptyHidden}>No messages in this month.</p>
        <ol class="thread dm-thread" role="log">${messageListHtml(messages)}</ol>
        <p class="dm-pager">${earlier}${later}</p>
      </section>
    `,
  });
}

async function renderHistoryPage(req, res, session) {
  const listed = await listHistory(session.email, {
    month: firstQuery(req, 'month') || '',
    before: firstQuery(req, 'before') || '',
    after: firstQuery(req, 'after') || '',
    limit: firstQuery(req, 'limit') || '',
  });
  if (listed.error === 'encryption_not_configured') {
    sendHtml(res, 503, encryptionUnavailablePage(session));
    return true;
  }
  if (listed.error) {
    sendHtml(res, failureStatus(listed.error), historyPageHtml(session, null));
    return true;
  }
  sendHtml(res, 200, historyPageHtml(session, listed));
  return true;
}

function failureStatus(error) {
  if (error === 'store_unavailable' || error === 'encryption_not_configured') return 503;
  if (error === 'forbidden') return 403;
  if (error === 'not_found') return 404;
  return 400;
}

function failureCopy(error) {
  if (error === 'store_unavailable') return 'The store is unavailable. Check Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).';
  if (error === 'encryption_not_configured') return 'Private messages are unavailable because encryption is not configured.';
  if (error === 'invalid_message') return 'Enter a message.';
  return 'Could not open the thread.';
}

async function renderPage(req, res, session, extra) {
  if (String(firstQuery(req, 'view') || '') === 'history') {
    return renderHistoryPage(req, res, session);
  }
  const listed = await listMessages(session.email);
  if (listed.error === 'encryption_not_configured') {
    sendHtml(res, 503, encryptionUnavailablePage(session));
    return true;
  }
  if (listed.error) {
    const message = failureCopy(listed.error);
    sendHtml(res, failureStatus(listed.error), pageHtml(session, null, {
      error: (extra && extra.error) || message,
    }));
    return true;
  }
  sendHtml(res, 200, pageHtml(session, listed, extra));
  return true;
}

async function handleApi(req, res, session) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const scope = String(firstQuery(req, 'scope') || '');
    if (scope === 'history') {
      const listed = await listHistory(session.email, {
        month: firstQuery(req, 'month') || '',
        before: firstQuery(req, 'before') || '',
        after: firstQuery(req, 'after') || '',
        limit: firstQuery(req, 'limit') || '',
      });
      if (listed.error) {
        sendJson(res, failureStatus(listed.error), { error: listed.error });
        return true;
      }
      sendJson(res, 200, listed);
      return true;
    }
    if (scope === 'unread') {
      const counted = await countUnread(session.email);
      if (counted.error) {
        sendJson(res, failureStatus(counted.error), { error: counted.error });
        return true;
      }
      sendJson(res, 200, { ok: true, unread: counted.unread });
      return true;
    }
    const listed = await listMessages(session.email);
    if (listed.error) {
      sendJson(res, failureStatus(listed.error), { error: listed.error });
      return true;
    }
    const etag = etagFor(listed);
    const inbound = String(header(req, 'if-none-match') || '').trim();
    if (inbound && inbound === etag) {
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-store');
      res.status(304).send('');
      return true;
    }
    const view = Object.assign({}, listed, {
      messages: messagesAfter(listed.messages, firstQuery(req, 'after')),
    });
    res.setHeader('ETag', etag);
    sendJson(res, 200, view);
    return true;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (foundersBodyTooLarge(req)) {
    if (wantsJson(req)) sendJson(res, 413, { error: 'message_too_long' });
    else await renderPage(req, res, session, { error: 'Message too long' });
    return true;
  }
  const body = readBody(req);
  if (!readCsrfToken(csrfFrom(req, body), session.email)) {
    if (wantsJson(req)) sendJson(res, 403, { error: 'csrf' });
    else await renderPage(req, res, session, { error: 'Refresh was rejected. Reload Private and try again.' });
    return true;
  }
  if (String(body.action || '').toLowerCase() === 'read') {
    const marked = await markRead(session.email);
    if (marked.error) {
      const status = failureStatus(marked.error);
      if (wantsJson(req)) sendJson(res, status, { error: marked.error });
      else if (marked.error === 'encryption_not_configured') sendHtml(res, 503, encryptionUnavailablePage(session));
      else await renderPage(req, res, session, { error: 'Could not update the thread.' });
      return true;
    }
    if (wantsJson(req)) sendJson(res, 200, marked);
    else redirect(res, '/ops/founders');
    return true;
  }
  const sent = await sendMessage(session.email, body.text || body.message || '');
  if (sent.error) {
    const status = failureStatus(sent.error);
    if (wantsJson(req)) sendJson(res, status, { error: sent.error });
    else if (sent.error === 'encryption_not_configured') sendHtml(res, 503, encryptionUnavailablePage(session));
    else {
      await renderPage(req, res, session, {
        error: sent.error === 'invalid_message' ? 'Enter a message.' : 'Could not send that message.',
      });
    }
    return true;
  }
  if (wantsJson(req)) {
    sendJson(res, 200, sent);
    return true;
  }
  redirect(res, '/ops/founders');
  return true;
}

async function handlePage(req, res, session) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (wantsJson(req)) sendJson(res, 405, { error: 'method_not_allowed' });
    else sendHtml(res, 405, notFoundPage());
    return true;
  }
  return renderPage(req, res, session);
}

async function foundersNavFor(req) {
  if (!foundersDmEnabled() || looksLikeAgentRequest(req)) return null;
  const session = await readLiveSession(req);
  if (!session || !isFounderDmIdentity(session.email)) return null;
  if (wantsJson(req) || foundersDmKind(req) === 'api') return null;
  if (!encryptionReady()) {
    return { href: '/ops/founders', label: 'Private', unread: 0 };
  }
  if (foundersDmKind(req) === 'page') {
    return { href: '/ops/founders', label: 'Private', unread: 0 };
  }
  const counted = await countUnread(session.email);
  return {
    href: '/ops/founders',
    label: 'Private',
    unread: counted && counted.ok ? counted.unread : 0,
  };
}

async function handleFoundersDm(req, res) {
  const kind = foundersDmKind(req);
  if (!kind) return false;
  const access = await guard(req);
  if (!access.session) {
    deny(req, res, access, kind);
    return true;
  }
  if (!encryptionReady()) {
    if (kind === 'api' || wantsJson(req)) sendJson(res, 503, { error: 'encryption_not_configured' });
    else sendHtml(res, 503, encryptionUnavailablePage(access.session));
    return true;
  }
  switch (kind) {
    case 'api':
      return handleApi(req, res, access.session);
    case 'page':
      return handlePage(req, res, access.session);
    default: {
      const _never = kind;
      void _never;
      return false;
    }
  }
}

module.exports = {
  BADGE_MS,
  DM_KEY,
  DOCS_KEY,
  READ_KEY,
  LEGACY_KEY,
  docsMonthKey,
  foundersDmKeys,
  FOUNDERS,
  MAX_TEXT,
  POLL_MS,
  foundersDmEnabled,
  foundersDmKind,
  foundersNavFor,
  handleFoundersDm,
  isFounderDmIdentity,
  resetFoundersDm,
};
