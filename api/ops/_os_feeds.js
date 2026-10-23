// api/ops/_os_feeds.js — live data feeds for /os: shapes, storage and views.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// The ingest endpoint (api/os/ingest/[feed].js, through api/ops/_os_ingest.js) is the ONLY writer. /os itself
// stays read-only: api/ops/_os_data.js calls readFeeds(), which issues KV GETs and nothing else.
//
// Each feed has its own NEW KV key (lavaall-os-feed-<name>-v1; non-production deploys get an env prefix, like
// routine health). The existing store key lavaall-ops-v2 is never touched. Counts only for outreach: no names,
// no emails. Text is stored as data and escaped by the client. Never log a payload.

const fs = require('fs');
const path = require('path');

const { formatChicago } = require('./_routine_health');

const FEEDS = Object.freeze(['morning-brief', 'routine-health', 'spend', 'outreach-stats', 'desk-status', 'notes']);
const MAX_BYTES = 20 * 1024;
// The notes pack is a few hundred notes of text, so that one feed gets a larger cap. 900 KB stays under Vercel's
// 4.5 MB request limit and Upstash's 1 MB request size; every other feed keeps 20 KB.
const NOTES_MAX_BYTES = 900 * 1024;
const MAX_NOTES = 500;
const NOTE_TYPES = Object.freeze(['idea', 'scout-find', 'decision', 'note']);
const NOTE_FOLDERS = Object.freeze(['Ideas', 'Scout Finds', 'Research', 'Skills', 'Decisions']);
const NOTE_ID_RE = /^nt-[0-9a-f]{10}$/;
// Same words the notes builder drops; the endpoint refuses them too, so a hand-made push cannot slip them in.
const NOTE_BLOCK = new RegExp(['star' + 'link', 'gui' + 'nea', '@', 'lead', 'customer'].join('|'), 'i');

