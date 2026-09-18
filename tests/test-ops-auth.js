// Tests for api/ops magic-link auth — mocks req/res/fetch so these run in plain node.
const fs = require('fs');
const path = require('path');

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

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.OPS_MAGIC_LINK_WEBHOOK_URL = 'https://example.test/ops-mail';
  process.env.OPS_MAGIC_LINK_WEBHOOK_SECRET = 'hook-secret';
  delete process.env.RESEND_API_KEY;
  delete process.env.OPS_FROM_EMAIL;
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
    check('/ops login HTML is dark operational UI', String(res.raw).includes('#0A0A14') && String(res.raw).includes('#00C2FF'));
  }

  {
    delete process.env.OPS_MAGIC_LINK_WEBHOOK_URL;
    const res = mockRes();
    await auth(jsonReq({ body: { action: 'request', email: ALLOWED } }), res);
    check('request without a mail sender returns 503 for everyone', res.statusCode === 503 && res.body && res.body.error === 'delivery_not_configured');
    process.env.OPS_MAGIC_LINK_WEBHOOK_URL = 'https://example.test/ops-mail';
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
    check('/ops with a session shows the signed-in placeholder', res.statusCode === 200 && String(res.raw).includes('signed in as') && String(res.raw).includes(ALLOWED.toLowerCase()));
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
    check('/ops after logout is the login page again', res.statusCode === 401 && String(res.raw).includes('Email me a sign-in link'));
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
    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
    const sources = vercel.rewrites.map((row) => row.source + '->' + row.destination);
    check('public / still rewrites to index.html', sources.includes('/->/index.html'));
    check('public /schedule still rewrites to index.html', sources.includes('/schedule->/index.html'));
    check('/ops is rewritten to the session gate', sources.includes('/ops->/api/ops') && sources.includes('/ops/:path*->/api/ops'));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    check('public index.html is not login-gated and does not advertise /ops', home.includes('Enterprise IT Hardware') && !home.includes('href="/ops"') && !home.includes("href='/ops'"));
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
