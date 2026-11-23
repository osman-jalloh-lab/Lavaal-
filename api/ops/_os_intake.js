// api/ops/_os_intake.js — POST /api/os/ingest/project-intake (routed by api/os/ingest/[feed].js).
// Business assistant -> LAVAALL OS project intake. Scoped OS_INTAKE_TOKEN bearer + HMAC-bound founder
// approval record. Writes only under #103's lavaall:goals:v1: root. Never creates repositories, grants
// access, calls a model, dispatches a coding run or sends mail. Never logs payloads, tokens or headers.
'use strict';
const crypto = require('node:crypto');
const { header, noStore, timingSafeEqualString } = require('./_lib');
// Dedicated intake approver list (Osman, 22 Nov 2026 11:15 PM CT). Deliberately separate from the
// founder sign-in ALLOWLIST in _lib.js, which is unchanged. Change only through a reviewed PR.
const INTAKE_APPROVERS = Object.freeze(['osmanjalloh104@gmail.com']);
const isIntakeApprover = email => typeof email === 'string' && INTAKE_APPROVERS.includes(email.trim().toLowerCase());
const { command, createGoal, ROOT, MAX_GOAL } = require('./_harness_goals');
const catalog = require('../../tools/lavaall-ai/projects.json');
const projects = new Set((catalog.projects || []).map(p => p.name));
const allowed = ['name', 'description', 'business_objective', 'proposed_next_task', 'required_functionality', 'acceptance_criteria', 'requirements', 'constraints', 'priorities', 'existing_repository', 'existing_os_project'];
const lists = ['required_functionality', 'acceptance_criteria', 'requirements', 'constraints', 'priorities'];
const forbidden = /conversation|transcript|message|chat|client|customer|applicant|cv|resume|email|phone|contact|address|password|token|secret|cookie|payment|card|quote|quotation|salary|ssn|passport/i;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function signingBody(body) { const b = { ...body, approval: { ...body.approval } }; delete b.approval.signature; return b; }
function signIntake(token, body) { return crypto.createHmac('sha256', token).update('lavaall-os-intake-v1\n' + canonicalJson(signingBody(body))).digest('hex'); }
function validateIntake(body, cat = catalog) {
  const fail = (error, extra) => ({ error, ...extra });
  if (!object(body)) return fail('invalid_json');
  const p = body.project;
  if (Object.hasOwn(body, 'founder_approved') || (object(p) && Object.hasOwn(p, 'founder_approved'))) return fail('unverified_approval_field', { message: 'A bare founder_approved flag is not accepted; send a signed approval record.' });
  const unknown = Object.keys(body).filter(k => !['schema_version', 'idempotency_key', 'source', 'approval', 'project'].includes(k));
  if (unknown.length) return fail('unknown_field', { fields: unknown });
  const a = body.approval;
  if (!object(a) || Object.keys(a).sort().join(',') !== ['action','approval_id','approved_at','approver_email','signature'].sort().join(',') || typeof a.approval_id !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(a.approval_id) || typeof a.approver_email !== 'string' || typeof a.approved_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,6})?)?(?:Z|[+-]\d\d:\d\d)$/.test(a.approved_at) || !Number.isFinite(Date.parse(a.approved_at)) || a.action !== 'intake_create' || typeof a.signature !== 'string' || !/^[a-f0-9]{64}$/.test(a.signature)) return fail('approval_required');
  if (!object(p)) return fail('invalid_field', { fields: ['project'] });
  const blocked = Object.keys(p).filter(k => forbidden.test(k)).map(k => 'project.' + k);
  if (blocked.length) return fail('forbidden_field', { fields: blocked });
  const strippedFields = Object.keys(p).filter(k => !allowed.includes(k)).map(k => 'project.' + k);
  const sanitized = {}; for (const k of allowed) if (Object.hasOwn(p, k)) sanitized[k] = p[k];
  const errors = [];
  if (body.schema_version !== 1) errors.push('schema_version');
  if (body.source !== 'business_assistant') errors.push('source');
  for (const k of ['name','description','business_objective','proposed_next_task']) {
    if (typeof p[k] !== 'string' || !p[k].trim() || p[k].trim().length > (k === 'name' ? 80 : 1200)) errors.push('project.' + k);
    else sanitized[k] = p[k].trim();
  }
  for (const k of lists) {
    if (p[k] === undefined && !['required_functionality','acceptance_criteria'].includes(k)) continue;
    if (!Array.isArray(p[k]) || p[k].length > 20 || (['required_functionality','acceptance_criteria'].includes(k) && !p[k].length) || p[k].some(x => typeof x !== 'string' || !x.trim() || x.trim().length > 500)) errors.push('project.' + k);
    else sanitized[k] = p[k].map(x => x.trim());
  }
  if (p.existing_repository != null && (typeof p.existing_repository !== 'string' || !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(p.existing_repository))) errors.push('project.existing_repository');
  const names = new Set((cat.projects || []).map(x => x.name));
  if (p.existing_os_project != null && !names.has(p.existing_os_project)) return fail('invalid_existing_os_project');
  if (errors.length) return fail('invalid_field', { fields: errors });
  const pii = [];
  for (const [k,v] of Object.entries(sanitized)) {
    const check = (x, path) => { if (typeof x === 'string' && (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(x) || (x.match(/\+?\d[\d .()\-]*\d/g) || []).some(n => (n.match(/\d/g) || []).length >= 9))) pii.push(path); };
    if (Array.isArray(v)) v.forEach((x,i) => check(x, 'project.' + k + '[' + i + ']')); else check(v, 'project.' + k);
  }
  if (pii.length) return fail('pii_detected', { fields: pii });
  return { value: sanitized, strippedFields };
}
function send(res, status, body) { noStore(res, 'application/json; charset=utf-8'); return res.status(status).send(JSON.stringify(body)); }
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
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
  const idem = h != null ? h : b;
  if (typeof idem !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(idem)) return send(res, 400, { error: 'idempotency_key_required' });
  const checked = validateIntake(raw); if (checked.error) return send(res, 400, checked);
  const a = raw.approval;
  if (!isIntakeApprover(a.approver_email)) return send(res, 403, { error: 'approver_not_allowed' });
  if (!timingSafeEqualString(a.signature, signIntake(token, raw))) return send(res, 403, { error: 'approval_signature_invalid' });
  const approved = Date.parse(a.approved_at);
  const approvalFresh = !(approved > now + 60000 || approved < now - 900000);
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) return send(res, 503, { error: 'intake_store_not_configured' });
  const requestHash = hash(canonicalJson(signingBody(raw))), idemHash = hash(idem), idemKey = ROOT + 'intake-idem:' + idemHash;
  const at = new Date(now).toISOString();
  let reserved = false, approvalWritten = false, goalCreated = false;
  try {
    const cmd = args => command(env, fetchImpl, args);
    const replay = async () => { const v = await cmd(['GET', idemKey]); if (!v) return null; let record; try { record = JSON.parse(v); } catch { throw Error('invalid record'); } if (record.requestHash !== requestHash) return [409, { error: 'idempotency_conflict' }]; if (record.status === 'done') return [200, { ...record.response, replayed: true }]; return [409, { error: 'intake_in_progress' }]; };
    // N1: an identical, already-completed signed request replays its stored result even after the approval window.
    let prior = await replay(); if (prior) return send(res, ...prior);
    if (!approvalFresh) return send(res, 403, { error: 'approval_expired' });
    if (await cmd(['SET', idemKey, JSON.stringify({ status: 'pending', requestHash, at }), 'NX', 'EX', 300]) !== 'OK') { prior = await replay(); if (!prior) throw Error('reservation'); return send(res, ...prior); }
    reserved = true;
    const rateKey = ROOT + 'intake-rate:' + at.slice(0,10), count = Number(await cmd(['INCR', rateKey]));
    if (count === 1) await cmd(['EXPIRE', rateKey, 172800]);
    if (count > 30) { await cmd(['DEL', idemKey]); return send(res, 429, { error: 'rate_limited' }); }
    const intakeId = 'intake-' + crypto.randomUUID();
    const approval = { id: a.approval_id, action: 'intake_create', scope: 'intake_create', approver: a.approver_email.toLowerCase(), approvedAt: a.approved_at, recordedAt: at, idempotencyKeyHash: idemHash, requestHash, verifiedBy: 'os_intake_token_hmac_v1', intakeId };
    if (await cmd(['SET', ROOT + 'approvals:' + a.approval_id, JSON.stringify(approval), 'NX']) !== 'OK') { await cmd(['DEL', idemKey]); return send(res, 409, { error: 'approval_reused' }); }
    approvalWritten = true;
    const p = checked.value;
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,60).replace(/-$/, '');
    const projectId = p.existing_os_project || slug;
    if (!projectId) { await cmd(['DEL', idemKey]); await cmd(['DEL', ROOT + 'approvals:' + a.approval_id]); return send(res, 400, { error: 'invalid_field', fields: ['project.name'] }); }
    const projectStatus = projects.has(projectId) ? 'catalog' : 'pending_stub';
    if (projectStatus === 'pending_stub') await cmd(['SET', ROOT + 'catalog:' + projectId, JSON.stringify({ id: projectId, label: p.name, description: p.description, status: 'pending', source: 'business_intake', claimedRepository: p.existing_repository || null, createdAt: at, firstIntakeId: intakeId }), 'NX']);
    const intake = { name: p.name, description: p.description, business_objective: p.business_objective, required_functionality: p.required_functionality, existing_repository_claimed: p.existing_repository || null, requirements: p.requirements || [], acceptance_criteria: p.acceptance_criteria, constraints: p.constraints || [], priorities: p.priorities || [], proposed_next_task: p.proposed_next_task };
    const goal = await createGoal(env, fetchImpl, { project: projectId, objective: (p.name + ': ' + p.proposed_next_task).slice(0, MAX_GOAL), createdAt: at, createdBy: 'business_intake', source: 'business_intake', intakeId, approvalId: a.approval_id, intake });
    goalCreated = true;
    await cmd(['RPUSH', ROOT + 'tasks:' + goal.id, JSON.stringify({ id: crypto.randomUUID(), title: p.proposed_next_task, state: 'proposed', source: 'business_intake', createdAt: at })]);
    await cmd(['SET', ROOT + 'intake:' + intakeId, JSON.stringify({ id: intakeId, receivedAt: at, projectId, projectStatus, goalId: goal.id, approvalId: a.approval_id, idempotencyKeyHash: idemHash, requestHash, strippedFields: checked.strippedFields, project: p })]);
    const response = { ok: true, project_id: projectId, project_status: projectStatus, goal_id: goal.id, intake_id: intakeId, approval_id: a.approval_id, url: 'https://www.lavaall.com/os/?project=' + encodeURIComponent(projectId) + '&goal=' + encodeURIComponent(goal.id) + '#harness', stripped_fields: checked.strippedFields, note: 'Intake recorded with a verified founder approval. No repository was created, no access was granted, no model was called and no code was executed.' };
    await cmd(['SET', idemKey, JSON.stringify({ status: 'done', requestHash, at, response }), 'EX', 604800]);
    return send(res, 201, response);
  } catch {
    // Best effort: if nothing durable was created yet, release the reservation and approval so a retry can succeed.
    if (reserved && !goalCreated) {
      try { await command(env, fetchImpl, ['DEL', idemKey]); } catch { /* store down */ }
      if (approvalWritten) { try { await command(env, fetchImpl, ['DEL', ROOT + 'approvals:' + a.approval_id]); } catch { /* store down */ } }
    }
    return send(res, 503, { error: 'intake_store_unavailable' });
  }
}
module.exports = { INTAKE_APPROVERS, handleProjectIntake, canonicalJson, signIntake, validateIntake };
