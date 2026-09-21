// Ticket 03 — durable store CRUD and dashboard agreement.
const fs = require('fs');
const os = require('os');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';

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
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: {
      cookie: cookieFor(ALLOWED),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'text/html',
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops',
    body: extra && extra.body,
  };
}

function installKv() {
  const bucket = { value: null };
  process.env.KV_REST_API_URL = 'https://kv.example.test';
  process.env.KV_REST_API_TOKEN = 'kv-token';
  global.fetch = async (_url, opts) => {
    const cmd = JSON.parse(opts.body);
    if (cmd[0] === 'GET') {
      return { ok: true, json: async () => ({ result: bucket.value }) };
    }
    if (cmd[0] === 'SET') {
      bucket.value = cmd[2];
      return { ok: true, json: async () => ({ result: 'OK' }) };
    }
    return { ok: false, json: async () => ({ error: 'unknown_cmd' }) };
  };
  return bucket;
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();

  {
    const empty = store.normalizeStore({});
    check('empty store has no invented profile, goal, projects, or tasks',
      Object.keys(empty.profiles).length === 0 && empty.goal == null && empty.projects.length === 0 && empty.tasks.length === 0);
  }

  {
    const saved = await store.saveProfile(ALLOWED, { role: 'Founder', timezone: 'Africa/Freetown', writingPreferences: 'Short, factual' });
    const again = store.getProfile(await store.readStore(), ALLOWED);
    check('profile CRUD persists role, timezone, writing preferences',
      saved.ok && again.role === 'Founder' && again.timezone === 'Africa/Freetown' && again.writingPreferences === 'Short, factual');
  }

  {
    const saved = await store.saveGoal({
      title: 'Ship /ops v1',
      definitionOfDone: 'Eight areas usable',
      nextStep: 'Persist the store',
      targetDate: '2026-10-01',
    });
    check('goal requires a real title and keeps optional target date', saved.ok && saved.goal.title === 'Ship /ops v1' && saved.goal.targetDate === '2026-10-01');
    const bad = await store.saveGoal({ title: '   ' });
    check('blank goal title is rejected', bad.error === 'invalid_goal');
  }

  {
    store.resetStore();
    await store.addProject({ name: 'Quote follow-through', finishLine: 'All open SL quotes answered', createdBy: ALLOWED });
    const one = await store.addTask({ title: 'Task A', nextAction: 'Draft reply', createdBy: ALLOWED });
    await store.addTask({ title: 'Task B', status: 'doing', createdBy: ALLOWED });
    const three = await store.addTask({ title: 'Task C', due: '2026-09-30', createdBy: ALLOWED });
    await store.updateTask(three.task.id, { status: 'done' });
    const snap = store.dashboardSnapshot(await store.readStore());
    const data = await store.readStore();
    check('three tasks with one done leave two unfinished', data.tasks.length === 3 && snap.unfinished.length === 2 && data.tasks.filter((row) => row.status === 'done').length === 1);
    check('new tasks do not invent due dates or owners', one.task.due === '' && !one.task.owner && one.task.ownerAgentId === '' && one.task.createdBy === ALLOWED);
    const child = await store.addTask({
      title: 'Source ThinkPads',
      status: 'doing',
      createdBy: ALLOWED,
      ownerAgentId: 'researchy',
      parentThreadId: 'ceo-parent-1',
      parentCorrelationId: 'corr-parent-1',
      assignStatus: 'assigned',
      brief: 'Find quote-first suppliers',
    });
    const rejectedOwner = await store.addTask({
      title: 'Do not auto-route Technical',
      createdBy: ALLOWED,
      ownerAgentId: 'technical',
    });
    check('store tasks keep Researchy assign parent links and drop other owners',
      child.task.ownerAgentId === 'researchy'
      && child.task.parentThreadId === 'ceo-parent-1'
      && child.task.parentCorrelationId === 'corr-parent-1'
      && child.task.assignStatus === 'assigned'
      && child.task.brief === 'Find quote-first suppliers'
      && child.task.status === 'doing'
      && rejectedOwner.task.ownerAgentId === '');
    check('dashboard next action matches an unfinished task', snap.nextAction && snap.unfinished.some((row) => row.id === snap.nextAction.taskId));
  }

  {
    store.resetStore();
    await store.saveGoal({ title: 'Keep dashboard honest' });
    await store.addTask({ title: 'Home item', nextAction: 'Check projects view', createdBy: ALLOWED });
    const home = mockRes();
    await ops(authed({ url: '/ops' }), home);
    const projects = mockRes();
    await ops(authed({ url: '/ops/tasks', query: { area: 'tasks' } }), projects);
    check('home and projects views agree on goal and unfinished tasks',
      home.body.snapshot.goal.title === projects.body.snapshot.goal.title
      && home.body.store.tasks.length === projects.body.store.tasks.length
      && home.body.snapshot.unfinished[0].title === projects.body.store.tasks[0].title);
  }

  {
    store.resetStore();
    const profileHtml = mockRes();
    await ops(authed({ json: false, url: '/ops/profile', query: { area: 'profile' } }), profileHtml);
    check('profile page is real, not a ticket stub',
      String(profileHtml.raw).includes('Save profile') && String(profileHtml.raw).includes('Save goal') && !String(profileHtml.raw).includes('coming in ticket 03'));
    const tasksHtml = mockRes();
    await ops(authed({ json: false, url: '/ops/tasks', query: { area: 'tasks' } }), tasksHtml);
    check('tasks page is real, not a ticket stub',
      String(tasksHtml.raw).includes('Save project') && String(tasksHtml.raw).includes('All tasks') && !String(tasksHtml.raw).includes('coming in ticket 03'));
    check('demo banner shows only when the store is not durable',
      String(profileHtml.raw).includes('Demo store') && store.isDurable() === false);
  }

  {
    store.resetStore();
    const bucket = installKv();
    store.resetStore();
    await store.saveProfile(ALLOWED, { role: 'Founder', timezone: 'Africa/Freetown', writingPreferences: 'Direct' });
    await store.saveGoal({ title: 'Durable goal', nextStep: 'Bind KV' });
    await store.addTask({ title: 'One', createdBy: ALLOWED });
    await store.addTask({ title: 'Two', createdBy: ALLOWED });
    const third = await store.addTask({ title: 'Three', createdBy: ALLOWED });
    await store.updateTask(third.task.id, { status: 'done' });
    store.resetStore();
    const afterRestart = await store.readStore();
    const snap = store.dashboardSnapshot(afterRestart);
    check('KV restart keeps profile, goal, and task statuses',
      store.isDurable() === true
      && store.getProfile(afterRestart, ALLOWED).role === 'Founder'
      && afterRestart.goal.title === 'Durable goal'
      && afterRestart.tasks.length === 3
      && snap.unfinished.length === 2
      && afterRestart.tasks.filter((row) => row.status === 'done')[0].title === 'Three');
    const landed = typeof bucket.value === 'string' ? JSON.parse(bucket.value) : bucket.value;
    check('KV write actually landed in the REST body', landed && landed.goal && landed.goal.title === 'Durable goal');
    global.fetch = origFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    store.resetStore();
  }

  {
    const html = mockRes();
    await ops(authed({ json: false }), html);
    check('dashboard does not invent owners or completions', !/assigned to|owner:|completed this week/i.test(String(html.raw)));
  }

  {
    store.resetStore();
    const profile = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/profile',
      query: { area: 'profile' },
      body: { action: 'save-profile', role: 'Founder', timezone: 'Africa/Freetown', writingPreferences: 'Short, factual' },
    }), profile);
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/profile',
      body: { action: 'save-goal', title: 'Ship ticket 03', definitionOfDone: 'Home and tasks agree after refresh', nextStep: 'Add three tasks', targetDate: '2026-10-01' },
    }), mockRes());
    await ops(authed({ json: true, method: 'POST', url: '/ops/tasks', body: { action: 'add-task', title: 'Task one', nextAction: 'Start the first item' } }), mockRes());
    await ops(authed({ json: true, method: 'POST', url: '/ops/tasks', body: { action: 'add-task', title: 'Task two' } }), mockRes());
    const third = mockRes();
    await ops(authed({ json: true, method: 'POST', url: '/ops/tasks', body: { action: 'add-task', title: 'Task three' } }), third);
    await ops(authed({ json: true, method: 'POST', url: '/ops/tasks', body: { action: 'update-task', id: third.body.task.id, status: 'done' } }), mockRes());
    const home = mockRes();
    await ops(authed({ json: true, url: '/ops' }), home);
    const tasks = mockRes();
    await ops(authed({ json: true, url: '/ops/tasks', query: { area: 'tasks' } }), tasks);
    check('HTTP profile save returns the written role', profile.body.ok === true && profile.body.profile.role === 'Founder');
    check('HTTP goal + 3 tasks + one done: home and tasks views agree',
      home.body.snapshot.goal.title === 'Ship ticket 03'
      && home.body.snapshot.goal.title === tasks.body.snapshot.goal.title
      && home.body.store.tasks.length === 3
      && home.body.store.tasks.length === tasks.body.store.tasks.length
      && home.body.snapshot.unfinished.length === 2
      && home.body.snapshot.unfinished.length === tasks.body.snapshot.unfinished.length
      && home.body.store.tasks.filter((row) => row.status === 'done')[0].title === 'Task three');
  }

  {
    const tmp = path.join(os.tmpdir(), `lavaall-ops-test-${Date.now()}.json`);
    process.env.OPS_STORE_FILE = tmp;
    store.resetStore();
    await store.saveGoal({ title: 'File-backed goal', nextStep: 'Restart the process' });
    await store.addTask({ title: 'File task', createdBy: ALLOWED });
    store.resetStore();
    const afterRestart = await store.readStore();
    check('local OPS_STORE_FILE survives a memory reset',
      store.isDurable() === true
      && afterRestart.goal.title === 'File-backed goal'
      && afterRestart.tasks[0].title === 'File task');
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    delete process.env.OPS_STORE_FILE;
    store.resetStore();
  }

  {
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'kv-token';
    global.fetch = async () => ({ ok: false, json: async () => ({ error: 'down' }) });
    const saved = await store.saveGoal({ title: 'Must not pretend to persist' });
    check('KV outage returns store_unavailable instead of a silent demo write', saved.error === 'store_unavailable');
    global.fetch = origFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    store.resetStore();
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

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
