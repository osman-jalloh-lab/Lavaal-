// Return-to-/os after sign-in. Drives the real api/ops/auth.js and api/os/index.js with mocked req/res/fetch.
// The cookie only ever chooses between the fixed paths "/os" and "/ops"; nothing from a request becomes a URL.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const opsDir = path.join(root, 'api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const auth = require(path.join(opsDir, 'auth.js'));
const google = require(path.join(opsDir, '_google_signin.js'));
const ret = require(path.join(opsDir, '_os_return.js'));
const os = require(path.join(root, 'api/os/index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const DENIED = 'stranger@example.com';
const RET = `${ret.OS_RETURN_COOKIE}=os`;

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
    } else if (key.toLowerCase() === 'set-cookie') {
      res.headers['Set-Cookie'] = v;
    } else {
      res.headers[key] = v;
    }
    return res;
  };
  res.send = (b) => {
    res.raw = b;
    if (typeof b === 'string' && (b.startsWith('{') || b.startsWith('['))) { try { res.body = JSON.parse(b); } catch { res.body = b; } } else res.body = b;
    return res;
  };
  return res;
}
const setCookies = (res) => { const raw = res.headers['Set-Cookie']; return raw == null ? [] : (Array.isArray(raw) ? raw : [raw]); };
const cookieNamed = (res, name) => setCookies(res).find((c) => String(c).startsWith(name + '='));
const pairOf = (c) => String(c).split(';')[0];
let ipN = 0;
const nextIp = () => `203.0.113.${100 + (ipN++ % 100)}`;
const req = (extra) => Object.assign({ method: 'GET', headers: {}, query: {} }, extra);
const headers = (h) => Object.assign({ host: 'preview.example.test', 'x-forwarded-proto': 'https', 'x-forwarded-for': nextIp(), accept: 'text/html' }, h);

