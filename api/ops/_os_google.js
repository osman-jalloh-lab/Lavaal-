// api/ops/_os_google.js — "Connect Google" for /os: one Google account (meant to be support@lavaall.com)
// with Gmail read + drafts and Calendar read/write. Founder-only. Underscore-prefixed: not a Vercel function.
//
//   GET  /ops/os/google/connect    -> redirect to Google consent (PKCE + signed state cookie)
//   GET  /ops/os/gmail/callback    -> exchange the code, store the refresh token ENCRYPTED in KV, back to /os#inbox
//   GET  /ops/os/google/status     -> { connected, email, scopes }
//   POST /ops/os/google/disconnect -> revoke at Google and forget the token
//   GET  /ops/os/calendar          -> upcoming events (next 14 days, primary calendar)
//   POST /ops/os/calendar/event    -> create one event (only from Osman's click in /os)
//   POST /ops/os/gmail/draft       -> create a Gmail DRAFT. Nothing is ever sent from here: Osman sends it in Gmail.
//
// The refresh token is AES-256-GCM encrypted with a key derived from OPS_AUTH_SECRET before it touches KV.
// Uses the existing OAuth client (OPS_GMAIL_CLIENT_ID / OPS_GMAIL_CLIENT_SECRET). Never logs tokens or mail.

const crypto = require('crypto');
const { buildCookie, getSecret, json, looksLikeAgentRequest, parseCookies, publicOrigin, queryOf, readBody, readSignedToken, signToken } = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');

const KEY = 'lavaall-os-google-v1';
const COOKIE = 'lavaall_os_google';
const CALLBACK_PATH = '/ops/os/gmail/callback';
const SCOPES = Object.freeze([
  'openid', 'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events',
]);
const STATE_TTL_SEC = 600;

let memoryRecord = null;

function routeOf(req) {
  const q = queryOf(req);
  const area = String((Array.isArray(q.area) ? q.area[0] : q.area) || '').replace(/^\/+|\/+$/g, '');
  const pathOnly = String(req.url || '').split('?')[0].replace(/^\/+|\/+$/g, '').replace(/^api\/ops\/?/, '').replace(/^ops\//, '');
  const r = area || pathOnly;
  return ['os/google/connect', 'os/gmail/callback', 'os/google/status', 'os/google/disconnect', 'os/calendar', 'os/calendar/event', 'os/gmail/draft'].includes(r) ? r : '';
}

function client(env) {
  return { id: String(env.OPS_GMAIL_CLIENT_ID || '').trim(), secret: String(env.OPS_GMAIL_CLIENT_SECRET || '').trim() };
}

function kvOn(env) { return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN); }
function kvKey(env) {
  const e = String(env.VERCEL_ENV || '').trim().toLowerCase();
  const prefix = !e || e === 'production' ? '' : e.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return prefix ? `${prefix}:${KEY}` : KEY;
}
async function kv(args, env, fetchImpl) {
  const res = await fetchImpl(String(env.KV_REST_API_URL).replace(/\/$/, ''), {
    method: 'POST', headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('kv');
  return res.json();
}

function encKey() {
  const secret = getSecret();
  if (!secret) throw new Error('no_secret');
  return crypto.createHash('sha256').update(`${secret}:os-google-token-v1`).digest();
}
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}
function decrypt(blob) {
  const [iv, tag, body] = String(blob || '').split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}

async function readRecord(env, fetchImpl) {
  if (!kvOn(env)) return memoryRecord;
  const out = await kv(['GET', kvKey(env)], env, fetchImpl);
  try { return out && out.result ? JSON.parse(out.result) : null; } catch { return null; }
}
async function writeRecord(rec, env, fetchImpl) {
  if (!kvOn(env)) { memoryRecord = rec; return; }
  if (rec) await kv(['SET', kvKey(env), JSON.stringify(rec)], env, fetchImpl);
  else await kv(['DEL', kvKey(env)], env, fetchImpl);
}

async function accessToken(env, fetchImpl) {
  const rec = await readRecord(env, fetchImpl);
  if (!rec || !rec.enc) return null;
  const c = client(env);
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: decrypt(rec.enc), grant_type: 'refresh_token' }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error('google_token');
  return { token: data.access_token, record: rec };
}

async function google(fetchImpl, token, url, init) {
  const res = await fetchImpl(url, Object.assign({}, init || {}, { headers: Object.assign({ Authorization: `Bearer ${token}` }, (init && init.headers) || {}) }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error('google_api'); e.status = res.status; throw e; }
  return data;
}

function clip(v, n) { return String(v || '').replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, n); }
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

function redirect(res, location, cookie) {
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.setHeader('Cache-Control', 'no-store');
  res.status(302).setHeader('Location', location);
  res.send('');
}

