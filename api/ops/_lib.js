// Shared LAVAALL OS auth helpers for api/ops/*.
// HMAC-signed magic-link tokens + HMAC-signed httpOnly session cookie.
// No npm. Underscore prefix so Vercel Hobby does not count this as a function.
//
// Why not Auth.js / Clerk: this repo is static HTML + Vercel api/ serverless
// with no package.json. Introducing Next.js or an Auth.js runtime would be a
// rewrite. Tokens use the same Node crypto pattern as api/slack/_lib.js.
//
// Used-token set is process-local (same limitation as Slack task memory).
// Short TTL (10 minutes) bounds replay across cold starts.

const crypto = require('crypto');
const { gmailConfigured, sendGmailMessage } = require('./_gmail');

const ALLOWLIST = Object.freeze([
  'osmanjalloh104@gmail.com',
  'abdulhbah55@gmail.com',
]);
const ALLOWLIST_SET = new Set(ALLOWLIST);

const MAGIC_TTL_MS = 10 * 60 * 1000;
const MAGIC_VERSION = 2;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Version 2 invalidates sessions minted by the former production instant-login
// path, where knowing an allowlisted address was enough to obtain a cookie.
const SESSION_VERSION = 2;
const EXP_SKEW_MS = 30 * 1000;
const SESSION_COOKIE = 'lavaall_ops';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 4_000;

const usedMagic = new Map();
const recent = new Map();

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

