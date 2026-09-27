// api/ops/auth.js — LAVAALL OS founder sign-in (Vercel serverless).
// Founders sign in with Google. The server checks the ID token and allowlist.
// Email-only instant login does not issue a session in any environment.
// POST action=google|request|logout|signout-all  ·  GET ?code=&state= Google callback
// GET ?token=… still consumes a one-time magic link when one was delivered.

const { loginPage } = require('./_html');
const {
  authConfigured,
  clearSessionCookie,
  clientIp,
  consumeMagicToken,
  createMagicToken,
  createSessionToken,
  deliverMagicLink,
  deliveryConfigured,
  genericLinkFailure,
  genericRequestMessage,
  genericSignInFailure,
  genericRateLimitMessage,
  isAllowlisted,
  looksLikeAgentRequest,
  isValidEmail,
  json,
  noStore,
  parseCookies,
  payloadTooLarge,
  publicOrigin,
  queryOf,
  rateLimited,
  readBody,
  readCsrfToken,
  redirect,
  sessionCookie,
  timingSafeEqualString,
  wantsJson,
  header,
} = require('./_lib');
const {
  bumpSessionGeneration,
  domainOf,
  mintSessionToken,
  noteSignIn,
  readLiveSession,
  rejectedWho,
  signInHardeningEnabled,
} = require('./_signin_hardening');
const {
  OAUTH_COOKIE,
  allowedOauthOrigin,
  buildAuthorizeUrl,
  clearOAuthCookie,
  consumeOAuthState,
  createOAuthTransaction,
  exchangeAuthCode,
  genericGoogleFailure,
  googleSignInConfigured,
  logGoogle,
  oauthStateCookie,
  readOAuthTransaction,
  validAuthCode,
  verifyGoogleIdToken,
} = require('./_google_signin');

// Separate buckets so one Google round trip does not spend two tries.
const GOOGLE_AUTH_MAX_HITS = 5;
const GOOGLE_AUTH_WINDOW_MS = 60_000;

