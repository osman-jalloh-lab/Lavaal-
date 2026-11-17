'use strict';
const { requestRateLimit } = require('./_chat/request-rate-limit');
const { createService, equal } = require('./_chat/service');

const ACTION_FIELDS = Object.freeze({
  session: [],
  draft: ['sessionId', 'fields', 'eventId'],
  review: ['sessionId', 'csrf', 'draftId'],
  confirm: ['sessionId', 'csrf', 'draftId', 'token', 'idempotencyKey', 'privacyConsent'],
  turn: ['sessionId', 'csrf', 'eventId', 'text', 'pageUrl', 'privacyConsent'],
});
const OPAQUE_FIELDS = ['sessionId', 'draftId', 'token', 'csrf', 'idempotencyKey'];
const isOpaque = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).send(JSON.stringify(body));
}

function validOrigin(value, localTests) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return localTests && url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch (_) {
    return false;
  }
}

function settings(options = {}) {
  // Read env on every request, including requests to the public config endpoint.
  const env = options.env || process.env;
  const runtime = options.runtime || env.VERCEL_ENV;
  const production = runtime === 'production' || env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const preview = !production && (runtime === 'preview' || env.VERCEL_ENV === 'preview');
  const salt = options.salt || env.CHAT_IP_HASH_SALT;
  const localTests = !production && runtime === 'test' && options.localTests === true;
  // Production requires the explicit env allowlist; Preview also trusts its Vercel URLs.
  const suppliedOrigins = production ? [] : (options.trustedOrigins || []);
  const trustedOrigins = Array.isArray(suppliedOrigins) ? [...suppliedOrigins] : [suppliedOrigins];
  trustedOrigins.push(...(env.CHAT_TRUSTED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
  if (preview) for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
    if (host && validOrigin('https://' + host, false)) trustedOrigins.push('https://' + host);
  }
  const validOrigins = Array.isArray(suppliedOrigins) && trustedOrigins.length > 0 && trustedOrigins.every(origin => validOrigin(origin, localTests));
  const configuredStore = options.store ? typeof options.store.transaction === 'function' : (env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
  const enabled = (options.CHAT_ENABLED === true || env.CHAT_ENABLED === 'true') &&
    Boolean(options.deepseekApiKey || env.DEEPSEEK_API_KEY) && typeof salt === 'string' && salt.length >= 8 && salt.length <= 256 &&
    Boolean(configuredStore) && validOrigins;
  return { env, runtime, production, preview, salt, localTests, trustedOrigins, enabled };
}

function flags(config) {
  return { CHAT_ENABLED: Boolean(config.enabled), CHAT_VOICE_ENABLED: false,
    CHAT_BROWSER_VOICE_ENABLED: false, environment: config.production ? 'production' : (config.preview ? 'preview' : 'disabled'),
    name: 'LAVAALL Assistant' };
}

async function requestSettings(options) {
  const config = settings(options);
  if (!config.enabled) return config;
  config.store = options.store || require('./_chat/store').kvStore({ url: config.env.KV_REST_API_URL, token: config.env.KV_REST_API_TOKEN });
  const record = await config.store.get('chat:kill');
  const expired = record && typeof record === 'object' && record.exp <= (options.now || Date.now)();
  const value = record && typeof record === 'object' ? record.value : record;
  const killed = !expired && [true, 'true', '1', 'kill'].includes(value);
  config.enabled = !killed;
  return config;
}

async function publicConfig(options = {}) {
  try { return flags(await requestSettings(options)); }
  // A failed read disables public config; config never needs a write.
  catch (_) { return flags({ ...settings(options), enabled: false }); }
}

function createHandler(options = {}) {
  return async function handler(req, res) {
    let config;
    try {
      if (req.query?.action === 'config' && ['GET', 'POST'].includes(req.method)) {
        const exposed = await publicConfig(options);
        return exposed.CHAT_ENABLED ? reply(res, 200, exposed) :
          reply(res, 503, { ...exposed, error: 'chat_disabled' });
      }
      if (req.method !== 'POST') return reply(res, 405, { error: 'method_not_allowed' });
      config = await requestSettings(options);
      const exposed = flags(config);
      if (!config.enabled) return reply(res, 503, { ...exposed, error: 'chat_disabled' });
      const { env, salt, store, localTests, trustedOrigins } = config;
      const { vendorSecret } = options;
      const chat = options.chat || (args => require('./_chat/llm-gateway').chat({ ...args, env }));
      const { previewDebug, previewLimits, ...serviceOptions } = options;
      const service = createService({ ...serviceOptions, store, salt, chat, env, runtime: config.preview ? 'preview' : config.runtime, trustedOrigins,
        ...(config.preview ? { previewDebug: true, previewLimits: true } : {}) });
      const headers = req.headers || {};
      const ip = String(headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
      const limit = await requestRateLimit(store, salt, ip, (options.now || Date.now)());
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfter));
        return reply(res, 429, { error: 'rate_limited', message: 'Please wait a moment and try again.' });
      }
      if (!/^application\/json(?:\s*;|$)/i.test(headers['content-type'] || '')) {
        return reply(res, 415, { error: 'json_required' });
      }
      let body = req.body;
      const serialized = typeof body === 'string' ? body : JSON.stringify(body || {});
      if (Buffer.byteLength(serialized) > 8192) {
        return reply(res, 413, { error: 'payload_too_large' });
      }
      if (typeof body === 'string') body = JSON.parse(body);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply(res, 400, { error: 'invalid_request' });
      }
      const action = req.query?.action;
      if (typeof action !== 'string' || !Object.hasOwn(ACTION_FIELDS, action)) {
        return reply(res, 400, { error: 'invalid_request' });
      }
      if (config.preview && ['draft', 'review', 'confirm'].includes(action) && env.CHAT_INQUIRY_DELIVERY !== 'true') return reply(res, 503, { error: 'delivery_disabled' });
      const allowed = ACTION_FIELDS[action];
      if (Object.keys(body).some(key => !allowed.includes(key))) {
        return reply(res, 400, { error: 'invalid_request' });
      }
      // Authenticate the provider before processing its draft inputs. This
      // credential never authorizes browser review, confirmation or sessions.
      if (action === 'draft' && (typeof vendorSecret !== 'string' ||
          vendorSecret.length < 32 || !equal(headers.authorization, 'Bearer ' + vendorSecret))) {
        return reply(res, 403, { error: 'forbidden' });
      }
      if (OPAQUE_FIELDS.some(key => allowed.includes(key) && !isOpaque(body[key]))) {
        return reply(res, 400, { error: 'invalid_request' });
      }
      if (action === 'turn' && config.preview && (typeof body.text !== 'string' || body.text.length > 2000)) return reply(res, 400, { error: 'invalid_request' });
      if (action === 'draft') {
        return reply(res, 200, await service.draft(body.sessionId, body.fields, body.eventId));
      }
      // Explicit configured origins only; never derive authority from Host.
      if (typeof headers.origin !== 'string' || !trustedOrigins.includes(headers.origin)) {
        return reply(res, 403, { error: 'origin' });
      }
      if (action === 'session') {
        const session = await service.start(String(headers['x-forwarded-for'] || 'unknown').split(',')[0].trim());
        const cookie = 'lavaall_chat=' + session.proof +
          '; HttpOnly; SameSite=Strict; Path=/api/chat-inquiry; Max-Age=1800' +
          (localTests ? '' : '; Secure');
        res.setHeader('Set-Cookie', cookie);
        return reply(res, 200, { sessionId: session.sessionId, csrf: session.csrf });
      }
      const cookies = typeof headers.cookie === 'string' ? headers.cookie.split(';')
        .map(cookie => cookie.trim()).filter(cookie => cookie.startsWith('lavaall_chat=')) : [];
      if (cookies.length !== 1) return reply(res, 403, { error: 'session' });
      const proof = cookies[0].slice('lavaall_chat='.length);
      if (!isOpaque(proof)) return reply(res, 403, { error: 'session' });
      let result;
      if (action === 'review') {
        result = await service.review(body.sessionId, proof, body.csrf, body.draftId);
      } else if (action === 'confirm') {
        result = await service.confirm(body.sessionId, proof, body.csrf, body.draftId, body.token, body.idempotencyKey, body.privacyConsent);
      } else if (action === 'turn') {
        // Text turns compute their reservation on the server before vendor I/O.
        result = await service.turn(body.sessionId, proof, body.eventId, options.turnReservationCents, body.csrf, body.text, { pageUrl: body.pageUrl, privacyConsent: body.privacyConsent });
      }
      return reply(res, 200, result);
    } catch (error) {
      const codes = ['quota', 'cost_cap', 'billing_unverified', 'session', 'csrf', 'draft', 'consent', 'privacy_consent', 'event', 'replay', 'fields', 'store_unavailable', 'turn_pending'];
      const code = codes.includes(error.code) ? error.code : 'invalid_request';
      if (config?.preview) console.warn('chat_inquiry', req.query && req.query.action, code);
      return reply(res, code === 'store_unavailable' ? 503 : code === 'quota' || code === 'cost_cap' ? 429 : 400, { error: code });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.publicConfig = publicConfig;
