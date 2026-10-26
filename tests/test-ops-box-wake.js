// Send to CEO desk + instant box wake + queue-check sweep (no Slack).
const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const desks = require(path.join(opsDir, '_agent_thread.js'));
const wake = require(path.join(opsDir, '_wake.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
const WAKE_URL = 'https://box-wake.example.test/hooks/routine-abc';
const WAKE_TOKEN = 'test-box-wake-token-not-real-123';
const SWEEP_SECRET = 'test-wake-sweep-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.send = (b) => {
    if (typeof b === 'string' && (b.startsWith('{') || b.startsWith('['))) {
      try { res.body = JSON.parse(b); } catch { res.body = b; }
    } else {
      res.body = b;
    }
    return res;
  };
  return res;
}

function authed(extra) {
  return {
    method: extra.method || 'GET',
    headers: {
      cookie: `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(ALLOWED))}`,
      host: 'preview.example.test',
      accept: 'application/json',
      'content-type': 'application/json',
    },
    query: extra.query || {},
    url: extra.url || '/ops',
    body: extra.body,
  };
}

function sweepReq(secret) {
  const headers = { host: 'www.lavaall.com', accept: 'application/json' };
  if (secret) headers.authorization = `Bearer ${secret}`;
  return {
    method: 'GET',
    headers,
    query: { area: 'api/ceo-bridge/wake-sweep' },
    url: '/ops/api/ceo-bridge/wake-sweep',
  };
}

// Records box-wake POSTs; mode controls the box webhook's behavior.
const wakes = [];
const xaiCalls = [];
let wakeMode = 'ok';
function installFetch() {
  global.fetch = async (url, opts) => {
    const target = String(url);
    if (target === WAKE_URL) {
      wakes.push({ headers: (opts && opts.headers) || {}, raw: String((opts && opts.body) || ''), body: JSON.parse((opts && opts.body) || '{}') });
      if (wakeMode === 'throw') throw new Error('box down');
      if (wakeMode === 'hang') {
        return new Promise((resolve, reject) => {
          if (opts && opts.signal) opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      if (wakeMode === 'http500') return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (target.includes('api.x.ai')) {
      xaiCalls.push(target);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'xAI CEO reply.' } }] }) };
    }
    throw new Error(`unexpected fetch ${target}`);
  };
}

function reset() {
  store.resetStore();
  ceo.resetCeoBridge();
  desks.resetDeskTalk();
  wake.resetWake();
  wakes.length = 0;
  xaiCalls.length = 0;
  wakeMode = 'ok';
}

function noSecretsOrText(w, text) {
  const keys = Object.keys(w.body).sort().join(',');
  return keys === 'pendingId,queue'
    && !w.raw.includes(BRIDGE_SECRET)
    && !w.raw.includes(WAKE_TOKEN)
    && !w.raw.includes(ALLOWED)
    && (!text || !w.raw.includes(text));
}

