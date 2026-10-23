// LAVAALL OS local-only dev bypass: opens only with the flag, a non-production Node, no Vercel
// runtime, a loopback Host and peer, and no proxy headers. Everywhere else /os still answers
// 302 (page) or 401 (JSON). No network, no KV.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const os = require(path.join(root, 'api/os/index.js'));
const { localDevBypass } = require(path.join(root, 'api/ops/_os_guard.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; return res; };
  res.send = (b) => { res.body = b == null ? '' : String(b); return res; };
  return res;
}

function req(extra) {
  const e = extra || {};
  return {
    method: 'GET',
    headers: Object.assign({ host: 'localhost:3100', accept: 'text/html' }, e.headers),
    query: { area: '' },
    url: '/os',
    socket: { remoteAddress: e.peer === undefined ? '127.0.0.1' : e.peer },
  };
}

async function status(r) {
  const res = mockRes();
  await os(r, res);
  return res;
}

const KEYS = ['OS_DEV_BYPASS', 'NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'OPS_STORE_FILE', 'OPS_SIGNIN_HARDENING_ENABLED'];
function setEnv(vars) {
  KEYS.forEach((k) => { delete process.env[k]; });
  Object.assign(process.env, vars);
}

(async () => {
  process.env.OPS_AUTH_SECRET = 'test-ops-auth-secret-32chars!!';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network is off in this test'); };

  // 1. The bypass opens on a developer PC.
  setEnv({ OS_DEV_BYPASS: '1' });
  let res = await status(req());
  check('flag + loopback + no Vercel -> 200 page', res.statusCode === 200 && res.body.includes('<'));
  check('bypass page is not cacheable', res.headers['cache-control'] === 'no-store');
  res = await status(req({ headers: { host: '127.0.0.1:3100' } }));
  check('127.0.0.1 host also opens', res.statusCode === 200);

  // 2. Production and hosted environments stay closed even with the flag set.
  setEnv({ OS_DEV_BYPASS: '1', NODE_ENV: 'production' });
  res = await status(req());
  check('NODE_ENV=production + flag + localhost -> 302 to /ops', res.statusCode === 302 && res.headers.location === '/ops');
  res = await status(req({ headers: { accept: 'application/json' } }));
  check('NODE_ENV=production JSON request -> 401', res.statusCode === 401);

  ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL'].forEach((k) => {
    setEnv({ OS_DEV_BYPASS: '1', [k]: k === 'VERCEL' ? '1' : 'production' });
    check(`${k} set + flag + localhost -> closed`, localDevBypass(req()) === false);
  });
  setEnv({ OS_DEV_BYPASS: '1', VERCEL_ENV: 'preview' });
  res = await status(req());
  check('Vercel preview + flag -> 302', res.statusCode === 302);

  // 3. No flag, or any other flag value: closed.
  setEnv({});
  res = await status(req());
  check('no flag -> 302', res.statusCode === 302 && res.headers.location === '/ops');
  ['0', 'true', 'yes', ' 1', '1 ', ''].forEach((v) => {
    setEnv({ OS_DEV_BYPASS: v });
    check(`OS_DEV_BYPASS=${JSON.stringify(v)} -> closed`, localDevBypass(req()) === false);
  });

  // 4. Host and proxy tricks.
  setEnv({ OS_DEV_BYPASS: '1' });
  ['www.lavaall.com', 'localhost.evil.com', 'evil.com:3100', 'preview.example.test', '', '192.168.1.5:3100', 'localhost@evil.com'].forEach((h) => {
    check(`host ${JSON.stringify(h)} -> closed`, localDevBypass(req({ headers: { host: h } })) === false);
  });
  ['x-forwarded-host', 'x-forwarded-for', 'x-real-ip'].forEach((h) => {
    check(`${h} present -> closed`, localDevBypass(req({ headers: { [h]: '203.0.113.9' } })) === false);
  });
  check('non-loopback peer -> closed', localDevBypass(req({ peer: '203.0.113.9' })) === false);
  check('missing socket -> closed', localDevBypass({ method: 'GET', headers: { host: 'localhost' } }) === false);

  // 5. Agents are still refused first, bypass or not.
  res = await status(req({ headers: { authorization: 'Bearer anything' } }));
  check('agent credentials with bypass on -> 403', res.statusCode === 403);

  // 6. Wiring: the bypass is read only by the /os guard, never by /ops or auth.
  const opsDir = path.join(root, 'api/ops');
  const users = fs.readdirSync(opsDir).filter((f) => f.endsWith('.js')
    && fs.readFileSync(path.join(opsDir, f), 'utf8').includes('OS_DEV_BYPASS'));
  check('OS_DEV_BYPASS appears only in _os_guard.js', users.length === 1 && users[0] === '_os_guard.js');
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  check('.env.local is gitignored', /^\.env\.local$/m.test(ignore));
  check('.env.example does not turn the bypass on', !/^OS_DEV_BYPASS\s*=\s*1/m.test(fs.readFileSync(path.join(root, '.env.example'), 'utf8')));

  globalThis.fetch = realFetch;
  setEnv({});
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
