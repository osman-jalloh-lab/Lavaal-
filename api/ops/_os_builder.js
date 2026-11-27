// api/ops/_os_builder.js — the OS builder harness (Phase 4), founder side. Underscore-prefixed: not a Vercel function.
//
// The founder approves one build: { repo, branch, objective }. This mints a single-use approval bound to exactly that
// request (api/ops/_approvals.js), takes its single-use marker for one job, and queues the job in KV. Nothing runs
// here. The box runner (scripts/os-runner/index.js) is off by default and is the only thing that picks a job up; it
// opens a DRAFT pull request at most. Nothing in this harness merges, deploys, or touches DNS.
//
// POST /ops/os/builder/approve  { repo, branch, objective }  -> { job_id, approval_id, state: 'queued' }
// GET  /ops/os/builder                                         -> { jobs: [...] }   (latest 20)
'use strict';
const crypto = require('node:crypto');
const { json, readBody, looksLikeAgentRequest, queryOf } = require('./_lib');
const approvals = require('./_approvals');

const REPOS = Object.freeze(['osman-jalloh-lab/Lavaal-', 'osman-jalloh-lab/saloneworks']);
const PROTECTED = Object.freeze(['main', 'master', 'production', 'prod']);
const MAX_OBJECTIVE = 2000;
// Builders: Codex, or Claude Code with Sonnet or Opus (Osman, 27 Nov 2026: Opus is allowed in the builder only, per job,
// when he picks it; chat stays Sonnet/Haiku). Model names are Claude Code aliases, so "opus" is the newest Opus.
const BUILDERS = Object.freeze({ codex: [''], claude: ['sonnet', 'opus'] });
function validBuilder(executor, model) {
  const e = String(executor || ''); const m = String(model || '');
  return Object.prototype.hasOwnProperty.call(BUILDERS, e) && BUILDERS[e].includes(m);
}
const CAP_NAME = 'OS_BUILDER_MONTHLY_CAP_USD';

// Builders work only on feature/ or os-build/ branches; main, master and production are refused anywhere in the name.
function validBranch(branch) {
  return typeof branch === 'string' && /^(?:feature|os-build)\/[a-z0-9][a-z0-9._/-]{0,100}$/.test(branch)
    && !branch.includes('..') && !branch.includes('//') && !branch.endsWith('.') && !branch.endsWith('/')
    && !branch.split('/').some((x) => PROTECTED.includes(x.toLowerCase()) || x.endsWith('.lock'));
}

// Default off: OS_RUNNER_ENABLED must be exactly "1", and a stop file (if configured) wins.
function runnerEnabled(env, exists) {
  const has = typeof exists === 'function' ? exists : () => false;
  return Boolean(env) && env.OS_RUNNER_ENABLED === '1' && !(env.OS_RUNNER_STOP_FILE && has(env.OS_RUNNER_STOP_FILE));
}

const RUN_ESTIMATE_NAME = 'OS_BUILDER_RUN_ESTIMATE_USD';
const DEFAULT_RUN_ESTIMATE_USD = 2;
const MONEY = /^\d+(\.\d{1,2})?$/;

// What one run is charged against the cap. The Codex CLI reports no dollar cost, so every run that reaches Codex is
// charged this flat amount (default $2; a box-only, non-secret setting may change it). Invalid means no run.
const OPUS_ESTIMATE_NAME = 'OS_BUILDER_OPUS_RUN_ESTIMATE_USD';
const DEFAULT_OPUS_ESTIMATE_USD = 6;
function runEstimate(env, job) {
  const opus = job && job.executor === 'claude' && job.model === 'opus';
  const raw = env ? env[opus ? OPUS_ESTIMATE_NAME : RUN_ESTIMATE_NAME] : undefined;
  if (raw === undefined || raw === null || String(raw).trim() === '') return opus ? DEFAULT_OPUS_ESTIMATE_USD : DEFAULT_RUN_ESTIMATE_USD;
  const s = String(raw).trim();
  return MONEY.test(s) && Number(s) > 0 ? Number(s) : NaN;
}

