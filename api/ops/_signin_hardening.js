// Sign-in history and "sign out all sessions" for LAVAALL OS.
// Flag OPS_SIGNIN_HARDENING_ENABLED defaults off (unset, empty, or any
// value other than 1 / true / on). Does not change SESSION_VERSION and
// does not read or rotate the auth signing secret.
//
// KV keys are separate from the founder store blob. Preview (and any
// non-production VERCEL_ENV) prefixes them, same idea as the founders
// thread. If KV is down, sign-in still succeeds and logging is skipped.
// A generation read failure fails open so a KV blip does not lock founders out.
// Underscore prefix: not a Vercel function. No npm.

const crypto = require('crypto');
const lib = require('./_lib');

const LOG_KEY = 'lavaall-ops-signin-log-v1';
const GEN_KEY = 'lavaall-ops-session-gen-v1';
const MAX_EVENTS = 200;
const PANEL_EVENTS = 20;
const GEN_MAX = 1_000_000_000;
const RESULTS = Object.freeze(['signed_in', 'rejected', 'signed_out_all']);

function signInHardeningEnabled() {
  const flag = String(process.env.OPS_SIGNIN_HARDENING_ENABLED || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function signInKeys() {
  const env = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  const prefix = !env || env === 'production'
    ? ''
    : env.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return {
    log: prefix ? `${prefix}:${LOG_KEY}` : LOG_KEY,
    generation: prefix ? `${prefix}:${GEN_KEY}` : GEN_KEY,
  };
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function fetchSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(2500);
  }
  return undefined;
}

async function kvCommand(args) {
  const base = String(process.env.KV_REST_API_URL || '').replace(/\/$/, '');
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) throw new Error('kv_unconfigured');
  const response = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: fetchSignal(),
  });
  if (!response || !response.ok) throw new Error('kv_command_failed');
  return response.json();
}

function domainOf(email) {
  const normalized = lib.normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at < 1) return '';
  return normalized.slice(at + 1);
}

function rejectedWho(domain) {
  const safe = String(domain || '').trim().toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 80);
  if (!safe || !safe.includes('.') || safe.includes('..') || safe.startsWith('.') || safe.endsWith('.')) {
    return 'rejected: unknown';
  }
  return `rejected: ${safe}`;
}

function sanitizeWho(who, result) {
  const value = typeof who === 'string' ? who.trim().toLowerCase() : '';
  if (result === 'signed_in' || result === 'signed_out_all') {
    return lib.isAllowlisted(value) ? value : 'rejected: unknown';
  }
  if (value === 'rejected: unknown') return value;
  if (/^rejected: [a-z0-9.-]{1,80}$/.test(value)) return rejectedWho(value.slice('rejected: '.length));
  return 'rejected: unknown';
}

function sanitizeWhere(value) {
  const clean = String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 60);
  if (/\d{1,3}(?:\.\d{1,3}){3}/.test(clean)) return '';
  return clean;
}

function sanitizeUa(value) {
  const clean = String(value || '').trim();
  if (!/^(Chrome|Safari|Firefox|Edge|Opera|Script|Browser) on (macOS|Windows|iOS|Android|Linux|ChromeOS|Unknown OS)$/.test(clean)) {
    return '';
  }
  return clean;
}

function sanitizeIp(value) {
  const clean = String(value || '').trim();
  if (/^(?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d)\.x\.x$/.test(clean)) return clean;
  if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}::$/i.test(clean)) return clean.toLowerCase();
  return '';
}

function sanitizeEvent(input) {
  const src = input && typeof input === 'object' ? input : {};
  const result = RESULTS.includes(src.result) ? src.result : '';
  if (!result) return null;
  const at = Number(src.at);
  return {
    at: Number.isFinite(at) ? Math.floor(at) : Date.now(),
    who: sanitizeWho(src.who, result),
    result,
    where: sanitizeWhere(src.where),
    ua: sanitizeUa(src.ua),
    ip: sanitizeIp(src.ip),
  };
}

function parseStored(row) {
  let value = row;
  if (typeof row === 'string') {
    try {
      value = JSON.parse(row);
    } catch {
      return null;
    }
  }
  return sanitizeEvent(value);
}

function summarizeUserAgent(value) {
  const ua = String(value || '').slice(0, 400);
  if (!ua.trim()) return '';
  let os = 'Unknown OS';
  if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';
  else if (/curl|wget|python-requests|bot/i.test(ua)) browser = 'Script';
  return sanitizeUa(`${browser} on ${os}`);
}

function coarseLocation(req) {
  const countryRaw = String(lib.header(req, 'x-vercel-ip-country') || '').trim();
  const country = /^[A-Za-z]{2}$/.test(countryRaw) ? countryRaw.toUpperCase() : '';
  let city = String(lib.header(req, 'x-vercel-ip-city') || '').trim();
  if (city) {
    try {
      city = decodeURIComponent(city);
    } catch {
      city = '';
    }
  }
  city = city.replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
  if (/\d{1,3}(?:\.\d{1,3}){2}/.test(city)) city = '';
  return sanitizeWhere([city, country].filter(Boolean).join(', '));
}

function truncateIp(ip) {
  const raw = String(ip || '').trim();
  if (!raw || raw === 'unknown') return '';
  if (raw.includes('.')) {
    const parts = raw.split('.');
    if (parts.length !== 4) return '';
    const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return '';
    return sanitizeIp(`${nums[0]}.${nums[1]}.x.x`);
  }
  const groups = raw.split(':');
  if (groups.length < 3) return '';
  const head = groups.slice(0, 2).map((group) => group.replace(/[^0-9a-f]/gi, '').slice(0, 4).toLowerCase());
  if (head.some((group) => !group)) return '';
  return sanitizeIp(`${head[0]}:${head[1]}::`);
}

