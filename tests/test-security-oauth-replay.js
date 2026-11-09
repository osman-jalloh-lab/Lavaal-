// Plain Node regression tests; every outgoing request is mocked.
const google = require('../api/ops/_google_signin');
const limits = require('../api/_shared_limits');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

async function run() {
  const names = ['SECURITY_SHARED_LIMITS', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL_ENV'];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  const originalLog = console.log;
  const originalNow = Date.now;
  let now = 1800000000000;
  function reset() {
    google.resetGoogleSignInState();
    limits.resetSharedLimits();
  }
  try {
    Date.now = () => now;
    process.env.SECURITY_SHARED_LIMITS = '0';
    process.env.KV_REST_API_URL = 'https://example.com/kv';
    process.env.KV_REST_API_TOKEN = 'synthetic-test-token';
    process.env.VERCEL_ENV = 'preview';
    let offFetches = 0;
    global.fetch = async () => { offFetches++; throw new Error('Unexpected fetch'); };
    reset();
    check('flag off accepts first state', await google.consumeOAuthState('synthetic-local-state', now + 60000));
    check('flag off rejects replay', !(await google.consumeOAuthState('synthetic-local-state', now + 60000)));
    check('flag off does not fetch', offFetches === 0);
    now += 60001;
    check('flag off prunes expired state', await google.consumeOAuthState('synthetic-local-state', now + 60000));

    reset();
    for (let i = 0; i < 5001; i++) await google.consumeOAuthState('synthetic-bounded-' + i, now + 60000);
    check('bounded map retains newest state', !(await google.consumeOAuthState('synthetic-bounded-5000', now + 60000)));
    check('bounded map retains 5000th newest state', !(await google.consumeOAuthState('synthetic-bounded-1', now + 60000)));
    check('bounded map drops oldest beyond 5000 entries', await google.consumeOAuthState('synthetic-bounded-0', now + 60000));

    process.env.SECURITY_SHARED_LIMITS = '1';
    const kv = new Map();
    const bodies = [];
    global.fetch = async (url, opts) => {
      if (url !== 'https://example.com/kv/pipeline') throw new Error('Unexpected URL');
      bodies.push(opts.body);
      const commands = JSON.parse(opts.body);
      return { ok: true, json: async () => commands.map(command => {
        const [op, key, value, px, ttl, nx] = command;
        if (op !== 'SET' || px !== 'PX' || nx !== 'NX') throw new Error('Unexpected KV command');
        if (kv.has(key) && kv.get(key).expires > now) return { result: null };
        kv.set(key, { value, expires: now + Number(ttl) });
        return { result: 'OK' };
      }) };
    };
    reset();
    const state = 'synthetic-cross-instance-oauth-state';
    check('shared mode accepts state on first instance', await google.consumeOAuthState(state, now + 60000));
    reset(); // Simulate another instance while retaining shared KV contents.
    check('shared mode blocks replay on second instance', !(await google.consumeOAuthState(state, now + 60000)));
    check('raw state never appears in KV body', bodies.length === 2 && bodies.every(body => !body.includes(state)));
    check('shared TTL includes 30 second grace', JSON.parse(bodies[0])[0][4] === '90000');
    await google.consumeOAuthState('synthetic-minimum-ttl-state', now - 60000);
    check('shared TTL has one second minimum', JSON.parse(bodies[bodies.length - 1])[0][4] === '1000');

    reset();
    let failedFetches = 0;
    global.fetch = async () => { failedFetches++; throw new Error('Synthetic KV outage'); };
    console.log = () => {};
    check('KV error falls back to memory for first consume', await google.consumeOAuthState('synthetic-fallback-state', now + 60000));
    check('KV error memory fallback rejects replay', !(await google.consumeOAuthState('synthetic-fallback-state', now + 60000)));
    check('fallback exercises mocked KV error', failedFetches === 2);
  } finally {
    global.fetch = originalFetch;
    console.log = originalLog;
    Date.now = originalNow;
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
    reset();
  }
  let failed = 0;
  for (const result of results) {
    console.log((result.pass ? 'PASS' : 'FAIL') + ' - ' + result.name);
    if (!result.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
