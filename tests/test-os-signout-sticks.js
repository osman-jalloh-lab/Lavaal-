// Exercise sign-out through the real OS, auth, and login handlers without network access.
const lib = require('../api/ops/_lib');
const auth = require('../api/ops/auth');
const ops = require('../api/ops');
const os = require('../api/os');

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }
function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; return res; };
  res.send = (body) => {
    try { res.body = JSON.parse(body); } catch { res.body = body; }
    return res;
  };
  return res;
}
const cookies = (res) => [].concat(res.headers['Set-Cookie'] || []);
const clears = (res, name) => cookies(res).some((c) => c.startsWith(name + '=;') && /Max-Age=0(?:;|$)/.test(c));
const sessionCookies = (res) => cookies(res).filter((c) => c.startsWith('lavaall_ops='));
let ip = 0;
function request(extra = {}) {
  return Object.assign({ method: 'GET', query: {}, headers: {
    host: 'www.lavaall.com', 'x-forwarded-proto': 'https',
    'x-forwarded-for': `203.0.113.${++ip}`, accept: 'text/html',
  } }, extra);
}
function applyCookies(jar, res) {
  for (const cookie of cookies(res)) {
    const [pair] = cookie.split(';');
    const pos = pair.indexOf('=');
    const name = pair.slice(0, pos);
    if (/Max-Age=0(?:;|$)/.test(cookie)) delete jar[name];
    else jar[name] = pair.slice(pos + 1);
  }
  return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ');
}

(async () => {
  process.env.OPS_AUTH_SECRET = 'test-ops-auth-secret-32chars!!';
  process.env.OPS_GOOGLE_SIGNIN_CLIENT_ID = 'fake-client';
  process.env.OPS_GOOGLE_SIGNIN_CLIENT_SECRET = 'fake-secret';
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'OPS_STORE_FILE', 'VERCEL', 'OPS_SIGNIN_HARDENING_ENABLED', 'OPS_INSTANT_LOGIN', 'OPS_PREVIEW_INSTANT_LOGIN'].forEach((key) => { delete process.env[key]; });
  process.env.VERCEL_ENV = 'production';
  globalThis.fetch = async () => { throw new Error('network is off'); };

  const jar = { lavaall_ops: encodeURIComponent(lib.createSessionToken('osmanjalloh104@gmail.com')), 'lavaall-os-return': 'os' };
  const signedIn = mockRes();
  const signedInReq = request();
  signedInReq.headers.cookie = Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ');
  await os(signedInReq, signedIn);
  check('signed-in founder opens OS with the logout form', signedIn.statusCode === 200 && /<form\b[^>]*method="post"[^>]*action="\/api\/ops\/auth"[^>]*>\s*<input\b[^>]*name="action"[^>]*value="logout"/i.test(String(signedIn.body)));

  const logout = mockRes();
  const logoutReq = request({ method: 'POST', body: 'action=logout' });
  Object.assign(logoutReq.headers, { cookie: signedInReq.headers.cookie, 'content-type': 'application/x-www-form-urlencoded' });
  await auth(logoutReq, logout);
  check('HTML logout redirects to /ops and clears the session cookie', logout.statusCode === 302 && logout.headers.Location === '/ops' && clears(logout, 'lavaall_ops') && sessionCookies(logout).every((c) => c.startsWith('lavaall_ops=;')));
  const jarCookie = applyCookies(jar, logout);
  check('applying logout cookies removes the session', !jar.lavaall_ops);

  const login = mockRes();
  const loginReq = request(); loginReq.headers.cookie = jarCookie;
  await ops(loginReq, login);
  const html = String(login.body);
  check('cleared jar opens a passive login page with a POST Google form', login.statusCode === 401 && html.includes('Sign in with Google') && !/<script/i.test(html) && !/http-equiv\s*=\s*["']refresh["']/i.test(html) && !/accounts\.google\.com\/o\/oauth2/i.test(html) && /<form\b[^>]*method="post"[^>]*action="\/api\/ops\/auth"[^>]*>[\s\S]*?<input\b[^>]*name="action"[^>]*value="google"/i.test(html));

  const osAgain = mockRes();
  const osReq = request(); osReq.headers.cookie = jarCookie;
  await os(osReq, osAgain);
  check('cleared jar cannot reopen OS or receive a session', osAgain.statusCode === 302 && osAgain.headers.Location === '/ops' && sessionCookies(osAgain).length === 0);

  const plainGet = mockRes();
  await auth(request(), plainGet);
  check('plain auth GET does not start Google or issue a session', plainGet.statusCode === 302 && /^\/ops\?error=/.test(plainGet.headers.Location || '') && !/accounts\.google\.com/.test(plainGet.headers.Location || '') && sessionCookies(plainGet).length === 0);

  const stale = mockRes();
  const staleReq = request(); staleReq.headers.cookie = 'lavaall-os-return=os';
  await ops(staleReq, stale);
  check('stale return cookie still shows the login page', stale.statusCode === 401 && String(stale.body).includes('Sign in with Google') && !stale.headers.Location);

  const jsonLogout = mockRes();
  const jsonReq = request({ method: 'POST', body: 'action=logout' });
  Object.assign(jsonReq.headers, { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', cookie: signedInReq.headers.cookie });
  await auth(jsonReq, jsonLogout);
  check('JSON logout returns ok and clears the session cookie', jsonLogout.statusCode === 200 && jsonLogout.body && jsonLogout.body.ok === true && clears(jsonLogout, 'lavaall_ops'));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