async function handleOsGoogle(req, res, opts) {
  const route = routeOf(req);
  if (!route) return false;
  const env = (opts && opts.env) || process.env;
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  if (looksLikeAgentRequest(req)) { json(res, 403, { error: 'agent_denied' }); return true; }
  const session = opts && opts.session !== undefined ? opts.session : await readLiveSession(req);
  if (!session || !session.email) { json(res, 401, { error: 'sign_in_required' }); return true; }
  const method = String(req.method || 'GET').toUpperCase();
  const c = client(env);
  const origin = (opts && opts.origin) || publicOrigin(req);
  const redirectUri = `${origin}${CALLBACK_PATH}`;

  try {
    if (route === 'os/google/connect') {
      if (!c.id || !c.secret || !getSecret()) { json(res, 409, { error: 'not_configured', message: 'OPS_GMAIL_CLIENT_ID, OPS_GMAIL_CLIENT_SECRET and OPS_AUTH_SECRET must be set.' }); return true; }
      const state = crypto.randomBytes(24).toString('base64url');
      const verifier = crypto.randomBytes(32).toString('base64url');
      const cookie = buildCookie(COOKIE, encodeURIComponent(signToken('os-google', { state, cv: verifier, exp: Date.now() + STATE_TTL_SEC * 1000, who: session.email })), req, STATE_TTL_SEC);
      const params = new URLSearchParams({
        client_id: c.id, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
        login_hint: 'support@lavaall.com',
      });
      redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, cookie);
      return true;
    }

    if (route === 'os/gmail/callback') {
      const q = queryOf(req);
      const clear = buildCookie(COOKIE, '', req, 0);
      const raw = parseCookies(req)[COOKIE];
      const read = raw ? readSignedToken('os-google', decodeURIComponent(raw)) : { error: 'missing' };
      const p = read.payload;
      if (!p || !p.state || p.state !== q.state || !(p.exp > Date.now()) || p.who !== session.email) { redirect(res, '/os#inbox', clear); return true; }
      if (q.error || !q.code) { redirect(res, '/os#inbox', clear); return true; }
      const tokRes = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, code: String(q.code), code_verifier: p.cv, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
      });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok || !tok.refresh_token || !tok.access_token) { redirect(res, '/os#inbox', clear); return true; }
      const prof = await google(fetchImpl, tok.access_token, 'https://gmail.googleapis.com/gmail/v1/users/me/profile');
      await writeRecord({ email: clip(prof.emailAddress, 160).toLowerCase(), scopes: String(tok.scope || '').split(' ').filter(Boolean), enc: encrypt(tok.refresh_token), at: Date.now() }, env, fetchImpl);
      redirect(res, '/os#inbox', clear);
      return true;
    }

    if (route === 'os/google/status') {
      const rec = await readRecord(env, fetchImpl);
      json(res, 200, { connected: Boolean(rec && rec.enc), email: rec ? rec.email : '', scopes: rec ? rec.scopes : [], configured: Boolean(c.id && c.secret) });
      return true;
    }

    if (route === 'os/google/disconnect') {
      if (method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
      const rec = await readRecord(env, fetchImpl);
      if (rec && rec.enc) {
        try { await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(rec.enc))}`, { method: 'POST' }); } catch { /* forget it anyway */ }
      }
      await writeRecord(null, env, fetchImpl);
      json(res, 200, { ok: true, connected: false });
      return true;
    }

    const auth = await accessToken(env, fetchImpl);
    if (!auth) { json(res, 409, { error: 'google_not_connected', message: 'Connect Google first.' }); return true; }

    if (route === 'os/calendar') {
      const now = (opts && opts.now) || Date.now();
      const params = new URLSearchParams({ timeMin: new Date(now).toISOString(), timeMax: new Date(now + 14 * 86400000).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '25' });
      const data = await google(fetchImpl, auth.token, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`);
      const events = (Array.isArray(data.items) ? data.items : []).map((e) => ({
        id: clip(e.id, 120), title: clip(e.summary, 200) || '(no title)', where: clip(e.location, 200),
        start: (e.start && (e.start.dateTime || e.start.date)) || '', end: (e.end && (e.end.dateTime || e.end.date)) || '',
        allDay: Boolean(e.start && e.start.date && !e.start.dateTime), link: /^https:\/\/www\.google\.com\/calendar\//.test(e.htmlLink || '') ? e.htmlLink : '',
      }));
      json(res, 200, { connected: true, email: auth.record.email, events });
      return true;
    }

    if (method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
    const body = readBody(req) || {};

    if (route === 'os/calendar/event') {
      const title = clip(body.title, 200);
      const start = Date.parse(body.start); const end = Date.parse(body.end);
      if (!title || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 14 * 86400000) { json(res, 400, { error: 'invalid_event' }); return true; }
      const ev = await google(fetchImpl, auth.token, 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: title, location: clip(body.where, 200) || undefined, start: { dateTime: new Date(start).toISOString() }, end: { dateTime: new Date(end).toISOString() } }),
      });
      json(res, 200, { ok: true, id: clip(ev.id, 120) });
      return true;
    }

    if (route === 'os/gmail/draft') {
      const to = clip(body.to, 200); const subject = clip(body.subject, 200); const text = String(body.text || '').slice(0, 20000);
      if (!EMAIL_RE.test(to) || !subject || !text.trim()) { json(res, 400, { error: 'invalid_draft' }); return true; }
      const mime = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0', '', text].join('\r\n');
      const d = await google(fetchImpl, auth.token, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { raw: Buffer.from(mime, 'utf8').toString('base64url') } }),
      });
      json(res, 200, { ok: true, draftId: clip(d.id, 120), message: 'Draft saved in Gmail. Review and send it there.' });
      return true;
    }
  } catch (err) {
    json(res, 502, { error: 'google_unavailable', message: 'Google did not answer. Try again, or reconnect Google.' });
    return true;
  }
  json(res, 404, { error: 'not_found' });
  return true;
}

function resetOsGoogle() { memoryRecord = null; }

module.exports = { CALLBACK_PATH, SCOPES, accessToken, decrypt, encrypt, handleOsGoogle, readRecord, resetOsGoogle, routeOf };
