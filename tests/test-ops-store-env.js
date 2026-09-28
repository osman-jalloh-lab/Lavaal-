// Preview must not read or write production /ops keys.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const storeEnv = require(path.join(root, 'api/ops/_store-env.js'));
const store = require(path.join(root, 'api/ops/_store.js'));
const dm = require(path.join(root, 'api/ops/_founders_dm.js'));
const hard = require(path.join(root, 'api/ops/_signin_hardening.js'));
const health = require(path.join(root, 'api/ops/_routine_health.js'));
const ceo = require(path.join(root, 'api/ops/_ceo_bridge.js'));
const desks = require(path.join(root, 'api/ops/_agent_thread.js'));
const kits = require(path.join(root, 'api/ops/_kits.js'));
const calendar = require(path.join(root, 'api/ops/_calendar.js'));
const gmail = require(path.join(root, 'api/ops/_gmail.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const PRODUCTION_NAMES = Object.freeze({
  office: 'lavaall-ops-v2',
  foundersDm: 'lavaall-ops-founders-dm-v1',
  foundersDmRead: 'lavaall-ops-founders-dm-v1:read',
  foundersDmLegacy: 'lavaall-ops-founders-dm-v1:legacy',
  signinLog: 'lavaall-ops-signin-log-v1',
  sessionGeneration: 'lavaall-ops-session-gen-v1',
  routineHealth: 'lavaall-ops-routine-health-v1',
  ceoPending: 'ops:ceo:pending',
  ceoThreadPrefix: 'ops:ceo:thread:',
  deskThreadPrefix: 'ops:agent:thread:',
});

async function withEnv(extra, fn) {
  const names = Object.keys(extra);
  const prior = {};
  names.forEach((name) => {
    prior[name] = process.env[name];
    if (extra[name] == null) delete process.env[name];
    else process.env[name] = extra[name];
  });
  try {
    return await fn();
  } finally {
    names.forEach((name) => {
      if (prior[name] == null) delete process.env[name];
      else process.env[name] = prior[name];
    });
  }
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) out.push(full);
  });
  return out;
}

