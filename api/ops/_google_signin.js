// Google sign-in for LAVAALL OS founders.
// Authorization-code flow + server-side ID token checks. No npm.
// Underscore prefix so Vercel Hobby does not count this as a function.
//
// Authorized redirect URI (register each exact origin in Google Cloud Console):
//   https://www.lavaall.com/api/ops/auth
//   https://lavaall.com/api/ops/auth
//   https://<lavaal-preview-host>.vercel.app/api/ops/auth
// This flow does not use Authorized JavaScript origins.
// If the consent screen is in Testing, both founder Google accounts must be test users.

const crypto = require('crypto');
const {
  buildCookie,
  header,
  isAllowlisted,
  normalizeEmail,
  readSignedToken,
  sessionAudience,
  signToken,
  timingSafeEqualString,
} = require('./_lib');

const OAUTH_COOKIE = 'lavaall_ops_oauth';
const OAUTH_TTL_SEC = 10 * 60;
const GOOGLE_SKEW_MS = 30 * 1000;
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const REDIRECT_PATH = '/api/ops/auth';

const usedStates = new Map();
let jwksCache = { keys: null, exp: 0 };

function cleanClientId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 200 || /[\s&#?]/.test(id)) return '';
  return id;
}

function cleanSecret(value) {
  const secret = typeof value === 'string' ? value.trim() : '';
  if (!secret || secret.length > 500 || /[\r\n]/.test(secret)) return '';
  return secret;
}

function googleCredentials() {
  const dedicatedId = cleanClientId(process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID);
  const dedicatedSecret = cleanSecret(process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET);
  if (dedicatedId && dedicatedSecret) return { id: dedicatedId, secret: dedicatedSecret };
  if (dedicatedId || dedicatedSecret) return { id: '', secret: '' };
  return {
    id: cleanClientId(process.env.OPS_GMAIL_CLIENT_ID),
    secret: cleanSecret(process.env.OPS_GMAIL_CLIENT_SECRET),
  };
}

function googleClientId() {
  return googleCredentials().id;
}

function googleClientSecret() {
  return googleCredentials().secret;
}

function googleSignInConfigured() {
  const creds = googleCredentials();
  return Boolean(creds.id && creds.secret);
}

function genericGoogleFailure() {
  return 'Sign-in didn’t work. Try again.';
}

function isProjectPreviewHost(hostname) {
  return hostname === 'lavaal.vercel.app'
    || (hostname.startsWith('lavaal-') && hostname.endsWith('.vercel.app'));
}

function isAllowedOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return false;
  const host = url.hostname.toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1';
  if (local) return url.protocol === 'http:' || url.protocol === 'https:';
  if (url.protocol !== 'https:') return false;
  if (host === 'www.lavaall.com' || host === 'lavaall.com') return true;
  return isProjectPreviewHost(host);
}

function allowedOauthOrigin(req) {
  const rawHost = String(header(req, 'x-forwarded-host') || header(req, 'host') || '').split(',')[0].trim().toLowerCase();
  if (!rawHost || /[\s/\\@]/.test(rawHost)) return '';
  const hostname = rawHost.replace(/:\d+$/, '');
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const host = local ? rawHost : hostname;
  const protoHeader = String(header(req, 'x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const proto = protoHeader || (local ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  return isAllowedOrigin(origin) ? origin : '';
}

function redirectUriFor(origin) {
  return `${origin}${REDIRECT_PATH}`;
}

function codeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function createOAuthTransaction(origin) {
  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const token = signToken('oauth', {
    v: 1,
    state,
    nonce,
    cv: codeVerifier,
    origin,
    aud: sessionAudience(),
    exp: Date.now() + OAUTH_TTL_SEC * 1000,
  });
  return { state, nonce, codeVerifier, origin, token };
}

function readOAuthTransaction(token) {
  const read = readSignedToken('oauth', token);
  if (read.error || !read.payload) return null;
  const payload = read.payload;
  if (payload.v !== 1 || payload.aud !== sessionAudience()) return null;
  if (typeof payload.state !== 'string' || typeof payload.nonce !== 'string' || typeof payload.cv !== 'string' || typeof payload.origin !== 'string') {
    return null;
  }
  if (!Number.isFinite(payload.exp) || payload.exp + GOOGLE_SKEW_MS <= Date.now()) return null;
  if (!isAllowedOrigin(payload.origin)) return null;
  if (payload.state.length < 20 || payload.nonce.length < 20 || payload.cv.length < 20) return null;
  return {
    state: payload.state,
    nonce: payload.nonce,
    codeVerifier: payload.cv,
    origin: payload.origin,
    redirectUri: redirectUriFor(payload.origin),
    exp: payload.exp,
  };
}

function oauthStateCookie(token, req) {
  return buildCookie(OAUTH_COOKIE, encodeURIComponent(token), req, OAUTH_TTL_SEC);
}

function clearOAuthCookie(req) {
  return buildCookie(OAUTH_COOKIE, '', req, 0);
}

function consumeOAuthState(state, exp) {
  const now = Date.now();
  for (const [key, until] of usedStates) {
    if (until <= now) usedStates.delete(key);
  }
  if (usedStates.has(state)) return false;
  usedStates.set(state, exp);
  return true;
}

function buildAuthorizeUrl({ origin, state, nonce, codeVerifier }) {
  const clientId = googleClientId();
  if (!clientId || !isAllowedOrigin(origin)) return '';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUriFor(origin),
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    code_challenge: codeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
    access_type: 'online',
    include_granted_scopes: 'false',
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

function validAuthCode(code) {
  return typeof code === 'string' && code.length >= 8 && code.length <= 2048 && /^[A-Za-z0-9_\-/.~]+$/.test(code);
}

function fetchSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(8000);
  }
  return undefined;
}

async function exchangeAuthCode({ code, redirectUri, codeVerifier }) {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) return { ok: false, reason: 'not_configured' };
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    signal: fetchSignal(),
  });
  if (!response || !response.ok) return { ok: false, reason: 'exchange' };
  const parsed = await response.json();
  if (!parsed || typeof parsed.id_token !== 'string' || !parsed.id_token || parsed.id_token.length > 20000) {
    return { ok: false, reason: 'exchange' };
  }
  return { ok: true, idToken: parsed.id_token };
}