function maxBytesFor(feed) { return feed === 'notes' ? NOTES_MAX_BYTES : MAX_BYTES; }
const MAX_BRIEF = 6000;
const MAX_ROUTINES = 40;
const MAX_SPEND_ROWS = 200;
const MAX_SPEND_STORED = 500;
const MAX_OUTREACH_DAYS = 60;
const MAX_NOW = 200;
const SKEW_MS = 10 * 60 * 1000;
const HEALTH_STATUSES = Object.freeze(['ok', 'late', 'failed', 'skipped']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY_PREFIX = 'lavaall-os-feed-';

const memory = {};

// ---- small validators ---------------------------------------------------------

const bad = (reason) => ({ error: 'invalid_shape', reason });

function isObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function exactKeys(obj, keys) {
  if (!isObject(obj)) return false;
  const got = Object.keys(obj);
  return got.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

// Printable text. Newlines and tabs only when `multiline`.
function plain(value, min, max, multiline) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (t.length < min || t.length > max) return null;
  const re = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  if (re.test(t)) return null;
  return t;
}

function parseIso(value) {
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const frac = value.match(/\.(\d+)Z$/);
  const millis = frac ? frac[1].padEnd(3, '0') : '000';
  return date.toISOString() === `${value.slice(0, 19)}.${millis}Z` ? date : null;
}

// A real calendar day, written YYYY-MM-DD. Not more than a day ahead (time-zone slack).
function validDay(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return false;
  if (y < 2020) return false;
  const clock = Number.isFinite(now) ? now : Date.now();
  return ms <= clock + 24 * 60 * 60 * 1000;
}

function pastIso(value, now) {
  const date = parseIso(value);
  const clock = Number.isFinite(now) ? now : Date.now();
  return date && date.getTime() <= clock + SKEW_MS ? date : null;
}

// ---- payload validation (pure) -----------------------------------------------------
// Each returns { ok: true, value } or { error: 'invalid_shape', reason } where `reason` is a field path,
// never a value from the payload.

function validateBrief(body, ctx) {
  if (!exactKeys(body, ['date', 'text'])) return bad('body');
  if (!validDay(body.date, ctx.now)) return bad('date');
  const text = plain(body.text, 1, MAX_BRIEF, true);
  if (text === null) return bad('text');
  return { ok: true, value: { date: body.date, text } };
}

function validateRoutineHealth(body, ctx) {
  if (!Array.isArray(body) || body.length < 1 || body.length > MAX_ROUTINES) return bad('body');
  const seen = new Set();
  const rows = [];
  for (let i = 0; i < body.length; i += 1) {
    const row = body[i];
    if (!exactKeys(row, ['id', 'lastRun', 'status'])) return bad(`[${i}]`);
    if (typeof row.id !== 'string' || row.id.length > 64 || !SLUG_RE.test(row.id)) return bad(`[${i}].id`);
    if (seen.has(row.id)) return bad(`[${i}].id`);
    seen.add(row.id);
    if (row.lastRun !== null && !pastIso(row.lastRun, ctx.now)) return bad(`[${i}].lastRun`);
    if (!HEALTH_STATUSES.includes(row.status)) return bad(`[${i}].status`);
    rows.push({ id: row.id, lastRun: row.lastRun, status: row.status });
  }
  return { ok: true, value: rows };
}

function validateSpend(body, ctx) {
  if (!Array.isArray(body) || body.length < 1 || body.length > MAX_SPEND_ROWS) return bad('body');
  const rows = [];
  for (let i = 0; i < body.length; i += 1) {
    const row = body[i];
    if (!exactKeys(row, ['date', 'tool', 'usd', 'note'])) return bad(`[${i}]`);
    if (!validDay(row.date, ctx.now)) return bad(`[${i}].date`);
    const tool = plain(row.tool, 1, 60, false);
    if (tool === null) return bad(`[${i}].tool`);
    if (typeof row.usd !== 'number' || !Number.isFinite(row.usd) || row.usd < 0 || row.usd > 100000) return bad(`[${i}].usd`);
    const note = row.note === '' ? '' : plain(row.note, 0, 200, false);
    if (note === null) return bad(`[${i}].note`);
    // Whole cents, so totals never drift.
    rows.push({ date: row.date, tool, cents: Math.round(row.usd * 100), note });
  }
  return { ok: true, value: rows };
}

const COUNT_KEYS = ['drafted', 'approved', 'sent', 'replied', 'bounced'];

function validateOutreach(body, ctx) {
  if (!exactKeys(body, ['date'].concat(COUNT_KEYS))) return bad('body');
  if (!validDay(body.date, ctx.now)) return bad('date');
  const value = { date: body.date };
  for (const k of COUNT_KEYS) {
    if (!Number.isInteger(body[k]) || body[k] < 0 || body[k] > 1000000) return bad(k);
    value[k] = body[k];
  }
  // A bounce is a send that came back, so it cannot exceed sends (keeps the bounce rate within 0..100%).
  if (value.bounced > value.sent) return bad('bounced');
  return { ok: true, value };
}

function validateDeskStatus(body, ctx) {
  if (!Array.isArray(body) || body.length < 1 || body.length > 20) return bad('body');
  const seen = new Set();
  const rows = [];
  for (let i = 0; i < body.length; i += 1) {
    const row = body[i];
    if (!exactKeys(row, ['desk', 'now', 'updated'])) return bad(`[${i}]`);
    if (typeof row.desk !== 'string' || !ctx.deskIds.includes(row.desk) || seen.has(row.desk)) return bad(`[${i}].desk`);
    seen.add(row.desk);
    const now = plain(row.now, 1, MAX_NOW, false);
    if (now === null) return bad(`[${i}].now`);
    if (!pastIso(row.updated, ctx.now)) return bad(`[${i}].updated`);
    rows.push({ desk: row.desk, now, updated: row.updated });
  }
  return { ok: true, value: rows };
}

const NOTE_REQUIRED = ['id', 'type', 'folder', 'title', 'date', 'updated', 'desk', 'status', 'level', 'jev', 'tags', 'links', 'source', 'body'];
const NOTE_OPTIONAL = ['urgent', 'url'];

function validateNotes(body, ctx) {
  if (!Array.isArray(body) || body.length < 1 || body.length > MAX_NOTES) return bad('body');
  const seen = new Set();
  const rows = [];
  for (let i = 0; i < body.length; i += 1) {
    const n = body[i];
    if (!isObject(n)) return bad(`[${i}]`);
    const keys = Object.keys(n);
    if (!NOTE_REQUIRED.every((k) => Object.prototype.hasOwnProperty.call(n, k)) || !keys.every((k) => NOTE_REQUIRED.includes(k) || NOTE_OPTIONAL.includes(k))) return bad(`[${i}]`);
    if (typeof n.id !== 'string' || !NOTE_ID_RE.test(n.id) || seen.has(n.id)) return bad(`[${i}].id`);
    seen.add(n.id);
    if (!NOTE_TYPES.includes(n.type)) return bad(`[${i}].type`);
    if (!NOTE_FOLDERS.includes(n.folder)) return bad(`[${i}].folder`);
    const title = plain(n.title, 1, 200, false);
    if (title === null) return bad(`[${i}].title`);
    if (!validDay(n.date, ctx.now)) return bad(`[${i}].date`);
    if (n.updated !== '' && !validDay(n.updated, ctx.now)) return bad(`[${i}].updated`);
    if (n.desk !== '' && (typeof n.desk !== 'string' || n.desk.length > 40 || !SLUG_RE.test(n.desk))) return bad(`[${i}].desk`);
    const status = n.status === '' ? '' : plain(n.status, 0, 40, false);
    if (status === null) return bad(`[${i}].status`);
    if (n.level !== null && !/^L[0-4]$/.test(String(n.level))) return bad(`[${i}].level`);
    if (!(n.jev === 'not run' || (typeof n.jev === 'number' && n.jev >= 0 && n.jev <= 1))) return bad(`[${i}].jev`);
    if (!Array.isArray(n.tags) || n.tags.length > 12 || !n.tags.every((t) => plain(t, 1, 40, false) !== null)) return bad(`[${i}].tags`);
    if (!Array.isArray(n.links) || n.links.length > 30 || !n.links.every((l) => typeof l === 'string' && NOTE_ID_RE.test(l))) return bad(`[${i}].links`);
    const source = n.source === '' ? '' : plain(n.source, 0, 240, false);
    if (source === null) return bad(`[${i}].source`);
    const text = n.body === '' ? '' : plain(n.body, 0, 4000, true);
    if (text === null) return bad(`[${i}].body`);
    const row = { id: n.id, type: n.type, folder: n.folder, title, date: n.date, updated: n.updated, desk: n.desk, status, level: n.level, jev: n.jev, tags: n.tags.map((t) => t.trim()), links: n.links.slice(), source, body: text };
    if (Object.prototype.hasOwnProperty.call(n, 'urgent')) {
      if (typeof n.urgent !== 'boolean') return bad(`[${i}].urgent`);
      row.urgent = n.urgent;
    }
    if (Object.prototype.hasOwnProperty.call(n, 'url')) {
      if (typeof n.url !== 'string' || n.url.length > 500 || !/^https?:\/\/[^\s@]+$/.test(n.url)) return bad(`[${i}].url`);
      row.url = n.url;
    }
    if (NOTE_BLOCK.test([row.title, row.tags.join(' '), row.source, row.status, row.url || '', row.body].join('\n'))) return bad(`[${i}].body`);
    rows.push(row);
  }
  return { ok: true, value: rows };
}

const VALIDATORS = {
  notes: validateNotes,
  'morning-brief': validateBrief,
  'routine-health': validateRoutineHealth,
  spend: validateSpend,
  'outreach-stats': validateOutreach,
  'desk-status': validateDeskStatus,
};

function validate(feed, body, ctx) {
  const fn = VALIDATORS[feed];
  return fn ? fn(body, ctx || {}) : bad('feed');
}

// ---- records: merge a validated payload into what is already stored (pure) ---------------

function dayOf(row) { return row.date; }

function applyPayload(feed, existing, value, now) {
  const receivedAt = Number.isFinite(now) ? now : Date.now();
  switch (feed) {
    case 'morning-brief':
      return { date: value.date, text: value.text, receivedAt };
    case 'routine-health':
      return { receivedAt, routines: value.slice() };
    case 'spend': {
      // Posting a date replaces every row stored for that date, so re-sending a day is safe (no duplicates).
      const replaced = new Set(value.map(dayOf));
      const kept = existing && Array.isArray(existing.rows) ? existing.rows.filter((r) => !replaced.has(r.date)) : [];
      const rows = kept.concat(value).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, MAX_SPEND_STORED);
      return { receivedAt, rows };
    }
    case 'outreach-stats': {
      const days = Object.assign({}, existing && isObject(existing.days) ? existing.days : {});
      days[value.date] = COUNT_KEYS.reduce((o, k) => { o[k] = value[k]; return o; }, {});
      const keep = Object.keys(days).sort().reverse().slice(0, MAX_OUTREACH_DAYS);
      return { receivedAt, days: keep.reduce((o, d) => { o[d] = days[d]; return o; }, {}) };
    }
    case 'notes':
      // Each push replaces the whole pack: the vault is the source of truth, so a note removed there leaves /os too.
      return { receivedAt, notes: value.slice() };
    case 'desk-status': {
      const desks = Object.assign({}, existing && isObject(existing.desks) ? existing.desks : {});
      value.forEach((r) => { desks[r.desk] = { now: r.now, updated: r.updated }; });
      return { receivedAt, desks };
    }
    default:
      return null;
  }
}

