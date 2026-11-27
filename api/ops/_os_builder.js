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

// Fail closed: the cap must be present, a plain positive number, and above what this month has already used.
function capCheck(env, spentUsd) {
  const raw = env ? env[CAP_NAME] : undefined;
  if (raw === undefined || raw === null || String(raw).trim() === '') return { ok: false, error: 'cap_missing' };
  if (!/^\d+(\.\d{1,2})?$/.test(String(raw).trim())) return { ok: false, error: 'cap_invalid' };
  const cap = Number(raw);
  if (!(cap > 0)) return { ok: false, error: 'cap_invalid' };
  const spent = Number(spentUsd);
  if (!Number.isFinite(spent) || spent < 0) return { ok: false, error: 'spend_unknown' };
  if (spent >= cap) return { ok: false, error: 'cap_reached', cap, spent };
  return { ok: true, cap, spent };
}

function monthKey(env, now) { return approvals.rootFor(env) + 'builder-spend:' + new Date(now || Date.now()).toISOString().slice(0, 7); }
function jobKey(env, id) { return approvals.rootFor(env) + 'builder-jobs:' + id; }
function queueKey(env) { return approvals.rootFor(env) + 'builder-jobs:queue'; }

function routeOf(req) {
  const q = queryOf(req);
  const area = String((Array.isArray(q.area) ? q.area[0] : q.area) || '').replace(/^\/+|\/+$/g, '');
  const p = String(req.url || '').split('?')[0].replace(/^\/+|\/+$/g, '').replace(/^ops\//, '');
  const r = area || p;
  return ['os/builder', 'os/builder/approve'].includes(r) ? r : '';
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
      json(res, 200, { jobs, draft_only: true });
      return true;
    }
    if (method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
    if (!approvals.isApprover(session.email)) { json(res, 403, { error: 'approver_not_allowed' }); return true; }
    const body = readBody(req) || {};
    const payload = { repo: String(body.repo || ''), branch: String(body.branch || ''), objective: String(body.objective || '').trim() };
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

module.exports = { CAP_NAME, PROTECTED, REPOS, capCheck, handleBuilder, jobKey, monthKey, queueKey, routeOf, runnerEnabled, validBranch };
