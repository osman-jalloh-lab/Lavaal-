// Tests for api/ops allowlist auth — mocks req/res/fetch so these run in plain node.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const auth = require(path.join(opsDir, 'auth.js'));
const ops = require(path.join(opsDir, 'index.js'));
const google = require(path.join(opsDir, '_google_signin.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'Osmanjalloh104@gmail.com';
const ALLOWED_2 = 'abdulhbah55@gmail.com';
const DENIED = 'stranger@example.com';

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => {
    const key = String(k);
    if (key.toLowerCase() === 'set-cookie' && res.headers['Set-Cookie']) {
      const prev = res.headers['Set-Cookie'];
      res.headers['Set-Cookie'] = Array.isArray(prev) ? prev.concat(v) : [prev, v];
    } else {
      res.headers[key] = v;
    }
    return res;
  };
  res.send = (b) => {
    res.raw = b;
    if (typeof b === 'string' && (b.startsWith('{') || b.startsWith('['))) {
      try { res.body = JSON.parse(b); } catch { res.body = b; }
    } else {
      res.body = b;
    }
    return res;
  };
  return res;
}

function jsonReq(extra) {
  return {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      host: 'preview.example.test',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '203.0.113.10',
      ...(extra && extra.headers),
    },
    query: extra && extra.query,
    url: extra && extra.url,
    body: extra && extra.body,
  };
}