// ---- storage ---------------------------------------------------------------------------------------

function feedKey(feed, env) {
  const e = String((env || process.env).VERCEL_ENV || '').trim().toLowerCase();
  const prefix = !e || e === 'production' ? '' : e.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  const key = `${KEY_PREFIX}${feed}-v1`;
  return prefix ? `${prefix}:${key}` : key;
}

function kvOn(env) { return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN); }

function filePathFor(feed, env) {
  if (kvOn(env) || env.VERCEL) return '';
  const custom = String(env.OPS_STORE_FILE || '').trim();
  return custom ? `${custom}.os-feed-${feed}.json` : '';
}

async function kvCall(args, env, fetchImpl) {
  const response = await fetchImpl(String(env.KV_REST_API_URL).replace(/\/$/, ''), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error('kv_failed');
  return response.json();
}

function decode(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

// GET only. Returns a normalized record, or null when absent or unreadable.
async function readFeed(feed, opts) {
  const env = (opts && opts.env) || process.env;
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  try {
    let raw = null;
    if (kvOn(env)) {
      const payload = await kvCall(['GET', feedKey(feed, env)], env, fetchImpl);
      raw = decode(payload && payload.result);
    } else if (filePathFor(feed, env)) {
      const file = filePathFor(feed, env);
      raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    } else if (!env.VERCEL) {
      raw = memory[feed] || null;
    }
    return normalizeRecord(feed, raw);
  } catch {
    return null;
  }
}

async function writeFeed(feed, record, opts) {
  const env = (opts && opts.env) || process.env;
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  const clean = normalizeRecord(feed, record);
  if (!clean) throw new Error('invalid_record');
  if (kvOn(env)) {
    await kvCall(['SET', feedKey(feed, env), JSON.stringify(clean)], env, fetchImpl);
  } else if (filePathFor(feed, env)) {
    const file = filePathFor(feed, env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(clean));
  } else if (!env.VERCEL) {
    memory[feed] = clean;
  } else {
    throw new Error('store_unavailable');
  }
  return clean;
}

function resetFeeds() { Object.keys(memory).forEach((k) => { delete memory[k]; }); }

// Re-check whatever was stored with the same row rules, so a damaged record reads as "no data", not as a crash.
function normalizeRecord(feed, raw) {
  if (!isObject(raw) || !Number.isFinite(raw.receivedAt)) return null;
  const ctx = { now: Number.MAX_SAFE_INTEGER / 4, deskIds: null };
  const rec = { receivedAt: raw.receivedAt };
  switch (feed) {
    case 'morning-brief': {
      const v = validateBrief({ date: raw.date, text: raw.text }, ctx);
      return v.ok ? Object.assign(rec, v.value) : null;
    }
    case 'routine-health': {
      const v = validateRoutineHealth(raw.routines, ctx);
      return v.ok ? Object.assign(rec, { routines: v.value }) : null;
    }
    case 'spend': {
      if (!Array.isArray(raw.rows) || raw.rows.length > MAX_SPEND_STORED) return null;
      const rows = [];
      for (const r of raw.rows) {
        if (!exactKeys(r, ['date', 'tool', 'cents', 'note']) || !validDay(r.date, ctx.now)) return null;
        if (!plain(r.tool, 1, 60, false) || !Number.isInteger(r.cents) || r.cents < 0 || r.cents > 10000000) return null;
        if (r.note !== '' && plain(r.note, 0, 200, false) === null) return null;
        rows.push({ date: r.date, tool: r.tool, cents: r.cents, note: r.note });
      }
      return Object.assign(rec, { rows });
    }
    case 'outreach-stats': {
      if (!isObject(raw.days)) return null;
      const days = {};
      for (const d of Object.keys(raw.days)) {
        const v = validateOutreach(Object.assign({ date: d }, raw.days[d]), ctx);
        if (!v.ok) return null;
        days[d] = COUNT_KEYS.reduce((o, k) => { o[k] = v.value[k]; return o; }, {});
      }
      return Object.assign(rec, { days });
    }
    case 'notes': {
      const v = validateNotes(raw.notes, ctx);
      return v.ok ? Object.assign(rec, { notes: v.value }) : null;
    }
    case 'desk-status': {
      if (!isObject(raw.desks)) return null;
      const desks = {};
      for (const id of Object.keys(raw.desks)) {
        const r = raw.desks[id];
        if (!SLUG_RE.test(id) || !exactKeys(r, ['now', 'updated']) || plain(r.now, 1, MAX_NOW, false) === null || !parseIso(r.updated)) return null;
        desks[id] = { now: r.now, updated: r.updated };
      }
      return Object.assign(rec, { desks });
    }
    default:
      return null;
  }
}

// Reads all six. One unreadable feed never hides the others.
async function readFeeds(opts) {
  if (opts && opts.feeds !== undefined) return opts.feeds;
  const [brief, health, spend, outreach, desks, notes] = await Promise.all(FEEDS.map((f) => readFeed(f, opts)));
  return { brief, health, spend, outreach, desks, notes };
}

// ---- views for the adapter (pure) --------------------------------------------------------------------

const TONE = { ok: 'ok', late: 'warn', skipped: 'warn', failed: 'bad' };

function briefView(rec) {
  return rec ? { date: rec.date, text: rec.text } : null;
}

// Same shape the legacy routine-health view has, so routinesFrom() merges it unchanged.
function healthView(rec) {
  if (!rec) return null;
  const checked = new Date(rec.receivedAt).toISOString().slice(0, 19) + 'Z';
  return {
    checkedLabel: formatChicago(checked),
    routines: rec.routines.map((r) => ({
      slug: r.id,
      status: r.status,
      tone: TONE[r.status] || '',
      reason: '',
      lastRunAt: r.lastRun,
      lastRunLabel: r.lastRun ? formatChicago(r.lastRun) : '',
    })),
  };
}

// 18:00 UTC is midday in Chicago all year, so the stored day keeps its calendar day in America/Chicago.
function dayToMs(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 18, 0, 0);
}

function spendRows(rec) {
  if (!rec) return null;
  return rec.rows.map((r, i) => ({ id: `${r.date}-${i}`, date: dayToMs(r.date), cents: r.cents, provider: r.tool, note: r.note }));
}

function outreachView(rec) {
  if (!rec) return null;
  const days = Object.keys(rec.days).sort();
  if (!days.length) return null;
  const date = days[days.length - 1];
  const s = rec.days[date];
  return Object.assign({ date }, s, { bounceRate: s.sent > 0 ? s.bounced / s.sent : null });
}

// Same shape notesFrom() gives store notes, plus the pack fields (type, folder, tags, links, level, jev, ...).
function notesView(rec) {
  if (!rec) return null;
  return rec.notes.map((n) => notePackRow(n));
}

function notePackRow(n) {
  const ms = (d) => (d ? Date.parse(`${d}T18:00:00Z`) : 0);
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    source: n.source,
    type: n.type,
    folder: n.folder,
    desk: n.desk,
    status: n.status,
    level: n.level || '',
    jev: typeof n.jev === 'number' ? n.jev : null,
    tags: n.tags.slice(),
    links: n.links.slice(),
    url: n.url || '',
    urgent: n.urgent === true,
    date: ms(n.date),
    updatedAt: ms(n.updated) || ms(n.date),
  };
}

function deskStatusView(rec) {
  if (!rec) return null;
  return Object.keys(rec.desks).reduce((o, id) => {
    o[id] = { now: rec.desks[id].now, updatedAt: Date.parse(rec.desks[id].updated) };
    return o;
  }, {});
}

module.exports = {
  COUNT_KEYS,
  FEEDS,
  HEALTH_STATUSES,
  MAX_BYTES,
  NOTES_MAX_BYTES,
  applyPayload,
  briefView,
  deskStatusView,
  feedKey,
  healthView,
  maxBytesFor,
  normalizeRecord,
  notePackRow,
  notesView,
  outreachView,
  readFeed,
  readFeeds,
  resetFeeds,
  spendRows,
  validate,
  writeFeed,
};
