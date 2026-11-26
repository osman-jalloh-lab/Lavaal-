// LAVAALL OS Progress and saved Memory: the founder-only /ops/os/saved store and the two views. KV is mocked.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const saved = require(path.join(root, 'api/ops/_os_saved.js'));
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }
const SESSION = { email: 'founder@example.com' };
const ENV = { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'kv-token' };

function makeKv() {
  const data = new Map(); const cmds = [];
  const fetchImpl = async (url, init) => {
    const cmd = JSON.parse(init.body); cmds.push(cmd);
    if (cmd[0] === 'GET') return { ok: true, json: async () => ({ result: data.has(cmd[1]) ? data.get(cmd[1]) : null }) };
    if (cmd[0] === 'SET') { data.set(cmd[1], cmd[2]); return { ok: true, json: async () => ({ result: 'OK' }) }; }
    return { ok: false, json: async () => ({}) };
  };
  return { data, cmds, fetchImpl };
}
function mockRes() {
  const res = { statusCode: 200, raw: '' };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = () => res;
  res.send = (b) => { res.raw = String(b); try { res.body = JSON.parse(b); } catch { res.body = b; } return res; };
  return res;
}
async function call(req, opts) {
  const res = mockRes();
  const handled = await saved.handleSaved(Object.assign({ method: 'GET', url: '/ops/os/saved', headers: {}, query: { area: 'os/saved' } }, req), res, Object.assign({ session: SESSION, env: ENV, now: 1790000000000 }, opts));
  return { handled, res };
}

(async () => {
  check('other routes fall through', (await call({ url: '/ops/os/inbox', query: { area: 'os/inbox' } })).handled === false);
  check('agent-looking requests are refused', (await call({ headers: { authorization: 'Bearer x' } })).res.statusCode === 403);
  check('without the founder sign-in: 401', (await call({}, { session: null })).res.statusCode === 401);
  check('PUT is 405', (await call({ method: 'PUT' }, { fetchImpl: makeKv().fetchImpl })).res.statusCode === 405);

  const kv = makeKv();
  const add = await call({ method: 'POST', body: { op: 'goal.upsert', goal: { title: 'Launch SaloneHire in Freetown', horizon: 'month', project: 'salonehire', progress: 30 } } }, { fetchImpl: kv.fetchImpl });
  const goal = add.res.body.item;
  check('a goal is saved to its own KV key', add.res.statusCode === 200 && add.res.body.persist === true && /^g-[a-f0-9]{12}$/.test(goal.id) && kv.cmds.some((c) => c[0] === 'SET' && c[1] === 'lavaall-os-saved-v1'));
  check('progress is clamped and 100 marks it done', saved.cleanGoal({ title: 'x', horizon: 'week', progress: 140 }, 1).progress === 100 && saved.cleanGoal({ title: 'x', horizon: 'week', progress: 140 }, 1).done === true && saved.cleanGoal({ title: 'x', horizon: 'week', progress: -5 }, 1).progress === 0);
  const upd = await call({ method: 'POST', body: { op: 'goal.upsert', goal: Object.assign({}, goal, { progress: 60 }) } }, { fetchImpl: kv.fetchImpl });
  check('updating a goal keeps one copy', upd.res.body.goals.length === 1 && upd.res.body.goals[0].progress === 60);
  check('bad goals are refused', (await call({ method: 'POST', body: { op: 'goal.upsert', goal: { title: '', horizon: 'week' } } }, { fetchImpl: kv.fetchImpl })).res.statusCode === 400
    && (await call({ method: 'POST', body: { op: 'goal.upsert', goal: { title: 'x', horizon: 'decade' } } }, { fetchImpl: kv.fetchImpl })).res.statusCode === 400);
  const mem = await call({ method: 'POST', body: { op: 'memory.add', text: 'Hiring pass is 60 days', tags: ['salonehire', ' '] } }, { fetchImpl: kv.fetchImpl });
  check('a memory is saved with its tags, newest first', mem.res.body.memories[0].text === 'Hiring pass is 60 days' && mem.res.body.memories[0].tags.join() === 'salonehire');
  check('an empty or oversized memory is refused', (await call({ method: 'POST', body: { op: 'memory.add', text: '  ' } }, { fetchImpl: kv.fetchImpl })).res.statusCode === 400
    && (await call({ method: 'POST', body: { op: 'memory.add', text: 'x'.repeat(2001) } }, { fetchImpl: kv.fetchImpl })).res.statusCode === 400);
  const del = await call({ method: 'POST', body: { op: 'memory.delete', id: mem.res.body.memories[0].id } }, { fetchImpl: kv.fetchImpl });
  check('a memory can be deleted', del.res.body.memories.length === 0);
  const read = await call({}, { fetchImpl: kv.fetchImpl });
  check('GET reads back the goals and memories', read.res.body.goals.length === 1 && read.res.body.memories.length === 0);
  check('unknown ops are refused', (await call({ method: 'POST', body: { op: 'drop.all' } }, { fetchImpl: kv.fetchImpl })).res.statusCode === 400);
  check('preview deploys use a prefixed key', saved.keyFor({ VERCEL_ENV: 'preview' }) === 'preview:lavaall-os-saved-v1' && saved.keyFor({ VERCEL_ENV: 'production' }) === 'lavaall-os-saved-v1');
  saved.resetSaved();
  const nokv = await call({ method: 'POST', body: { op: 'memory.add', text: 'in memory' } }, { env: {} });
  check('without KV it still works for the instance and says persist:false', nokv.res.body.persist === false && nokv.res.body.memories.length === 1);
  const broken = await call({}, { fetchImpl: async () => { throw new Error('kv-token leaked?'); } });
  check('a store failure is a plain 503', broken.res.statusCode === 503 && !/kv-token/.test(broken.res.raw));
  check('damaged stored data reads as empty, not a crash', saved.normalize({ goals: [{ nope: 1 }], memories: 'x' }).goals.length === 0);

  // ---- client ----
  const win = {};
  const sandbox = { window: win, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } }, location: { hash: '' }, navigator: {}, setTimeout: () => 0, setInterval: () => 0, Intl };
  vm.createContext(sandbox);
  ['core.js', 'saved.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  const OS = win.OS;
  check('Progress is a section under Today; Saved is the first Memory tab', OS.sectionOf('progress').group === 'Today' && OS.sectionOf('saved').id === 'memory' && OS.sections.find((s) => s.id === 'memory').views[0] === 'saved');
  OS.setSavedState({ goals: [{ id: 'g-000000000001', horizon: 'week', title: '<img src=x onerror=alert(1)>', project: 'lavaall', progress: 40, done: false }], memories: [{ id: 'm-000000000001', text: '<script>alert(2)</script>', tags: ['<b>'], createdAt: 1 }], persist: true });
  const p = OS.progressBody(); const m = OS.memoryBody();
  check('goals and memories are escaped', !/<img src=x/.test(p) && !/<script>alert/.test(m) && !/<b>/.test(m));
  check('a goal shows its progress bar and percentage', /aria-valuenow="40"/.test(p) && />40%</.test(p) && /This week/.test(p));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
