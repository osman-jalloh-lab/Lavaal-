// Sign-in history and sign-out-all. Flag defaults off. KV failures must not block sign-in.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const auth = require(path.join(opsDir, 'auth.js'));
const ops = require(path.join(opsDir, 'index.js'));
const google = require(path.join(opsDir, '_google_signin.js'));
const hard = require(path.join(opsDir, '_signin_hardening.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const health = require(path.join(opsDir, '_routine_health.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const ALLOWED_2 = 'abdulhbah55@gmail.com';
const DENIED = 'stranger@evil.example';
const FULL_IP = '203.0.113.44';
const SECRET_TOKEN = 'magic-token-should-not-be-stored';
const AUTH_CODE = 'google-auth-code-do-not-store';

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.setHeader = (key, value) => {
    const name = String(key);
    if (name.toLowerCase() === 'set-cookie' && res.headers['Set-Cookie']) {
      const prev = res.headers['Set-Cookie'];
      res.headers['Set-Cookie'] = Array.isArray(prev) ? prev.concat(value) : [prev, value];
    } else {
      res.headers[name] = value;
    }
    return res;
  };
  res.send = (body) => {
    res.raw = body;
    if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
      try { res.body = JSON.parse(body); } catch { res.body = body; }
    } else {
      res.body = body;
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
      host: 'www.lavaall.com',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': FULL_IP,
      ...(extra && extra.headers),
    },
    query: extra && extra.query,
    url: extra && extra.url,
    body: extra && extra.body,
  };
}

