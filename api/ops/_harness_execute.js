// GitHub Actions is the real execution environment. This endpoint never executes code on Vercel.
'use strict';
const crypto = require('node:crypto');

const REPO = 'osman-jalloh-lab/Lavaal-';
const WORKFLOW = 'os-code-task.yml';
const BASE = 'https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW;
const MAX_TASK = 2000;
const DAILY_CAP = 2;

function originOK(req) {
  const origin = req && req.headers && req.headers.origin;
  const host = req && req.headers && req.headers.host;
  try {
    return Boolean(origin && host && new URL(origin).protocol === 'https:'
      && new URL(origin).host === host);
  } catch { return false; }
}

async function postKv(command, env, fetchImpl) {
  const r = await fetchImpl(String(env.KV_REST_API_URL).replace(/\/$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      Authorization: 'Bearer ' + env.KV_REST_API_TOKEN },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('rate_limit_store_unavailable');
  const j = await r.json();
  if (j && j.error) throw new Error('rate_limit_store_unavailable');
  return j && j.result;
}

function ready(env) {
  return env.OS_CODE_RUNS_ENABLED === 'true'
    && Boolean(env.OS_GITHUB_RUNNER_TOKEN && env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
}

async function consumeDailyLimit(env, fetchImpl) {
  const day = new Date().toISOString().slice(0, 10);
  const key = 'lavaall-os-code-runs:' + day;
  const count = Number(await postKv(['INCR', key], env, fetchImpl));
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('rate_limit_store_unavailable');
  if (count === 1) await postKv(['EXPIRE', key, 172800], env, fetchImpl);
  return count <= DAILY_CAP;
}

async function githubRequest(url, opts, env, fetchImpl) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetchImpl(url, {
      ...(opts || {}),
      signal: controller.signal,
      headers: {
        Authorization: 'Bearer ' + env.OS_GITHUB_RUNNER_TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...((opts && opts.headers) || {}),
      },
    });
  } finally { clearTimeout(t); }
}

async function dispatch(req, env, fetchImpl) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } };
  if (!originOK(req)) return { status: 403, body: { error: 'invalid_origin' } };
  if (!ready(env)) return { status: 503, body: { error: 'coding_runner_not_configured' } };
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.confirm !== true || body.project !== 'lavaall') {
    return { status: 400, body: { error: 'approval_or_project_required' } };
  }
  const task = String(body.task || '').trim();
  if (!task || task.length > MAX_TASK) {
    return { status: 400, body: { error: 'invalid_task', maxLength: MAX_TASK } };
  }
  let allowed = false;
  try { allowed = await consumeDailyLimit(env, fetchImpl); }
  catch { return { status: 503, body: { error: 'rate_limit_store_unavailable' } }; }
  if (!allowed) return { status: 429, body: { error: 'daily_code_run_limit', limit: DAILY_CAP } };
  const requestId = 'os-' + crypto.randomUUID();
  let resp;
  try {
    resp = await githubRequest(BASE + '/dispatches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs: { request_id: requestId, task } }),
    }, env, fetchImpl);
  } catch {
    return { status: 502, body: { error: 'github_dispatch_unavailable' } };
  }
  if (resp.status !== 204) {
    return { status: 502, body: { error: 'github_dispatch_failed', providerStatus: resp.status } };
  }
  return { status: 202, body: {
    ok: true, requestId, status: 'queued',
    note: 'GitHub accepted the request. This does not prove the agent executed successfully.',
    runsUrl: 'https://github.com/' + REPO + '/actions/workflows/' + WORKFLOW,
  } };
}

async function status(req, env, fetchImpl) {
  if (req.method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
  if (!ready(env)) return { status: 503, body: { error: 'coding_runner_not_configured' } };
  const value = req.query && req.query.request_id;
  const id = typeof value === 'string' ? value : '';
  if (!/^os-[a-f0-9-]{36}$/.test(id)) return { status: 400, body: { error: 'invalid_request_id' } };
  try {
    const resp = await githubRequest(BASE + '/runs?event=workflow_dispatch&per_page=50', {
      method: 'GET',
    }, env, fetchImpl);
    if (!resp.ok) return { status: 502, body: { error: 'github_runs_unavailable' } };
    const data = await resp.json();
    const match = (data.workflow_runs || []).find(x => x.display_title === 'LAVAALL OS coding: ' + id);
    if (!match) return { status: 200, body: { requestId: id, status: 'pending_discovery',
      note: 'The workflow run has not appeared in the latest results yet.' } };
    return { status: 200, body: {
      requestId: id, status: match.status, conclusion: match.conclusion || null,
      runUrl: match.html_url, runId: match.id,
      note: 'Inspect the run jobs and downloadable patch artifact to verify actual execution.',
    } };
  } catch {
    return { status: 502, body: { error: 'github_runs_unavailable' } };
  }
}

module.exports = { originOK, ready, dispatch, status, MAX_TASK, DAILY_CAP };