function header(req, name) {
  const value = req.headers[name] || req.headers[String(name).toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
  return EMAIL_RE.test(normalizeEmail(value));
}

function isAllowlisted(value) {
  return ALLOWLIST_SET.has(normalizeEmail(value));
}

function getSecret() {
  const secret = process.env.OPS_AUTH_SECRET;
  return typeof secret === 'string' && secret.length >= 16 ? secret : '';
}

function authConfigured() {
  return Boolean(getSecret());
}

function resendKeyPresent() {
  return Boolean(process.env.RESEND_API_KEY);
}

function resendKeyPrefixOk() {
  return typeof process.env.RESEND_API_KEY === 'string' && process.env.RESEND_API_KEY.startsWith('re_');
}

function resendFromSet() {
  return Boolean(process.env.OPS_FROM_EMAIL);
}

function webhookConfigured() {
  return Boolean(process.env.OPS_MAGIC_LINK_WEBHOOK_URL);
}

function previewInlineEnabled() {
  return vercelEnv() === 'preview' && process.env.OPS_PREVIEW_INLINE_LINK === '1';
}

function vercelEnv() {
  return String(process.env.VERCEL_ENV || '').trim().toLowerCase();
}

function envFlag(value) {
  const flag = String(value || '').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  if (flag === '1' || flag === 'true' || flag === 'on') return true;
  return null;
}

// Production must always prove email ownership with a delivered magic link.
// Instant login is an explicit Preview/local convenience only; an environment
// variable must never be able to turn it on in Production.
function instantLoginEnabled() {
  if (vercelEnv() === 'production') return false;
  const explicit = envFlag(process.env.OPS_INSTANT_LOGIN);
  if (explicit !== null) return explicit;
  const legacy = envFlag(process.env.OPS_PREVIEW_INSTANT_LOGIN);
  if (legacy !== null) return legacy;
  return false;
}

function sessionAudience() {
  const env = vercelEnv();
  if (env === 'production' || env === 'preview' || env === 'development') return env;
  return 'local';
}

function describeDeliveryConfig() {
  return {
    resend_key_present: resendKeyPresent(),
    resend_key_prefix_ok: resendKeyPrefixOk(),
    resend_from_set: resendFromSet(),
    gmail_configured: gmailConfigured(),
    webhook_configured: webhookConfigured(),
    preview_inline: previewInlineEnabled(),
  };
}

function deliveryConfigured() {
  return resendKeyPresent() || gmailConfigured() || webhookConfigured() || previewInlineEnabled();
}

function logDelivery(event, extra) {
  const payload = Object.assign({ type: 'OpsAuthDelivery', event }, describeDeliveryConfig(), extra || {});
  console.log(JSON.stringify(payload));
}

async function readSafeErrorName(response) {
  try {
    const text = await response.text();
    const parsed = JSON.parse(text);
    const name = parsed && (parsed.name || parsed.error || parsed.status);
    return typeof name === 'string' ? name.slice(0, 80) : '';
  } catch {
    return '';
  }
}

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function parseB64urlJson(raw) {
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hmac(purpose, raw) {
  return crypto.createHmac('sha256', getSecret()).update(`${purpose}:${raw}`, 'utf8').digest('base64url');
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function signToken(purpose, payload) {
  const raw = b64urlJson(payload);
  return `${raw}.${hmac(purpose, raw)}`;
}

function readSignedToken(purpose, token) {
  if (!getSecret() || typeof token !== 'string') return { error: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 2) return { error: 'invalid' };
  const [raw, sig] = parts;
  if (!timingSafeEqualString(hmac(purpose, raw), sig)) return { error: 'invalid' };
  const payload = parseB64urlJson(raw);
  if (!payload) return { error: 'invalid' };
  return { payload };
}

function pruneUsed(now) {
  for (const [jti, exp] of usedMagic) {
    if (exp <= now) usedMagic.delete(jti);
  }
}

function createMagicToken(email, opts) {
  const now = opts && Number.isFinite(opts.now) ? opts.now : Date.now();
  const ttl = opts && Number.isFinite(opts.ttlMs) ? opts.ttlMs : MAGIC_TTL_MS;
  return signToken('magic', {
    v: MAGIC_VERSION,
    e: normalizeEmail(email),
    aud: sessionAudience(),
    exp: now + ttl,
    jti: crypto.randomBytes(16).toString('hex'),
  });
}

function consumeMagicToken(token, opts) {
  const now = opts && Number.isFinite(opts.now) ? opts.now : Date.now();
  pruneUsed(now);
  const read = readSignedToken('magic', token);
  if (read.error) return read;
  const { payload } = read;
  if (payload.v !== MAGIC_VERSION || payload.aud !== sessionAudience() || typeof payload.e !== 'string' || typeof payload.jti !== 'string' || !Number.isFinite(payload.exp)) {
    return { error: 'invalid' };
  }
  if (!isAllowlisted(payload.e)) return { error: 'invalid' };
  if (payload.exp + EXP_SKEW_MS <= now) return { error: 'expired' };
  if (usedMagic.has(payload.jti)) return { error: 'used' };
  usedMagic.set(payload.jti, payload.exp);
  return { email: payload.e };
}

function createSessionToken(email, opts) {
  const now = opts && Number.isFinite(opts.now) ? opts.now : Date.now();
  const ttl = opts && Number.isFinite(opts.ttlMs) ? opts.ttlMs : SESSION_TTL_MS;
  return signToken('session', {
    v: SESSION_VERSION,
    e: normalizeEmail(email),
    aud: sessionAudience(),
    iat: now,
    exp: now + ttl,
  });
}

function readSessionToken(token, opts) {
  const now = opts && Number.isFinite(opts.now) ? opts.now : Date.now();
  const read = readSignedToken('session', token);
  if (read.error) return null;
  const { payload } = read;
  if (payload.v !== SESSION_VERSION || payload.aud !== sessionAudience() || !isAllowlisted(payload.e) || !Number.isFinite(payload.exp)) return null;
  if (payload.exp + EXP_SKEW_MS <= now) return null;
  return { email: payload.e, exp: payload.exp, iat: payload.iat };
}

function parseCookies(req) {
  const raw = header(req, 'cookie') || '';
  const out = {};
  String(raw).split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  });
  return out;
}

function cookieSecure(req) {
  if (process.env.OPS_AUTH_COOKIE_SECURE === '0') return false;
  const host = String(header(req, 'host') || '');
  return !(host.startsWith('localhost') || host.startsWith('127.0.0.1'));
}

function cookieHeader(value, req, maxAgeSec) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (cookieSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

function sessionCookie(token, req) {
  return cookieHeader(encodeURIComponent(token), req, Math.floor(SESSION_TTL_MS / 1000));
}

function clearSessionCookie(req) {
  return cookieHeader('', req, 0);
}

function readSession(req, opts) {
  const cookies = parseCookies(req);
  return readSessionToken(cookies[SESSION_COOKIE], opts);
}

function publicOrigin(req) {
  const configured = process.env.OPS_PUBLIC_URL;
  if (typeof configured === 'string' && configured) return configured.replace(/\/$/, '');
  const proto = header(req, 'x-forwarded-proto') || 'https';
  const host = header(req, 'x-forwarded-host') || header(req, 'host') || 'www.lavaall.com';
  return `${String(proto).split(',')[0].trim()}://${String(host).split(',')[0].trim()}`;
}

function wantsJson(req) {
  const accept = String(header(req, 'accept') || '');
  const ct = String(header(req, 'content-type') || '');
  return ct.includes('application/json') || accept.includes('application/json');
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    try {
      return Object.fromEntries(new URLSearchParams(raw));
    } catch {
      return {};
    }
  }
}

function queryOf(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    return Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  } catch {
    return {};
  }
}

