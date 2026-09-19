// Ticket 03 — durable store CRUD and dashboard agreement.
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
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: {
      cookie: cookieFor(ALLOWED),
      host: 'preview.example.test',
      accept: extra && extra.json === false ? 'text/html' : 'application/json',
      'content-type': 'application/json',
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
  global.fetch = async (url, opts) => {
    if (String(url).includes('/get/')) {
      return { ok: true, json: async () => ({ result: bucket.value }) };
    }
    bucket.value = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ result: 'OK' }) };
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
    check('new tasks do not invent due dates or owners', one.task.due === '' && !one.task.owner && one.task.createdBy === ALLOWED);
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
    check('KV write actually landed in the REST body', bucket.value && bucket.value.goal && bucket.value.goal.title === 'Durable goal');
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
