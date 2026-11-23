// api/ops/_os_intake.js — POST /api/os/ingest/project-intake (routed by api/os/ingest/[feed].js).
// Business assistant -> LAVAALL OS project intake. The scoped OS_INTAKE_TOKEN only authenticates the sender.
// Consent is a founder approval record minted by Osman's own signed-in session (api/ops/_approvals.js,
// POST /ops/harness/approvals) and bound to this exact request hash; the token cannot mint one.
// Writes only under rootFor(env) (lavaall:goals:v1: in production, lavaall:preview:goals:v1: elsewhere).
// Never creates repositories, grants access, calls a model, dispatches a coding run or sends mail.
// Never logs payloads, tokens or headers.
'use strict';
const crypto = require('node:crypto');
const { header, noStore, timingSafeEqualString } = require('./_lib');
const { command, createGoal, rootFor, MAX_GOAL } = require('./_harness_goals');
const approvals = require('./_approvals');
const catalog = require('../../tools/lavaall-ai/projects.json');
const projects = new Set((catalog.projects || []).map(p => p.name));
const TOP = ['schema_version', 'idempotency_key', 'source', 'approval_id', 'project'];
const allowed = ['name', 'description', 'business_objective', 'proposed_next_task', 'required_functionality', 'acceptance_criteria', 'requirements', 'constraints', 'priorities', 'existing_repository', 'existing_os_project'];
const lists = ['required_functionality', 'acceptance_criteria', 'requirements', 'constraints', 'priorities'];
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const INTAKE_APPROVERS = approvals.APPROVERS;
function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
// The hash Osman approves in his session and the sender submits: everything except approval_id.
function intakeRequestHash(body) { const b = { ...body }; delete b.approval_id; return hash('lavaall-os-intake-v2\n' + canonicalJson(b)); }
// opts.requireApproval=false validates a payload before an approval exists (used by the founder mint route).
function validateIntake(body, opts = {}) {
  const fail = (error, extra) => ({ error, ...extra });
  if (!object(body)) return fail('invalid_json');
  const p = body.project;
  if (Object.hasOwn(body, 'founder_approved') || (object(p) && Object.hasOwn(p, 'founder_approved'))) return fail('unverified_approval_field', { message: 'A bare founder_approved flag is not accepted; reference a founder-session approval_id.' });
  const top = opts.requireApproval === false ? TOP.filter(k => k !== 'approval_id') : TOP;
  // S5: unknown fields are rejected, never stripped or echoed back.
  if (Object.keys(body).some(k => !top.includes(k)) || (object(p) && Object.keys(p).some(k => !allowed.includes(k)))) return fail('unknown_field', { message: 'Only the documented intake fields are accepted.' });
  if (opts.requireApproval !== false && (typeof body.approval_id !== 'string' || !/^appr-[a-f0-9-]{36}$/.test(body.approval_id))) return fail('approval_required');
  if (!object(p)) return fail('invalid_field', { fields: ['project'] });
  const errors = [], sanitized = {};
  if (body.schema_version !== 2) errors.push('schema_version');
  if (body.source !== 'business_assistant') errors.push('source');
  if (typeof body.idempotency_key !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(body.idempotency_key)) errors.push('idempotency_key');
  for (const k of ['name', 'description', 'business_objective', 'proposed_next_task']) {
    if (typeof p[k] !== 'string' || !p[k].trim() || p[k].trim().length > (k === 'name' ? 80 : 1200)) errors.push('project.' + k);
    else sanitized[k] = p[k].trim();
  }
  for (const k of lists) {
    const required = k === 'required_functionality' || k === 'acceptance_criteria';
    if (p[k] === undefined && !required) continue;
    if (!Array.isArray(p[k]) || p[k].length > 20 || (required && !p[k].length) || p[k].some(x => typeof x !== 'string' || !x.trim() || x.trim().length > 500)) errors.push('project.' + k);
    else sanitized[k] = p[k].map(x => x.trim());
  }
  if (p.existing_repository != null) {
    if (typeof p.existing_repository !== 'string' || !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(p.existing_repository)) errors.push('project.existing_repository');
    else sanitized.existing_repository = p.existing_repository;
  }
  if (p.existing_os_project != null) {
    if (!projects.has(p.existing_os_project)) return fail('invalid_existing_os_project');
    sanitized.existing_os_project = p.existing_os_project;
  }
  if (errors.length) return fail('invalid_field', { fields: errors });
  const pii = [];
  const check = (x, path) => { if (typeof x === 'string' && (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(x) || (x.match(/\+?\d[\d .()\-]*\d/g) || []).some(n => (n.match(/\d/g) || []).length >= 9))) pii.push(path); };
  for (const [k, v] of Object.entries(sanitized)) { if (Array.isArray(v)) v.forEach((x, i) => check(x, 'project.' + k + '[' + i + ']')); else check(v, 'project.' + k); }
  if (pii.length) return fail('pii_detected', { fields: pii });
  return { value: sanitized };
}
function send(res, status, body) { noStore(res, 'application/json; charset=utf-8'); return res.status(status).send(JSON.stringify(body)); }
function stubId(name) {
  // S3: stubs never share a name with a catalog project; only existing_os_project attaches to one.
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50).replace(/-$/, '');
  return slug ? 'stub-' + slug : '';
}
function intakeOrigin(req) {
  const host = String(header(req, 'x-forwarded-host') || header(req, 'host') || '').trim().toLowerCase();
  const match = host.match(/^([a-z0-9.-]+)(?::([0-9]{1,5}))?$/);
  if (!match || !(match[1] === 'lavaall.com' || match[1].endsWith('.lavaall.com') || match[1].endsWith('.vercel.app')) || !match[1].split('.').every(part => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)) || (match[2] && Number(match[2]) > 65535)) return 'https://www.lavaall.com';
  const proto = String(header(req, 'x-forwarded-proto') || 'https').toLowerCase();
  return (proto === 'http' || proto === 'https' ? proto : 'https') + '://' + host;
}
async function handleProjectIntake(req, res, opts = {}) {
  const env = opts.env || process.env, fetchImpl = opts.fetchImpl || fetch;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  // S1: environment gate. Only Preview deployments serve intake unless Production is explicitly enabled.
  const vercelEnv = String(env.VERCEL_ENV || '');
  if (!(vercelEnv === 'preview' || (vercelEnv === 'production' && env.OS_INTAKE_PRODUCTION_ENABLED === '1'))) return send(res, 404, { error: 'not_found' });
  const token = env.OS_INTAKE_TOKEN;
  const match = String(header(req, 'authorization') || '').match(/^\s*Bearer\s+(\S+)\s*$/i);
  if (typeof token !== 'string' || token.length < 32 || token === env.OPS_CEO_BRIDGE_SECRET || token === env.OPS_AUTH_SECRET || !match || !timingSafeEqualString(match[1], token)) return send(res, 401, { error: 'unauthorized' });
  if (String(req.method || '').toUpperCase() !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  let raw = req.body, bytes;
  try { bytes = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw) || ''); } catch { return send(res, 400, { error: 'invalid_json' }); }
  if (bytes > 16384) return send(res, 413, { error: 'payload_too_large' });
  try { if (Buffer.isBuffer(raw)) raw = raw.toString('utf8'); if (typeof raw === 'string') raw = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid_json' }); }
  if (!object(raw)) return send(res, 400, { error: 'invalid_json' });
  const h = header(req, 'idempotency-key'), b = raw.idempotency_key;
  if (h != null && b != null && h !== b) return send(res, 400, { error: 'idempotency_key_mismatch' });
  if (typeof b !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(b)) return send(res, 400, { error: 'idempotency_key_required' });
  const checked = validateIntake(raw); if (checked.error) return send(res, 400, checked);
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) return send(res, 503, { error: 'intake_store_not_configured' });
  const ROOT = rootFor(env);
  const requestHash = intakeRequestHash(raw), idemHash = hash(b), idemKey = ROOT + 'intake-idem:' + idemHash;
  const at = new Date(now).toISOString(), approvalId = raw.approval_id;
  let reserved = false, consumed = false, goalCreated = false;
  try {
    const cmd = args => command(env, fetchImpl, args);
    const replay = async () => { const v = await cmd(['GET', idemKey]); if (!v) return null; let record; try { record = JSON.parse(v); } catch { throw Error('invalid record'); } if (record.requestHash !== requestHash || record.approvalId !== approvalId) return [409, { error: 'idempotency_conflict' }]; if (record.status === 'done') return [200, { ...record.response, replayed: true }]; return [409, { error: 'intake_in_progress' }]; };
    // A completed identical request replays its stored result (even after the approval has expired).
    let prior = await replay(); if (prior) return send(res, ...prior);
    if (await cmd(['SET', idemKey, JSON.stringify({ status: 'pending', requestHash, approvalId, at }), 'NX', 'EX', 300]) !== 'OK') { prior = await replay(); if (!prior) throw Error('reservation'); return send(res, ...prior); }
    reserved = true;
    const rateKey = ROOT + 'intake-rate:' + at.slice(0, 10), count = Number(await cmd(['INCR', rateKey]));
    if (count === 1) await cmd(['EXPIRE', rateKey, 172800]);
    if (count > 30) { await cmd(['DEL', idemKey]); return send(res, 429, { error: 'rate_limited' }); }
    // S2: the approval must already exist, minted by Osman's session for exactly this request hash.
    const approval = await approvals.consumeApproval(env, fetchImpl, { id: approvalId, action: 'intake_create', requestHash, consumer: 'intake' }, now);
    if (!approval.ok) { await cmd(['DEL', idemKey]); return send(res, approval.status, { error: approval.error }); }
    consumed = true;
    const p = checked.value;
    const intakeId = 'intake-' + crypto.randomUUID();
    const projectId = p.existing_os_project || stubId(p.name);
    if (!projectId) { await approvals.releaseApproval(env, fetchImpl, approvalId); await cmd(['DEL', idemKey]); return send(res, 400, { error: 'invalid_field', fields: ['project.name'] }); }
    const projectStatus = p.existing_os_project ? 'catalog' : 'pending_stub';
    if (projectStatus === 'pending_stub') await cmd(['SET', ROOT + 'catalog:' + projectId, JSON.stringify({ id: projectId, label: p.name, description: p.description, status: 'pending', source: 'business_intake', claimedRepository: p.existing_repository || null, createdAt: at, firstIntakeId: intakeId }), 'NX']);
    const intake = { name: p.name, description: p.description, business_objective: p.business_objective, required_functionality: p.required_functionality, existing_repository_claimed: p.existing_repository || null, requirements: p.requirements || [], acceptance_criteria: p.acceptance_criteria, constraints: p.constraints || [], priorities: p.priorities || [], proposed_next_task: p.proposed_next_task };
    const goal = await createGoal(env, fetchImpl, { project: projectId, objective: (p.name + ': ' + p.proposed_next_task).slice(0, MAX_GOAL), createdAt: at, createdBy: 'business_intake', source: 'business_intake', intakeId, approvalId, intake });
    goalCreated = true;
    await cmd(['RPUSH', ROOT + 'tasks:' + goal.id, JSON.stringify({ id: crypto.randomUUID(), title: p.proposed_next_task, state: 'proposed', source: 'business_intake', createdAt: at })]);
    await cmd(['SET', ROOT + 'intake:' + intakeId, JSON.stringify({ id: intakeId, receivedAt: at, projectId, projectStatus, goalId: goal.id, approvalId, approver: approval.record.approver, idempotencyKeyHash: idemHash, requestHash, project: p })]);
    const response = { ok: true, project_id: projectId, project_status: projectStatus, goal_id: goal.id, intake_id: intakeId, approval_id: approvalId, url: intakeOrigin(req) + '/os/?project=' + encodeURIComponent(projectId) + '&goal=' + encodeURIComponent(goal.id) + '#harness', note: 'Intake recorded with a founder-session approval. No repository was created, no access was granted, no model was called and no code was executed.' };
    await cmd(['SET', idemKey, JSON.stringify({ status: 'done', requestHash, approvalId, at, response }), 'EX', 604800]);
    return send(res, 201, response);
  } catch {
    // Best effort: if nothing durable was created yet, release the reservation and approval so a retry can succeed.
    if (reserved && !goalCreated) {
      try { await command(env, fetchImpl, ['DEL', idemKey]); } catch { /* store down */ }
      if (consumed) { try { await approvals.releaseApproval(env, fetchImpl, approvalId); } catch { /* store down */ } }
    }
    return send(res, 503, { error: 'intake_store_unavailable' });
  }
}
module.exports = { INTAKE_APPROVERS, handleProjectIntake, canonicalJson, intakeRequestHash, validateIntake, stubId, intakeOrigin };