function clientIp(req) {
  return String(header(req, 'x-forwarded-for') || header(req, 'x-real-ip') || 'unknown').split(',')[0].trim();
}

function rateLimited(key, windowMs) {
  const now = Date.now();
  const last = recent.get(key) || 0;
  if (now - last < windowMs) return true;
  recent.set(key, now);
  return false;
}

function payloadTooLarge(req) {
  const raw = JSON.stringify(req.body || '');
  return raw.length > MAX_BODY;
}

function genericRequestMessage() {
  return 'If that email is authorized, a sign-in link is on its way.';
}

function genericSignInFailure() {
  return 'That email isn’t allowed.';
}

function genericRateLimitMessage() {
  return 'Please wait a moment and try again.';
}

function genericLinkFailure() {
  return 'This sign-in link is invalid or has expired.';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function noStore(res, contentType) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', contentType);
}

function redirect(res, location, cookie) {
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.status(302).setHeader('Location', location).setHeader('Cache-Control', 'no-store').send('');
}

function buildMagicLinkMessage(loginUrl) {
  const subject = 'Your LAVAALL OS sign-in link';
  const text = [
    'Sign in to LAVAALL OS with this one-time link:',
    '',
    loginUrl,
    '',
    'The link expires in 10 minutes and can be used once.',
    'If you did not request this, you can ignore this email.',
  ].join('\n');
  const html = [
    '<p>Sign in to LAVAALL OS with this one-time link:</p>',
    `<p><a href="${escapeHtml(loginUrl)}">Sign in to LAVAALL OS</a></p>`,
    '<p>The link expires in 10 minutes and can be used once. If you did not request this, you can ignore this email.</p>',
  ].join('');
  return { subject, text, html };
}

async function tryResend({ to, subject, text, html }) {
  if (!resendKeyPresent()) return { skipped: true, reason: 'missing' };
  logDelivery('resend_attempt');
  if (!resendKeyPrefixOk()) {
    logDelivery('resend_skipped', { reason: 'key_prefix' });
    return { failed: true, reason: 'key_prefix' };
  }
  if (!resendFromSet()) {
    logDelivery('resend_skipped', { reason: 'from_missing' });
    return { failed: true, reason: 'from_missing' };
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.OPS_FROM_EMAIL,
      to,
      subject,
      text,
      html,
    }),
  });
  if (!response.ok) {
    const name = await readSafeErrorName(response);
    logDelivery('resend_failed', { status: response.status, reason: name || 'http' });
    return { failed: true, reason: 'http', status: response.status };
  }
  logDelivery('resend_ok', { status: response.status });
  return { ok: true, via: 'resend' };
}

async function tryGmail({ to, subject, text, html }) {
  if (!gmailConfigured()) return { skipped: true, reason: 'missing' };
  logDelivery('gmail_attempt');
  try {
    const sent = await sendGmailMessage({ to, subject, text, html });
    logDelivery('gmail_ok', { status: sent.status || 200 });
    return { ok: true, via: 'gmail' };
  } catch (err) {
    logDelivery('gmail_failed', {
      status: err && err.status ? err.status : 0,
      reason: err && err.reason ? err.reason : 'http',
    });
    return { failed: true, reason: err && err.reason ? err.reason : 'http' };
  }
}