// The cap is a budget, not a wall (Osman, 27 Nov 2026). It must be present and valid (a missing or broken cap still
// fails closed). When the next run would pass this month's allowance (the cap plus whatever Osman has added this month),
// work pauses with 'needs_ok' and the OS asks him; nothing is dropped. At 80% the Build page warns.
function capCheck(env, spentUsd, job, extraUsd) {
  const raw = env ? env[CAP_NAME] : undefined;
  if (raw === undefined || raw === null || String(raw).trim() === '') return { ok: false, error: 'cap_missing' };
  if (!MONEY.test(String(raw).trim())) return { ok: false, error: 'cap_invalid' };
  const cap = Number(raw);
  if (!(cap > 0)) return { ok: false, error: 'cap_invalid' };
  const spent = Number(spentUsd);
  if (!Number.isFinite(spent) || spent < 0) return { ok: false, error: 'spend_unknown' };
  const next = runEstimate(env, job);
  if (!Number.isFinite(next)) return { ok: false, error: 'run_estimate_invalid' };
  const extra = Number.isFinite(Number(extraUsd)) && Number(extraUsd) > 0 ? Number(extraUsd) : 0;
  const allowance = cap + extra;
  if (spent + next > allowance) return { ok: false, error: 'needs_ok', cap, extra, allowance, spent, next };
  return { ok: true, cap, extra, allowance, spent, next, warn: spent + next >= 0.8 * allowance };
}

function extraKey(env, now) { return approvals.rootFor(env) + 'builder-extra:' + new Date(now || Date.now()).toISOString().slice(0, 7); }
function holdKey(env, now) { return approvals.rootFor(env) + 'builder-hold:' + new Date(now || Date.now()).toISOString().slice(0, 7); }

// What the Build page shows: this month's spend, the allowance, an 80% warning, and a pause waiting for Osman.
async function budgetState(env, call, now) {
  const num = async (k) => { const v = Number(await call(['GET', k]) || 0); return Number.isFinite(v) ? v : 0; };
  const spent = await num(monthKey(env, now));
  const extra = await num(extraKey(env, now));
  const capRaw = env ? env[CAP_NAME] : undefined;
  // Same rule as the PM: no setting on Vercel means Osman's $50; a value that is set but invalid shows no budget.
  const unset = capRaw === undefined || capRaw === null || String(capRaw).trim() === '';
  const cap = unset ? 50 : MONEY.test(String(capRaw).trim()) ? Number(capRaw) : null;
  let hold = null;
  try { hold = JSON.parse(await call(['GET', holdKey(env, now)]) || 'null'); } catch { hold = null; }
  const allowance = cap === null ? null : cap + extra;
  return { spent: Math.round(spent * 100) / 100, cap, extra, allowance, warn: allowance !== null && spent >= 0.8 * allowance, hold };
}

// Pause and ask: record why work is waiting, for the Build page.
async function holdForOk(env, call, check, what, now) {
  const hold = { spent: check.spent, allowance: check.allowance, next: check.next, what: String(what || '').slice(0, 140), at: new Date(now || Date.now()).toISOString() };
  await call(['SET', holdKey(env, now), JSON.stringify(hold)]);
  return hold;
}

function monthKey(env, now) { return approvals.rootFor(env) + 'builder-spend:' + new Date(now || Date.now()).toISOString().slice(0, 7); }
function lockKey(env, job) {
  const who = job && job.executor === 'claude' ? `claude-${job.model === 'opus' ? 'opus' : 'sonnet'}` : 'codex';
  return approvals.rootFor(env) + 'builder-lock:' + who;
}
function jobKey(env, id) { return approvals.rootFor(env) + 'builder-jobs:' + id; }
function queueKey(env) { return approvals.rootFor(env) + 'builder-jobs:queue'; }