async function ceoSend(text, extra) {
  const res = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/api/ceo-bridge/message',
    query: { area: 'api/ceo-bridge/message' },
    body: Object.assign({ csrf: lib.createCsrfToken(ALLOWED), text }, extra || {}),
  }), res);
  return res;
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.OPS_CEO_BRIDGE_SECRET = BRIDGE_SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_BOX_WAKE_URL;
  delete process.env.OPS_BOX_WAKE_TOKEN;
  delete process.env.OPS_WAKE_SWEEP_SECRET;
  delete process.env.OPS_WAKE_MAX_ATTEMPTS;
  installFetch();

  // --- wakeBox unit seam ---
  reset();
  const unset = await wake.wakeBox({ queue: 'ceo', pendingId: 'p1' });
  check('wakeBox is a no-op when OPS_BOX_WAKE_URL is unset',
    unset.ok === true && unset.skipped === true && wakes.length === 0);

  process.env.OPS_BOX_WAKE_URL = WAKE_URL;
  process.env.OPS_BOX_WAKE_TOKEN = WAKE_TOKEN;
  const sent = await wake.wakeBox({ queue: 'ceo', pendingId: 'abc123' });
  check('wakeBox POSTs exactly { queue, pendingId } with the token only in the header',
    sent.ok === true
    && wakes.length === 1
    && wakes[0].body.queue === 'ceo'
    && wakes[0].body.pendingId === 'abc123'
    && noSecretsOrText(wakes[0])
    && wakes[0].headers.Authorization === `Bearer ${WAKE_TOKEN}`);

  const bad = await wake.wakeBox({ queue: 'slack', pendingId: 'abc' });
  const noId = await wake.wakeBox({ queue: 'ceo', pendingId: '' });
  check('wakeBox rejects unknown queues and empty ids without calling out',
    bad.skipped === true && noId.skipped === true && wakes.length === 1);

  process.env.OPS_BOX_WAKE_URL = 'http://insecure.example.test/hook';
  const insecure = await wake.wakeBox({ queue: 'ceo', pendingId: 'abc' });
  check('wakeBox refuses a non-https wake URL', insecure.skipped === true && wakes.length === 1);
  process.env.OPS_BOX_WAKE_URL = WAKE_URL;

  wakeMode = 'throw';
  const thrown = await wake.wakeBox({ queue: 'ceo', pendingId: 'abc' });
  wakeMode = 'http500';
  const http500 = await wake.wakeBox({ queue: 'ceo', pendingId: 'abc' });
  wakeMode = 'hang';
  const started = Date.now();
  const hung = await wake.wakeBox({ queue: 'ceo', pendingId: 'abc', timeoutMs: 150 });
  const elapsed = Date.now() - started;
  check('wakeBox ignores failures (throw, HTTP 500, timeout) without throwing',
    thrown.ok === false && http500.ok === false && hung.ok === false && hung.error === 'timeout' && elapsed < 1500);
  check('wakeBox default timeout is about 2 seconds', wake.DEFAULT_TIMEOUT_MS === 2000);

  // --- CEO Talk toggle ---
  reset();
  process.env.XAI_API_KEY = 'xai-test-key-not-real';
  const normal = await ceoSend('What should we focus on for the Freetown kits this week?', { correlationId: 'normal-1' });
  const afterNormal = (await ceo.listPending()).pending;
  check('normal CEO Talk keeps its xAI reply, queues nothing and wakes nothing',
    normal.statusCode === 200 && xaiCalls.length === 1 && afterNormal.length === 0 && wakes.length === 0);

  const BRIEF = 'Compare three Starlink installer quotes for Bo and Kenema';
  const toDesk = await ceoSend(BRIEF, { correlationId: 'desk-1', sendToCeoDesk: true });
  const pendingDesk = (await ceo.listPending()).pending;
  check('Send to CEO desk queues the message in ops:ceo:pending without an xAI call',
    toDesk.statusCode === 200
    && toDesk.body.waiting === true
    && xaiCalls.length === 1
    && pendingDesk.length === 1
    && pendingDesk[0].text === BRIEF
    && pendingDesk[0].wakeReason === 'send_to_ceo_desk');
  check('Send to CEO desk fires one ceo wake with the pending id and no text or secret',
    wakes.length === 1
    && wakes[0].body.queue === 'ceo'
    && wakes[0].body.pendingId === pendingDesk[0].messageId
    && noSecretsOrText(wakes[0], BRIEF));

  await ceoSend(BRIEF, { correlationId: 'desk-1', sendToCeoDesk: true });
  check('a replayed Send to CEO desk does not wake twice', wakes.length === 1);

  const form = await ceoSend('Plan the Monrovia install week', { correlationId: 'desk-2', sendToCeoDesk: 'on' });
  check('form checkbox value "on" also counts as Send to CEO desk',
    form.statusCode === 200 && wakes.length === 2 && xaiCalls.length === 1);

  reset();
  wakeMode = 'throw';
  const failingWake = await ceoSend(BRIEF, { correlationId: 'desk-3', sendToCeoDesk: '1' });
  check('a failing box wake never fails the founder send; the row stays queued',
    failingWake.statusCode === 200
    && failingWake.body.ok === true
    && (await ceo.listPending()).pending.length === 1);
  wakeMode = 'ok';

  // --- Tasks add-task toggle ---
  reset();
  const plain = mockRes();
  await ops(authed({ method: 'POST', url: '/ops/tasks', body: { action: 'add-task', title: 'Call the Bo installer' } }), plain);
  check('add-task without the toggle queues nothing and wakes nothing',
    plain.statusCode === 200 && (await ceo.listPending()).pending.length === 0 && wakes.length === 0);

  const queuedTask = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/tasks',
    body: { action: 'add-task', title: 'Draft the Kenema quote pack', nextAction: 'List the three kits', sendToCeoDesk: '1' },
  }), queuedTask);
  const taskPending = (await ceo.listPending()).pending;
  const savedTask = (await store.readStore()).tasks.find((row) => row.title === 'Draft the Kenema quote pack');
  check('add-task with Send to CEO desk saves the task and queues it for the CEO desk',
    queuedTask.statusCode === 200
    && savedTask
    && taskPending.length === 1
    && taskPending[0].text.includes('Draft the Kenema quote pack')
    && taskPending[0].text.includes('List the three kits')
    && taskPending[0].source === 'ops-tasks'
    && taskPending[0].founderAuthenticated === true
    && queuedTask.body.ceoDesk && queuedTask.body.ceoDesk.queued === true);
  check('add-task with Send to CEO desk links the task to the CEO thread',
    savedTask && savedTask.parentThreadId === taskPending[0].threadId
    && savedTask.parentCorrelationId === taskPending[0].correlationId);
  check('add-task with Send to CEO desk fires exactly one ceo wake, no task text',
    wakes.length === 1
    && wakes[0].body.queue === 'ceo'
    && wakes[0].body.pendingId === taskPending[0].messageId
    && noSecretsOrText(wakes[0], 'Kenema'));
  const pendingRes = mockRes();
  await ops({
    method: 'GET',
    headers: { host: 'www.lavaall.com', accept: 'application/json', authorization: `Bearer ${BRIDGE_SECRET}` },
    query: { area: 'api/ceo-bridge/pending' },
    url: '/ops/api/ceo-bridge/pending',
  }, pendingRes);
  const agentView = pendingRes.body && pendingRes.body.pending && pendingRes.body.pending[0];
  check('the CEO desk sees a Tasks item as founder-authenticated (C2 wrapper)',
    agentView && agentView.instruction === 'founder' && agentView.source === 'ops-tasks');

  // --- Assign wakes Researchy once ---
  reset();
  delete process.env.XAI_API_KEY;
  const assignRes = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/ceo-assign/message',
    query: { area: 'api/ceo-assign/message' },
    body: { csrf: lib.createCsrfToken(ALLOWED), text: 'assign to researchy: source USB-C docks for Freetown', correlationId: 'assign-wake-1', assign: 'researchy' },
  }), assignRes);
  const rPending = store.listResearchyPending(await store.readStore());
  check('Assign fires one researchy wake with the Researchy pending id and no brief',
    assignRes.statusCode === 200
    && rPending.length === 1
    && wakes.length === 1
    && wakes[0].body.queue === 'researchy'
    && wakes[0].body.pendingId === rPending[0].messageId
    && noSecretsOrText(wakes[0], 'USB-C'));
  check('Assign still does not use the CEO bridge queue', (await ceo.listPending()).pending.length === 0);

  // --- Queue-check sweep ---
  reset();
  const off = mockRes();
  await ops(sweepReq(SWEEP_SECRET), off);
  check('sweep endpoint is off (404) until OPS_WAKE_SWEEP_SECRET is set', off.statusCode === 404);

  process.env.OPS_WAKE_SWEEP_SECRET = SWEEP_SECRET;
  const noAuth = mockRes();
  await ops(sweepReq(''), noAuth);
  const wrongAuth = mockRes();
  await ops(sweepReq('wrong-secret-value-1234567890'), wrongAuth);
  const sessionOnly = mockRes();
  await ops(authed({ method: 'GET', url: '/ops/api/ceo-bridge/wake-sweep', query: { area: 'api/ceo-bridge/wake-sweep' } }), sessionOnly);
  check('sweep rejects missing, wrong, and session-only callers with 401',
    noAuth.statusCode === 401 && wrongAuth.statusCode === 401 && sessionOnly.statusCode === 401 && wakes.length === 0);

  const empty = mockRes();
  await ops(sweepReq(SWEEP_SECRET), empty);
  check('an empty sweep wakes nothing',
    empty.statusCode === 200 && empty.body.woke.length === 0 && wakes.length === 0
    && empty.body.waiting.ceo === 0 && empty.body.waiting.researchy === 0);

  // Queue a CEO item while the box webhook is down, then let the sweep retry.
  wakeMode = 'throw';
  await ceoSend('Check the Bo kit stock', { correlationId: 'sweep-1', sendToCeoDesk: true });
  wakeMode = 'ok';
  wakes.length = 0;
  const swept = mockRes();
  await ops(sweepReq(SWEEP_SECRET), swept);
  const ceoRow = (await ceo.listPending()).pending[0];
  check('sweep wakes the ceo queue once when an item is waiting',
    swept.statusCode === 200
    && swept.body.woke.join(',') === 'ceo'
    && wakes.length === 1
    && wakes[0].body.pendingId === ceoRow.messageId
    && noSecretsOrText(wakes[0], 'Bo kit'));
  check('sweep response has counts only, no queued text or emails',
    !JSON.stringify(swept.body).includes('Bo kit') && !JSON.stringify(swept.body).includes(ALLOWED));

  process.env.OPS_WAKE_MAX_ATTEMPTS = '2';
  await ops(sweepReq(SWEEP_SECRET), mockRes());
  await ops(sweepReq(SWEEP_SECRET), mockRes());
  check('sweep stops waking a held item after OPS_WAKE_MAX_ATTEMPTS successful wakes',
    wakes.length === 2);
  delete process.env.OPS_WAKE_MAX_ATTEMPTS;

  delete process.env.OPS_BOX_WAKE_URL;
  wake.resetWake();
  wakes.length = 0;
  const unconfigured = mockRes();
  await ops(sweepReq(SWEEP_SECRET), unconfigured);
  check('sweep with no OPS_BOX_WAKE_URL reports counts and calls nothing',
    unconfigured.statusCode === 200 && unconfigured.body.waiting.ceo === 1 && wakes.length === 0);

  // --- UI + wording ---
  reset();
  const ceoPage = mockRes();
  await ops(Object.assign(authed({ url: '/ops/chat?agent=lavaall-ceo', query: { area: 'chat', agent: 'lavaall-ceo' } }), {
    headers: Object.assign(authed({}).headers, { accept: 'text/html', 'content-type': 'text/html' }),
  }), ceoPage);
  const salesPage = mockRes();
  await ops(Object.assign(authed({ url: '/ops/chat?agent=sales', query: { area: 'chat', agent: 'sales' } }), {
    headers: Object.assign(authed({}).headers, { accept: 'text/html', 'content-type': 'text/html' }),
  }), salesPage);
  const tasksPage = mockRes();
  await ops(Object.assign(authed({ url: '/ops/tasks', query: { area: 'tasks' } }), {
    headers: Object.assign(authed({}).headers, { accept: 'text/html', 'content-type': 'text/html' }),
  }), tasksPage);
  const ceoHtml = String(ceoPage.body || '');
  check('CEO Talk shows the Send to CEO desk toggle',
    ceoHtml.includes('id="ceo-send-to-desk"') && ceoHtml.includes('name="sendToCeoDesk"'));
  check('other desks do not show the CEO desk toggle',
    String(salesPage.body || '').includes('ceo-bridge-form') && !String(salesPage.body || '').includes('ceo-send-to-desk'));
  check('Tasks add form shows the Send to CEO desk toggle',
    String(tasksPage.body || '').includes('id="task-send-to-desk-page"'));
  const chatJs = fs.readFileSync(path.join(__dirname, '../assets/js/ops-ceo-chat.js'), 'utf8');
  check('Talk client sends sendToCeoDesk only from the CEO toggle and unticks after send',
    chatJs.includes("getElementById('ceo-send-to-desk')") && chatJs.includes('body.sendToCeoDesk = true')
    && chatJs.includes('deskToggle.checked = false'));

  const srcs = ['_ceo_bridge.js', '_chat.js', '_routines.js', '_wake.js', '_wake_sweep.js']
    .map((f) => fs.readFileSync(path.join(opsDir, f), 'utf8')).join('\n');
  check('no Slack backup wording remains in the /ops bridge, chat, or routines',
    !/Slack remains available/.test(srcs) && !/Slack #laval/.test(srcs) && !srcs.includes('SLACK_FALLBACK'));
  check('wake modules never post to Slack', !/slack\.com|chat\.postMessage|LAVAALL_TASK/.test(srcs));

  const wf = fs.readFileSync(path.join(__dirname, '../.github/workflows/ops-wake-sweep.yml'), 'utf8');
  check('Actions workflow is gated by repo variable and secret, pinned to production',
    wf.includes("vars.OPS_WAKE_SWEEP_ENABLED == 'true'")
    && wf.includes('secrets.OPS_WAKE_SWEEP_SECRET')
    && wf.includes('https://www.lavaall.com/ops/api/ceo-bridge/wake-sweep')
    && wf.includes("cron: '*/30 * * * *'")
    && wf.includes('permissions: {}'));
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
  check('no Vercel cron is added (Hobby allows daily only)', !vercel.crons);
  const envExample = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
  check('.env.example lists the new variables by name only',
    /^OPS_BOX_WAKE_URL=$/m.test(envExample) && /^OPS_BOX_WAKE_TOKEN=$/m.test(envExample)
    && /^OPS_WAKE_SWEEP_SECRET=$/m.test(envExample));

  global.fetch = origFetch;
  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