async function tryWebhook({ to, subject, text, html }) {
  if (!webhookConfigured()) return { skipped: true, reason: 'missing' };
  logDelivery('webhook_attempt');
  const response = await fetch(process.env.OPS_MAGIC_LINK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: process.env.OPS_MAGIC_LINK_WEBHOOK_SECRET || undefined,
      to,
      subject,
      text,
      html,
      receivedAt: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    logDelivery('webhook_failed', { status: response.status, reason: 'http' });
    return { failed: true, reason: 'http', status: response.status };
  }
  logDelivery('webhook_ok', { status: response.status });
  return { ok: true, via: 'webhook' };
}

async function deliverMagicLink({ to, loginUrl }) {
  const message = buildMagicLinkMessage(loginUrl);
  const payload = { to, subject: message.subject, text: message.text, html: message.html };

  const resend = await tryResend(payload);
  if (resend.ok) return resend;

  const gmail = await tryGmail(payload);
  if (gmail.ok) return gmail;

  const webhook = await tryWebhook(payload);
  if (webhook.ok) return webhook;

  if (previewInlineEnabled()) {
    logDelivery('preview_inline');
    return { ok: true, via: 'preview_inline', previewLoginUrl: loginUrl };
  }

  const attempted = [resend, gmail, webhook].some((row) => row.failed);
  return {
    ok: false,
    code: attempted ? 'delivery_failed' : 'delivery_not_configured',
  };
}

async function sendMagicLink({ to, loginUrl }) {
  const result = await deliverMagicLink({ to, loginUrl });
  if (result.ok) return result;
  const err = new Error(result.code);
  err.code = result.code;
  throw err;
}

function resetAuthState() {
  usedMagic.clear();
  recent.clear();
}

function peekSessionEmail(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return '';
  const read = readSignedToken('session', token);
  if (read.error || !read.payload || typeof read.payload.e !== 'string') return '';
  return normalizeEmail(read.payload.e);
}

function createCsrfToken(email, opts) {
  const now = opts && Number.isFinite(opts.now) ? opts.now : Date.now();
  const ttl = opts && Number.isFinite(opts.ttlMs) ? opts.ttlMs : SESSION_TTL_MS;
  return signToken('csrf', {
    v: 1,
    e: normalizeEmail(email),
    exp: now + ttl,
  });
}

function readCsrfToken(token, email, opts) {
  const now = opts && Number.isFinite(opts.now) ? opts.now : Date.now();
  const read = readSignedToken('csrf', token);
  if (read.error) return null;
  const { payload } = read;
  if (payload.v !== 1 || !isAllowlisted(payload.e) || !Number.isFinite(payload.exp)) return null;
  if (payload.exp + EXP_SKEW_MS <= now) return null;
  if (normalizeEmail(email) !== payload.e) return null;
  return { email: payload.e };
}

function looksLikeAgentRequest(req) {
  const authz = String(header(req, 'authorization') || '');
  if (/^\s*(bearer|slack|bot)\s+/i.test(authz)) return true;
  const names = [
    'x-lavaall-agent',
    'x-agent-id',
    'x-agent-name',
    'x-slack-signature',
    'x-slack-request-timestamp',
  ];
  if (names.some((name) => header(req, name))) return true;
  const body = req && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
    ? req.body
    : {};
  return Boolean(body.agentToken || body.agent || body.botToken);
}

module.exports = {
  ALLOWLIST,
  MAGIC_VERSION,
  MAGIC_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  SESSION_VERSION,
  authConfigured,
  clearSessionCookie,
  clientIp,
  consumeMagicToken,
  createCsrfToken,
  createMagicToken,
  createSessionToken,
  deliverMagicLink,
  deliveryConfigured,
  describeDeliveryConfig,
  escapeHtml,
  genericLinkFailure,
  genericRequestMessage,
  genericSignInFailure,
  genericRateLimitMessage,
  instantLoginEnabled,
  getSecret,
  gmailConfigured,
  header,
  isAllowlisted,
  isValidEmail,
  json,
  looksLikeAgentRequest,
  noStore,
  normalizeEmail,
  parseCookies,
  payloadTooLarge,
  peekSessionEmail,
  previewInlineEnabled,
  publicOrigin,
  queryOf,
  rateLimited,
  readBody,
  readCsrfToken,
  readSession,
  readSessionToken,
  redirect,
  resetAuthState,
  resendKeyPrefixOk,
  resendKeyPresent,
  sendMagicLink,
  sessionCookie,
  timingSafeEqualString,
  wantsJson,
};
