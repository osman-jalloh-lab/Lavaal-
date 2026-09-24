// Tests for api/ops magic-link auth — mocks req/res/fetch so these run in plain node.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const auth = require(path.join(opsDir, 'auth.js'));
const ops = require(path.join(opsDir, 'index.js'));

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
    check('/ops login is a simple email Continue form',
      String(res.raw).includes('Enter your work email')
      && String(res.raw).includes('>Continue<')
      && !/allowlisted|work floor|Email me a sign-in link/i.test(String(res.raw)));
  }

  {
    clearDeliveryEnv();
    process.env.VERCEL_ENV = 'preview';
    delete process.env.OPS_PREVIEW_INSTANT_LOGIN;
    process.env.OPS_INSTANT_LOGIN = '1';
    lib.resetAuthState();
    const fetchCalls = [];
    global.fetch = async () => {
      fetchCalls.push(true);
      return { ok: true, status: 200 };
    };
    const res = mockRes();
    await auth({
      method: 'POST',
      headers: {
        host: 'preview.example.test',
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': '203.0.113.70',
      },
      body: { action: 'request', email: ALLOWED },
    }, res);
    const instantCookie = cookieFrom(res);
    check('Preview instant login sets the session cookie and redirects to /ops',
      res.statusCode === 302
      && res.headers.Location === '/ops'
      && /HttpOnly/i.test(String(res.headers['Set-Cookie']))
      && /SameSite=Lax/i.test(String(res.headers['Set-Cookie']))
      && fetchCalls.length === 0);
    const dash = mockRes();
    await ops({ method: 'GET', headers: { cookie: instantCookie, host: 'preview.example.test' }, query: {}, url: '/ops' }, dash);
    check('Preview instant login lands on the dashboard',
      dash.statusCode === 200 && String(dash.raw).includes('Dashboard') && String(dash.raw).includes(ALLOWED.toLowerCase()));
    const mapPage = mockRes();
    await ops({ method: 'GET', headers: { cookie: instantCookie, host: 'preview.example.test' }, query: { area: 'map' }, url: '/ops/map' }, mapPage);
    check('instant session can open Map', mapPage.statusCode === 200 && String(mapPage.raw).includes('<h1>Map</h1>'));
    const kitsPage = mockRes();
    await ops({ method: 'GET', headers: { cookie: instantCookie, host: 'preview.example.test' }, query: { area: 'kits' }, url: '/ops/kits' }, kitsPage);
    check('instant session can open Kits', kitsPage.statusCode === 200 && String(kitsPage.raw).includes('Kits'));
    delete process.env.OPS_INSTANT_LOGIN;
  }

  {
    process.env.VERCEL_ENV = 'preview';
    process.env.OPS_INSTANT_LOGIN = '1';
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.71' }, body: { action: 'request', email: DENIED } }), res);
    check('unknown email cannot get an instant session',
      res.statusCode === 401
      && res.body && res.body.error === 'sign_in_failed'
      && res.body.message === 'That email isn’t allowed.'
      && !res.headers['Set-Cookie']
      && !/allowlist|unknown account|requesting another|sign-in link|magic/i.test(JSON.stringify(res.body)));
    check('deny copy is plain and does not mention a link',
      lib.genericSignInFailure() === 'That email isn’t allowed.'
      && !/link|magic|requesting/i.test(lib.genericSignInFailure()));
    delete process.env.OPS_INSTANT_LOGIN;
  }

  {
    process.env.VERCEL_ENV = 'preview';
    process.env.OPS_INSTANT_LOGIN = '1';
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({
      headers: { 'x-forwarded-for': '203.0.113.72', authorization: 'Bearer simulated-agent-token' },
      body: { action: 'request', email: ALLOWED },
    }), res);
    check('agent cannot use instant login',
      res.statusCode === 403
      && res.body.error === 'agent_denied'
      && res.body.message === 'That email isn’t allowed.'
      && !res.headers['Set-Cookie']
      && !/requesting another|sign-in link|magic/i.test(JSON.stringify(res.body)));
    delete process.env.OPS_INSTANT_LOGIN;
  }

  {
    clearDeliveryEnv();
    process.env.VERCEL_ENV = 'production';
    delete process.env.OPS_PREVIEW_INSTANT_LOGIN;
    process.env.OPS_INSTANT_LOGIN = '1';
    process.env.OPS_MAGIC_LINK_WEBHOOK_URL = 'https://example.test/ops-mail';
    process.env.OPS_MAGIC_LINK_WEBHOOK_SECRET = 'hook-secret';
    lib.resetAuthState();
    check('production cannot enable instant login, even with OPS_INSTANT_LOGIN=1', lib.instantLoginEnabled() === false);
    const fetchCalls = [];
    global.fetch = async (url, opts) => {
      fetchCalls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200 };
    };
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.73' }, body: { action: 'request', email: ALLOWED } }), res);
    check('production allowlisted POST sends a magic link and never creates a session directly',
      res.statusCode === 200
      && res.body && res.body.accepted === true
      && res.body.via !== 'instant'
      && !res.headers['Set-Cookie']
      && fetchCalls.length === 1);
    const hamid = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.79' }, body: { action: 'request', email: ALLOWED_2 } }), hamid);
    check('production second founder also receives a magic link instead of an instant session',
      hamid.statusCode === 200
      && hamid.body && hamid.body.accepted === true
      && hamid.body.via !== 'instant'
      && !hamid.headers['Set-Cookie']
      && fetchCalls.length === 2);
    const denied = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.75' }, body: { action: 'request', email: DENIED } }), denied);
    check('production accepts non-allowlisted requests generically without sending or setting a cookie',
      denied.statusCode === 200
      && denied.body && denied.body.accepted === true
      && fetchCalls.length === 2
      && !denied.headers['Set-Cookie']);
    const agent = mockRes();
    await auth(jsonReq({
      headers: { 'x-forwarded-for': '203.0.113.76', authorization: 'Bearer simulated-agent-token' },
      body: { action: 'request', email: ALLOWED },
    }), agent);
    check('production still denies agent spoof of instant login',
      agent.statusCode === 403
      && agent.body.error === 'agent_denied'
      && !agent.headers['Set-Cookie']);
    delete process.env.OPS_INSTANT_LOGIN;
  }

  {
    process.env.VERCEL_ENV = 'production';
    const oldSession = legacySessionToken(ALLOWED);
    check('session version bump rejects cookies minted by the insecure login release',
      lib.SESSION_VERSION === 2 && lib.readSessionToken(oldSession) === null);

    const productionSession = lib.createSessionToken(ALLOWED);
    process.env.VERCEL_ENV = 'preview';
    check('production session cookies cannot be replayed on Preview', lib.readSessionToken(productionSession) === null);
    process.env.VERCEL_ENV = 'production';
    check('current production session cookie remains valid in Production', Boolean(lib.readSessionToken(productionSession)));

    const oldMagic = legacyMagicToken(ALLOWED);
    check('magic-link version bump rejects links minted by the insecure login release',
      lib.MAGIC_VERSION === 2 && !lib.consumeMagicToken(oldMagic).email);
    process.env.VERCEL_ENV = 'preview';
    const previewMagic = lib.createMagicToken(ALLOWED);
    process.env.VERCEL_ENV = 'production';
    check('Preview magic links cannot be replayed on Production', !lib.consumeMagicToken(previewMagic).email);
    delete process.env.VERCEL_ENV;
  }

  {
    clearDeliveryEnv();
    process.env.VERCEL_ENV = 'production';
    process.env.OPS_INSTANT_LOGIN = '0';
    process.env.OPS_MAGIC_LINK_WEBHOOK_URL = 'https://example.test/ops-mail';
    process.env.OPS_MAGIC_LINK_WEBHOOK_SECRET = 'hook-secret';
    check('OPS_INSTANT_LOGIN=0 disables instant on production', lib.instantLoginEnabled() === false);
    const fetchCalls = [];
    global.fetch = async (url, opts) => {
      fetchCalls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200 };
    };
    lib.resetAuthState();
    const res = mockRes();
    await auth(jsonReq({ headers: { 'x-forwarded-for': '203.0.113.77' }, body: { action: 'request', email: ALLOWED } }), res);
    check('production magic-link fallback sends mail when instant is off',
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
    process.env.VERCEL_ENV = 'production';
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
    check('production Resend magic-link works when instant is off',
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
    check('/ops after logout is the login page again', res.statusCode === 401 && String(res.raw).includes('Enter your work email'));
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
    check('.env.example documents that production instant login is forbidden',
      env.includes('OPS_INSTANT_LOGIN')
      && env.includes('OPS_PREVIEW_INSTANT_LOGIN')
      && env.includes('Production always requires the delivered magic link')
      && env.includes('neither')
      && env.includes('VERCEL_ENV=production'));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home, 'index.html');
    const privacy = fs.readFileSync(path.join(__dirname, '../privacy.html'), 'utf8');
    assertPublicLogin(check, privacy, 'privacy.html');
    const terms = fs.readFileSync(path.join(__dirname, '../terms.html'), 'utf8');
    assertPublicLogin(check, terms, 'terms.html');
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
