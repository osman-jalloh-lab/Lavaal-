// Durable, founder-only /goal records. Never grants model or repository access.
// Each checkpoint is an atomic Redis list append; no read-modify-write of shared chat state.
'use strict';
const crypto = require('node:crypto');
const CATALOG = require('../../tools/lavaall-ai/projects.json');

const MAX_GOAL = 1200;
const MAX_NOTE = 3000;
const MAX_CHECKPOINTS = 100;
const PROJECTS = new Set((CATALOG.projects || []).map(x => x.name));
const PROVIDERS = new Set(['human', 'grok', 'claude', 'codex', 'deepseek']);
const STATES = new Set(['planned', 'in_progress', 'blocked', 'awaiting_approval', 'completed']);
const ID_RE = /^goal-[a-f0-9-]{36}$/;
const ROOT = 'lavaall:goals:v1:';

function allowedOrigin(req) {
  const origin = req && req.headers && req.headers.origin;
  const host = req && req.headers && req.headers.host;
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.host === host && url.pathname === '/'
      && !url.search && !url.hash;
  } catch { return false; }
}
function configured(env) { return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN); }
async function command(env, fetchImpl, args) {
  const res = await fetchImpl(String(env.KV_REST_API_URL).replace(/\/$/, ''), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.KV_REST_API_TOKEN,
      'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('store_unavailable');
  const body = await res.json();
  if (!body || body.error) throw new Error('store_unavailable');
  return body.result;
}
function reply(status, body) { return { status, body }; }
function clean(v, cap) {
  const str = typeof v === 'string' ? v.trim() : '';
  return str && str.length <= cap ? str : '';
}
function key(id) { return ROOT + 'item:' + id; }
function eventsKey(id) { return ROOT + 'events:' + id; }
function indexKey(project) { return ROOT + 'project:' + project; }
function jsonRecord(v) {
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; }
  catch { return null; }
}
function allowedUrl(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash
      && ['github.com', 'www.github.com'].includes(u.hostname) ? u.href : null;
  } catch { return null; }
}
async function getGoal(env, fetchImpl, id) {
  if (!ID_RE.test(id || '')) return null;
  const raw = await command(env, fetchImpl, ['GET', key(id)]);
  return typeof raw === 'string' ? jsonRecord(raw) : null;
}
async function detail(env, fetchImpl, id) {
  const goal = await getGoal(env, fetchImpl, id);
  if (!goal) return reply(404, { error: 'goal_not_found' });
  const lines = await command(env, fetchImpl, ['LRANGE', eventsKey(id), 0, MAX_CHECKPOINTS - 1]);
  const checkpoints = (Array.isArray(lines) ? lines : []).map(jsonRecord).filter(Boolean);
  return reply(200, { goal, checkpoints, latest: checkpoints[checkpoints.length - 1] || null,
    note: 'Checkpoints are submitted assertions, not verified provider execution.' });
}
async function list(env, fetchImpl, project) {
  if (!PROJECTS.has(project)) return reply(400, { error: 'unknown_project' });
  const ids = await command(env, fetchImpl, ['LRANGE', indexKey(project), 0, 19]);
  const records = await Promise.all((Array.isArray(ids) ? ids : [])
    .map(id => getGoal(env, fetchImpl, id)));
  const goals = records.filter(g => g && g.project === project);
  return reply(200, { project, goals, persist: true });
}
async function create(env, fetchImpl, body) {
  if (!PROJECTS.has(body.project)) return reply(400, { error: 'unknown_project' });
  const objective = clean(body.objective, MAX_GOAL);
  if (!objective) return reply(400, { error: 'invalid_objective', maxLength: MAX_GOAL });
  const id = 'goal-' + crypto.randomUUID();
  const goal = { id, project: body.project, objective, state: 'planned',
    createdAt: new Date().toISOString(), createdBy: 'founder',
    repository: body.project === 'salonehire' || body.project === 'saloneworks'
      ? 'osman-jalloh-lab/saloneworks' : body.project === 'lavaall'
        ? 'osman-jalloh-lab/Lavaal-' : null,
    execution: 'not_started' };
  const result = await command(env, fetchImpl, ['SET', key(id), JSON.stringify(goal), 'NX']);
  if (result !== 'OK') throw new Error('store_unavailable');
  await command(env, fetchImpl, ['LPUSH', indexKey(goal.project), id]);
  return reply(201, { goal, note: 'Goal recorded. No model was called and no coding run started.' });
}
async function checkpoint(env, fetchImpl, body) {
  const goal = await getGoal(env, fetchImpl, body.id);
  if (!goal) return reply(404, { error: 'goal_not_found' });
  const note = clean(body.note, MAX_NOTE);
  const provider = String(body.provider || 'human');
  const state = String(body.state || 'in_progress');
  const evidenceUrl = allowedUrl(body.evidenceUrl);
  if (!note || !PROVIDERS.has(provider) || !STATES.has(state) || evidenceUrl === null) {
    return reply(400, { error: 'invalid_checkpoint' });
  }
  const checkpoint = { id: crypto.randomUUID(), at: new Date().toISOString(),
    provider, state, note, evidenceUrl,
    verification: 'unverified', submittedBy: 'founder' };
  await command(env, fetchImpl, ['RPUSH', eventsKey(goal.id), JSON.stringify(checkpoint)]);
  const updated = { ...goal, state: checkpoint.state, updatedAt: checkpoint.at,
    latestCheckpointId: checkpoint.id };
  const result = await command(env, fetchImpl, ['SET', key(goal.id), JSON.stringify(updated), 'XX']);
  if (result !== 'OK') throw new Error('store_unavailable');
  return reply(201, { goalId: goal.id, goal: updated, checkpoint,
    note: 'Handoff saved, but no external run or commit was independently verified.' });
}
async function handle(req, env, fetchImpl) {
  if (req.method !== 'GET' && req.method !== 'POST')
    return reply(405, { error: 'method_not_allowed' });
  if (req.method === 'POST' && !allowedOrigin(req))
    return reply(403, { error: 'invalid_origin' });
  if (!configured(env)) return reply(503, { error: 'goal_store_not_configured' });
  try {
    if (req.method === 'GET') {
      if (req.query && req.query.id) return detail(env, fetchImpl, String(req.query.id));
      return list(env, fetchImpl, String(req.query && req.query.project || ''));
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.action === 'create') return create(env, fetchImpl, body);
    if (body.action === 'checkpoint') return checkpoint(env, fetchImpl, body);
    return reply(400, { error: 'unknown_action' });
  } catch { return reply(503, { error: 'goal_store_unavailable' }); }
}
module.exports = { handle, allowedOrigin, allowedUrl, ID_RE, MAX_GOAL };