function installKv() {
  const lists = {};
  const strings = {};
  const calls = [];
  global.fetch = async (url, opts) => {
    const endpoint = String(url);
    if (endpoint.includes('oauth2.googleapis.com/token') || endpoint.includes('/certs')) {
      return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
    }
    if (!endpoint.startsWith('https://kv.example.test')) {
      return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
    }
    const cmd = JSON.parse(opts.body);
    calls.push(cmd.slice());
    const op = cmd[0];
    const key = cmd[1];
    if (op === 'GET') {
      const result = Object.prototype.hasOwnProperty.call(strings, key) ? strings[key] : null;
      return { ok: true, json: async () => ({ result }) };
    }
    if (op === 'SET') {
      strings[key] = cmd[2];
      return { ok: true, json: async () => ({ result: 'OK' }) };
    }
    if (op === 'INCR') {
      const next = Number(strings[key] || 0) + 1;
      strings[key] = String(next);
      return { ok: true, json: async () => ({ result: next }) };
    }
    if (op === 'LPUSH') {
      if (!lists[key]) lists[key] = [];
      lists[key].unshift(String(cmd[2]));
      return { ok: true, json: async () => ({ result: lists[key].length }) };
    }
    if (op === 'LTRIM') {
      const start = Number(cmd[2]);
      const end = Number(cmd[3]);
      if (lists[key]) lists[key] = lists[key].slice(start, end + 1);
      return { ok: true, json: async () => ({ result: 'OK' }) };
    }
    if (op === 'LRANGE') {
      const start = Number(cmd[2]);
      const end = Number(cmd[3]);
      return { ok: true, json: async () => ({ result: (lists[key] || []).slice(start, end + 1) }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  return { lists, strings, calls };
}

function eventsOf(store, key) {
  return (store.lists[key] || []).map((row) => JSON.parse(row));
}

function cookiePair(header) {
  const raw = Array.isArray(header)
    ? header.find((row) => String(row).includes('lavaall_ops='))
    : header;
  if (!raw) return '';
  return String(raw).split(';')[0];
}

function sessionPayload(header) {
  const pair = cookiePair(header);
  const value = decodeURIComponent(pair.slice('lavaall_ops='.length));
  const body = value.slice(0, value.lastIndexOf('.'));
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function authed(cookie, extra) {
  return {
    method: (extra && extra.method) || 'GET',
    headers: {
      host: 'www.lavaall.com',
      'x-forwarded-proto': 'https',
      cookie,
      ...(extra && extra.headers),
    },
    query: extra && extra.query,
    url: (extra && extra.url) || '/ops',
    body: extra && extra.body,
  };
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.OPS_SIGNIN_HARDENING_ENABLED;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.VERCEL_ENV;
  delete process.env.OPS_PUBLIC_URL;
  lib.resetAuthState();

  const hardeningSrc = fs.readFileSync(path.join(opsDir, '_signin_hardening.js'), 'utf8');
  const authSrc = fs.readFileSync(path.join(opsDir, 'auth.js'), 'utf8');
  check('hardening does not read or set the auth signing secret', !hardeningSrc.includes('OPS_AUTH_SECRET'));
  const misspelledFounder = ['H', 'a', 'm', 'i', 'd'].join('');
  check('founder spelling stays Hameed', !hardeningSrc.includes(misspelledFounder) && !authSrc.includes(misspelledFounder));
  check('session version stays 3', lib.SESSION_VERSION === 3);
  check('flag defaults off', hard.signInHardeningEnabled() === false);
  process.env.OPS_SIGNIN_HARDENING_ENABLED = '0';
  check('0 does not enable the flag', hard.signInHardeningEnabled() === false);
  process.env.OPS_SIGNIN_HARDENING_ENABLED = 'yes';
  check('yes does not enable the flag', hard.signInHardeningEnabled() === false);
  process.env.OPS_SIGNIN_HARDENING_ENABLED = ' ON ';
  check('on enables the flag', hard.signInHardeningEnabled() === true);
  delete process.env.OPS_SIGNIN_HARDENING_ENABLED;

  delete process.env.VERCEL_ENV;
  const unsetKeys = hard.signInKeys();
  process.env.VERCEL_ENV = 'production';
  const prodKeys = hard.signInKeys();
  process.env.VERCEL_ENV = 'preview';
  const previewKeys = hard.signInKeys();
  check('production and an unset environment keep unprefixed KV keys',
    unsetKeys.log === 'lavaall-ops-signin-log-v1'
    && unsetKeys.generation === 'lavaall-ops-session-gen-v1'
    && prodKeys.log === unsetKeys.log
    && prodKeys.generation === unsetKeys.generation
    && !unsetKeys.log.startsWith('preview:'));
  check('preview KV keys use the preview prefix',
    previewKeys.log === 'preview:lavaall-ops-signin-log-v1'
    && previewKeys.generation === 'preview:lavaall-ops-session-gen-v1');

  const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
  check('.env.example documents the flag as off and does not set it',
    env.includes('OPS_SIGNIN_HARDENING_ENABLED')
    && /Default off/i.test(env)
    && !/^OPS_SIGNIN_HARDENING_ENABLED=.+/m.test(env));

  {
    delete process.env.VERCEL_ENV;
    delete process.env.OPS_SIGNIN_HARDENING_ENABLED;
    const plain = lib.createSessionToken(ALLOWED);
    const decoded = JSON.parse(Buffer.from(plain.slice(0, plain.lastIndexOf('.')), 'base64url').toString('utf8'));
    check('flag-off session cookies omit the generation field', decoded.g === undefined && decoded.v === 3);
    const off = mockRes();
    await ops(authed(`${lib.SESSION_COOKIE}=${encodeURIComponent(plain)}`, { headers: { accept: 'text/html' } }), off);
    check('flag-off dashboard hides sign-in history',
      off.statusCode === 200
      && !String(off.raw).includes('id="signin-history"')
      && !String(off.raw).includes('Sign out all sessions'));
    const hidden = mockRes();
    await auth(jsonReq({ body: { action: 'signout-all', csrf: lib.createCsrfToken(ALLOWED) }, headers: { cookie: `${lib.SESSION_COOKIE}=${encodeURIComponent(plain)}` } }), hidden);
    check('sign out all is not available while the flag is off', hidden.statusCode === 404 && hidden.body && hidden.body.error === 'not_found');
  }

  process.env.OPS_SIGNIN_HARDENING_ENABLED = '1';
  process.env.VERCEL_ENV = 'preview';
  process.env.KV_REST_API_URL = 'https://kv.example.test';
  process.env.KV_REST_API_TOKEN = 'kv-token';
  process.env.OPS_MAGIC_LINK_WEBHOOK_URL = 'https://example.test/ops-mail';
  lib.resetAuthState();
  const kv = installKv();

  {
    const denied = mockRes();
    await auth(jsonReq({
      headers: {
        'x-forwarded-for': FULL_IP,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ya29.should-not-store',
        'x-vercel-ip-country': 'SL',
        'x-vercel-ip-city': 'Free%20town',
      },
      body: { action: 'request', email: DENIED },
    }), denied);
    const logged = eventsOf(kv, previewKeys.log);
    const dumped = JSON.stringify(logged);
    check('non-allowlisted sign-in response stays generic',
      denied.statusCode === 200
      && denied.body
      && denied.body.accepted === true
      && !JSON.stringify(denied.body).includes('stranger')
      && !JSON.stringify(denied.body).includes('evil.example'));
    check('rejection log stores the domain only',
      logged.length === 1
      && logged[0].who === 'rejected: evil.example'
      && logged[0].result === 'rejected'
      && logged[0].where === 'Free town, SL'
      && logged[0].ua === 'Chrome on macOS'
      && logged[0].ip === '203.0.x.x'
      && !dumped.includes(FULL_IP)
      && !dumped.includes('stranger')
      && !dumped.includes('ya29')
      && !dumped.includes('Mozilla'));
  }

  {
    const before = kv.calls.length;
    const honeypot = mockRes();
    await auth(jsonReq({
      headers: { 'x-forwarded-for': '198.51.100.8' },
      body: { action: 'request', email: DENIED, website: 'https://spam.example' },
    }), honeypot);
    check('honeypot sign-in attempts are not logged', honeypot.statusCode === 200 && kv.calls.length === before);
    const invalid = mockRes();
    await auth(jsonReq({
      headers: { 'x-forwarded-for': '198.51.100.9' },
      body: { action: 'request', email: 'not-an-email' },
    }), invalid);
    check('invalid email is not written to the sign-in log', invalid.statusCode === 400 && kv.calls.length === before);
  }

  {
    await hard.noteSignIn(jsonReq({ headers: { 'x-forwarded-for': '198.51.100.10' } }), DENIED, 'rejected');
    const logged = eventsOf(kv, previewKeys.log);
    check('a raw rejected email is not stored',
      logged[0].who === 'rejected: unknown'
      && !JSON.stringify(logged[0]).includes('stranger'));
  }

  {
    const bad = mockRes();
    await auth({
      method: 'GET',
      headers: {
        accept: 'application/json',
        host: 'www.lavaall.com',
        'x-forwarded-for': '198.51.100.11',
      },
      query: { token: SECRET_TOKEN },
      url: `/api/ops/auth?token=${SECRET_TOKEN}`,
    }, bad);
    const dumped = JSON.stringify(kv.lists);
    check('invalid sign-in link is rejected and the token is not stored',
      bad.statusCode === 400
      && !dumped.includes(SECRET_TOKEN));
  }

  {
    const token = lib.createMagicToken(ALLOWED);
    const ok = mockRes();
    await auth({
      method: 'GET',
      headers: {
        accept: 'application/json',
        host: 'www.lavaall.com',
        'x-forwarded-for': FULL_IP,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'x-vercel-ip-country': 'SL',
        'x-vercel-ip-city': 'Freetown%3Cscript%3E',
      },
      query: { token },
      url: `/api/ops/auth?token=${encodeURIComponent(token)}`,
    }, ok);
    const logged = eventsOf(kv, previewKeys.log);
    const dumped = JSON.stringify(logged);
    const payload = sessionPayload(ok.headers['Set-Cookie']);
    check('successful sign-in is logged without the token or full IP',
      ok.statusCode === 200
      && ok.body
      && ok.body.email === ALLOWED
      && logged[0].who === ALLOWED
      && logged[0].result === 'signed_in'
      && logged[0].ua === 'Chrome on macOS'
      && logged[0].ip === '203.0.x.x'
      && logged[0].where === 'Freetownscript, SL'
      && payload.v === 3
      && payload.g === 0
      && !dumped.includes(token)
      && !dumped.includes(FULL_IP)
      && !dumped.includes('<script'));
    const home = mockRes();
    await ops(authed(cookiePair(ok.headers['Set-Cookie'])), home);
    check('founder dashboard shows sign-in history',
      home.statusCode === 200
      && String(home.raw).includes('id="signin-history"')
      && String(home.raw).includes('Sign-in history')
      && String(home.raw).includes('Sign out all sessions')
      && String(home.raw).includes(ALLOWED)
      && String(home.raw).includes('Freetownscript, SL')
      && !String(home.raw).includes('<script>')
      && !String(home.raw).includes(FULL_IP)
      && !String(home.raw).includes(token));
    const homeJson = mockRes();
    await ops(authed(cookiePair(ok.headers['Set-Cookie']), {
      headers: { accept: 'application/json' },
    }), homeJson);
    check('dashboard JSON includes the sign-in history for the founder',
      homeJson.statusCode === 200
      && Array.isArray(homeJson.body.signInHistory)
      && homeJson.body.signInHistory[0].who === ALLOWED
      && !JSON.stringify(homeJson.body.signInHistory).includes(FULL_IP));
    const memory = mockRes();
    await ops(authed(cookiePair(ok.headers['Set-Cookie']), {
      headers: { accept: 'application/json' },
      url: '/ops/memory',
      query: { area: 'memory' },
    }), memory);
    check('sign-in history is not attached to other areas',
      memory.statusCode === 200 && memory.body.signInHistory === undefined);
  }

  {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' });
    jwk.kid = 'signin-kid';
    jwk.alg = 'RS256';
    jwk.use = 'sig';
    process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID = 'signin-client';
    process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET = 'signin-secret-value';
    google.resetGoogleSignInState();
    lib.resetAuthState();

    function signJwt(payload) {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'signin-kid', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const data = `${header}.${body}`;
      const sig = crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64url');
      return `${data}.${sig}`;
    }

    const start = mockRes();
    await auth(jsonReq({
      headers: { 'x-forwarded-for': '198.51.100.21', host: 'www.lavaall.com' },
      body: { action: 'google' },
    }), start);
    const oauth = String(Array.isArray(start.headers['Set-Cookie']) ? start.headers['Set-Cookie'].find((row) => String(row).startsWith('lavaall_ops_oauth=')) : start.headers['Set-Cookie']);
    const oauthValue = decodeURIComponent(oauth.split(';')[0].slice('lavaall_ops_oauth='.length));
    const tx = JSON.parse(Buffer.from(oauthValue.slice(0, oauthValue.lastIndexOf('.')), 'base64url').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signJwt({
      iss: 'https://accounts.google.com',
      aud: 'signin-client',
      sub: 'stranger-sub',
      email: DENIED,
      email_verified: true,
      nonce: tx.nonce,
      iat: nowSec,
      exp: nowSec + 300,
    });
    const callsBefore = JSON.stringify(kv.lists);
    global.fetch = async (url, opts) => {
      const endpoint = String(url);
      if (endpoint.includes('oauth2.googleapis.com/token')) {
        return { ok: true, status: 200, json: async () => ({ id_token: idToken, access_token: 'ya29.should-not-leak' }) };
      }
      if (endpoint.includes('/certs')) {
        return { ok: true, status: 200, json: async () => ({ keys: [jwk] }) };
      }
      return installKvFetch(url, opts);
    };
    function installKvFetch(url, opts) {
      return kvFetch(url, opts);
    }
    async function kvFetch(url, opts) {
      const endpoint = String(url);
      if (!endpoint.startsWith('https://kv.example.test')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      const cmd = JSON.parse(opts.body);
      kv.calls.push(cmd.slice());
      const op = cmd[0];
      const key = cmd[1];
      if (op === 'LPUSH') {
        if (!kv.lists[key]) kv.lists[key] = [];
        kv.lists[key].unshift(String(cmd[2]));
        return { ok: true, json: async () => ({ result: kv.lists[key].length }) };
      }
      if (op === 'LTRIM') {
        const startAt = Number(cmd[2]);
        const end = Number(cmd[3]);
        if (kv.lists[key]) kv.lists[key] = kv.lists[key].slice(startAt, end + 1);
        return { ok: true, json: async () => ({ result: 'OK' }) };
      }
      if (op === 'GET') {
        const result = Object.prototype.hasOwnProperty.call(kv.strings, key) ? kv.strings[key] : null;
        return { ok: true, json: async () => ({ result }) };
      }
      if (op === 'LRANGE') {
        const startAt = Number(cmd[2]);
        const end = Number(cmd[3]);
        return { ok: true, json: async () => ({ result: (kv.lists[key] || []).slice(startAt, end + 1) }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    }
    const rejected = mockRes();
    await auth({
      method: 'GET',
      headers: {
        accept: 'application/json',
        host: 'www.lavaall.com',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '198.51.100.22',
        cookie: oauth.split(';')[0],
      },
      query: { code: AUTH_CODE, state: tx.state },
    }, rejected);
    const logged = eventsOf(kv, previewKeys.log);
    const dumped = JSON.stringify(kv.lists);
    check('non-allowlisted Google account is rejected and only the domain is logged',
      rejected.statusCode === 401
      && rejected.body
      && rejected.body.error === 'sign_in_failed'
      && !JSON.stringify(rejected.body).includes('stranger')
      && !JSON.stringify(rejected.body).includes('evil.example')
      && !/lavaall_ops=/.test(String(rejected.headers['Set-Cookie'] || ''))
      && logged[0].who === 'rejected: evil.example'
      && logged[0].result === 'rejected'
      && !dumped.includes(AUTH_CODE)
      && !dumped.includes(idToken)
      && !dumped.includes('ya29')
      && !dumped.includes('stranger')
      && dumped !== callsBefore);
    delete process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID;
    delete process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET;
    google.resetGoogleSignInState();
    installKvRestore();
  }

  function installKvRestore() {
    global.fetch = async (url, opts) => {
      const endpoint = String(url);
      if (!endpoint.startsWith('https://kv.example.test')) {
        return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
      }
      const cmd = JSON.parse(opts.body);
      kv.calls.push(cmd.slice());
      const op = cmd[0];
      const key = cmd[1];
      if (op === 'GET') {
        const result = Object.prototype.hasOwnProperty.call(kv.strings, key) ? kv.strings[key] : null;
        return { ok: true, json: async () => ({ result }) };
      }
      if (op === 'SET') {
        kv.strings[key] = cmd[2];
        return { ok: true, json: async () => ({ result: 'OK' }) };
      }
      if (op === 'INCR') {
        const next = Number(kv.strings[key] || 0) + 1;
        kv.strings[key] = String(next);
        return { ok: true, json: async () => ({ result: next }) };
      }
      if (op === 'LPUSH') {
        if (!kv.lists[key]) kv.lists[key] = [];
        kv.lists[key].unshift(String(cmd[2]));
        return { ok: true, json: async () => ({ result: kv.lists[key].length }) };
      }
      if (op === 'LTRIM') {
        const startAt = Number(cmd[2]);
        const end = Number(cmd[3]);
        if (kv.lists[key]) kv.lists[key] = kv.lists[key].slice(startAt, end + 1);
        return { ok: true, json: async () => ({ result: 'OK' }) };
      }
      if (op === 'LRANGE') {
        const startAt = Number(cmd[2]);
        const end = Number(cmd[3]);
        return { ok: true, json: async () => ({ result: (kv.lists[key] || []).slice(startAt, end + 1) }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    };
  }
  installKvRestore();

  {
    lib.resetAuthState();
    const oldToken = lib.createSessionToken(ALLOWED, { generation: 0 });
    const oldCookie = `${lib.SESSION_COOKIE}=${encodeURIComponent(oldToken)}`;
    const csrf = lib.createCsrfToken(ALLOWED);
    const incrBefore = kv.calls.filter((cmd) => cmd[0] === 'INCR').length;
    const missing = mockRes();
    await auth(jsonReq({
      headers: { cookie: oldCookie, 'x-forwarded-for': '198.51.100.30' },
      body: { action: 'signout-all' },
    }), missing);
    check('sign out all without CSRF does not bump generation',
      missing.statusCode === 403
      && missing.body
      && missing.body.error === 'csrf'
      && kv.calls.filter((cmd) => cmd[0] === 'INCR').length === incrBefore);

    const wrong = mockRes();
    await auth(jsonReq({
      headers: { cookie: oldCookie, 'x-forwarded-for': '198.51.100.31' },
      body: { action: 'signout-all', csrf: lib.createCsrfToken(ALLOWED_2) },
    }), wrong);
    check('sign out all rejects another founder CSRF token',
      wrong.statusCode === 403
      && kv.calls.filter((cmd) => cmd[0] === 'INCR').length === incrBefore);

    const agent = mockRes();
    await auth(jsonReq({
      headers: {
        cookie: oldCookie,
        authorization: 'Bearer agent-token',
        'x-forwarded-for': '198.51.100.32',
      },
      body: { action: 'signout-all', csrf },
    }), agent);
    check('sign out all denies agent requests',
      agent.statusCode === 403
      && agent.body
      && agent.body.error === 'agent_denied'
      && kv.calls.filter((cmd) => cmd[0] === 'INCR').length === incrBefore);

    const bumped = mockRes();
    await auth(jsonReq({
      headers: { cookie: oldCookie, 'x-forwarded-for': '198.51.100.33' },
      body: { action: 'signout-all', csrf },
    }), bumped);
    const freshPayload = sessionPayload(bumped.headers['Set-Cookie']);
    const freshCookie = cookiePair(bumped.headers['Set-Cookie']);
    check('sign out all bumps generation and keeps this browser signed in',
      bumped.statusCode === 200
      && bumped.body
      && bumped.body.ok === true
      && freshPayload.g === 1
      && freshPayload.v === 3
      && kv.strings[previewKeys.generation] === '1'
      && kv.calls.some((cmd) => cmd[0] === 'INCR' && cmd[1] === previewKeys.generation));
    const again = mockRes();
    await auth(jsonReq({
      headers: { cookie: freshCookie, 'x-forwarded-for': '198.51.100.33' },
      body: { action: 'signout-all', csrf },
    }), again);
    check('sign out all is rate-limited like other auth actions',
      again.statusCode === 429
      && kv.strings[previewKeys.generation] === '1');

    const oldPage = mockRes();
    await ops(authed(oldCookie), oldPage);
    check('a cookie from before the bump cannot open /ops', oldPage.statusCode === 401);
    const oldKits = mockRes();
    await ops(authed(oldCookie, {
      headers: { accept: 'application/json' },
      url: '/ops/api/kits',
      query: { area: 'api/kits' },
    }), oldKits);
    check('a cookie from before the bump cannot open kits',
      oldKits.statusCode === 401 && oldKits.body && oldKits.body.error === 'sign_in_required');
    const oldSession = mockRes();
    await auth({
      method: 'GET',
      headers: { accept: 'application/json', cookie: oldCookie, host: 'www.lavaall.com' },
      query: { action: 'session' },
      url: '/api/ops/auth?action=session',
    }, oldSession);
    check('session check rejects the older generation',
      oldSession.statusCode === 401 && oldSession.body && oldSession.body.authenticated === false);

    const freshPage = mockRes();
    await ops(authed(freshCookie, { url: '/ops?revoked=1', query: { revoked: '1' } }), freshPage);
    check('the new cookie still opens /ops and confirms the sign-out',
      freshPage.statusCode === 200
      && String(freshPage.raw).includes(ALLOWED)
      && String(freshPage.raw).includes('Older sessions were signed out')
      && String(freshPage.raw).includes('Signed out all sessions'));
    const live = await hard.readLiveSession({ headers: { cookie: freshCookie, host: 'www.lavaall.com' } });
    const dead = await hard.readLiveSession({ headers: { cookie: oldCookie, host: 'www.lavaall.com' } });
    check('generation bump invalidates only older cookies',
      Boolean(live && live.email === ALLOWED && live.gen === 1)
      && dead === null);

    process.env.OPS_CEO_BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
    process.env.OPS_ROUTINE_HEALTH_ENABLED = '1';
    delete process.env.XAI_API_KEY;
    health.resetRoutineHealth();
    ceo.resetCeoBridge();
    const posted = mockRes();
    await ops({
      method: 'POST',
      headers: {
        host: 'www.lavaall.com',
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: 'Bearer test-ceo-bridge-secret-32chars!!',
      },
      query: { area: 'api/ceo-bridge/routine-health' },
      url: '/ops/api/ceo-bridge/routine-health',
      body: {
        generatedAt: new Date().toISOString(),
        routines: [{
          slug: 'kit-registry-eod-sync',
          status: 'OK',
          lastRunAt: '2026-09-27T05:00:12Z',
          reason: 'signed-out-cookie-must-not-see-this',
        }],
      },
    }, posted);
    const queued = mockRes();
    await ops(authed(freshCookie, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: { csrf: lib.createCsrfToken(ALLOWED), text: 'deploy production' },
    }), queued);
    const messageId = queued.body && queued.body.messageId;
    const deadRead = mockRes();
    await ops(authed(oldCookie, {
      headers: { accept: 'application/json' },
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), deadRead);
    const deadConfirm = mockRes();
    await ops(authed(oldCookie, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      url: '/ops/api/ceo-bridge/confirm',
      query: { area: 'api/ceo-bridge/confirm' },
      body: { csrf: lib.createCsrfToken(ALLOWED), messageId },
    }), deadConfirm);
    const stillPending = mockRes();
    await ops({
      method: 'GET',
      headers: {
        host: 'www.lavaall.com',
        accept: 'application/json',
        authorization: 'Bearer test-ceo-bridge-secret-32chars!!',
      },
      query: { area: 'api/ceo-bridge/pending' },
      url: '/ops/api/ceo-bridge/pending',
    }, stillPending);
    const held = stillPending.body && stillPending.body.pending && stillPending.body.pending[0];
    const liveRead = mockRes();
    await ops(authed(freshCookie, {
      headers: { accept: 'application/json' },
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), liveRead);
    const liveConfirm = mockRes();
    await ops(authed(freshCookie, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      url: '/ops/api/ceo-bridge/confirm',
      query: { area: 'api/ceo-bridge/confirm' },
      body: { csrf: lib.createCsrfToken(ALLOWED), messageId },
    }), liveConfirm);
    const both = mockRes();
    await ops(authed(freshCookie, { headers: { accept: 'text/html' } }), both);
    const deadBody = JSON.stringify(deadRead.body || {});
    check('a cookie invalidated by Sign out all sessions cannot read routine health or confirm a queued action',
      posted.statusCode === 200
      && queued.statusCode === 200
      && Boolean(messageId)
      && deadRead.statusCode === 403
      && deadRead.body
      && deadRead.body.error === 'forbidden'
      && !deadBody.includes('signed-out-cookie-must-not-see-this')
      && !deadBody.includes('kit-registry-eod-sync')
      && deadConfirm.statusCode === 403
      && deadConfirm.body
      && deadConfirm.body.error === 'forbidden'
      && held
      && held.mayAct === false
      && held.actionStatus === 'needs_founder_confirm'
      && liveRead.statusCode === 200
      && liveRead.body
      && liveRead.body.routines
      && liveRead.body.routines[0].reason === 'signed-out-cookie-must-not-see-this'
      && liveConfirm.statusCode === 200
      && liveConfirm.body
      && liveConfirm.body.ok === true
      && liveConfirm.body.pending
      && liveConfirm.body.pending.mayAct === true
      && liveConfirm.body.pending.actionStatus === 'confirmed'
      && both.statusCode === 200
      && String(both.raw).includes('id="signin-history"')
      && String(both.raw).includes('Sign out all sessions')
      && String(both.raw).includes('id="routine-health"')
      && String(both.raw).includes('ops-routine-health.js'));
    delete process.env.OPS_ROUTINE_HEALTH_ENABLED;
    delete process.env.OPS_CEO_BRIDGE_SECRET;
    health.resetRoutineHealth();
    ceo.resetCeoBridge();
  }

  {
    const prior = kv.lists[previewKeys.log] ? kv.lists[previewKeys.log].length : 0;
    for (let i = 0; i < hard.MAX_EVENTS + 5; i += 1) {
      await hard.noteSignIn(jsonReq({ headers: { 'x-forwarded-for': '198.51.100.40' } }), ALLOWED, 'signed_in');
    }
    const logged = eventsOf(kv, previewKeys.log);
    check('the sign-in log keeps about the last 200 events',
      logged.length === hard.MAX_EVENTS
      && logged.length < prior + hard.MAX_EVENTS + 5
      && kv.calls.some((cmd) => cmd[0] === 'LTRIM' && cmd[1] === previewKeys.log && Number(cmd[3]) === hard.MAX_EVENTS - 1));
  }

  {
    process.env.VERCEL_ENV = 'production';
    const prod = hard.signInKeys();
    const previewLen = (kv.lists[previewKeys.log] || []).length;
    await hard.noteSignIn(jsonReq({ headers: { 'x-forwarded-for': '198.51.100.41' } }), ALLOWED_2, 'signed_in');
    check('production sign-in log does not use the preview prefix',
      prod.log === 'lavaall-ops-signin-log-v1'
      && eventsOf(kv, prod.log).some((event) => event.who === ALLOWED_2 && event.result === 'signed_in')
      && (kv.lists[previewKeys.log] || []).length === previewLen);
    process.env.VERCEL_ENV = 'preview';
  }

  {
    global.fetch = async () => { throw new Error('kv down'); };
    lib.resetAuthState();
    const token = lib.createMagicToken(ALLOWED_2);
    const ok = mockRes();
    await auth({
      method: 'GET',
      headers: { accept: 'application/json', host: 'www.lavaall.com', 'x-forwarded-for': '198.51.100.60' },
      query: { token },
      url: `/api/ops/auth?token=${encodeURIComponent(token)}`,
    }, ok);
    check('sign-in still works when KV is unavailable',
      ok.statusCode === 200 && ok.body && ok.body.ok === true && ok.body.email === ALLOWED_2);
    const cookie = cookiePair(ok.headers['Set-Cookie']);
    const page = mockRes();
    await ops(authed(cookie), page);
    check('an existing session still opens /ops when KV is unavailable',
      page.statusCode === 200 && String(page.raw).includes(ALLOWED_2));
    const revoke = mockRes();
    await auth(jsonReq({
      headers: { cookie, 'x-forwarded-for': '198.51.100.61' },
      body: { action: 'signout-all', csrf: lib.createCsrfToken(ALLOWED_2) },
    }), revoke);
    check('sign out all reports failure when KV is unavailable',
      revoke.statusCode === 503 && revoke.body && revoke.body.error === 'store_unavailable');
  }

  {
    delete process.env.OPS_SIGNIN_HARDENING_ENABLED;
    installKvRestore();
    kv.strings[previewKeys.generation] = '5';
    lib.resetAuthState();
    const legacy = lib.createSessionToken(ALLOWED);
    const before = kv.calls.length;
    const page = mockRes();
    await ops(authed(`${lib.SESSION_COOKIE}=${encodeURIComponent(legacy)}`), page);
    const signinCalls = kv.calls.slice(before).filter((cmd) => String(cmd[1] || '').includes('signin'));
    check('flag off ignores a higher stored generation',
      page.statusCode === 200
      && String(page.raw).includes(ALLOWED)
      && !String(page.raw).includes('id="signin-history"')
      && signinCalls.length === 0);
  }

  delete process.env.OPS_SIGNIN_HARDENING_ENABLED;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.VERCEL_ENV;
  delete process.env.OPS_MAGIC_LINK_WEBHOOK_URL;
  delete process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID;
  delete process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET;
  global.fetch = origFetch;
  lib.resetAuthState();
  google.resetGoogleSignInState();

  let failed = 0;
  for (const row of results) {
    console.log((row.pass ? 'PASS' : 'FAIL') + ' - ' + row.name);
    if (!row.pass) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run();