function routeOf(req) {
  const q = queryOf(req);
  const area = String((Array.isArray(q.area) ? q.area[0] : q.area) || '').replace(/^\/+|\/+$/g, '');
  const p = String(req.url || '').split('?')[0].replace(/^\/+|\/+$/g, '').replace(/^ops\//, '');
  const r = area || p;
  return ['os/builder', 'os/builder/approve', 'os/builder/budget'].includes(r) ? r : '';
}

async function handleBuilder(req, res, opts) {
  const route = routeOf(req);
  if (!route) return false;
  const env = (opts && opts.env) || process.env;
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  const now = (opts && opts.now) || Date.now();
  if (looksLikeAgentRequest(req)) { json(res, 403, { error: 'agent_denied' }); return true; }
  let session = opts && opts.session !== undefined ? opts.session : null;
  if (!opts || opts.session === undefined) { const { readLiveSession } = require('./_signin_hardening'); session = await readLiveSession(req); }
  if (!session || !session.email) { json(res, 401, { error: 'sign_in_required' }); return true; }
  const method = String(req.method || 'GET').toUpperCase();
  try {
    if (route === 'os/builder') {
      if (method !== 'GET') { json(res, 405, { error: 'method_not_allowed' }); return true; }
      const ids = await approvals.command(env, fetchImpl, ['LRANGE', queueKey(env), 0, 19]);
      const jobs = [];
      for (const id of Array.isArray(ids) ? ids : []) {
        try { const j = JSON.parse(await approvals.command(env, fetchImpl, ['GET', jobKey(env, id)]) || 'null'); if (j) jobs.push(j); } catch { /* skip */ }
      }
      let budget = null;
      try { budget = await budgetState(env, (a) => approvals.command(env, fetchImpl, a), now); } catch { budget = null; }
      json(res, 200, { jobs, budget, draft_only: true });
      return true;
    }
    if (route === 'os/builder/budget') {
      // Osman says "yes, continue": add to this month's allowance (he tops up his credits himself) and lift the pause.
      if (method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
      if (!approvals.isApprover(session.email)) { json(res, 403, { error: 'approver_not_allowed' }); return true; }
      const add = String((readBody(req) || {}).add || '').trim();
      if (!MONEY.test(add) || !(Number(add) > 0) || Number(add) > 500) { json(res, 400, { error: 'amount_invalid' }); return true; }
      await approvals.command(env, fetchImpl, ['INCRBYFLOAT', extraKey(env, now), add]);
      await approvals.command(env, fetchImpl, ['DEL', holdKey(env, now)]);
      json(res, 200, { budget: await budgetState(env, (a) => approvals.command(env, fetchImpl, a), now) });
      return true;
    }
    if (method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
    if (!approvals.isApprover(session.email)) { json(res, 403, { error: 'approver_not_allowed' }); return true; }
    const body = readBody(req) || {};
    const executor = String(body.executor || 'codex');
    const model = executor === 'claude' ? String(body.model || 'sonnet') : '';
    const payload = { repo: String(body.repo || ''), branch: String(body.branch || ''), objective: String(body.objective || '').trim(), executor, model };
    if (!validBuilder(executor, model)) { json(res, 400, { error: 'builder_not_allowed' }); return true; }
    if (!REPOS.includes(payload.repo)) { json(res, 400, { error: 'repo_not_allowed' }); return true; }
    if (!validBranch(payload.branch)) { json(res, 400, { error: 'branch_not_allowed' }); return true; }
    if (!payload.objective || payload.objective.length > MAX_OBJECTIVE) { json(res, 400, { error: 'objective_invalid' }); return true; }
    const hash = approvals.requestHash(payload);
    const minted = await approvals.mintApproval(env, fetchImpl, session, { action: 'code_run', requestHash: hash, summary: payload.objective.slice(0, 120) }, now);
    if (minted.status !== 201) { json(res, minted.status, minted.body); return true; }
    const id = 'job-' + crypto.randomUUID();
    const used = await approvals.consumeApproval(env, fetchImpl, { id: minted.body.approval_id, action: 'code_run', requestHash: hash, consumer: 'code_run:' + id }, now);
    if (!used.ok) { json(res, used.status, { error: used.error }); return true; }
    const job = Object.assign({ id, approvalId: minted.body.approval_id, state: 'queued', createdAt: new Date(now).toISOString(), result: null }, payload);
    await approvals.command(env, fetchImpl, ['SET', jobKey(env, id), JSON.stringify(job), 'NX']);
    await approvals.command(env, fetchImpl, ['LPUSH', queueKey(env), id]);
    json(res, 201, { job_id: id, approval_id: minted.body.approval_id, state: 'queued', draft_only: true });
    return true;
  } catch {
    json(res, 503, { error: 'store_unavailable' });
    return true;
  }
}

module.exports = { budgetState, extraKey, holdForOk, holdKey, lockKey, BUILDERS, CAP_NAME, DEFAULT_OPUS_ESTIMATE_USD, OPUS_ESTIMATE_NAME, validBuilder, DEFAULT_RUN_ESTIMATE_USD, PROTECTED, REPOS, RUN_ESTIMATE_NAME, capCheck, runEstimate, handleBuilder, jobKey, monthKey, queueKey, routeOf, runnerEnabled, validBranch };