function decodePart(part) {
  try {
    const parsed = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function selectKey(keys, kid) {
  if (!Array.isArray(keys)) return null;
  return keys.find((key) => key
    && key.kid === kid
    && key.kty === 'RSA'
    && (key.alg === undefined || key.alg === 'RS256')
    && (key.use === undefined || key.use === 'sig')) || null;
}

async function loadJwks(opts) {
  if (Array.isArray(opts.keys)) return opts.keys;
  const now = Date.now();
  if (!opts.forceRefresh && jwksCache.keys && jwksCache.exp > now) return jwksCache.keys;
  const response = await fetch(GOOGLE_JWKS_URL, {
    headers: { Accept: 'application/json' },
    signal: fetchSignal(),
  });
  if (!response || !response.ok) {
    const err = new Error('jwks');
    err.reason = 'jwks';
    throw err;
  }
  const body = await response.json();
  if (!body || !Array.isArray(body.keys) || body.keys.length === 0) {
    const err = new Error('jwks');
    err.reason = 'jwks';
    throw err;
  }
  jwksCache = { keys: body.keys, exp: now + 60 * 60 * 1000 };
  return body.keys;
}

function verifyRs256(headerPart, payloadPart, signaturePart, jwk) {
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    return false;
  }
  try {
    return crypto.verify(
      'sha256',
      Buffer.from(`${headerPart}.${payloadPart}`),
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(signaturePart, 'base64url'),
    );
  } catch {
    return false;
  }
}

function issuerOk(iss) {
  return iss === 'accounts.google.com' || iss === 'https://accounts.google.com';
}

async function verifyGoogleIdToken(idToken, opts = {}) {
  const clientId = opts.clientId || googleClientId();
  if (!clientId || typeof idToken !== 'string') return { ok: false, reason: 'malformed' };
  const parts = idToken.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return { ok: false, reason: 'malformed' };
  const [headerPart, payloadPart, signaturePart] = parts;
  const tokenHeader = decodePart(headerPart);
  const payload = decodePart(payloadPart);
  if (!tokenHeader || !payload) return { ok: false, reason: 'malformed' };
  if (tokenHeader.alg !== 'RS256' || typeof tokenHeader.kid !== 'string' || !tokenHeader.kid) {
    return { ok: false, reason: 'bad_signature' };
  }

  let keys;
  try {
    keys = await loadJwks(opts);
  } catch {
    return { ok: false, reason: 'jwks' };
  }
  let jwk = selectKey(keys, tokenHeader.kid);
  if (!jwk && !Array.isArray(opts.keys)) {
    try {
      keys = await loadJwks({ forceRefresh: true });
    } catch {
      return { ok: false, reason: 'jwks' };
    }
    jwk = selectKey(keys, tokenHeader.kid);
  }
  if (!jwk || !verifyRs256(headerPart, payloadPart, signaturePart, jwk)) {
    return { ok: false, reason: 'bad_signature' };
  }

  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  if (!issuerOk(payload.iss)) return { ok: false, reason: 'bad_iss' };
  if (typeof payload.aud !== 'string' || payload.aud !== clientId) return { ok: false, reason: 'bad_aud' };
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return { ok: false, reason: 'expired' };
  if (payload.exp * 1000 + GOOGLE_SKEW_MS <= now) return { ok: false, reason: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf * 1000 - GOOGLE_SKEW_MS > now) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof opts.nonce !== 'string' || typeof payload.nonce !== 'string' || !timingSafeEqualString(payload.nonce, opts.nonce)) {
    return { ok: false, reason: 'bad_nonce' };
  }
  if (payload.email_verified !== true) return { ok: false, reason: 'unverified' };
  if (typeof payload.sub !== 'string' || !payload.sub) return { ok: false, reason: 'malformed' };
  if (typeof payload.email !== 'string') return { ok: false, reason: 'not_allowlisted' };
  const email = normalizeEmail(payload.email);
  if (!isAllowlisted(email)) return { ok: false, reason: 'not_allowlisted' };
  return { ok: true, email };
}

function logGoogle(event, reason) {
  const payload = { type: 'OpsGoogleSignIn', event };
  if (reason) payload.reason = reason;
  console.log(JSON.stringify(payload));
}

function resetGoogleSignInState() {
  usedStates.clear();
  jwksCache = { keys: null, exp: 0 };
}

module.exports = {
  OAUTH_COOKIE,
  allowedOauthOrigin,
  buildAuthorizeUrl,
  clearOAuthCookie,
  consumeOAuthState,
  createOAuthTransaction,
  exchangeAuthCode,
  genericGoogleFailure,
  googleClientId,
  googleSignInConfigured,
  logGoogle,
  oauthStateCookie,
  readOAuthTransaction,
  redirectUriFor,
  resetGoogleSignInState,
  validAuthCode,
  verifyGoogleIdToken,
};