function requestContext(req) {
  return {
    where: coarseLocation(req),
    ua: summarizeUserAgent(lib.header(req, 'user-agent')),
    ip: truncateIp(lib.clientIp(req)),
  };
}

async function currentGeneration() {
  if (!kvConfigured()) return null;
  try {
    const payload = await kvCommand(['GET', signInKeys().generation]);
    const raw = payload ? payload.result : null;
    if (raw == null || raw === '') return 0;
    const n = typeof raw === 'number' ? raw : Number(String(raw));
    if (!Number.isInteger(n) || n < 0 || n > GEN_MAX) return null;
    return n;
  } catch {
    return null;
  }
}

async function bumpSessionGeneration() {
  if (!signInHardeningEnabled()) return { error: 'disabled' };
  if (!kvConfigured()) return { error: 'store_unavailable' };
  try {
    const payload = await kvCommand(['INCR', signInKeys().generation]);
    const n = Number(payload && payload.result);
    if (!Number.isInteger(n) || n < 1 || n > GEN_MAX) return { error: 'store_unavailable' };
    return { ok: true, generation: n };
  } catch {
    return { error: 'store_unavailable' };
  }
}

async function appendEvent(input) {
  if (!signInHardeningEnabled() || !kvConfigured()) return;
  const event = sanitizeEvent(input);
  if (!event) return;
  const key = signInKeys().log;
  await kvCommand(['LPUSH', key, JSON.stringify(event)]);
  await kvCommand(['LTRIM', key, 0, MAX_EVENTS - 1]);
}

async function noteSignIn(req, who, result) {
  if (!signInHardeningEnabled()) return;
  try {
    const ctx = requestContext(req);
    await appendEvent({
      at: Date.now(),
      who,
      result,
      where: ctx.where,
      ua: ctx.ua,
      ip: ctx.ip,
    });
  } catch {
    // Sign-in must succeed even when the log write fails.
  }
}

async function listSignInEvents() {
  if (!signInHardeningEnabled() || !kvConfigured()) return [];
  try {
    const payload = await kvCommand(['LRANGE', signInKeys().log, 0, MAX_EVENTS - 1]);
    const rows = payload && payload.result;
    if (!Array.isArray(rows)) return [];
    const events = [];
    rows.forEach((row) => {
      const event = parseStored(row);
      if (event) events.push(event);
    });
    return events.slice(0, MAX_EVENTS);
  } catch {
    return [];
  }
}

async function readLiveSession(req, opts) {
  const session = lib.readSession(req, opts);
  if (!session || !signInHardeningEnabled()) return session;
  const stored = await currentGeneration();
  if (stored == null) return session;
  const gen = Number.isInteger(session.gen) ? session.gen : 0;
  if (gen < stored) return null;
  return session;
}

async function mintSessionToken(email) {
  if (!signInHardeningEnabled()) return lib.createSessionToken(email);
  const current = await currentGeneration();
  if (current == null) return lib.createSessionToken(email);
  return lib.createSessionToken(email, { generation: current });
}

function resultLabel(result) {
  switch (result) {
    case 'signed_in':
      return 'Signed in';
    case 'rejected':
      return 'Rejected';
    case 'signed_out_all':
      return 'Signed out all sessions';
    default: {
      const _never = result;
      void _never;
      return 'Rejected';
    }
  }
}

function formatWhen(at) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

function renderSignInHistory({ events, csrf }) {
  const rows = Array.isArray(events) ? events.slice(0, PANEL_EVENTS) : [];
  const list = rows.length
    ? `<ul class="list signin-history">${rows.map((event) => {
      const bits = [formatWhen(event.at), event.where, event.ua, event.ip].filter(Boolean);
      const meta = bits.length ? `<span class="signin-meta">${lib.escapeHtml(bits.join(' · '))}</span>` : '';
      const tagClass = event.result === 'signed_in' ? 'tag' : 'tag overlap';
      return `<li><span class="${tagClass}">${lib.escapeHtml(resultLabel(event.result))}</span> ${lib.escapeHtml(event.who)}${meta}</li>`;
    }).join('')}</ul>`
    : '<p class="empty">No sign-ins recorded yet.</p>';
  const kvNote = kvConfigured()
    ? ''
    : '<p class="banner">Sign-in history needs Vercel KV. Sign-in still works without it.</p>';
  return `<section class="card" id="signin-history">
      <div class="kicker">Founders only</div>
      <h2>Sign-in history</h2>
      <p class="signin-lead">Recent sign-ins. A rejected address is stored as its domain only. Location is the Vercel country and city when those headers are present.</p>
      ${kvNote}
      ${list}
      <form method="POST" action="/api/ops/auth">
        <input type="hidden" name="action" value="signout-all"/>
        <input type="hidden" name="csrf" value="${lib.escapeHtml(csrf || '')}"/>
        <button class="btn btn-danger btn-sm" type="submit">Sign out all sessions</button>
      </form>
      <p class="signin-lead">Signs out every older session, including other browsers. This browser stays signed in.</p>
    </section>`;
}

module.exports = {
  GEN_KEY,
  LOG_KEY,
  MAX_EVENTS,
  PANEL_EVENTS,
  bumpSessionGeneration,
  currentGeneration,
  domainOf,
  listSignInEvents,
  mintSessionToken,
  noteSignIn,
  readLiveSession,
  rejectedWho,
  renderSignInHistory,
  signInHardeningEnabled,
  signInKeys,
  summarizeUserAgent,
  truncateIp,
};
