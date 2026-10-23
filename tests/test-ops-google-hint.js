// Google sign-in sends login_hint (a fixed founder account) alongside prompt=select_account.
// Drives the real auth.js start handler and buildAuthorizeUrl. No network.

const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const auth = require(path.join(opsDir, 'auth.js'));
const google = require(path.join(opsDir, '_google_signin.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const HINT = 'osmanjalloh104@gmail.com';
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[String(k)] = v; return res; };
  res.send = (b) => { try { res.body = JSON.parse(b); } catch { res.body = b; } return res; };
  return res;
}
let ip = 0;
async function start(host, body) {
  lib.resetAuthState();
  google.resetGoogleSignInState();
  const res = mockRes();
  await auth({
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', host, 'x-forwarded-proto': 'https', 'x-forwarded-for': `203.0.113.${100 + (ip++ % 100)}` },
    body: body || { action: 'google' },
  }, res);
  return res;
}
const params = (res) => new URL(res.body.redirect).searchParams;

(async () => {
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.VERCEL_ENV = 'production';
  process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID = 'signin-client';
  process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET = 'signin-secret-value';
  delete process.env.OPS_SIGNIN_HARDENING_ENABLED;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network is off'); };

  // ---- the request the real handler builds -----------------------------------
  const res = await start('www.lavaall.com');
  const q = params(res);
  check('start succeeds and redirects to Google', res.statusCode === 200 && res.body.ok === true && new URL(res.body.redirect).origin === 'https://accounts.google.com');
  check('login_hint is the founder account', q.get('login_hint') === HINT);
  check('prompt=select_account is still sent', q.get('prompt') === 'select_account');
  check('login_hint is sent exactly once', q.getAll('login_hint').length === 1 && q.getAll('prompt').length === 1);
  const NAMES = ['access_type', 'client_id', 'code_challenge', 'code_challenge_method', 'include_granted_scopes', 'login_hint', 'nonce', 'prompt', 'redirect_uri', 'response_type', 'scope', 'state'];
  check('the parameters are the old ones plus login_hint, nothing else', [...new Set(q.keys())].sort().join() === NAMES.join());
  check('everything else is unchanged', q.get('response_type') === 'code' && q.get('scope') === 'openid email' && q.get('code_challenge_method') === 'S256' && q.get('access_type') === 'online' && q.get('include_granted_scopes') === 'false' && q.get('redirect_uri') === 'https://www.lavaall.com/api/ops/auth' && q.get('client_id') === 'signin-client');
  check('PKCE challenge, state and nonce are still present', q.get('code_challenge').length >= 40 && q.get('state').length >= 16 && q.get('nonce').length >= 16);
  check('the OAuth state cookie is still set (HttpOnly)', /lavaall_ops_oauth=/.test(String([].concat(res.headers['Set-Cookie'] || []).join(';'))) && /HttpOnly/.test(String([].concat(res.headers['Set-Cookie'] || []).join(';'))));
  check('the hint is the same for the apex and a preview host', params(await start('lavaall.com')).get('login_hint') === HINT && params(await start('lavaal-git-test-osman14.vercel.app')).get('login_hint') === HINT);

  // ---- the hint is fixed: nothing in the request can change it -------------------
  const hostile = await start('www.lavaall.com', { action: 'google', login_hint: 'attacker@example.com', prompt: 'none', redirect: 'https://evil.example', email: 'attacker@example.com' });
  const hq = params(hostile);
  check('a request cannot inject its own login_hint', hq.get('login_hint') === HINT && hq.getAll('login_hint').length === 1);
  check('a request cannot turn off the account chooser', hq.get('prompt') === 'select_account');
  check('a request cannot change the redirect', hq.get('redirect_uri') === 'https://www.lavaall.com/api/ops/auth');

  // ---- the hint is a hint, not authorisation ----------------------------------------
  check('the hinted account is on the founder allowlist (so the hint cannot be a typo)', lib.isAllowlisted(HINT) && lib.ALLOWLIST.includes(HINT));
  check('the allowlist is unchanged: still exactly the two founders', lib.ALLOWLIST.length === 2 && lib.ALLOWLIST.includes('abdulhbah55@gmail.com'));
  check('a non-allowlisted account is still refused', lib.isAllowlisted('attacker@example.com') === false);

  // ---- direct builder ---------------------------------------------------------------
  const url = google.buildAuthorizeUrl({ origin: 'https://www.lavaall.com', state: 's'.repeat(24), nonce: 'n'.repeat(24), codeVerifier: 'v'.repeat(48) });
  const du = new URL(url);
  check('buildAuthorizeUrl includes both prompt and login_hint', du.searchParams.get('prompt') === 'select_account' && du.searchParams.get('login_hint') === HINT);
  check('buildAuthorizeUrl still refuses a disallowed origin', google.buildAuthorizeUrl({ origin: 'https://evil.example', state: 's', nonce: 'n', codeVerifier: 'v' }) === '');
  check('the email is URL-encoded in the query', /login_hint=osmanjalloh104%40gmail\.com/.test(url));

  // ---- scope of the change --------------------------------------------------------------
  const src = fs.readFileSync(path.join(opsDir, '_google_signin.js'), 'utf8');
  check('the hint is a single hard-coded constant, not read from env, request or storage', (src.match(/GOOGLE_LOGIN_HINT/g) || []).length === 2 && /const GOOGLE_LOGIN_HINT = '[^']+';/.test(src) && !/process\.env\.[A-Z_]*HINT/.test(src));
  check('there is exactly one login_hint in the file and prompt is untouched', (src.match(/login_hint:/g) || []).length === 1 && (src.match(/prompt: 'select_account'/g) || []).length === 1);

  globalThis.fetch = realFetch;
  const failedChecks = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failedChecks.length}/${results.length} passed`);
  process.exit(failedChecks.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
