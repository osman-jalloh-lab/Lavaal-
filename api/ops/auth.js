// api/ops/auth.js — LAVAALL OS magic-link auth (Vercel serverless).
// POST action=request|logout  ·  GET ?token=… consumes a one-time link.
// JSON when Accept/Content-Type is application/json; otherwise HTML redirects.

const {
  authConfigured,
  clearSessionCookie,
  clientIp,
  consumeMagicToken,
  createMagicToken,
  createSessionToken,
  deliveryConfigured,
  genericLinkFailure,
  genericRequestMessage,
  isAllowlisted,
  isValidEmail,
  json,
  payloadTooLarge,
  publicOrigin,
  queryOf,
  rateLimited,
  readBody,
  readSession,
  redirect,
  sendMagicLink,
  sessionCookie,
  wantsJson,
} = require('./_lib');

function requestFailed(req, res, status, error, message) {
  if (wantsJson(req)) return json(res, status, { error, message });
  return redirect(res, `/ops?error=${encodeURIComponent(message)}`);
}

async function handleRequest(req, res) {
  if (!authConfigured()) {
    return requestFailed(req, res, 503, 'auth_not_configured', 'Sign-in is not configured yet.');
  }
  if (!deliveryConfigured()) {
    return requestFailed(req, res, 503, 'delivery_not_configured', 'Magic-link email sending is not configured yet.');
  }
  if (payloadTooLarge(req)) return requestFailed(req, res, 413, 'payload_too_large', 'Request is too large.');

  const body = readBody(req);
  if (body.website) {
    return wantsJson(req)
      ? json(res, 200, { accepted: true, message: genericRequestMessage() })
      : redirect(res, '/ops?sent=1');
  }

  const ip = clientIp(req);
  if (rateLimited(`ip:${ip}`, 30_000)) {
    return requestFailed(req, res, 429, 'rate_limited', 'Please wait a moment before requesting another link.');
  }

  const email = typeof body.email === 'string' ? body.email : '';
  if (!isValidEmail(email)) {
    return requestFailed(req, res, 400, 'invalid_email', 'Enter a valid email address.');
  }

  if (isAllowlisted(email)) {
    const token = createMagicToken(email);
    const loginUrl = `${publicOrigin(req)}/api/ops/auth?token=${encodeURIComponent(token)}`;
    try {
      await sendMagicLink({ to: email.trim(), loginUrl });
    } catch (err) {
      const code = err && err.code === 'delivery_not_configured' ? 'delivery_not_configured' : 'delivery_failed';
      const status = code === 'delivery_not_configured' ? 503 : 502;
      return requestFailed(req, res, status, code, 'We could not send a sign-in link. Try again shortly.');
    }
  }

  if (wantsJson(req)) return json(res, 200, { accepted: true, message: genericRequestMessage() });
  return redirect(res, '/ops?sent=1');
}

function handleVerify(req, res) {
  if (!authConfigured()) {
    return wantsJson(req)
      ? json(res, 503, { error: 'auth_not_configured' })
      : redirect(res, '/ops?error=' + encodeURIComponent('Sign-in is not configured yet.'));
  }
  const rawToken = queryOf(req).token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const result = consumeMagicToken(token);
  if (!result.email) {
    return wantsJson(req)
      ? json(res, 400, { error: result.error || 'invalid', message: genericLinkFailure() })
      : redirect(res, '/ops?error=' + encodeURIComponent(genericLinkFailure()));
  }
  const cookie = sessionCookie(createSessionToken(result.email), req);
  if (wantsJson(req)) {
    res.setHeader('Set-Cookie', cookie);
    return json(res, 200, { ok: true, email: result.email });
  }
  return redirect(res, '/ops', cookie);
}

function handleLogout(req, res) {
  const cookie = clearSessionCookie(req);
  if (wantsJson(req)) {
    res.setHeader('Set-Cookie', cookie);
    return json(res, 200, { ok: true });
  }
  return redirect(res, '/ops', cookie);
}

function handleSession(req, res) {
  const session = readSession(req);
  if (!session) return json(res, 401, { authenticated: false });
  return json(res, 200, { authenticated: true, email: session.email });
}

async function auth(req, res) {
  const query = queryOf(req);

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (query.token) return handleVerify(req, res);
    if (wantsJson(req) || query.action === 'session') return handleSession(req, res);
    const session = readSession(req);
    return redirect(res, session ? '/ops' : '/ops?error=' + encodeURIComponent('Sign in required.'));
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const body = readBody(req);
  const action = String(query.action || body.action || 'request');
  switch (action) {
    case 'request':
      return handleRequest(req, res);
    case 'logout':
      return handleLogout(req, res);
    case 'session':
      return handleSession(req, res);
    default:
      return json(res, 400, { error: 'unknown_action' });
  }
}

module.exports = auth;