function cookieFrom(res) {
  const raw = res.headers['Set-Cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) return '';
  return String(first).split(';')[0];
}

function extractLoginUrl(text) {
  const match = String(text || '').match(/https?:\/\/\S+/);
  return match ? match[0] : '';
}

function tokenFromUrl(url) {
  try {
    return new URL(url).searchParams.get('token') || '';
  } catch {
    return '';
  }
}

function versionedSession(email, version, aud) {
  const raw = Buffer.from(JSON.stringify({
    v: version,
    e: String(email).trim().toLowerCase(),
    aud,
    iat: Date.now(),
    exp: Date.now() + 60_000,
  }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(`session:${raw}`, 'utf8').digest('base64url');
  return `${raw}.${sig}`;
}

function legacySessionToken(email) {
  const raw = Buffer.from(JSON.stringify({
    v: 1,
    e: String(email).trim().toLowerCase(),
    iat: Date.now(),
    exp: Date.now() + 60_000,
  }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(`session:${raw}`, 'utf8').digest('base64url');
  return `${raw}.${sig}`;
}

function legacyMagicToken(email) {
  const raw = Buffer.from(JSON.stringify({
    v: 1,
    e: String(email).trim().toLowerCase(),
    exp: Date.now() + 60_000,
    jti: 'legacy-test-token',
  }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(`magic:${raw}`, 'utf8').digest('base64url');
  return `${raw}.${sig}`;
}

function clearDeliveryEnv() {
  delete process.env.RESEND_API_KEY;
  delete process.env.OPS_FROM_EMAIL;
  delete process.env.OPS_MAGIC_LINK_WEBHOOK_URL;
  delete process.env.OPS_MAGIC_LINK_WEBHOOK_SECRET;
  delete process.env.OPS_GMAIL_CLIENT_ID;
  delete process.env.OPS_GMAIL_CLIENT_SECRET;
  delete process.env.OPS_GMAIL_REFRESH_TOKEN;
  delete process.env.OPS_GMAIL_FROM;
  delete process.env.OPS_PREVIEW_INLINE_LINK;
  delete process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID;
  delete process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET;
}

function setGmailEnv() {
  process.env.OPS_GMAIL_CLIENT_ID = 'gmail-client-id';
  process.env.OPS_GMAIL_CLIENT_SECRET = 'gmail-client-secret';
  process.env.OPS_GMAIL_REFRESH_TOKEN = 'gmail-refresh-token';
  process.env.OPS_GMAIL_FROM = 'Osmanjalloh104@gmail.com';
}

function mockMailFetch(handler) {
  const fetchCalls = [];
  global.fetch = async (url, opts) => {
    const raw = opts && opts.body ? String(opts.body) : '';
    let body = raw;
    try { body = JSON.parse(raw); } catch { /* urlencoded */ }
    fetchCalls.push({ url: String(url), body, raw, headers: opts && opts.headers ? opts.headers : {} });
    return handler(String(url), opts, fetchCalls[fetchCalls.length - 1]);
  };
  return fetchCalls;
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  clearDeliveryEnv();
  delete process.env.OPS_PREVIEW_INSTANT_LOGIN;
  delete process.env.OPS_INSTANT_LOGIN;
  delete process.env.VERCEL_ENV;
  process.env.OPS_MAGIC_LINK_WEBHOOK_URL = 'https://example.test/ops-mail';
  process.env.OPS_MAGIC_LINK_WEBHOOK_SECRET = 'hook-secret';
  delete process.env.OPS_PUBLIC_URL;
  lib.resetAuthState();

  check('allowlist is exactly the two founder emails',
    lib.ALLOWLIST.length === 2
    && lib.isAllowlisted(ALLOWED)
    && lib.isAllowlisted(ALLOWED_2)
    && lib.isAllowlisted('ABDULHBAH55@GMAIL.COM')
    && !lib.isAllowlisted(DENIED)
    && !lib.isAllowlisted('osmanjalloh104@gmail.com.evil.com'));

  check('magic-link TTL is 10 minutes or less', lib.MAGIC_TTL_MS <= 10 * 60 * 1000);

  {
    const res = mockRes();
    await ops({ method: 'GET', headers: {}, query: {}, url: '/ops' }, res);
    check('/ops without a session returns the login page (401)', res.statusCode === 401);
    check('/ops login HTML does not include allowlisted emails', !String(res.raw).toLowerCase().includes('osmanjalloh104@gmail.com') && !String(res.raw).toLowerCase().includes('abdulhbah55@gmail.com'));
    check('/ops login HTML has no public signup CTA', !/sign up|create account|register/i.test(String(res.raw)));
    check('/ops login HTML is Option I cream workspace', String(res.raw).includes('--canvas:#EDE7E0') && String(res.raw).includes('--surface:#F3EEE7') && String(res.raw).includes('#2EC4FF') && String(res.raw).includes('--emerald:#10B981') && !String(res.raw).includes('#0B1424'));
    check('/ops login is Sign in with Google on the warm palette',
      String(res.raw).includes('Sign in with Google')
      && String(res.raw).includes('name="action" value="google"')
      && String(res.raw).includes('class="btn"')
      && !String(res.raw).includes('name="email"')
      && !/allowlisted|work floor|Email me a sign-in link/i.test(String(res.raw)));
    const policy = String(res.raw).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
    const directives = policy ? policy[1].split(';').map((part) => part.trim()) : [];
    const forms = String(res.raw).match(/<form\b/g) || [];
    check('one Sign in with Google click can follow the redirect to Google',
      forms.length === 1
      && String(res.raw).includes('method="POST" action="/api/ops/auth"')
      && String(res.raw).includes('type="submit"')
      && !/<script/i.test(String(res.raw))
      && directives.includes("form-action 'self' https://accounts.google.com"));
  }

  {
    clearDeliveryEnv();
    process.env.OPS_INSTANT_LOGIN = '1';
    process.env.OPS_PREVIEW_INSTANT_LOGIN = '1';
    process.env.OPS_MAGIC_LINK_WEBHOOK_URL = 'https://example.test/ops-mail';
    process.env.OPS_MAGIC_LINK_WEBHOOK_SECRET = 'hook-secret';
    const envs = ['production', 'preview', 'development', ''];
    for (let i = 0; i < envs.length; i += 1) {
      const envName = envs[i];
      if (envName) process.env.VERCEL_ENV = envName;
      else delete process.env.VERCEL_ENV;
      lib.resetAuthState();
      const fetchCalls = [];
      global.fetch = async (url, opts) => {
        fetchCalls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
        return { ok: true, status: 200 };
      };
      const res = mockRes();
      await auth(jsonReq({
        headers: { 'x-forwarded-for': `203.0.113.${70 + i}` },
        body: { action: 'request', email: ALLOWED, id_token: 'eyJhbGciOiJub25lIn0.e30.x' },
      }), res);
      const setCookie = String(res.headers['Set-Cookie'] || '');
      const label = envName || 'local';
      check(`email-only POST does not issue a session when VERCEL_ENV=${label}`,
        !/lavaall_ops=/.test(setCookie)
        && !(res.body && res.body.via === 'instant')
        && res.statusCode !== 302);
    }
    check('instant login stays off even if the old env flags are set',
      lib.instantLoginEnabled() === false);
    delete process.env.OPS_INSTANT_LOGIN;
    delete process.env.OPS_PREVIEW_INSTANT_LOGIN;
    delete process.env.VERCEL_ENV;
  }

  {
    process.env.VERCEL_ENV = 'production';
    process.env.OPS_INSTANT_LOGIN = '1';
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({
      headers: { 'x-forwarded-for': '203.0.113.72', authorization: 'Bearer simulated-agent-token' },
      body: { action: 'request', email: ALLOWED },
    }), res);
    check('agent cannot obtain a session by posting an allowlisted email',
      res.statusCode === 403
      && res.body.error === 'agent_denied'
      && !/lavaall_ops=/.test(String(res.headers['Set-Cookie'] || ''))
      && !/requesting another|sign-in link|magic/i.test(JSON.stringify(res.body)));
    delete process.env.OPS_INSTANT_LOGIN;
    delete process.env.VERCEL_ENV;
  }

  {
    process.env.VERCEL_ENV = 'production';
    const oldSession = legacySessionToken(ALLOWED);
    const versionTwo = versionedSession(ALLOWED, 2, 'production');
    check('session version 3 rejects version 2 instant-login cookies',
      lib.SESSION_VERSION === 3
      && lib.readSessionToken(oldSession) === null
      && lib.readSessionToken(versionTwo) === null);
    const oldCookie = mockRes();
    await auth({
      method: 'GET',
      headers: {
        accept: 'application/json',
        host: 'www.lavaall.com',
        cookie: `${lib.SESSION_COOKIE}=${encodeURIComponent(versionTwo)}`,
      },
      query: { action: 'session' },
    }, oldCookie);
    check('old-version session cookie is rejected',
      oldCookie.statusCode === 401 && oldCookie.body && oldCookie.body.authenticated === false);

    const productionSession = lib.createSessionToken(ALLOWED);
    process.env.VERCEL_ENV = 'preview';
    check('production session cookies cannot be replayed on Preview', lib.readSessionToken(productionSession) === null);
    process.env.VERCEL_ENV = 'production';
    check('current production session cookie remains valid in Production', Boolean(lib.readSessionToken(productionSession)));

    const oldMagic = legacyMagicToken(ALLOWED);
    check('magic-link version bump rejects links minted by the prior token version',
      lib.MAGIC_VERSION === 2 && !lib.consumeMagicToken(oldMagic).email);
    process.env.VERCEL_ENV = 'preview';
    const previewMagic = lib.createMagicToken(ALLOWED);
    process.env.VERCEL_ENV = 'production';
    check('Preview magic links cannot be replayed on Production', !lib.consumeMagicToken(previewMagic).email);
    delete process.env.VERCEL_ENV;
  }

  {
    clearDeliveryEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.OPS_INSTANT_LOGIN = '0';
    process.env.OPS_MAGIC_LINK_WEBHOOK_URL = 'https://example.test/ops-mail';
    process.env.OPS_MAGIC_LINK_WEBHOOK_SECRET = 'hook-secret';
    process.env.OPS_INSTANT_LOGIN = '1';
    check('OPS_INSTANT_LOGIN=1 still cannot enable instant login on Preview', lib.instantLoginEnabled() === false);
    const fetchCalls = [];
    global.fetch = async (url, opts) => {
      fetchCalls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200 };
    };
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.77' }, body: { action: 'request', email: ALLOWED } }), res);
    check('Preview magic-link fallback sends mail when instant is off',
      res.statusCode === 200
      && res.body && res.body.accepted === true
      && res.body.via !== 'instant'
      && !res.headers['Set-Cookie']
      && fetchCalls.length === 1
      && fetchCalls[0].url === 'https://example.test/ops-mail');
    delete process.env.OPS_INSTANT_LOGIN;
  }

  {
    clearDeliveryEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.OPS_INSTANT_LOGIN = '0';
    process.env.RESEND_API_KEY = 're_primary';
    process.env.OPS_FROM_EMAIL = 'LAVAALL OS <os@test.example>';
    const fetchCalls = mockMailFetch(async (url) => {
      if (url.includes('api.resend.com')) return { ok: true, status: 200, text: async () => '{}' };
      return { ok: false, status: 500, text: async () => '{}' };
    });
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.78' }, body: { action: 'request', email: ALLOWED } }), res);
    check('Preview Resend magic-link works when instant is off',
      res.statusCode === 200
      && res.body && res.body.via === 'resend'
      && fetchCalls.some((call) => call.url.includes('api.resend.com'))
      && !res.headers['Set-Cookie']);
    delete process.env.OPS_INSTANT_LOGIN;
    delete process.env.VERCEL_ENV;
  }

  {
    delete process.env.VERCEL_ENV;
    delete process.env.OPS_PREVIEW_INSTANT_LOGIN;
    delete process.env.OPS_INSTANT_LOGIN;
    clearDeliveryEnv();
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.74' }, body: { action: 'request', email: ALLOWED } }), res);
    check('request without a mail sender returns 503 for everyone', res.statusCode === 503 && res.body && res.body.error === 'delivery_not_configured');
    process.env.OPS_MAGIC_LINK_WEBHOOK_URL = 'https://example.test/ops-mail';
    process.env.OPS_MAGIC_LINK_WEBHOOK_SECRET = 'hook-secret';
  }

  {
    const fetchCalls = [];
    global.fetch = async (url, opts) => {
      fetchCalls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200 };
    };
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.20' }, body: { action: 'request', email: DENIED } }), res);
    check('non-allowlisted request is accepted without sending mail', res.statusCode === 200 && res.body.accepted === true && fetchCalls.length === 0);
    check('non-allowlisted message does not confirm the account is unknown', /authorized/i.test(res.body.message));
  }

  let magicUrl = '';
  {
    const fetchCalls = [];
    global.fetch = async (url, opts) => {
      fetchCalls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200 };
    };
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.21' }, body: { action: 'request', email: ALLOWED } }), res);
    magicUrl = extractLoginUrl(fetchCalls[0] && fetchCalls[0].body && fetchCalls[0].body.text);
    check('allowlisted request sends one magic-link email', res.statusCode === 200 && fetchCalls.length === 1 && fetchCalls[0].url === 'https://example.test/ops-mail');
    check('webhook payload includes the shared secret and not a user-enumeration error', fetchCalls[0].body.secret === 'hook-secret' && fetchCalls[0].body.to === ALLOWED);
    check('magic link points at /api/ops/auth?token= on this host', /https:\/\/preview\.example\.test\/api\/ops\/auth\?token=/.test(magicUrl));
  }

  const token = tokenFromUrl(magicUrl);
  let sessionCookie = '';
  {
    const res = mockRes();
    await auth({
      method: 'GET',
      headers: { accept: 'application/json', host: 'preview.example.test' },
      query: { token },
    }, res);
    sessionCookie = cookieFrom(res);
    check('valid magic link creates a session for the allowlisted email', res.statusCode === 200 && res.body && res.body.ok === true && res.body.email === ALLOWED.toLowerCase());
    check('session cookie is HttpOnly SameSite=Lax', /HttpOnly/i.test(res.headers['Set-Cookie']) && /SameSite=Lax/i.test(res.headers['Set-Cookie']));
  }

  {
    const res = mockRes();
    await auth({
      method: 'GET',
      headers: { accept: 'application/json', host: 'preview.example.test' },
      query: { token },
    }, res);
    check('magic link is single-use', res.statusCode === 400 && res.body && res.body.error === 'used');
  }

  {
    const res = mockRes();
    await ops({
      method: 'GET',
      headers: { cookie: sessionCookie, host: 'preview.example.test' },
      query: {},
    }, res);
    check('/ops with a session shows the signed-in dashboard', res.statusCode === 200 && String(res.raw).includes('signed in as') && String(res.raw).includes(ALLOWED.toLowerCase()) && String(res.raw).includes('Dashboard'));
    check('signed-in page includes Sign out', /Sign out/.test(String(res.raw)));
  }

  {
    const res = mockRes();
    await auth({
      method: 'GET',
      headers: { accept: 'application/json', cookie: sessionCookie },
      query: { action: 'session' },
    }, res);
    check('session endpoint reports the signed-in email', res.statusCode === 200 && res.body.authenticated === true && res.body.email === ALLOWED.toLowerCase());
  }

  {
    const res = mockRes();
    await auth(jsonReq({
      headers: { cookie: sessionCookie, 'x-forwarded-for': '203.0.113.22' },
      body: { action: 'logout' },
    }), res);
    const cleared = String(res.headers['Set-Cookie'] || '');
    check('logout clears the session cookie', res.statusCode === 200 && res.body.ok === true && /Max-Age=0/i.test(cleared));
  }

  {
    const res = mockRes();
    await ops({ method: 'GET', headers: { cookie: `${lib.SESSION_COOKIE}=` }, query: {} }, res);
    check('/ops after logout is the login page again', res.statusCode === 401 && String(res.raw).includes('Sign in with Google'));
  }

  {
    const expired = lib.createMagicToken(ALLOWED_2, { ttlMs: -60_000 });
    const res = mockRes();
    await auth({ method: 'GET', headers: { accept: 'application/json' }, query: { token: expired } }, res);
    check('expired magic link is rejected', res.statusCode === 400 && res.body.error === 'expired');
  }

  {
    const token = lib.createMagicToken(ALLOWED_2);
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    const res = mockRes();
    await auth({ method: 'GET', headers: { accept: 'application/json' }, query: { token: tampered } }, res);
    check('tampered magic link is rejected', res.statusCode === 400 && res.body.error === 'invalid');
  }

  {
    const session = lib.createSessionToken(ALLOWED);
    const asMagic = { method: 'GET', headers: { accept: 'application/json' }, query: { token: session } };
    const res = mockRes();
    await auth(asMagic, res);
    check('session tokens cannot be used as magic links', res.statusCode === 400);
  }

  {
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.30' }, body: { action: 'request', email: 'not-an-email' } }), res);
    check('invalid email is rejected (400)', res.statusCode === 400 && res.body.error === 'invalid_email');
  }

  {
    lib.resetAuthState();
    global.fetch = async () => ({ ok: true, status: 200 });
    const first = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.40' }, body: { action: 'request', email: ALLOWED_2 } }), first);
    const second = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.40' }, body: { action: 'request', email: ALLOWED_2 } }), second);
    check('repeat request from the same IP is rate-limited', first.statusCode === 200 && second.statusCode === 429);
  }

  {
    const fetchCalls = [];
    global.fetch = async (url, opts) => {
      fetchCalls.push(opts.body);
      return { ok: true };
    };
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.41' }, body: { action: 'request', email: ALLOWED, website: 'https://spam.test' } }), res);
    check('honeypot request is silently accepted and sends no mail', res.statusCode === 200 && fetchCalls.length === 0);
  }

  {
    clearDeliveryEnv();
    process.env.RESEND_API_KEY = 're_test_valid_prefix';
    process.env.OPS_FROM_EMAIL = 'LAVAALL OS <os@test.example>';
    check('describeDeliveryConfig reports re_ prefix as boolean only',
      lib.resendKeyPrefixOk() === true
      && lib.describeDeliveryConfig().resend_key_present === true
      && lib.describeDeliveryConfig().resend_key_prefix_ok === true
      && !JSON.stringify(lib.describeDeliveryConfig()).includes('re_test'));
    process.env.RESEND_API_KEY = 'not-a-resend-key';
    check('invalid Resend key logs prefix_ok false without echoing the key',
      lib.resendKeyPrefixOk() === false
      && lib.describeDeliveryConfig().resend_key_prefix_ok === false
      && !JSON.stringify(lib.describeDeliveryConfig()).includes('not-a-resend-key'));
  }

  {
    clearDeliveryEnv();
    process.env.RESEND_API_KEY = 're_primary';
    process.env.OPS_FROM_EMAIL = 'LAVAALL OS <os@test.example>';
    setGmailEnv();
    const fetchCalls = mockMailFetch(async (url) => {
      if (url.includes('api.resend.com')) return { ok: true, status: 200, text: async () => '{}' };
      return { ok: false, status: 500, text: async () => '{}' };
    });
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.50' }, body: { action: 'request', email: ALLOWED } }), res);
    check('Resend success is primary and skips Gmail',
      res.statusCode === 200 && res.body.via === 'resend'
      && fetchCalls.some((call) => call.url.includes('api.resend.com'))
      && !fetchCalls.some((call) => call.url.includes('googleapis.com')));
  }

  {
    clearDeliveryEnv();
    process.env.RESEND_API_KEY = 're_primary';
    process.env.OPS_FROM_EMAIL = 'LAVAALL OS <os@test.example>';
    setGmailEnv();
    const fetchCalls = mockMailFetch(async (url) => {
      if (url.includes('api.resend.com')) return { ok: false, status: 401, text: async () => '{"name":"validation_error"}' };
      if (url.includes('oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.test-token' }) };
      if (url.includes('gmail.googleapis.com')) return { ok: true, status: 200, json: async () => ({ id: 'msg-1' }) };
      return { ok: false, status: 500, text: async () => '{}' };
    });
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.51' }, body: { action: 'request', email: ALLOWED } }), res);
    check('Gmail fallback is used when Resend HTTP fails',
      res.statusCode === 200 && res.body.via === 'gmail'
      && fetchCalls.some((call) => call.url.includes('api.resend.com'))
      && fetchCalls.some((call) => call.url.includes('oauth2.googleapis.com/token'))
      && fetchCalls.some((call) => call.url.includes('gmail.googleapis.com/gmail/v1/users/me/messages/send')));
    const tokenCall = fetchCalls.find((call) => call.url.includes('oauth2.googleapis.com/token'));
    check('Gmail OAuth refresh uses grant_type=refresh_token and does not put the token in JSON logs shape',
      tokenCall && String(tokenCall.raw).includes('grant_type=refresh_token') && String(tokenCall.raw).includes('refresh_token='));
  }

  {
    clearDeliveryEnv();
    process.env.RESEND_API_KEY = 'bad-key-without-prefix';
    process.env.OPS_FROM_EMAIL = 'LAVAALL OS <os@test.example>';
    setGmailEnv();
    const fetchCalls = mockMailFetch(async (url) => {
      if (url.includes('oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.test-token' }) };
      if (url.includes('gmail.googleapis.com')) return { ok: true, status: 200, json: async () => ({ id: 'msg-2' }) };
      return { ok: false, status: 500, text: async () => '{}' };
    });
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.52' }, body: { action: 'request', email: ALLOWED } }), res);
    check('invalid re_ prefix skips Resend and uses Gmail',
      res.statusCode === 200 && res.body.via === 'gmail'
      && !fetchCalls.some((call) => call.url.includes('api.resend.com')));
  }

  {
    clearDeliveryEnv();
    setGmailEnv();
    const fetchCalls = mockMailFetch(async (url) => {
      if (url.includes('oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.test-token' }) };
      if (url.includes('gmail.googleapis.com')) return { ok: true, status: 200, json: async () => ({ id: 'msg-3' }) };
      return { ok: false, status: 500, text: async () => '{}' };
    });
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.53' }, body: { action: 'request', email: ALLOWED_2 } }), res);
    check('Gmail is used when Resend is missing', res.statusCode === 200 && res.body.via === 'gmail' && fetchCalls.length === 2);
  }

  {
    clearDeliveryEnv();
    process.env.RESEND_API_KEY = 're_primary';
    process.env.OPS_FROM_EMAIL = 'LAVAALL OS <os@test.example>';
    setGmailEnv();
    mockMailFetch(async () => ({ ok: false, status: 503, text: async () => '{"name":"unavailable"}', json: async () => ({}) }));
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.54' }, body: { action: 'request', email: ALLOWED } }), res);
    check('both Resend and Gmail failing returns delivery_failed', res.statusCode === 502 && res.body.error === 'delivery_failed' && !res.body.previewLoginUrl);
  }

  {
    clearDeliveryEnv();
    process.env.VERCEL_ENV = 'preview';
    process.env.RESEND_API_KEY = 're_primary';
    process.env.OPS_FROM_EMAIL = 'LAVAALL OS <os@test.example>';
    setGmailEnv();
    process.env.OPS_PREVIEW_INLINE_LINK = '1';
    mockMailFetch(async () => ({ ok: false, status: 503, text: async () => '{"name":"unavailable"}', json: async () => ({}) }));
    lib.resetAuthState();
    const allowed = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.55' }, body: { action: 'request', email: ALLOWED } }), allowed);
    check('preview inline link is returned only after both senders fail',
      allowed.statusCode === 200
      && allowed.body.via === 'preview_inline'
      && /\/api\/ops\/auth\?token=/.test(allowed.body.previewLoginUrl || ''));
    lib.resetAuthState();
    const denied = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.56' }, body: { action: 'request', email: DENIED } }), denied);
    check('preview inline link is never returned for non-allowlisted emails',
      denied.statusCode === 200 && denied.body.accepted === true && !denied.body.previewLoginUrl && !denied.body.via);
    delete process.env.VERCEL_ENV;
  }

  {
    clearDeliveryEnv();
    process.env.VERCEL_ENV = 'production';
    process.env.OPS_PREVIEW_INLINE_LINK = '1';
    check('preview inline links remain disabled in Production', lib.previewInlineEnabled() === false);
    delete process.env.VERCEL_ENV;
  }

  {
    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
    const sources = vercel.rewrites.map((row) => row.source + '->' + row.destination);
    check('public / still rewrites to index.html', sources.includes('/->/index.html'));
    check('public /schedule still rewrites to index.html', sources.includes('/schedule->/index.html'));
    check('/ops is rewritten to the session gate', sources.includes('/ops->/api/ops') && sources.includes('/ops/:path*->/api/ops?area=:path*'));
  }

  {
    const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    check('.env.example documents Google founder sign-in',
      env.includes('OPS_GOOGLE_SIGNIN_CLIENT_ID')
      && env.includes('OPS_GOOGLE_SIGNIN_CLIENT_SECRET')
      && env.includes('OPS_GMAIL_CLIENT_ID')
      && env.includes('https://www.lavaall.com/api/ops/auth')
      && env.includes('https://lavaall.com/api/ops/auth')
      && env.includes('osmanjalloh104@gmail.com')
      && env.includes('abdulhbah55@gmail.com')
      && /test users/i.test(env)
      && /instant login is disabled/i.test(env)
      && !env.includes('Production always uses immediate allowlist login'));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home, 'index.html');
    const privacy = fs.readFileSync(path.join(__dirname, '../privacy.html'), 'utf8');
    assertPublicLogin(check, privacy, 'privacy.html');
    const terms = fs.readFileSync(path.join(__dirname, '../terms.html'), 'utf8');
    assertPublicLogin(check, terms, 'terms.html');
  }

  {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' });
    jwk.kid = 'test-kid';
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    function signJwt(key, payload, header) {
      const tokenHeader = header || { alg: 'RS256', kid: 'test-kid', typ: 'JWT' };
      const h = Buffer.from(JSON.stringify(tokenHeader)).toString('base64url');
      const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const data = `${h}.${p}`;
      const sig = crypto.sign('sha256', Buffer.from(data), key).toString('base64url');
      return `${data}.${sig}`;
    }

    function claims(nonce, overrides) {
      const nowSec = Math.floor(Date.now() / 1000);
      return Object.assign({
        iss: 'https://accounts.google.com',
        aud: 'signin-client',
        sub: 'sub-osman',
        email: ALLOWED,
        email_verified: true,
        nonce,
        iat: nowSec,
        exp: nowSec + 300,
      }, overrides || {});
    }

    process.env.VERCEL_ENV = 'production';
    process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID = 'signin-client';
    process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET = 'signin-secret-value';
    google.resetGoogleSignInState();
    lib.resetAuthState();

    const directNonce = 'nonce-for-direct-tests-32bytes!!';
    const verified = await google.verifyGoogleIdToken(signJwt(privateKey, claims(directNonce)), {
      nonce: directNonce,
      keys: [jwk],
      clientId: 'signin-client',
    });
    check('allowlisted verified Google ID token is accepted',
      verified.ok === true && verified.email === ALLOWED.toLowerCase());

    const mixedCase = await google.verifyGoogleIdToken(
      signJwt(privateKey, claims(directNonce, { email: 'OsmanJalloh104@gmail.com' })),
      { nonce: directNonce, keys: [jwk], clientId: 'signin-client' },
    );
    check('Google allowlist match is case-insensitive',
      mixedCase.ok === true && mixedCase.email === ALLOWED.toLowerCase());

    const secondFounder = await google.verifyGoogleIdToken(
      signJwt(privateKey, claims(directNonce, { email: ALLOWED_2, sub: 'sub-hameed' })),
      { nonce: directNonce, keys: [jwk], clientId: 'signin-client' },
    );
    check('second founder Google account is accepted',
      secondFounder.ok === true && secondFounder.email === ALLOWED_2);

    async function rejected(payloadOverrides, extra) {
      const token = signJwt((extra && extra.key) || privateKey, claims(directNonce, payloadOverrides), extra && extra.header);
      return google.verifyGoogleIdToken(token, {
        nonce: extra && extra.nonce ? extra.nonce : directNonce,
        keys: [jwk],
        clientId: 'signin-client',
      });
    }

    check('non-allowlisted Google account is rejected',
      (await rejected({ email: DENIED, sub: 'stranger' })).reason === 'not_allowlisted');
    check('unverified Google email is rejected',
      (await rejected({ email_verified: false })).reason === 'unverified');
    check('string email_verified is rejected',
      (await rejected({ email_verified: 'true' })).reason === 'unverified');
    check('wrong-aud Google token is rejected',
      (await rejected({ aud: 'other-client' })).reason === 'bad_aud');
    check('expired Google token is rejected',
      (await rejected({ exp: Math.floor(Date.now() / 1000) - 120 })).reason === 'expired');
    check('wrong issuer is rejected',
      (await rejected({ iss: 'https://accounts.google.com.evil.com' })).reason === 'bad_iss');
    const plainIssuer = await google.verifyGoogleIdToken(
      signJwt(privateKey, claims(directNonce, { iss: 'accounts.google.com' })),
      { nonce: directNonce, keys: [jwk], clientId: 'signin-client' },
    );
    check('accounts.google.com issuer is accepted', plainIssuer.ok === true);
    check('forged Google token is rejected',
      (await rejected({}, { key: other.privateKey })).reason === 'bad_signature');
    check('alg none is rejected',
      (await rejected({}, { header: { alg: 'none', kid: 'test-kid' } })).reason === 'bad_signature');
    check('nonce mismatch is rejected',
      (await rejected({}, { nonce: 'different-nonce-value-32b!!!!' })).reason === 'bad_nonce');

    let ipN = 10;
    function nextIp() {
      ipN += 1;
      return `198.51.100.${ipN}`;
    }

    async function startGoogle(host) {
      lib.resetAuthState();
      const res = mockRes();
      await auth(jsonReq({
        headers: {
          host: host || 'www.lavaall.com',
          'x-forwarded-proto': 'https',
          'x-forwarded-for': nextIp(),
        },
        body: { action: 'google' },
      }), res);
      return res;
    }

    function oauthFrom(res) {
      const raw = res.headers['Set-Cookie'];
      const list = Array.isArray(raw) ? raw : [raw];
      const row = list.find((item) => String(item || '').startsWith('lavaall_ops_oauth='));
      if (!row) return null;
      const pair = String(row).split(';')[0];
      const value = decodeURIComponent(pair.slice('lavaall_ops_oauth='.length));
      const dot = value.lastIndexOf('.');
      const body = value.slice(0, dot);
      const sig = value.slice(dot + 1);
      const expect = crypto.createHmac('sha256', SECRET).update(`oauth:${body}`).digest('base64url');
      if (expect !== sig) return null;
      return { pair, payload: JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) };
    }

    const started = await startGoogle('www.lavaall.com');
    const tx = oauthFrom(started);
    const loc = new URL(started.body.redirect);
    const challenge = crypto.createHash('sha256').update(tx.payload.cv).digest('base64url');
    check('Google start uses the code flow for www.lavaall.com',
      started.statusCode === 200
      && loc.origin === 'https://accounts.google.com'
      && loc.pathname === '/o/oauth2/v2/auth'
      && loc.searchParams.get('client_id') === 'signin-client'
      && loc.searchParams.get('redirect_uri') === 'https://www.lavaall.com/api/ops/auth'
      && loc.searchParams.get('scope') === 'openid email'
      && loc.searchParams.get('response_type') === 'code'
      && loc.searchParams.get('code_challenge') === challenge
      && loc.searchParams.get('code_challenge_method') === 'S256'
      && loc.searchParams.get('state') === tx.payload.state
      && loc.searchParams.get('nonce') === tx.payload.nonce
      && !started.body.redirect.includes('signin-secret-value')
      && /HttpOnly/i.test(String(started.headers['Set-Cookie']))
      && /SameSite=Lax/i.test(String(started.headers['Set-Cookie']))
      && /Secure/i.test(String(started.headers['Set-Cookie'])));

    const apex = await startGoogle('lavaall.com');
    check('apex redirect URI is https://lavaall.com/api/ops/auth',
      new URL(apex.body.redirect).searchParams.get('redirect_uri') === 'https://lavaall.com/api/ops/auth');
    const previewHost = await startGoogle('lavaal-git-ops-osman14.vercel.app');
    check('Preview redirect URI uses the lavaal preview host',
      new URL(previewHost.body.redirect).searchParams.get('redirect_uri') === 'https://lavaal-git-ops-osman14.vercel.app/api/ops/auth');
    const evil = await startGoogle('evil.example');
    check('untrusted host cannot start Google sign-in',
      evil.statusCode === 400
      && evil.body
      && evil.body.error === 'sign_in_failed'
      && !evil.body.redirect
      && !/lavaall_ops=/.test(String(evil.headers['Set-Cookie'] || '')));
    const foreignPreview = await startGoogle('notlavaal.vercel.app');
    check('unrelated vercel.app host cannot start Google sign-in', foreignPreview.statusCode === 400);

    async function callbackWith(startRes, payloadOverrides, opts) {
      const info = oauthFrom(startRes);
      const token = signJwt(
        (opts && opts.key) || privateKey,
        claims(info.payload.nonce, payloadOverrides),
        opts && opts.header,
      );
      const fetchCalls = [];
      global.fetch = async (url, options) => {
        const u = String(url);
        fetchCalls.push({ url: u, body: options && options.body ? String(options.body) : '' });
        if (u.includes('oauth2.googleapis.com/token')) {
          return { ok: true, status: 200, json: async () => ({ id_token: token, access_token: 'ya29.should-not-leak' }) };
        }
        if (u.includes('/certs')) {
          return { ok: true, status: 200, json: async () => ({ keys: [jwk] }) };
        }
        return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
      };
      const res = mockRes();
      await auth({
        method: 'GET',
        headers: {
          accept: 'application/json',
          host: (opts && opts.host) || 'www.lavaall.com',
          'x-forwarded-proto': 'https',
          'x-forwarded-for': (opts && opts.ip) || nextIp(),
          cookie: info.pair,
        },
        query: {
          code: 'valid-auth-code',
          state: opts && opts.state ? opts.state : info.payload.state,
        },
      }, res);
      return { res, fetchCalls, token };
    }

    google.resetGoogleSignInState();
    const happy = await callbackWith(await startGoogle('www.lavaall.com'), { email: 'OsmanJalloh104@gmail.com' });
    const sessionPair = cookieFrom(happy.res);
    const tokenPost = happy.fetchCalls.find((call) => call.url.includes('/token'));
    check('allowlisted verified Google account gets a session',
      happy.res.statusCode === 200
      && happy.res.body
      && happy.res.body.ok === true
      && happy.res.body.via === 'google'
      && happy.res.body.email === ALLOWED.toLowerCase()
      && /lavaall_ops=/.test(String(happy.res.headers['Set-Cookie']))
      && /HttpOnly/i.test(String(happy.res.headers['Set-Cookie']))
      && /SameSite=Lax/i.test(String(happy.res.headers['Set-Cookie']))
      && /Secure/i.test(String(happy.res.headers['Set-Cookie'])));
    check('code exchange does not request Gmail scopes or return the access token',
      Boolean(tokenPost)
      && tokenPost.body.includes('grant_type=authorization_code')
      && tokenPost.body.includes('code_verifier=')
      && tokenPost.body.includes('redirect_uri=https%3A%2F%2Fwww.lavaall.com%2Fapi%2Fops%2Fauth')
      && !tokenPost.body.includes('gmail')
      && !JSON.stringify(happy.res.body).includes('ya29')
      && !JSON.stringify(happy.res.body).includes('signin-secret-value'));
    const dash = mockRes();
    await ops({
      method: 'GET',
      headers: { cookie: sessionPair, host: 'www.lavaall.com' },
      query: {},
      url: '/ops',
    }, dash);
    check('Google session opens /ops',
      dash.statusCode === 200 && String(dash.raw).includes(ALLOWED.toLowerCase()));

    google.resetGoogleSignInState();
    const hameedLogin = await callbackWith(await startGoogle('www.lavaall.com'), { email: ALLOWED_2, sub: 'sub-hameed' });
    check('second founder Google account gets a session',
      hameedLogin.res.statusCode === 200
      && hameedLogin.res.body
      && hameedLogin.res.body.email === ALLOWED_2
      && /lavaall_ops=/.test(String(hameedLogin.res.headers['Set-Cookie'])));

    async function rejects(overrides, opts) {
      google.resetGoogleSignInState();
      const out = await callbackWith(await startGoogle('www.lavaall.com'), overrides, opts);
      const body = JSON.stringify(out.res.body || {});
      const cookie = String(out.res.headers['Set-Cookie'] || '');
      return out.res.statusCode === 401
        && out.res.body
        && out.res.body.error === 'sign_in_failed'
        && out.res.body.message === google.genericGoogleFailure()
        && !/lavaall_ops=/.test(cookie)
        && !body.includes(DENIED)
        && !/allowlist|isn.t allowed|osmanjalloh|abdulhbah/i.test(body);
    }

    check('non-allowlisted Google account does not get a session', await rejects({ email: DENIED, sub: 'nope' }));
    check('unverified Google account does not get a session', await rejects({ email_verified: false }));
    check('wrong-aud Google token does not get a session', await rejects({ aud: 'other-client' }));
    check('expired Google token does not get a session', await rejects({ exp: Math.floor(Date.now() / 1000) - 120 }));
    check('forged Google token does not get a session', await rejects({}, { key: other.privateKey }));

    google.resetGoogleSignInState();
    const mismatch = await callbackWith(
      await startGoogle('www.lavaall.com'),
      {},
      { state: 'wrong-state-value-not-the-real-one' },
    );
    check('mismatched OAuth state is rejected',
      mismatch.res.statusCode === 401
      && !/lavaall_ops=/.test(String(mismatch.res.headers['Set-Cookie'] || ''))
      && mismatch.fetchCalls.length === 0);

    const postedToken = mockRes();
    lib.resetAuthState();
    await auth(jsonReq({
      headers: { host: 'www.lavaall.com', 'x-forwarded-for': nextIp() },
      body: { action: 'google', id_token: signJwt(privateKey, claims(directNonce)) },
    }), postedToken);
    check('a client-supplied ID token does not mint a session',
      postedToken.body
      && postedToken.body.redirect
      && !/lavaall_ops=/.test(String(postedToken.headers['Set-Cookie'] || '')));

    google.resetGoogleSignInState();
    lib.resetAuthState();
    const rateIp = '203.0.113.77';
    const realNow = Date.now;
    const base = realNow();
    Date.now = () => base;
    try {
      async function formStart() {
        const res = mockRes();
        await auth({
          method: 'POST',
          headers: {
            host: 'www.lavaall.com',
            'x-forwarded-proto': 'https',
            'x-forwarded-for': rateIp,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'action=google',
        }, res);
        return res;
      }

      function limitedLocation(res) {
        return res.statusCode === 302
          && res.headers.Location === `/ops?error=${encodeURIComponent(lib.genericRateLimitMessage())}`;
      }

      const starts = [];
      for (let i = 0; i < 5; i += 1) starts.push(await formStart());
      check('five quick Google sign-in starts are allowed',
        starts.every((res) => res.statusCode === 302
          && String(res.headers.Location || '').startsWith('https://accounts.google.com/')));

      const blockedStart = await formStart();
      check('sixth Google sign-in start within 60s is rate-limited', limitedLocation(blockedStart));

      const jsonBlocked = mockRes();
      await auth(jsonReq({
        headers: { host: 'www.lavaall.com', 'x-forwarded-for': rateIp },
        body: { action: 'google' },
      }), jsonBlocked);
      check('rate-limited Google start keeps the friendly message',
        jsonBlocked.statusCode === 429
        && jsonBlocked.body
        && jsonBlocked.body.error === 'rate_limited'
        && jsonBlocked.body.message === lib.genericRateLimitMessage()
        && !jsonBlocked.body.redirect);

      const callbacks = [];
      for (const startRes of starts) {
        callbacks.push(await callbackWith(startRes, {}, { ip: rateIp }));
      }
      check('Google callback bucket is independent of the start bucket',
        callbacks.every((out) => out.res.statusCode === 200 && out.res.body && out.res.body.ok === true));

      const blockedCallback = mockRes();
      await auth({
        method: 'GET',
        headers: {
          accept: 'application/json',
          host: 'www.lavaall.com',
          'x-forwarded-proto': 'https',
          'x-forwarded-for': rateIp,
        },
        query: { code: 'valid-auth-code', state: 'x'.repeat(24) },
      }, blockedCallback);
      check('sixth Google callback within 60s is rate-limited',
        blockedCallback.statusCode === 429
        && blockedCallback.body
        && blockedCallback.body.error === 'rate_limited'
        && blockedCallback.body.message === lib.genericRateLimitMessage());

      Date.now = () => base + 59_999;
      const stillStart = await formStart();
      const stillCallback = mockRes();
      await auth({
        method: 'GET',
        headers: {
          accept: 'application/json',
          host: 'www.lavaall.com',
          'x-forwarded-proto': 'https',
          'x-forwarded-for': rateIp,
        },
        query: { code: 'valid-auth-code', state: 'y'.repeat(24) },
      }, stillCallback);
      check('Google start and callback stay limited until the 60s window ends',
        limitedLocation(stillStart) && stillCallback.statusCode === 429);

      Date.now = () => base + 60_000;
      const recoveredStart = await formStart();
      const recoveredCallback = await callbackWith(recoveredStart, {}, { ip: rateIp });
      check('Google sign-in start and callback are allowed again after 60s',
        recoveredStart.statusCode === 302
        && String(recoveredStart.headers.Location || '').startsWith('https://accounts.google.com/')
        && recoveredCallback.res.statusCode === 200
        && recoveredCallback.res.body
        && recoveredCallback.res.body.ok === true);
    } finally {
      Date.now = realNow;
      google.resetGoogleSignInState();
      lib.resetAuthState();
    }

    delete process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID;
    delete process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET;
    process.env.OPS_GMAIL_CLIENT_ID = 'gmail-fallback-client';
    process.env.OPS_GMAIL_CLIENT_SECRET = 'gmail-fallback-secret';
    const fallback = await startGoogle('www.lavaall.com');
    check('sign-in falls back to OPS_GMAIL_CLIENT_ID',
      fallback.statusCode === 200
      && new URL(fallback.body.redirect).searchParams.get('client_id') === 'gmail-fallback-client'
      && !fallback.body.redirect.includes('gmail-fallback-secret'));

    process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID = 'dedicated-client';
    const incomplete = mockRes();
    lib.resetAuthState();
    await auth(jsonReq({
      headers: { host: 'www.lavaall.com', 'x-forwarded-for': nextIp() },
      body: { action: 'google' },
    }), incomplete);
    check('dedicated client id without its secret does not use the Gmail secret',
      incomplete.statusCode === 503 && incomplete.body && incomplete.body.error === 'auth_not_configured');

    process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET = 'dedicated-secret';
    const dedicated = await startGoogle('www.lavaall.com');
    check('dedicated Google client id wins over the Gmail client',
      new URL(dedicated.body.redirect).searchParams.get('client_id') === 'dedicated-client');

    clearDeliveryEnv();
    delete process.env.VERCEL_ENV;
    google.resetGoogleSignInState();
  }

  global.fetch = origFetch;

  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run();