function requestFailed(req, res, status, error, message) {
  if (wantsJson(req)) return json(res, status, { error, message });
  return redirect(res, `/ops?error=${encodeURIComponent(message)}`);
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function failGoogle(req, res, status, clearCookie) {
  const code = status || 401;
  const cookie = clearCookie ? clearOAuthCookie(req) : undefined;
  if (wantsJson(req)) {
    if (cookie) res.setHeader('Set-Cookie', cookie);
    return json(res, code, { error: 'sign_in_failed', message: genericGoogleFailure() });
  }
  return redirect(res, `/ops?error=${encodeURIComponent(genericGoogleFailure())}`, cookie);
}

function handleGoogleStart(req, res) {
  if (looksLikeAgentRequest(req)) {
    return requestFailed(req, res, 403, 'agent_denied', genericGoogleFailure());
  }
  if (!authConfigured() || !googleSignInConfigured()) {
    return requestFailed(req, res, 503, 'auth_not_configured', 'Sign-in is not configured yet.');
  }
  if (payloadTooLarge(req)) return requestFailed(req, res, 413, 'payload_too_large', 'Request is too large.');

  const body = readBody(req);
  if (body.website) {
    return wantsJson(req)
      ? json(res, 200, { accepted: true, message: genericGoogleFailure() })
      : redirect(res, '/ops');
  }

  const ip = clientIp(req);
  if (rateLimited(`google-start:${ip}`, GOOGLE_AUTH_WINDOW_MS, GOOGLE_AUTH_MAX_HITS)) {
    return requestFailed(req, res, 429, 'rate_limited', genericRateLimitMessage());
  }

  const origin = allowedOauthOrigin(req);
  if (!origin) return failGoogle(req, res, 400);

  const tx = createOAuthTransaction(origin);
  const url = buildAuthorizeUrl({
    origin,
    state: tx.state,
    nonce: tx.nonce,
    codeVerifier: tx.codeVerifier,
  });
  if (!url) return requestFailed(req, res, 503, 'auth_not_configured', 'Sign-in is not configured yet.');

  const cookie = oauthStateCookie(tx.token, req);
  logGoogle('start');
  if (wantsJson(req)) {
    res.setHeader('Set-Cookie', cookie);
    return json(res, 200, { ok: true, redirect: url });
  }
  return redirect(res, url, cookie);
}

async function handleGoogleCallback(req, res) {
  if (looksLikeAgentRequest(req)) {
    return requestFailed(req, res, 403, 'agent_denied', genericGoogleFailure());
  }
  if (!authConfigured() || !googleSignInConfigured()) {
    return requestFailed(req, res, 503, 'auth_not_configured', 'Sign-in is not configured yet.');
  }

  const ip = clientIp(req);
  if (rateLimited(`google-callback:${ip}`, GOOGLE_AUTH_WINDOW_MS, GOOGLE_AUTH_MAX_HITS)) {
    return requestFailed(req, res, 429, 'rate_limited', genericRateLimitMessage());
  }

  const query = queryOf(req);
  const code = firstQueryValue(query.code);
  const state = firstQueryValue(query.state);
  if (query.error || !validAuthCode(code) || typeof state !== 'string' || state.length < 20 || state.length > 200) {
    logGoogle('rejected', 'callback');
    await noteSignIn(req, 'rejected: unknown', 'rejected');
    return failGoogle(req, res);
  }

  const cookies = parseCookies(req);
  const tx = readOAuthTransaction(cookies[OAUTH_COOKIE]);
  if (!tx || !timingSafeEqualString(tx.state, state)) {
    logGoogle('rejected', 'state');
    await noteSignIn(req, 'rejected: unknown', 'rejected');
    return failGoogle(req, res);
  }
  if (!consumeOAuthState(tx.state, tx.exp)) {
    logGoogle('rejected', 'state');
    await noteSignIn(req, 'rejected: unknown', 'rejected');
    return failGoogle(req, res, 401, true);
  }

  let exchanged;
  try {
    exchanged = await exchangeAuthCode({
      code,
      redirectUri: tx.redirectUri,
      codeVerifier: tx.codeVerifier,
    });
  } catch {
    logGoogle('rejected', 'exchange');
    await noteSignIn(req, 'rejected: unknown', 'rejected');
    return failGoogle(req, res, 503, true);
  }
  if (!exchanged.ok) {
    logGoogle('rejected', exchanged.reason || 'exchange');
    await noteSignIn(req, 'rejected: unknown', 'rejected');
    return failGoogle(req, res, 401, true);
  }

  let verified;
  try {
    verified = await verifyGoogleIdToken(exchanged.idToken, { nonce: tx.nonce });
  } catch {
    logGoogle('rejected', 'verify');
    await noteSignIn(req, 'rejected: unknown', 'rejected');
    return failGoogle(req, res, 503, true);
  }
  if (!verified.ok) {
    logGoogle('rejected', verified.reason);
    const who = verified.reason === 'not_allowlisted'
      ? rejectedWho(verified.domain)
      : 'rejected: unknown';
    await noteSignIn(req, who, 'rejected');
    return failGoogle(req, res, 401, true);
  }

  const session = sessionCookie(await mintSessionToken(verified.email), req);
  await noteSignIn(req, verified.email, 'signed_in');
  const clear = clearOAuthCookie(req);
  logGoogle('ok');
  if (wantsJson(req)) {
    res.setHeader('Set-Cookie', [session, clear]);
    return json(res, 200, { ok: true, email: verified.email, via: 'google' });
  }
  return redirect(res, '/ops', [session, clear]);
}

async function handleRequest(req, res) {
  if (looksLikeAgentRequest(req)) {
    return requestFailed(req, res, 403, 'agent_denied', genericSignInFailure());
  }
  if (!authConfigured()) {
    return requestFailed(req, res, 503, 'auth_not_configured', 'Sign-in is not configured yet.');
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
    return requestFailed(req, res, 429, 'rate_limited', genericRateLimitMessage());
  }

  const email = typeof body.email === 'string' ? body.email : '';
  if (!isValidEmail(email)) {
    return requestFailed(req, res, 400, 'invalid_email', 'Enter a valid email address.');
  }

  if (!deliveryConfigured()) {
    return requestFailed(req, res, 503, 'delivery_not_configured', 'Magic-link email sending is not configured yet.');
  }

  if (isAllowlisted(email)) {
    const token = createMagicToken(email);
    const loginUrl = `${publicOrigin(req)}/api/ops/auth?token=${encodeURIComponent(token)}`;
    const result = await deliverMagicLink({ to: email.trim(), loginUrl });
    if (!result.ok) {
      const code = result.code === 'delivery_not_configured' ? 'delivery_not_configured' : 'delivery_failed';
      const status = code === 'delivery_not_configured' ? 503 : 502;
      return requestFailed(req, res, status, code, 'We could not send a sign-in link. Try again shortly.');
    }
    if (result.via === 'preview_inline' && result.previewLoginUrl) {
      if (wantsJson(req)) {
        return json(res, 200, {
          accepted: true,
          message: genericRequestMessage(),
          via: 'preview_inline',
          previewLoginUrl: result.previewLoginUrl,
        });
      }
      noStore(res, 'text/html; charset=utf-8');
      return res.status(200).send(loginPage({ sent: true, previewLoginUrl: result.previewLoginUrl }));
    }
    if (wantsJson(req)) {
      return json(res, 200, { accepted: true, message: genericRequestMessage(), via: result.via });
    }
    return redirect(res, '/ops?sent=1');
  }

  await noteSignIn(req, rejectedWho(domainOf(email)), 'rejected');
  if (wantsJson(req)) return json(res, 200, { accepted: true, message: genericRequestMessage() });
  return redirect(res, '/ops?sent=1');
}

async function handleVerify(req, res) {
  if (!authConfigured()) {
    return wantsJson(req)
      ? json(res, 503, { error: 'auth_not_configured' })
      : redirect(res, '/ops?error=' + encodeURIComponent('Sign-in is not configured yet.'));
  }
  const rawToken = queryOf(req).token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const result = consumeMagicToken(token);
  if (!result.email) {
    await noteSignIn(req, 'rejected: unknown', 'rejected');
    return wantsJson(req)
      ? json(res, 400, { error: result.error || 'invalid', message: genericLinkFailure() })
      : redirect(res, '/ops?error=' + encodeURIComponent(genericLinkFailure()));
  }
  const cookie = sessionCookie(await mintSessionToken(result.email), req);
  await noteSignIn(req, result.email, 'signed_in');
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

function csrfFrom(req, body) {
  return (body && body.csrf)
    || header(req, 'x-csrf-token')
    || header(req, 'x-csrf');
}

async function handleSignOutAll(req, res) {
  if (!signInHardeningEnabled()) {
    return wantsJson(req) ? json(res, 404, { error: 'not_found' }) : redirect(res, '/ops');
  }
  if (looksLikeAgentRequest(req)) {
    return requestFailed(req, res, 403, 'agent_denied', genericSignInFailure());
  }
  if (!authConfigured()) {
    return requestFailed(req, res, 503, 'auth_not_configured', 'Sign-in is not configured yet.');
  }
  if (payloadTooLarge(req)) return requestFailed(req, res, 413, 'payload_too_large', 'Request is too large.');

  const session = await readLiveSession(req);
  if (!session) {
    return wantsJson(req)
      ? json(res, 401, { error: 'sign_in_required' })
      : redirect(res, '/ops?error=' + encodeURIComponent('Sign in required.'));
  }
  if (rateLimited(`signout-all:${clientIp(req)}`, 30_000)) {
    return requestFailed(req, res, 429, 'rate_limited', genericRateLimitMessage());
  }
  const body = readBody(req);
  if (!readCsrfToken(csrfFrom(req, body), session.email)) {
    return wantsJson(req)
      ? json(res, 403, { error: 'csrf' })
      : redirect(res, '/ops?signout=rejected');
  }

  const bumped = await bumpSessionGeneration();
  if (!bumped.ok) {
    return wantsJson(req)
      ? json(res, 503, { error: 'store_unavailable' })
      : redirect(res, '/ops?signout=unavailable');
  }

  const cookie = sessionCookie(createSessionToken(session.email, { generation: bumped.generation }), req);
  await noteSignIn(req, session.email, 'signed_out_all');
  if (wantsJson(req)) {
    res.setHeader('Set-Cookie', cookie);
    return json(res, 200, { ok: true });
  }
  return redirect(res, '/ops?revoked=1', cookie);
}

async function handleSession(req, res) {
  const session = await readLiveSession(req);
  if (!session) return json(res, 401, { authenticated: false });
  return json(res, 200, { authenticated: true, email: session.email });
}

async function auth(req, res) {
  const query = queryOf(req);

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (query.code || query.state || (query.error && !query.token)) return handleGoogleCallback(req, res);
    if (query.token) return handleVerify(req, res);
    if (wantsJson(req) || query.action === 'session') return handleSession(req, res);
    const session = await readLiveSession(req);
    return redirect(res, session ? '/ops' : '/ops?error=' + encodeURIComponent('Sign in required.'));
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const body = readBody(req);
  const action = String(query.action || body.action || 'request');
  switch (action) {
    case 'request':
      return handleRequest(req, res);
    case 'google':
      return handleGoogleStart(req, res);
    case 'logout':
      return handleLogout(req, res);
    case 'signout-all':
      return handleSignOutAll(req, res);
    case 'session':
      return handleSession(req, res);
    default:
      return json(res, 400, { error: 'unknown_action' });
  }
}

module.exports = auth;
