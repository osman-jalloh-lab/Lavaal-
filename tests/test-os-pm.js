// LAVAALL OS project manager (Phase 6): goals become plans, each step goes to the agent best at it, builders are
// load-balanced, steps wait for what they depend on, plans of different goals run side by side, approval is founder
// only, builds are held until their design exists and only open draft PRs, and every step counts toward the cap.
// In-memory KV and fake providers; no network.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pm = require(path.join(root, 'api/ops/_os_pm.js'));
const builder = require(path.join(root, 'api/ops/_os_builder.js'));
const approvals = require(path.join(root, 'api/ops/_approvals.js'));
const runner = require(path.join(root, 'scripts/os-runner/index.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }
function mockRes() { const r = { statusCode: 200, body: '' }; r.status = (c) => { r.statusCode = c; return r; }; r.setHeader = () => r; r.send = (b) => { r.body = String(b == null ? '' : b); return r; }; return r; }
function fakeKv() {
  const store = new Map(); const lists = new Map();
  return { store, lists, fetchImpl: async (u, init) => {
    const a = JSON.parse(init.body); let result = null;
    if (a[0] === 'GET') result = store.has(a[1]) ? store.get(a[1]) : null;
    else if (a[0] === 'SET') { if (a.includes('NX') && store.has(a[1])) result = null; else { store.set(a[1], a[2]); result = 'OK'; } }
    else if (a[0] === 'DEL') { store.delete(a[1]); result = 1; }
    else if (a[0] === 'LPUSH') { const l = lists.get(a[1]) || []; l.unshift(a[2]); lists.set(a[1], l); result = l.length; }
    else if (a[0] === 'LRANGE') result = (lists.get(a[1]) || []).slice(a[2], a[3] + 1);
    else if (a[0] === 'INCRBYFLOAT') { const v = Number(store.get(a[1]) || 0) + Number(a[2]); store.set(a[1], String(v)); result = String(v); }
    return { ok: true, json: async () => ({ result }) };
  } };
}
const FOUNDER = { email: 'osmanjalloh104@gmail.com' };
const ENV = { KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 't', OS_BUILDER_MONTHLY_CAP_USD: '50', OS_RUNNER_ENABLED: '1', XAI_API_KEY: 'x', DEEPSEEK_API_KEY: 'd', OPENAI_API_KEY: 'o' };
function req(url, method, body) { return { url, method, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, body }; }
async function hit(kv, url, method, body, extra) {
  const res = mockRes();
  await pm.handlePm(req(url, method, body), res, Object.assign({ env: ENV, fetchImpl: kv.fetchImpl, session: FOUNDER }, extra));
  return { res, out: JSON.parse(res.body || '{}') };
}
const kinds = (p) => p.steps.map((s) => `${s.kind}:${s.agent}`).join(' > ');

(async () => {
  // 1. Planning: who gets what.
  const site = pm.planGoal('Build me a website for SaloneHire employers');
  check('a website: Grok researches, DeepSeek designs, Claude Opus builds', kinds(site) === 'research:grok > design:deepseek > build:claude-opus');
  check('steps depend on the step before', site.steps[1].dependsOn.join() === 's1' && site.steps[2].dependsOn.join() === 's2');
  check('the plan goes to the right repo and a pm branch', site.business === 'salonehire' && site.repo === 'osman-jalloh-lab/saloneworks' && /^os-build\/pm-/.test(site.branch) && builder.validBranch(site.branch));
  check('a typo fix: DeepSeek specs it, Codex builds it', kinds(pm.planGoal('Fix the typo in the LAVAALL footer')) === 'design:deepseek > build:codex');
  check('everyday code: Claude Sonnet builds', /build:claude-sonnet$/.test(kinds(pm.planGoal('Add a contact form to the LAVAALL site'))));
  check('research only: Grok', kinds(pm.planGoal('Research competitors for SalonWeb in Freetown')) === 'research:grok');
  check('writing only: DeepSeek drafts, nothing is built', kinds(pm.planGoal('Write a launch email for SaloneHire')) === 'draft:deepseek');
  check('no xAI key: DeepSeek researches instead', pm.planGoal('Research market trends', { hasKey: (h) => h !== 'grok' }).steps[0].agent === 'deepseek');
  check('no DeepSeek key: Codex chat writes the spec', pm.planGoal('Fix a bug in the chat', { hasKey: (h) => h !== 'deepseek' }).steps[0].agent === 'codex-chat');
  const three = pm.planGoals(['fix a bug in the OS chat', 'fix the typo in the footer', 'fix the button colour']);
  check('several small fixes are shared between Codex and Claude Sonnet', new Set(three.map((p) => p.steps.find((s) => s.kind === 'build').agent)).size === 2);
  check('a busy Codex hands a small fix to Claude Sonnet', pm.buildAgent('fix the typo', { codex: 2, 'claude-sonnet': 0 }).agent === 'claude-sonnet');
  check('Opus is never picked just because others are busy', pm.buildAgent('fix the typo', { codex: 5, 'claude-sonnet': 5 }).agent !== 'claude-opus');
  check('every step says why its agent was picked', site.steps.every((s) => s.why && s.label));

  // 2. Preview is free; approval is founder only.
  {
    const kv = fakeKv();
    const prev = await hit(kv, '/ops/os/builder/pm/plan', 'POST', { goals: ['Build a landing page for SaloneHire', 'Research LAVAALL Web competitors'] });
    check('plan returns a preview and saves nothing', prev.res.statusCode === 200 && prev.out.plans.length === 2 && kv.store.size === 0);
    const six = await hit(kv, '/ops/os/builder/pm/plan', 'POST', { goals: ['a', 'b', 'c', 'd', 'e', 'f'] });
    check('more than 5 goals is refused', six.res.statusCode === 400);
    const stranger = await hit(kv, '/ops/os/builder/pm/approve', 'POST', { goals: ['Fix the footer typo'] }, { session: { email: 'drake@example.com' } });
    check('only Osman can approve a plan', stranger.res.statusCode === 403 && kv.store.size === 0);
    const none = await hit(kv, '/ops/os/builder/pm/plan', 'POST', { goals: ['x'] }, { session: null });
    check('signed out gets 401', none.res.statusCode === 401);
  }

  // 3. Approve and run two goals side by side.
  const kv = fakeKv();
  const calls = [];
  const fakeProvider = async (harness, model, prompt) => { calls.push({ harness, prompt }); return { text: `${harness} output for: ${prompt.user.slice(0, 40)}` }; };
  const ap = await hit(kv, '/ops/os/builder/pm/approve', 'POST', { goals: ['Build a website for SaloneHire employers', 'Fix the typo in the LAVAALL footer'] });
  check('approve saves both plans', ap.res.statusCode === 201 && ap.out.plans.length === 2 && ap.out.plans.every((p) => p.state === 'approved'));
  const [p1, p2] = ap.out.plans;
  const job1 = JSON.parse(kv.store.get(builder.jobKey(ENV, p1.steps.find((s) => s.kind === 'build').jobId)));
  check('build jobs are held (not queued) until their design is done', job1.state === 'held' && /PM plan/.test(job1.objective));
  check('each build job has its own founder approval for its builder and model', await approvals.verifyConsumed(ENV, kv.fetchImpl, { id: job1.approvalId, action: 'code_run', requestHash: approvals.requestHash({ repo: job1.repo, branch: job1.branch, objective: job1.objective, executor: job1.executor, model: job1.model }), consumer: 'code_run:' + job1.id }));
  const idle = await runner.tick({ env: ENV, fetchImpl: kv.fetchImpl, adapter: { async execute() { throw new Error('should not run'); }, async githubGet() { return {}; } } });
  check('the runner does not pick up a held build', idle.state === 'idle');

  // Advance both plans at the same time (as the page does).
  const adv = (id) => pm.advancePlan(ENV, kv.fetchImpl, id, { runHarness: fakeProvider });
  await Promise.all([adv(p1.id), adv(p2.id)]);
  let s1 = JSON.parse(kv.store.get('lavaall-os:pm-plans:' + p1.id));
  let s2 = JSON.parse(kv.store.get('lavaall-os:pm-plans:' + p2.id));
  check('two plans move forward at the same time (Grok on one, DeepSeek on the other)', s1.steps[0].state === 'done' && s1.steps[0].agent === 'grok' && s2.steps[0].state === 'done' && s2.steps[0].agent === 'deepseek');
  check('the build of plan 2 is released to the runner once its design is done', JSON.parse(kv.store.get(builder.jobKey(ENV, s2.steps[1].jobId))).state === 'held');
  await Promise.all([adv(p1.id), adv(p2.id)]);
  s2 = JSON.parse(kv.store.get('lavaall-os:pm-plans:' + p2.id));
  const j2 = JSON.parse(kv.store.get(builder.jobKey(ENV, s2.steps[1].jobId)));
  check('after its design, the build is queued with the design notes attached', j2.state === 'queued' && /deepseek output/.test(j2.context));
  check('a later step sees the earlier step output, wrapped as untrusted', /<<<UNTRUSTED-CONTENT>>>[\s\S]*grok output/.test(calls.find((c) => c.harness === 'deepseek' && /website/.test(c.prompt.user)).prompt.user));
  check('each research or design step is charged $0.25 against the cap (3 steps so far)', Number(kv.store.get(builder.monthKey(ENV, Date.now()))) === 0.75);

  // The runner: one job per builder at a time, and the design notes reach the builder prompt.
  const sha = 'a'.repeat(40);
  let seenPrompt = '';
  const adapter = (branch) => ({
    async execute(job, t, onStart) { seenPrompt = runner.promptFor(job); if (onStart) await onStart(); return { sha, prUrl: 'https://github.com/osman-jalloh-lab/Lavaal-/pull/77', tests: 'passed' }; },
    async githubGet() { return { draft: true, state: 'open', merged: false, head: { ref: branch, sha, repo: { full_name: 'osman-jalloh-lab/Lavaal-' } }, base: { ref: 'main' } }; },
    async recordActivity() { return true; },
  });
  // Plan 1's Opus build is queued too now; hold Opus busy so this part checks the Codex job only.
  const opusLock = builder.lockKey(ENV, { executor: 'claude', model: 'opus' });
  check('Codex and Opus have separate locks, so they can run at the same time', opusLock !== builder.lockKey(ENV, { executor: 'codex' }));
  kv.store.set(opusLock, 'opus-is-busy');
  kv.store.set(builder.lockKey(ENV, { executor: 'codex' }), 'someone-else');
  const blocked = await runner.tick({ env: ENV, fetchImpl: kv.fetchImpl, adapter: adapter(j2.branch) });
  check('a builder that is already busy does not take a second job', blocked.state === 'idle');
  kv.store.delete(builder.lockKey(ENV, { executor: 'codex' }));
  const ran = await runner.tick({ env: ENV, fetchImpl: kv.fetchImpl, adapter: adapter(j2.branch) });
  check('the released build runs and opens a draft PR', ran.state === 'draft_opened' && ran.result.prUrl.endsWith('/pull/77'));
  check('the design notes reach the builder, wrapped as untrusted', /Design notes from earlier steps[\s\S]*<<<UNTRUSTED-CONTENT>>>[\s\S]*deepseek output/.test(seenPrompt));
  check('the builder lock is released after the run', !kv.store.has(builder.lockKey(ENV, { executor: 'codex' })));
  await adv(p2.id);
  s2 = JSON.parse(kv.store.get('lavaall-os:pm-plans:' + p2.id));
  check('the plan picks up the draft PR and finishes', s2.state === 'done' && /Draft PR: https:\/\/github\.com/.test(s2.steps[1].output));

  // Cap: a missing cap stops the chat steps.
  {
    const kv2 = fakeKv();
    const a2 = await hit(kv2, '/ops/os/builder/pm/approve', 'POST', { goals: ['Research LAVAALL Web competitors'] });
    const r = await pm.advancePlan(Object.assign({}, ENV, { OS_BUILDER_MONTHLY_CAP_USD: '' }), kv2.fetchImpl, a2.out.plans[0].id, { runHarness: fakeProvider });
    check('no cap: the research step is refused and nothing is called', r.plan.steps[0].state === 'failed' && /cap/.test(r.plan.steps[0].output));
  }

  // Budget: over the allowance, a research step pauses and asks; after Osman's OK it runs.
  {
    const kv3 = fakeKv();
    const a3 = await hit(kv3, '/ops/os/builder/pm/approve', 'POST', { goals: ['Research LAVAALL Web competitors'] });
    kv3.store.set(builder.monthKey(ENV, Date.now()), '50');
    let r = await pm.advancePlan(ENV, kv3.fetchImpl, a3.out.plans[0].id, { runHarness: fakeProvider });
    check('over budget: the step pauses (not failed) and says why', r.plan.steps[0].state === 'waiting' && /Waiting for your OK/.test(r.plan.steps[0].output) && kv3.store.has(builder.holdKey(ENV, Date.now())));
    kv3.store.set(builder.extraKey(ENV, Date.now()), '50');
    r = await pm.advancePlan(ENV, kv3.fetchImpl, a3.out.plans[0].id, { runHarness: fakeProvider });
    check('after the OK the paused step runs', r.plan.steps[0].state === 'done' && r.plan.state === 'done');
  }

  // Guards.
  const src = fs.readFileSync(path.join(root, 'api/ops/_os_pm.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  check('the PM never merges, deploys or sends', !/\/merge\b|['"`]merge['"`]|vercel\s+deploy|sendMessage|gmail/i.test(src));
  const page = fs.readFileSync(path.join(root, 'api/os/_client/build.js'), 'utf8');
  check('the Build page has the PM card with Plan and Approve and run', /Project manager/.test(page) && /data-pm="plan"/.test(page) && /data-pm="approve"/.test(page) && (page.match(/window\.fetch\(/g) || []).length === 1);

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
