// Founder-approved code-run queue. Goal and objective text are untrusted data.
'use strict';
const crypto = require('node:crypto');
const goals = require('./_harness_goals');
const approvals = require('./_approvals');
const { canonicalJson } = require('./_os_intake');
const REPOS = Object.freeze(['osman-jalloh-lab/Lavaal-', 'osman-jalloh-lab/saloneworks']);
const JOB_ID = /^job-[a-f0-9-]{36}$/;
const fields = ['goalId', 'project', 'repo', 'branch', 'objective', 'baseSha'];
function validatePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !fields.includes(k))) return { error: 'invalid_payload' };
  if (!goals.ID_RE.test(String(input.goalId || '')) || typeof input.project !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(input.project)) return { error: 'invalid_goal' };
  if (!REPOS.includes(input.repo)) return { error: 'repo_not_allowed' };
  if (typeof input.branch !== 'string' || input.branch.length > 120 || !/^(?:feature|run)\/[a-z0-9][a-z0-9._-]*$/.test(input.branch) || input.branch.includes('..') || input.branch.endsWith('.') || input.branch.endsWith('.lock')) return { error: 'invalid_branch' };
  if (typeof input.objective !== 'string' || !input.objective.trim() || input.objective.length > 1200) return { error: 'invalid_objective' };
  if (input.baseSha !== undefined && !/^[a-f0-9]{40}$/.test(input.baseSha)) return { error: 'invalid_base_sha' };
  const value = { goalId: input.goalId, project: input.project, repo: input.repo, branch: input.branch, objective: input.objective };
  if (input.baseSha !== undefined) value.baseSha = input.baseSha;
  return { value };
}
function requestHash(payload) { return crypto.createHash('sha256').update('lavaall-os-code-run-v1\n' + canonicalJson(payload)).digest('hex'); }
function containsSecret(payload, env) {
  const text = JSON.stringify(payload);
  return Object.entries(env || {}).some(([key, value]) => /KEY|TOKEN|SECRET/i.test(key) && typeof value === 'string' && value.length >= 8 && text.includes(value));
}
async function checkGoal(env, fetchImpl, payload) {
  const result = await goals.handle({ method: 'GET', query: { id: payload.goalId } }, env, fetchImpl);
  const goal = result.body && result.body.goal;
  return goal && goal.project === payload.project && goal.repository === payload.repo && ['planned', 'in_progress'].includes(goal.state) ? goal : null;
}
async function handle(req, env, fetchImpl) {
  if (!['GET', 'POST'].includes(req.method)) return { status: 405, body: { error: 'method_not_allowed' } };
  if (req.method === 'POST' && !goals.allowedOrigin(req)) return { status: 403, body: { error: 'invalid_origin' } };
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) return { status: 503, body: { error: 'goal_store_not_configured' } };
  const root = goals.rootFor(env), cmd = args => goals.command(env, fetchImpl, args);
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.id) {
        if (!JOB_ID.test(String(q.id))) return { status: 404, body: { error: 'job_not_found' } };
        const raw = await cmd(['GET', root + 'jobs:' + q.id]);
        if (!raw) return { status: 404, body: { error: 'job_not_found' } };
        return { status: 200, body: { job: JSON.parse(raw) } };
      }
      if (!goals.ID_RE.test(String(q.goalId || '')) || typeof q.project !== 'string') return { status: 400, body: { error: 'invalid_goal' } };
      const goal = await goals.handle({ method: 'GET', query: { id: q.goalId } }, env, fetchImpl);
      if (!goal.body.goal || goal.body.goal.project !== q.project) return { status: 404, body: { error: 'goal_not_found' } };
      const ids = await cmd(['LRANGE', root + 'jobs:goal:' + q.goalId, 0, 49]);
      const jobs = await Promise.all((Array.isArray(ids) ? ids : []).filter(id => JOB_ID.test(id)).map(async id => { const raw = await cmd(['GET', root + 'jobs:' + id]); return raw ? JSON.parse(raw) : null; }));
      return { status: 200, body: { jobs: jobs.filter(j => j && j.goalId === q.goalId && j.project === q.project) } };
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !fields.includes(k) && k !== 'approvalId')) return { status: 400, body: { error: 'invalid_payload' } };
    const payload = { ...body }; delete payload.approvalId;
    const checked = validatePayload(payload);
    if (checked.error) return { status: 400, body: checked };
    if (containsSecret(checked.value, env)) return { status: 400, body: { error: 'sensitive_payload' } };
    if (!await checkGoal(env, fetchImpl, checked.value)) return { status: 400, body: { error: 'goal_not_runnable' } };
    const id = 'job-' + crypto.randomUUID();
    const consumed = await approvals.consumeApproval(env, fetchImpl, { id: body.approvalId, action: 'code_run', requestHash: requestHash(checked.value), consumer: 'code_run:' + id });
    if (!consumed.ok) return { status: consumed.status, body: { error: consumed.error } };
    const at = new Date().toISOString();
    const job = { id, ...checked.value, approvalId: body.approvalId, state: 'queued', createdAt: at, updatedAt: at, result: {} };
    let stored = false;
    try {
      if (await cmd(['SET', root + 'jobs:' + id, JSON.stringify(job), 'NX']) !== 'OK') throw Error('store_unavailable');
      stored = true;
      await cmd(['LPUSH', root + 'jobs:goal:' + job.goalId, id]);
      await cmd(['LPUSH', root + 'jobs:queue', id]);
    } catch (err) { if (!stored) await approvals.releaseApproval(env, fetchImpl, body.approvalId); throw err; }
    return { status: 201, body: { job, note: 'Queued for a box runner; no run has started.' } };
  } catch { return { status: 503, body: { error: 'job_store_unavailable' } }; }
}
module.exports = { REPOS, JOB_ID, validatePayload, requestHash, containsSecret, checkGoal, handle };
