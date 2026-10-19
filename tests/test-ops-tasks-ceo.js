// Tasks → CEO desk: Assignee, Do task, bridge tasks + task-status.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const chat = require(path.join(opsDir, '_chat.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const OTHER = 'abdulhbah55@gmail.com';
const STRANGER = 'stranger@example.com';

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
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

function cookieFor(email) {
  return `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(email))}`;
}

function authed(extra) {
  const asJson = extra && extra.json !== false;
  const headers = Object.assign({
    cookie: cookieFor((extra && extra.email) || ALLOWED),
    host: 'preview.example.test',
    accept: asJson ? 'application/json' : 'text/html',
    'content-type': asJson ? 'application/json' : 'text/html',
  }, extra && extra.headers ? extra.headers : {});
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers,
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/chat?agent=lavaall-ceo',
    body: extra && extra.body,
  };
}

function bridgeReq(kind, extra) {
  const asJson = extra && extra.json !== false;
  const secret = extra && extra.secret !== undefined ? extra.secret : BRIDGE_SECRET;
  const headers = Object.assign({
    host: 'preview.example.test',
    accept: 'application/json',
    'content-type': 'application/json',
  }, extra && extra.headers ? extra.headers : {});
  if (secret) headers.authorization = `Bearer ${secret}`;
  return {
    method: extra && extra.method ? extra.method : (kind === 'reply' ? 'POST' : 'GET'),
    headers,
    query: extra && extra.query ? extra.query : { area: `api/ceo-bridge/${kind}` },
    url: extra && extra.url ? extra.url : `/ops/api/ceo-bridge/${kind}`,
    body: extra && extra.body,
  };
}

async function run() {
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.OPS_CEO_BRIDGE_SECRET = BRIDGE_SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.XAI_API_KEY;
  store.resetStore();
  ceo.resetCeoBridge();
  const post = (body) => authed({ json: true, method: 'POST', url: '/ops/tasks', query: {}, body });

  await ops(post({ action: 'add-task', title: 'Mine only' }), mockRes());
  await ops(post({ action: 'add-task', title: 'For CEO', assignee: 'ceo' }), mockRes());
  let data = await store.readStore();
  const mine = data.tasks.find((t) => t.title === 'Mine only');
  const ceoTask = data.tasks.find((t) => t.title === 'For CEO');
  check('default assignee is me', mine.assignee === 'me' && mine.runState === '');
  check('add-task stores CEO assignee', ceoTask.assignee === 'ceo');
  await ops(post({ action: 'add-task', title: 'Bad', assignee: 'root' }), mockRes());
  data = await store.readStore();
  check('unknown assignee falls back to me', data.tasks.find((t) => t.title === 'Bad').assignee === 'me');

  const html = mockRes();
  await ops(authed({ json: false, url: '/ops/tasks', query: { area: 'tasks' } }), html);
  const page = String(html.raw || '');
  check('tasks page has Assignee field + CEO desk option', page.includes('name="assignee"') && page.includes('CEO desk'));
  check('tasks page has Do task button', page.includes('value="request-task"') && page.includes('Do task'));

  const noAuth = mockRes();
  await ops(bridgeReq('tasks', { secret: '' }), noAuth);
  check('bridge tasks without bearer is 401', noAuth.statusCode === 401);
  const wrong = mockRes();
  await ops(bridgeReq('tasks', { secret: 'wrong-secret-wrong-secret-0000' }), wrong);
  check('bridge tasks wrong bearer is 401', wrong.statusCode === 401);

  let list = mockRes();
  await ops(bridgeReq('tasks'), list);
  check('bridge lists CEO-assigned tasks only', list.statusCode === 200
    && list.body.tasks.length === 1 && list.body.tasks[0].id === ceoTask.id
    && list.body.tasks[0].runState === 'assigned');
  check('bridge returns safety rules', /Drafts only/.test(list.body.rules));

  const before = Date.now();
  await ops(post({ action: 'request-task', id: mine.id }), mockRes());
  data = await store.readStore();
  const queued = data.tasks.find((t) => t.id === mine.id);
  check('Do task queues + assigns CEO + timestamps', queued.runState === 'queued' && queued.assignee === 'ceo' && queued.requestedAt >= before);
  list = mockRes();
  await ops(bridgeReq('tasks'), list);
  check('queued task listed first', list.body.tasks.length === 2 && list.body.tasks[0].id === mine.id && list.body.tasks[0].runState === 'queued');

  const statusReq = (body, secret) => bridgeReq('task-status', { method: 'POST', body, secret });
  const s401 = mockRes();
  await ops(statusReq({ id: mine.id, state: 'done' }, ''), s401);
  check('task-status without bearer is 401', s401.statusCode === 401);
  const sGet = mockRes();
  await ops(bridgeReq('task-status'), sGet);
  check('task-status GET is 405', sGet.statusCode === 405);
  const sBad = mockRes();
  await ops(statusReq({ id: mine.id, state: 'queued' }), sBad);
  check('task-status rejects queued/unknown state', sBad.statusCode === 400);
  const s404 = mockRes();
  await ops(statusReq({ id: 'nope', state: 'working' }), s404);
  check('task-status unknown id is 404', s404.statusCode === 404);

  const sWork = mockRes();
  await ops(statusReq({ id: mine.id, state: 'working', notes: 'Started draft' }), sWork);
  data = await store.readStore();
  let t = data.tasks.find((r) => r.id === mine.id);
  check('working sets runState + status doing + notes', sWork.statusCode === 200 && t.runState === 'working' && t.status === 'doing' && t.runNotes === 'Started draft');

  const sNeed = mockRes();
  await ops(statusReq({ id: ceoTask.id, state: 'needs_you', notes: 'Draft <b>ready</b> for approval' }), sNeed);
  const sDone = mockRes();
  await ops(statusReq({ id: mine.id, state: 'done', notes: 'Draft in notes' }), sDone);
  data = await store.readStore();
  t = data.tasks.find((r) => r.id === mine.id);
  check('done sets status done', t.runState === 'done' && t.status === 'done');
  list = mockRes();
  await ops(bridgeReq('tasks'), list);
  check('done + needs_you drop out of queue', list.body.tasks.length === 0);

  const html2 = mockRes();
  await ops(authed({ json: false, url: '/ops/tasks', query: { area: 'tasks' } }), html2);
  const page2 = String(html2.raw || '');
  check('page shows Needs you + Done + notes (escaped)', page2.includes('Needs you') && page2.includes('Done') && page2.includes('Draft in notes') && !page2.includes('<b>ready</b>'));

  await ops(post({ action: 'request-task', id: ceoTask.id }), mockRes());
  data = await store.readStore();
  check('Do task re-queues a needs_you task', data.tasks.find((r) => r.id === ceoTask.id).runState === 'queued');

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
