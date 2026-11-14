'use strict';
const { createService, equal } = require('./_chat/service');

const ACTION_FIELDS = Object.freeze({
  session: [],
  draft: ['sessionId', 'fields', 'eventId'],
  review: ['sessionId', 'csrf', 'draftId'],
  confirm: ['sessionId', 'csrf', 'draftId', 'token', 'idempotencyKey'],
  turn: ['sessionId', 'csrf', 'eventId', 'text'],
});
const OPAQUE_FIELDS = ['sessionId', 'draftId', 'token', 'csrf', 'idempotencyKey'];
const isOpaque = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).send(JSON.stringify(body));
}

function settings(options = {}) {
  const env = options.env || process.env;
  const runtime = options.runtime || env.VERCEL_ENV;
  const production = runtime === 'production' || process.env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'production';
  const preview = runtime === 'preview' || env.VERCEL_ENV === 'preview';
  const salt = options.salt || env.CHAT_IP_HASH_SALT;
  const configuredStore = options.store ? typeof options.store.transaction === 'function' : (env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
  const enabled = !production && preview && (options.CHAT_ENABLED === true || env.CHAT_ENABLED === 'true') &&
    Boolean(options.deepseekApiKey || env.DEEPSEEK_API_KEY) && typeof salt === 'string' && salt.length >= 8 && salt.length <= 256 && Boolean(configuredStore);
  return { env, runtime, production, preview, salt, enabled };
}
function publicConfig(options = {}) {
  const config = settings(options);
  return { CHAT_ENABLED: Boolean(config.enabled), CHAT_VOICE_ENABLED: false,
    CHAT_BROWSER_VOICE_ENABLED: false, environment: config.preview && !config.production ? 'preview' : (config.production ? 'production' : 'disabled'),
    name: 'LAVAALL Assistant' };
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

function createHandler(options = {}) {
  const config = settings(options);
  const { env, runtime, salt } = config;
  const { vendorSecret, transport } = options;
  const localTests = runtime === 'test' && options.localTests === true;
  const trustedOrigins = [...(options.trustedOrigins || []), ...(env.CHAT_TRUSTED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)];
  if (config.preview) for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
    if (host && validOrigin('https://' + host, false)) trustedOrigins.push('https://' + host);
  }
  const validOrigins = trustedOrigins.length > 0 && trustedOrigins.every(origin => validOrigin(origin, localTests));
  const testEnabled = options.CHAT_ENABLED === true && runtime === 'test' &&
    options.store?.kind === 'mock' && typeof transport === 'function' && validOrigins;
  const enabled = !config.production && validOrigins && (testEnabled || config.enabled);
  let store = options.store;
  if (enabled && !store) store = require('./_chat/store').kvStore({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN });
  const chat = options.chat || (enabled && config.preview ? args => require('./_chat/llm-gateway').chat({ ...args, env }) : undefined);
  const previewOnly = config.preview && !config.production;
  const service = enabled ? createService({ ...options, store, salt, chat, previewDebug: previewOnly, previewLimits: previewOnly }) : null;
  const exposed = { ...publicConfig(options), CHAT_ENABLED: Boolean(enabled) };

  return async function handler(req, res) {
    if (process.env.VERCEL_ENV === 'production') return reply(res, 503, { ...exposed, CHAT_ENABLED: false, environment: 'production', error: 'chat_disabled' });
    if (!enabled) return reply(res, 503, { ...exposed, error: 'chat_disabled' });
    try {
      if (req.query?.action === 'config' && ['GET', 'POST'].includes(req.method)) {
        // Public flags only; no secrets. Session and turns still require Origin.
        return reply(res, 200, exposed);
      }
      if (req.method !== 'POST') return reply(res, 405, { error: 'method_not_allowed' });
      const headers = req.headers || {};
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
      if (action === 'turn' && config.preview && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000)) return reply(res, 400, { error: 'invalid_request' });
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
        result = await service.confirm(body.sessionId, proof, body.csrf, body.draftId, body.token, body.idempotencyKey);
      } else if (action === 'turn') {
        // Text turns compute their reservation on the server before vendor I/O.
        result = await service.turn(body.sessionId, proof, body.eventId, options.turnReservationCents, body.csrf, body.text);
      }
      return reply(res, 200, result);
    } catch (error) {
      const codes = ['quota', 'cost_cap', 'billing_unverified', 'session', 'csrf', 'draft', 'consent', 'event', 'replay', 'fields', 'store_unavailable', 'turn_pending'];
      const code = codes.includes(error.code) ? error.code : 'invalid_request';
      if (config.preview) console.warn('chat_inquiry', req.query && req.query.action, code);
      return reply(res, code === 'store_unavailable' ? 503 : code === 'quota' || code === 'cost_cap' ? 429 : 400, { error: code });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.publicConfig = publicConfig;