(async () => {
  process.env.OPS_AUTH_SECRET = SECRET;
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'OPS_STORE_FILE', 'VERCEL', 'OPS_SIGNIN_HARDENING_ENABLED', 'OPS_INSTANT_LOGIN', 'OPS_PREVIEW_INSTANT_LOGIN'].forEach((k) => { delete process.env[k]; });
  process.env.VERCEL_ENV = 'production';
  process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID = 'signin-client';
  process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET = 'signin-secret-value';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network is off'); };

  // ---- the helper -------------------------------------------------------------
  const asReq = (cookie) => ({ headers: cookie == null ? {} : { cookie } });
  check('the exact cookie sends the founder to /os', ret.postSignInPath(asReq(RET)) === '/os');
  check('no cookie means /ops, as before', ret.postSignInPath(asReq()) === '/ops' && ret.postSignInPath(asReq('')) === '/ops');
  check('other cookies do not matter', ret.postSignInPath(asReq('a=1; ' + RET + '; b=2')) === '/os' && ret.postSignInPath(asReq('a=1; b=2')) === '/ops');
  const hostile = ['OS', 'oS', '/os', '/os/', '//evil.example', 'https://evil.example', 'os\r\nSet-Cookie: x=y', '/ops', 'ops', '1', 'true', 'os%00', 'osos', 'os.evil', 'os/../ops', '%2Fos', 'o s'];
  check('any value that is not exactly "os" falls back to /ops', hostile.every((v) => ret.postSignInPath(asReq(`${ret.OS_RETURN_COOKIE}=${v}`)) === '/ops'));
  // The shared cookie parser trims whitespace, splits on ";" and URL-decodes. These all parse to exactly "os",
  // so they mean "os" and give the same fixed /os; none of them can produce any other destination.
  const sameAsOs = ['os ', ' os', 'os;evil', '%6f%73'];
  check('values that cookie parsing turns into exactly "os" behave as "os"', sameAsOs.every((v) => ret.postSignInPath(asReq(`${ret.OS_RETURN_COOKIE}=${v}`)) === '/os'));
  check('the answer is always one of two fixed paths', [RET, '', 'x=y', `${ret.OS_RETURN_COOKIE}=https://evil.example`].every((c) => ['/os', '/ops'].includes(ret.postSignInPath(asReq(c)))));
  const set = ret.osReturnCookie({ headers: { host: 'www.lavaall.com', 'x-forwarded-proto': 'https' } });
  check('return cookie is HttpOnly, SameSite=Lax, Path=/, 10 minutes, Secure on https', /HttpOnly/.test(set) && /SameSite=Lax/.test(set) && /Path=\//.test(set) && /Max-Age=600/.test(set) && /Secure/.test(set) && set.startsWith(RET + ';'));
  check('not Secure on localhost, so local testing works', !/Secure/.test(ret.osReturnCookie({ headers: { host: 'localhost:3000' } })));
  check('clear cookie expires immediately', /Max-Age=0/.test(ret.clearOsReturnCookie(asReq())) && ret.clearOsReturnCookie(asReq()).startsWith(ret.OS_RETURN_COOKIE + '=;'));

  // ---- /os remembers where to come back to --------------------------------------
  const anon = mockRes();
  await os(req({ headers: headers(), query: { area: '' } }), anon);
  check('anonymous page -> 302 /ops and sets the return cookie', anon.statusCode === 302 && anon.headers.Location === '/ops' && Boolean(cookieNamed(anon, ret.OS_RETURN_COOKIE)) && pairOf(cookieNamed(anon, ret.OS_RETURN_COOKIE)) === RET);
  const anonJson = mockRes();
  await os(req({ headers: headers({ accept: 'application/json' }), query: { area: '' } }), anonJson);
  check('JSON requests get 401 and no cookie', anonJson.statusCode === 401 && !cookieNamed(anonJson, ret.OS_RETURN_COOKIE));
  const agent = mockRes();
  await os(req({ headers: headers({ authorization: 'Bearer x', cookie: `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(ALLOWED))}` }), query: { area: '' } }), agent);
  check('agent requests get 403 and no cookie', agent.statusCode === 403 && !cookieNamed(agent, ret.OS_RETURN_COOKIE));
  const signedIn = mockRes();
  await os(req({ headers: headers({ cookie: `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(ALLOWED))}` }), query: { area: '' } }), signedIn);
  check('a signed-in founder gets the page and no return cookie', signedIn.statusCode === 200 && !cookieNamed(signedIn, ret.OS_RETURN_COOKIE));

  // ---- magic-link sign-in -------------------------------------------------------
  lib.resetAuthState();
  const withCookie = mockRes();
  await auth(req({ headers: headers({ cookie: RET }), query: { token: lib.createMagicToken(ALLOWED) } }), withCookie);
  const sess = cookieNamed(withCookie, lib.SESSION_COOKIE);
  check('magic link with the return cookie lands on /os', withCookie.statusCode === 302 && withCookie.headers.Location === '/os');
  check('...and still issues the session cookie', Boolean(sess) && /HttpOnly/.test(sess) && !/Max-Age=0/.test(sess));
  check('...and clears the return cookie', /Max-Age=0/.test(cookieNamed(withCookie, ret.OS_RETURN_COOKIE) || ''));
  const landed = mockRes();
  await os(req({ headers: headers({ cookie: pairOf(sess) }), query: { area: '' } }), landed);
  check('the session from that sign-in opens /os', landed.statusCode === 200 && /LAVAALL OS/.test(String(landed.raw)));

  lib.resetAuthState();
  const plain = mockRes();
  await auth(req({ headers: headers(), query: { token: lib.createMagicToken(ALLOWED) } }), plain);
  check('magic link without the cookie lands on /ops, as before', plain.statusCode === 302 && plain.headers.Location === '/ops' && Boolean(cookieNamed(plain, lib.SESSION_COOKIE)));
  lib.resetAuthState();
  const bad = mockRes();
  await auth(req({ headers: headers({ cookie: `${ret.OS_RETURN_COOKIE}=https://evil.example` }), query: { token: lib.createMagicToken(ALLOWED) } }), bad);
  check('a hostile cookie value cannot redirect anywhere else', bad.statusCode === 302 && bad.headers.Location === '/ops');
  lib.resetAuthState();
  const json = mockRes();
  await auth(req({ headers: headers({ accept: 'application/json', cookie: RET }), query: { token: lib.createMagicToken(ALLOWED) } }), json);
  check('the JSON response is unchanged (no redirect)', json.statusCode === 200 && json.body && json.body.ok === true && json.body.email === ALLOWED && !json.headers.Location);

  lib.resetAuthState();
  const tampered = lib.createMagicToken(ALLOWED);
  const failed = mockRes();
  await auth(req({ headers: headers({ cookie: RET }), query: { token: tampered.slice(0, -2) + (tampered.endsWith('aa') ? 'bb' : 'aa') } }), failed);
  check('a failed magic link never goes to /os and issues no session', failed.statusCode === 302 && /^\/ops\?error=/.test(failed.headers.Location) && !cookieNamed(failed, lib.SESSION_COOKIE));
  const expired = mockRes();
  await auth(req({ headers: headers({ cookie: RET }), query: { token: lib.createMagicToken(ALLOWED, { ttlMs: -60000 }) } }), expired);
  check('an expired magic link never goes to /os', /^\/ops\?error=/.test(expired.headers.Location) && !cookieNamed(expired, lib.SESSION_COOKIE));
  const asSession = mockRes();
  await auth(req({ headers: headers({ cookie: RET }), query: { token: lib.createSessionToken(ALLOWED) } }), asSession);
  check('a session token used as a magic link is still refused', /^\/ops\?error=/.test(asSession.headers.Location) && !cookieNamed(asSession, lib.SESSION_COOKIE));

  const logout = mockRes();
  await auth(req({ method: 'POST', headers: headers({ cookie: RET + '; ' + lib.SESSION_COOKIE + '=' + encodeURIComponent(lib.createSessionToken(ALLOWED)), 'content-type': 'application/x-www-form-urlencoded' }), body: { action: 'logout' } }), logout);
  check('logout still goes to /ops even with the cookie', logout.statusCode === 302 && logout.headers.Location === '/ops');

  // ---- Google sign-in -----------------------------------------------------------
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }); jwk.kid = 'test-kid'; jwk.alg = 'RS256'; jwk.use = 'sig';
  const signJwt = (payload) => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-kid', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${h}.${p}.${crypto.sign('sha256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`;
  };
  async function startGoogle() {
    lib.resetAuthState(); google.resetGoogleSignInState();
    const res = mockRes();
    await auth({ method: 'POST', headers: headers({ accept: 'application/json', 'content-type': 'application/json', host: 'www.lavaall.com' }), body: { action: 'google' } }, res);
    const row = cookieNamed(res, 'lavaall_ops_oauth');
    const value = decodeURIComponent(pairOf(row).slice('lavaall_ops_oauth='.length));
    const payload = JSON.parse(Buffer.from(value.slice(0, value.lastIndexOf('.')), 'base64url').toString('utf8'));
    return { pair: pairOf(row), payload };
  }
  async function callback(start, email, extraCookie) {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ iss: 'https://accounts.google.com', aud: 'signin-client', sub: 'sub-1', email, email_verified: true, nonce: start.payload.nonce, iat: now, exp: now + 300 });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ id_token: token, access_token: 'ya29.test' }) };
      if (u.includes('/certs')) return { ok: true, status: 200, json: async () => ({ keys: [jwk] }) };
      return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
    };
    const res = mockRes();
    await auth({ method: 'GET', headers: headers({ host: 'www.lavaall.com', cookie: start.pair + (extraCookie ? '; ' + extraCookie : '') }), query: { code: 'valid-code', state: start.payload.state } }, res);
    globalThis.fetch = async () => { throw new Error('network is off'); };
    return res;
  }

  const g1 = await callback(await startGoogle(), ALLOWED, RET);
  check('Google sign-in with the return cookie lands on /os', g1.statusCode === 302 && g1.headers.Location === '/os');
  check('...and issues a session and clears both the OAuth and return cookies', Boolean(cookieNamed(g1, lib.SESSION_COOKIE)) && /Max-Age=0/.test(cookieNamed(g1, ret.OS_RETURN_COOKIE) || '') && /Max-Age=0/.test(cookieNamed(g1, 'lavaall_ops_oauth') || ''));
  const g1land = mockRes();
  await os(req({ headers: headers({ cookie: pairOf(cookieNamed(g1, lib.SESSION_COOKIE)) }), query: { area: '' } }), g1land);
  check('the Google session opens /os', g1land.statusCode === 200);
  const g2 = await callback(await startGoogle(), ALLOWED, null);
  check('Google sign-in without the cookie lands on /ops, as before', g2.statusCode === 302 && g2.headers.Location === '/ops' && Boolean(cookieNamed(g2, lib.SESSION_COOKIE)));
  const g3 = await callback(await startGoogle(), ALLOWED, `${ret.OS_RETURN_COOKIE}=//evil.example`);
  check('Google sign-in with a hostile cookie lands on /ops', g3.headers.Location === '/ops');
  const g4 = await callback(await startGoogle(), DENIED, RET);
  check('a non-founder Google account never reaches /os and gets no session', !/^\/os/.test(String(g4.headers.Location || '')) && !cookieNamed(g4, lib.SESSION_COOKIE));
  const g5 = await callback(Object.assign(await startGoogle(), {}), ALLOWED, RET);
  const g5replay = mockRes();
  await auth({ method: 'GET', headers: headers({ host: 'www.lavaall.com', cookie: RET }), query: { code: 'x', state: 'wrong-state' } }, g5replay);
  check('a callback with no matching OAuth state never reaches /os and gets no session', !/^\/os/.test(String(g5replay.headers.Location || '')) && !cookieNamed(g5replay, lib.SESSION_COOKIE) && g5.headers.Location === '/os');

  // ---- scope of the change --------------------------------------------------------
  const src = fs.readFileSync(path.join(opsDir, 'auth.js'), 'utf8');
  check('auth.js asks postSignInPath in exactly the two success redirects', (src.match(/postSignInPath\(req\)/g) || []).length === 2 && (src.match(/clearOsReturnCookie\(req\)/g) || []).length === 2);
  check('auth.js imports the helper once', (src.match(/require\('\.\/_os_return'\)/g) || []).length === 1);
  const helper = fs.readFileSync(path.join(opsDir, '_os_return.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('the helper never reads the query, body or any URL', !/req\.(query|body|url)|queryOf|readBody|location|referer|origin/i.test(helper));
  check('only the two fixed paths appear in the helper', (helper.match(/'\/(os|ops)'/g) || []).sort().join() === "'/ops','/os'");

  globalThis.fetch = realFetch;
  const failedChecks = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failedChecks.length}/${results.length} passed`);
  process.exit(failedChecks.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
