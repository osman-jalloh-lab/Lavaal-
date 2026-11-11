'use strict';
const { createService, equal } = require('./_chat/service');

const ACTION_FIELDS = Object.freeze({
  session: [],
  draft: ['sessionId', 'fields', 'eventId'],
  review: ['sessionId', 'csrf', 'draftId'],
  confirm: ['sessionId', 'csrf', 'draftId', 'token', 'idempotencyKey'],
  turn: ['sessionId', 'csrf', 'eventId'],
});
const OPAQUE_FIELDS = ['sessionId', 'draftId', 'token', 'csrf', 'idempotencyKey'];
const isOpaque = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).send(JSON.stringify(body));
}

// No production adapters in A1. Env assertions cannot verify vendor enforcement.
function publicConfig() {
  return {
    CHAT_ENABLED: false,
    CHAT_VOICE_ENABLED: false,
    agentId: 'UNCONFIGURED',
    reason: 'a1_unverified_controls',
  };
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
  const { store, vendorSecret, runtime, transport } = options;
  const localTests = runtime === 'test' && options.localTests === true;
  const trustedOrigins = options.trustedOrigins || [];
  const validOrigins = Array.isArray(trustedOrigins) && trustedOrigins.length > 0 &&
    trustedOrigins.every(origin => validOrigin(origin, localTests));
  const enabled = options.CHAT_ENABLED === true && runtime === 'test' &&
    store?.kind === 'mock' && typeof transport === 'function' && validOrigins;
  const service = enabled ? createService(options) : null;

  return async function handler(req, res) {
    if (!enabled) return reply(res, 503, { ...publicConfig(), error: 'chat_disabled' });
    try {
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
        // Reservation is server configured, never model supplied; still mock only.
        result = await service.turn(body.sessionId, proof, body.eventId, options.turnReservationCents, body.csrf);
      }
      return reply(res, 200, result);
    } catch (error) {
      const codes = ['quota', 'cost_cap', 'billing_unverified', 'session', 'csrf', 'draft', 'consent', 'event', 'replay', 'fields'];
      const code = codes.includes(error.code) ? error.code : 'invalid_request';
      return reply(res, code === 'quota' || code === 'cost_cap' ? 429 : 400, { error: code });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.publicConfig = publicConfig;
