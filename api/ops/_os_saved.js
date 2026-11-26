// api/ops/_os_saved.js — what Osman saves in /os: goals (Progress) and memories (Memory). Founder-only.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// GET  /ops/os/saved            -> { goals, memories, persist }
// POST /ops/os/saved            -> body { op, ... } with op one of:
//      goal.upsert {goal:{id?, horizon, title, project, progress, done}}   goal.delete {id}
//      memory.add  {text, tags?}                                           memory.delete {id}
// One KV key, lavaall-os-saved-v1 (preview deploys prefix it, so a preview never writes production data).
// Without KV it keeps the data in memory for the instance and says persist:false. Text is stored as data and
// escaped by the client. Agent-looking requests are refused. Never logs bodies.

const crypto = require('crypto');
const { json, readBody, looksLikeAgentRequest, queryOf } = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');

const KEY = 'lavaall-os-saved-v1';
const HORIZONS = Object.freeze(['week', 'month', 'quarter']);
const PROJECTS = Object.freeze(Array.from(new Set(['lavaall', 'salonehire', 'saloneworks', 'personal', 'other'].concat((() => {
  try {
    const pack = require('../../tools/lavaall-ai/projects.json');
    return (Array.isArray(pack.groups) ? pack.groups : []).map((g) => String(g && g.id || '')).filter((id) => /^[a-z0-9-]{2,40}$/.test(id));
  } catch { return []; }
})()))));
const MAX_GOALS = 60;
const MAX_MEMORIES = 500;
const MAX_MEMORY = 2000;

let memoryStore = null;

function isSavedRequest(req) {
  const q = queryOf(req);
  const area = String((Array.isArray(q.area) ? q.area[0] : q.area) || '');
  const pathOnly = String(req.url || '').split('?')[0];
  return /(^|\/)os\/saved\/?$/.test(area) || /\/ops\/os\/saved\/?$/.test(pathOnly);
}

function keyFor(env) {
  const e = String(env.VERCEL_ENV || '').trim().toLowerCase();
  const prefix = !e || e === 'production' ? '' : e.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return prefix ? `${prefix}:${KEY}` : KEY;
}

function kvOn(env) { return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN); }

async function kv(args, env, fetchImpl) {
  const res = await fetchImpl(String(env.KV_REST_API_URL).replace(/\/$/, ''), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('kv');
  return res.json();
}

function text(value, min, max) {
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return t.length < min || t.length > max ? null : t;
}

function cleanGoal(g, now) {
  if (!g || typeof g !== 'object') return null;
  const title = text(g.title, 1, 160);
  if (!title || !HORIZONS.includes(g.horizon)) return null;
  const project = PROJECTS.includes(g.project) ? g.project : 'other';
  const progress = Math.max(0, Math.min(100, Math.round(Number(g.progress) || 0)));
  const id = typeof g.id === 'string' && /^g-[a-f0-9]{12}$/.test(g.id) ? g.id : `g-${crypto.randomBytes(6).toString('hex')}`;
  return { id, horizon: g.horizon, title, project, progress, done: g.done === true || progress === 100, updatedAt: now };
}

function normalize(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const goals = (Array.isArray(data.goals) ? data.goals : []).map((g) => cleanGoal(g, Number(g && g.updatedAt) || 0)).filter(Boolean).slice(0, MAX_GOALS);
  const memories = (Array.isArray(data.memories) ? data.memories : []).filter((m) => m && /^m-[a-f0-9]{12}$/.test(m.id) && text(m.text, 1, MAX_MEMORY))
    .map((m) => ({ id: m.id, text: text(m.text, 1, MAX_MEMORY), tags: Array.isArray(m.tags) ? m.tags.map((t) => text(t, 1, 30)).filter(Boolean).slice(0, 8) : [], createdAt: Number(m.createdAt) || 0 }))
    .slice(0, MAX_MEMORIES);
  return { goals, memories };
}

async function readSaved(env, fetchImpl) {
  if (!kvOn(env) || !fetchImpl) return { data: normalize(memoryStore), persist: false };
  const out = await kv(['GET', keyFor(env)], env, fetchImpl);
  const raw = out && out.result;
  let parsed = null;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { parsed = null; }
  return { data: normalize(parsed), persist: true };
}

async function writeSaved(data, env, fetchImpl) {
  if (!kvOn(env) || !fetchImpl) { memoryStore = data; return false; }
  await kv(['SET', keyFor(env), JSON.stringify(data)], env, fetchImpl);
  return true;
}

function apply(data, body, now) {
  const op = String(body.op || '');
  if (op === 'goal.upsert') {
    const goal = cleanGoal(body.goal, now);
    if (!goal) return { error: 'invalid_goal' };
    const rest = data.goals.filter((g) => g.id !== goal.id);
    if (rest.length >= MAX_GOALS && rest.length === data.goals.length) return { error: 'too_many_goals' };
    return { data: { goals: [goal].concat(rest), memories: data.memories }, item: goal };
  }
  if (op === 'goal.delete') return { data: { goals: data.goals.filter((g) => g.id !== body.id), memories: data.memories } };
  if (op === 'memory.add') {
    const t = text(body.text, 1, MAX_MEMORY);
    if (!t) return { error: 'invalid_memory' };
    const tags = Array.isArray(body.tags) ? body.tags.map((x) => text(x, 1, 30)).filter(Boolean).slice(0, 8) : [];
    const item = { id: `m-${crypto.randomBytes(6).toString('hex')}`, text: t, tags, createdAt: now };
    return { data: { goals: data.goals, memories: [item].concat(data.memories).slice(0, MAX_MEMORIES) }, item };
  }
  if (op === 'memory.delete') return { data: { goals: data.goals, memories: data.memories.filter((m) => m.id !== body.id) } };
  return { error: 'unknown_op' };
}

async function handleSaved(req, res, opts) {
  if (!isSavedRequest(req)) return false;
  const env = (opts && opts.env) || process.env;
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  const now = (opts && opts.now) || Date.now();
  if (looksLikeAgentRequest(req)) { json(res, 403, { error: 'agent_denied' }); return true; }
  const session = opts && opts.session !== undefined ? opts.session : await readLiveSession(req);
  if (!session || !session.email) { json(res, 401, { error: 'sign_in_required' }); return true; }
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const { data, persist } = await readSaved(env, fetchImpl);
      json(res, 200, Object.assign({ persist }, data));
      return true;
    }
    if (req.method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
    const body = readBody(req) || {};
    const { data } = await readSaved(env, fetchImpl);
    const next = apply(data, body, now);
    if (next.error) { json(res, 400, { error: next.error }); return true; }
    const persist = await writeSaved(next.data, env, fetchImpl);
    json(res, 200, Object.assign({ ok: true, persist, item: next.item || null }, next.data));
  } catch {
    json(res, 503, { error: 'store_unavailable', message: 'Saving is unavailable right now. Try again.' });
  }
  return true;
}

function resetSaved() { memoryStore = null; }

module.exports = { HORIZONS, PROJECTS, apply, cleanGoal, handleSaved, isSavedRequest, keyFor, normalize, resetSaved };