const BYPASS = [
  /process\.env\.KV_REST_API_URL/,
  /process\.env\.KV_REST_API_TOKEN/,
  /process\.env\.PREVIEW_KV_REST_API_URL/,
  /process\.env\.PREVIEW_KV_REST_API_TOKEN/,
  /process\.env\.KV_URL\b/,
  /process\.env\.KV_REST_API_READ_ONLY_TOKEN/,
  /process\.env\.OPS_STORE_FILE/,
  /process\.env\[\s*['"](?:KV_REST_API_URL|KV_REST_API_TOKEN|PREVIEW_KV_REST_API_URL|PREVIEW_KV_REST_API_TOKEN|OPS_STORE_FILE|KV_URL|KV_REST_API_READ_ONLY_TOKEN)['"]\s*\]/,
  /@vercel\/kv|@upstash\/redis|ioredis|require\(['"]redis['"]\)/,
  /readPair\(/,
];

async function run() {
  const origFetch = global.fetch;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  delete process.env.PREVIEW_KV_REST_API_URL;
  delete process.env.PREVIEW_KV_REST_API_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_STORE_FILE;
  delete process.env.PREVIEW_KIT_REGISTRY_SHEET_ID;
  delete process.env.PREVIEW_OPS_GOOGLE_CALENDAR_ID;

  check('production key catalog matches the historical names byte for byte',
    Object.keys(PRODUCTION_NAMES).every((name) => storeEnv.PRODUCTION_KEYS[name] === PRODUCTION_NAMES[name])
    && store.STORE_KEY === PRODUCTION_NAMES.office
    && dm.DM_KEY === PRODUCTION_NAMES.foundersDm
    && dm.READ_KEY === PRODUCTION_NAMES.foundersDmRead
    && dm.LEGACY_KEY === PRODUCTION_NAMES.foundersDmLegacy
    && hard.LOG_KEY === PRODUCTION_NAMES.signinLog
    && hard.GEN_KEY === PRODUCTION_NAMES.sessionGeneration
    && health.SNAPSHOT_KEY === PRODUCTION_NAMES.routineHealth
    && ceo.PENDING_KEY === PRODUCTION_NAMES.ceoPending
    && ceo.THREAD_KEY_PREFIX === PRODUCTION_NAMES.ceoThreadPrefix
    && desks.THREAD_KEY_PREFIX === PRODUCTION_NAMES.deskThreadPrefix);

  await withEnv({ VERCEL_ENV: null }, () => {
    const keys = dm.foundersDmKeys();
    check('unset VERCEL_ENV keeps production key names',
      storeEnv.deploymentEnv() === 'production'
      && storeEnv.key(store.STORE_KEY) === store.STORE_KEY
      && keys.thread === dm.DM_KEY
      && keys.read === dm.READ_KEY
      && keys.legacy === dm.LEGACY_KEY
      && hard.signInKeys().log === hard.LOG_KEY
      && hard.signInKeys().generation === hard.GEN_KEY
      && health.routineHealthKey() === health.SNAPSHOT_KEY
      && ceo.threadKey('abc123') === 'ops:ceo:thread:abc123'
      && desks.threadKey('sales', 'abc123') === 'ops:agent:thread:sales:abc123');
  });

  await withEnv({ VERCEL_ENV: 'Production' }, () => {
    check('Production (any case) does not prefix keys',
      storeEnv.deploymentEnv() === 'production'
      && storeEnv.key(PRODUCTION_NAMES.office) === PRODUCTION_NAMES.office
      && storeEnv.key(ceo.PENDING_KEY) === ceo.PENDING_KEY);
  });

  await withEnv({ VERCEL_ENV: 'production' }, () => {
    check('production module keys are byte-for-byte the historical names',
      storeEnv.key(store.STORE_KEY) === 'lavaall-ops-v2'
      && storeEnv.key(dm.DM_KEY) === 'lavaall-ops-founders-dm-v1'
      && storeEnv.key(dm.READ_KEY) === 'lavaall-ops-founders-dm-v1:read'
      && storeEnv.key(dm.LEGACY_KEY) === 'lavaall-ops-founders-dm-v1:legacy'
      && storeEnv.key(hard.LOG_KEY) === 'lavaall-ops-signin-log-v1'
      && storeEnv.key(hard.GEN_KEY) === 'lavaall-ops-session-gen-v1'
      && storeEnv.key(health.SNAPSHOT_KEY) === 'lavaall-ops-routine-health-v1'
      && storeEnv.key(ceo.PENDING_KEY) === 'ops:ceo:pending'
      && storeEnv.key(`${ceo.THREAD_KEY_PREFIX}ceo-1`) === 'ops:ceo:thread:ceo-1'
      && storeEnv.key(`${desks.THREAD_KEY_PREFIX}sales:t1`) === 'ops:agent:thread:sales:t1');
  });

  await withEnv({ VERCEL_ENV: 'preview' }, () => {
    const keys = dm.foundersDmKeys();
    check('preview prefixes every /ops key with preview:',
      storeEnv.keyPrefix() === 'preview:'
      && storeEnv.separationGuaranteed()
      && storeEnv.key(store.STORE_KEY) === 'preview:lavaall-ops-v2'
      && keys.thread === 'preview:lavaall-ops-founders-dm-v1'
      && keys.read === 'preview:lavaall-ops-founders-dm-v1:read'
      && keys.legacy === 'preview:lavaall-ops-founders-dm-v1:legacy'
      && hard.signInKeys().log === 'preview:lavaall-ops-signin-log-v1'
      && hard.signInKeys().generation === 'preview:lavaall-ops-session-gen-v1'
      && health.routineHealthKey() === 'preview:lavaall-ops-routine-health-v1'
      && ceo.threadKey('abc123') === 'preview:ops:ceo:thread:abc123'
      && desks.threadKey('sales', 'abc123') === 'preview:ops:agent:thread:sales:abc123'
      && storeEnv.key(storeEnv.key(store.STORE_KEY)) === 'preview:lavaall-ops-v2');
  });

  await withEnv({ VERCEL_ENV: 'development' }, () => {
    check('development prefixes every key with dev:',
      storeEnv.keyPrefix() === 'dev:'
      && storeEnv.key(store.STORE_KEY) === 'dev:lavaall-ops-v2'
      && dm.foundersDmKeys().thread === 'dev:lavaall-ops-founders-dm-v1'
      && health.routineHealthKey() === 'dev:lavaall-ops-routine-health-v1');
  });

  let fetches = [];
  global.fetch = async (url, opts) => {
    fetches.push({ url, body: opts && opts.body, auth: opts && opts.headers && opts.headers.Authorization });
    return { ok: true, json: async () => ({ result: 'OK' }) };
  };

  await withEnv({
    VERCEL_ENV: 'preview',
    KV_REST_API_URL: 'https://prod-kv.example.test',
    KV_REST_API_TOKEN: 'prod-token',
    PREVIEW_KV_REST_API_URL: 'https://preview-kv.example.test',
    PREVIEW_KV_REST_API_TOKEN: 'preview-token',
  }, async () => {
    fetches = [];
    await storeEnv.kvCommand(['SET', storeEnv.key(PRODUCTION_NAMES.office), '{}']);
    check('preview with dedicated credentials uses the preview database and a prefixed key',
      fetches.length === 1
      && fetches[0].url === 'https://preview-kv.example.test'
      && fetches[0].auth === 'Bearer preview-token'
      && JSON.parse(fetches[0].body)[1] === 'preview:lavaall-ops-v2');
  });

  await withEnv({
    VERCEL_ENV: 'preview',
    KV_REST_API_URL: 'https://prod-kv.example.test',
    KV_REST_API_TOKEN: 'prod-token',
    PREVIEW_KV_REST_API_URL: null,
    PREVIEW_KV_REST_API_TOKEN: null,
  }, async () => {
    fetches = [];
    await storeEnv.kvCommand(['GET', storeEnv.key(PRODUCTION_NAMES.office)]);
    check('preview without its own database still prefixes and may use the production client',
      fetches.length === 1
      && fetches[0].url === 'https://prod-kv.example.test'
      && fetches[0].auth === 'Bearer prod-token'
      && JSON.parse(fetches[0].body)[1] === 'preview:lavaall-ops-v2');
  });

  await withEnv({
    VERCEL_ENV: 'production',
    KV_REST_API_URL: 'https://prod-kv.example.test',
    KV_REST_API_TOKEN: 'prod-token',
    PREVIEW_KV_REST_API_URL: 'https://preview-kv.example.test',
    PREVIEW_KV_REST_API_TOKEN: 'preview-token',
  }, async () => {
    fetches = [];
    await storeEnv.kvCommand(['SET', storeEnv.key(PRODUCTION_NAMES.office), '{"goal":null}']);
    const body = JSON.parse(fetches[0].body);
    check('production ignores preview credentials and keeps the historical key',
      fetches.length === 1
      && fetches[0].url === 'https://prod-kv.example.test'
      && fetches[0].auth === 'Bearer prod-token'
      && body[0] === 'SET'
      && body[1] === 'lavaall-ops-v2');
  });

  await withEnv({
    VERCEL_ENV: 'preview',
    KV_REST_API_URL: 'https://prod-kv.example.test',
    KV_REST_API_TOKEN: 'prod-token',
  }, async () => {
    fetches = [];
    let caught = null;
    try {
      await storeEnv.kvCommand(['SET', PRODUCTION_NAMES.office, '{}']);
    } catch (err) {
      caught = err;
    }
    check('an unprefixed preview write throws 503 and does not call KV',
      caught
      && caught.code === 'unprefixed_preview_key'
      && caught.statusCode === 503
      && fetches.length === 0);
  });

  await withEnv({
    VERCEL_ENV: 'preview',
    KV_REST_API_URL: 'https://prod-kv.example.test',
    KV_REST_API_TOKEN: 'prod-token',
    PREVIEW_KV_REST_API_URL: 'https://preview-kv.example.test',
    PREVIEW_KV_REST_API_TOKEN: null,
  }, async () => {
    fetches = [];
    let caught = null;
    try {
      await storeEnv.kvCommand(['SET', storeEnv.key(PRODUCTION_NAMES.office), '{}']);
    } catch (err) {
      caught = err;
    }
    check('a half-set preview database fails closed',
      caught
      && caught.code === 'preview_kv_incomplete'
      && caught.statusCode === 503
      && fetches.length === 0
      && storeEnv.kvConfigured() === false);
  });

  await withEnv({ VERCEL: '1', VERCEL_ENV: null, KV_REST_API_URL: 'https://prod-kv.example.test', KV_REST_API_TOKEN: 'prod-token' }, async () => {
    fetches = [];
    let caught = null;
    try {
      await storeEnv.kvCommand(['GET', PRODUCTION_NAMES.office]);
    } catch (err) {
      caught = err;
    }
    check('Vercel without VERCEL_ENV refuses the production key',
      storeEnv.deploymentEnv() === 'unknown'
      && caught
      && caught.statusCode === 503
      && fetches.length === 0);
  });

  await withEnv({ VERCEL_ENV: 'staging', KV_REST_API_URL: 'https://prod-kv.example.test', KV_REST_API_TOKEN: 'prod-token' }, async () => {
    let caught = null;
    try {
      storeEnv.key(PRODUCTION_NAMES.office);
    } catch (err) {
      caught = err;
    }
    check('an unknown VERCEL_ENV cannot name a production key',
      caught && caught.statusCode === 503 && storeEnv.separationGuaranteed() === false);
  });

  await withEnv({ VERCEL_ENV: null, OPS_STORE_FILE: '/tmp/lavaall-ops-v2.json' }, () => {
    check('local production file path is unchanged',
      storeEnv.opsStoreFile('') === '/tmp/lavaall-ops-v2.json'
      && storeEnv.opsStoreFile('.founders-dm.json') === '/tmp/lavaall-ops-v2.json.founders-dm.json');
  });

  await withEnv({ VERCEL_ENV: 'preview', OPS_STORE_FILE: '/tmp/lavaall-ops-v2.json' }, () => {
    check('preview local files are namespaced',
      storeEnv.opsStoreFile('') === '/tmp/lavaall-ops-v2.preview.json'
      && storeEnv.opsStoreFile('.ceo-bridge.json') === '/tmp/lavaall-ops-v2.json.ceo-bridge.preview.json');
  });

  await withEnv({ VERCEL_ENV: 'development', OPS_STORE_FILE: '/tmp/lavaall-ops-v2' }, () => {
    check('development local files use the dev marker',
      storeEnv.opsStoreFile('.desk-talk.json') === '/tmp/lavaall-ops-v2.desk-talk.dev.json');
  });

  await withEnv({
    VERCEL_ENV: 'preview',
    KV_REST_API_URL: 'https://prod-kv.example.test',
    KV_REST_API_TOKEN: 'prod-token',
  }, async () => {
    fetches = [];
    store.resetStore();
    const saved = await store.saveGoal({ title: 'Preview only goal', nextStep: 'Stay off production' });
    const body = fetches.map((call) => JSON.parse(call.body));
    check('office blob writes on preview use only the prefixed key',
      saved.ok === true
      && body.length > 0
      && body.every((cmd) => cmd[1] === 'preview:lavaall-ops-v2')
      && fetches.every((call) => call.url === 'https://prod-kv.example.test'));
    store.resetStore();
  });

  const knownSheet = '155IRHtVgDcAVXeeW6EU8X4fw7eOpjX4pgSejR92Ch_4';
  await withEnv({
    VERCEL_ENV: null,
    KIT_REGISTRY_SHEET_ID: null,
    PREVIEW_KIT_REGISTRY_SHEET_ID: null,
  }, () => {
    check('production kit sheet id is unchanged when unset', kits.sheetId() === knownSheet);
  });
  await withEnv({
    VERCEL_ENV: 'preview',
    KIT_REGISTRY_SHEET_ID: 'founder-sheet',
    PREVIEW_KIT_REGISTRY_SHEET_ID: null,
  }, () => {
    check('preview does not read the founder kit sheet', kits.sheetId() === '');
  });
  await withEnv({
    VERCEL_ENV: 'preview',
    KIT_REGISTRY_SHEET_ID: 'founder-sheet',
    PREVIEW_KIT_REGISTRY_SHEET_ID: knownSheet,
  }, () => {
    check('preview refuses the known founder kit sheet id', kits.sheetId() === '');
  });
  await withEnv({
    VERCEL_ENV: 'preview',
    KIT_REGISTRY_SHEET_ID: 'founder-sheet',
    PREVIEW_KIT_REGISTRY_SHEET_ID: 'preview-sheet-only',
  }, () => {
    check('preview can use a different kit sheet id', kits.sheetId() === 'preview-sheet-only');
  });

  await withEnv({
    VERCEL_ENV: 'production',
    OPS_GOOGLE_CALENDAR_ID: 'founder-cal@group.calendar.google.com',
    PREVIEW_OPS_GOOGLE_CALENDAR_ID: 'other-cal',
  }, () => {
    check('production calendar id ignores the preview calendar variable',
      calendar.calendarId() === 'founder-cal@group.calendar.google.com');
  });
  await withEnv({
    VERCEL_ENV: 'preview',
    OPS_GOOGLE_CALENDAR_ID: 'founder-cal@group.calendar.google.com',
    PREVIEW_OPS_GOOGLE_CALENDAR_ID: null,
  }, () => {
    check('preview does not use the founder calendar', calendar.calendarId() === '');
  });
  await withEnv({
    VERCEL_ENV: 'preview',
    OPS_GOOGLE_CALENDAR_ID: 'founder-cal@group.calendar.google.com',
    PREVIEW_OPS_GOOGLE_CALENDAR_ID: 'founder-cal@group.calendar.google.com',
  }, () => {
    check('preview refuses a copy of the founder calendar id', calendar.calendarId() === '');
  });

  await withEnv({
    VERCEL_ENV: 'preview',
    OPS_GMAIL_CLIENT_ID: 'id',
    OPS_GMAIL_CLIENT_SECRET: 'secret',
    OPS_GMAIL_REFRESH_TOKEN: 'token',
    OPS_GMAIL_FROM: 'support@lavaall.com',
  }, () => {
    check('preview does not open the live support@ mailbox',
      gmail.gmailConfigured() === true
      && gmail.supportInboxConfigured() === false
      && gmail.describeGmailSetup().previewIsolated === true);
  });
  await withEnv({
    VERCEL_ENV: 'production',
    OPS_GMAIL_CLIENT_ID: 'id',
    OPS_GMAIL_CLIENT_SECRET: 'secret',
    OPS_GMAIL_REFRESH_TOKEN: 'token',
    OPS_GMAIL_FROM: 'support@lavaall.com',
  }, () => {
    check('production support@ detection is unchanged',
      gmail.supportInboxConfigured() === true
      && gmail.describeGmailSetup().previewIsolated === false);
  });

  const roots = ['api', 'netlify', 'scripts'].map((dir) => path.join(root, dir));
  const files = roots.reduce((out, dir) => walk(dir, out), []);
  const helper = path.join(root, 'api/ops/_store-env.js');
  const offenders = [];
  files.forEach((file) => {
    if (file === helper) return;
    const text = fs.readFileSync(file, 'utf8');
    BYPASS.forEach((pattern) => {
      if (pattern.test(text)) offenders.push(`${path.relative(root, file)} ${pattern}`);
    });
  });
  check('no runtime module reads KV or the local store file except the helper', offenders.length === 0);

  const seed = fs.readFileSync(path.join(root, 'scripts/ops/seed-preview-demo.js'), 'utf8');
  check('the demo seed is off unless explicitly armed and stays on preview keys',
    seed.includes("SEED_PREVIEW_DEMO !== '1'")
    && seed.includes("deploymentEnv() !== 'preview'")
    && seed.includes('FAKE preview demo')
    && !/process\.env\.KV_REST_API_/.test(seed));

  global.fetch = origFetch;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.PREVIEW_KV_REST_API_URL;
  delete process.env.PREVIEW_KV_REST_API_TOKEN;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL;
  delete process.env.OPS_STORE_FILE;
  delete process.env.KIT_REGISTRY_SHEET_ID;
  delete process.env.PREVIEW_KIT_REGISTRY_SHEET_ID;
  delete process.env.OPS_GOOGLE_CALENDAR_ID;
  delete process.env.PREVIEW_OPS_GOOGLE_CALENDAR_ID;
  delete process.env.OPS_GMAIL_CLIENT_ID;
  delete process.env.OPS_GMAIL_CLIENT_SECRET;
  delete process.env.OPS_GMAIL_REFRESH_TOKEN;
  delete process.env.OPS_GMAIL_FROM;
  store.resetStore();

  let failed = 0;
  for (const row of results) {
    console.log((row.pass ? 'PASS' : 'FAIL') + ' - ' + row.name);
    if (!row.pass) failed += 1;
  }
  if (offenders.length) console.log(offenders.join('\n'));
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
