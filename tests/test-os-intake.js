'use strict';
const assert = require('node:assert/strict');
const { handleProjectIntake, signIntake } = require('../api/ops/_os_intake');
const { handleIngest } = require('../api/ops/_os_ingest');
const { handleHarnessChat } = require('../api/ops/_harness_chat');
const goals = require('../api/ops/_harness_goals');
const { ALLOWLIST } = require('../api/ops/_lib');
const token = 'synthetic-intake-token-1234567890-123456';
const bridge = 'synthetic-bridge-token-1234567890';
const env = { OS_INTAKE_TOKEN: token, OPS_CEO_BRIDGE_SECRET: bridge, KV_REST_API_URL: 'https://kv.invalid', KV_REST_API_TOKEN: 'synthetic-kv-token' };
const now = Date.parse('2026-11-22T12:00:00Z');
const root = 'lavaall:goals:v1:';
const kv = new Map(), urls = [];
async function fetchImpl(url, opts) {
  urls.push(url); assert.equal(url, env.KV_REST_API_URL);
  const [op, key, a, b, ...rest] = JSON.parse(opts.body);
  let result;
  switch (op) {
    case 'GET': result = kv.get(key) ?? null; break;
    case 'SET': if ([b, ...rest].includes('NX') && kv.has(key)) result = null; else { kv.set(key, a); result = 'OK'; } break;
    case 'DEL': result = kv.delete(key) ? 1 : 0; break;
    case 'INCR': result = Number(kv.get(key) || 0) + 1; kv.set(key, result); break;
    case 'EXPIRE': result = 1; break;
    case 'LPUSH': { const list = kv.get(key) || []; list.unshift(a); kv.set(key, list); result = list.length; break; }
    case 'RPUSH': { const list = kv.get(key) || []; list.push(a); kv.set(key, list); result = list.length; break; }
    case 'LRANGE': result = (kv.get(key) || []).slice(a, Number(b) + 1); break;
    default: throw Error('unexpected fake KV command ' + op);
  }
  return { ok: true, json: async () => ({ result }) };
}
function response() { return { headers: {}, setHeader(k,v) { this.headers[k] = v; return this; }, status(n) { this.statusCode = n; return this; }, send(s) { this.body = JSON.parse(s); return this; } }; }
let serial = 0;
function payload() {
  const n = ++serial;
  return { schema_version: 1, idempotency_key: 'synthetic-idempotency-' + n, source: 'business_assistant', approval: { approval_id: 'approval-' + String(n).padStart(8,'0'), approver_email: ALLOWLIST[0], approved_at: new Date(now).toISOString(), action: 'intake_create', signature: '' }, project: { name: 'Sample Project', description: 'A synthetic project', business_objective: 'Improve operations', required_functionality: ['Provide a dashboard'], acceptance_criteria: ['Dashboard works'], proposed_next_task: 'Create a dashboard' } };
}
function signed(p) { p.approval.signature = signIntake(token, p); return p; }
async function send(body, options = {}) {
  const res = response();
  const req = { method: options.method || 'POST', headers: { authorization: 'Bearer ' + (options.bearer || token), ...(options.headers || {}) }, body };
  await handleProjectIntake(req, res, { env: options.env || env, fetchImpl: options.fetchImpl || fetchImpl, now });
  assert.equal(res.headers['Cache-Control'], 'no-store'); return res;
}
async function expect(body, status, error, opts) { const r = await send(body, opts); assert.equal(r.statusCode, status); if (error) assert.equal(r.body.error, error); return r; }
(async () => {
  await expect({},401,'unauthorized',{env:{}});
  await expect({},401,'unauthorized',{env:{...env,OS_INTAKE_TOKEN:'short'}});
  await expect({},401,'unauthorized',{env:{...env,OS_INTAKE_TOKEN:bridge}});
  await expect({},401,'unauthorized',{bearer:'wrong'});
  await expect({},401,'unauthorized',{bearer:bridge});
  let res = response(); await handleIngest({method:'POST',url:'/api/os/ingest/morning-brief',headers:{authorization:'Bearer '+token},body:{}},res,{env,fetchImpl,now}); assert.equal(res.statusCode,401);
  res = response(); await handleHarnessChat({method:'GET',url:'/ops/harness/goals',headers:{authorization:'Bearer '+token},query:{project:'lavaall'}},res,{env,fetchImpl}); assert([401,403].includes(res.statusCode));
  await expect({},405,'method_not_allowed',{method:'GET'});
  await expect('x'.repeat(16385),413,'payload_too_large');
  await expect('{',400,'invalid_json');
  let p = signed(payload()); delete p.idempotency_key; await expect(p,400,'idempotency_key_required');
  p = signed(payload()); await expect(p,400,'idempotency_key_mismatch',{headers:{'idempotency-key':'different-idempotency-key'}});
  p = payload(); delete p.approval; p.founder_approved = true; await expect(p,400,'unverified_approval_field');
  p = payload(); delete p.approval; await expect(p,400,'approval_required');
  p = payload(); p.approval.approver_email = 'synthetic@example.invalid'; await expect(signed(p),403,'approver_not_allowed');
  p = payload(); p.approval.approved_at = new Date(now-900001).toISOString(); await expect(signed(p),403,'approval_expired');
  p = payload(); p.approval.approved_at = new Date(now+60001).toISOString(); await expect(signed(p),403,'approval_expired');
  p = payload(); p.approval.signature = '0'.repeat(64); await expect(p,403,'approval_signature_invalid');
  p = signed(payload()); p.project.description = 'Changed after signing'; await expect(p,403,'approval_signature_invalid');
  p = signed(payload()); p.extra = true; await expect(p,400,'unknown_field');
  p = payload(); p.project.client_email = 'x'; await expect(signed(p),400,'forbidden_field');
  p = payload(); p.project.description = 'Write to person@example.invalid'; await expect(signed(p),400,'pii_detected');
  p = payload(); p.project.description = 'Call +1 (555) 123-4567'; await expect(signed(p),400,'pii_detected');
  p = payload(); p.project.description = 'x'.repeat(1201); await expect(signed(p),400,'invalid_field');
  p = payload(); p.project.requirements = Array(21).fill('item'); await expect(signed(p),400,'invalid_field');
  p = signed(payload()); await expect(p,503,'intake_store_not_configured',{env:{...env,KV_REST_API_URL:''}});
  p = payload(); p.project.existing_os_project = 'lavaall'; p.project.extra_detail = 'discard me'; signed(p);
  const created = await expect(p,201); assert.equal(created.body.project_id,'lavaall'); assert.equal(created.body.project_status,'catalog'); assert.match(created.body.goal_id,/^goal-/); assert.match(created.body.url,/^https:\/\/www\.lavaall\.com\/os\//); assert.deepEqual(created.body.stripped_fields,['project.extra_detail']);
  const goal = JSON.parse(kv.get(root+'item:'+created.body.goal_id)); assert.equal(goal.source,'business_intake'); assert.equal(goal.repository,'osman-jalloh-lab/Lavaal-'); assert.equal(goal.intake.extra_detail,undefined);
  assert(kv.has(root+'approvals:'+p.approval.approval_id)); const intake = JSON.parse(kv.get(root+'intake:'+created.body.intake_id)); assert.equal(intake.project.extra_detail,undefined); assert.equal(JSON.parse(kv.get(root+'tasks:'+goal.id)[0]).state,'proposed'); assert(kv.get(root+'project:lavaall').includes(goal.id));
  const count = [...kv.keys()].filter(k=>k.startsWith(root+'item:')).length;
  const replay = await expect(p,200); assert.equal(replay.body.replayed,true); assert.equal(replay.body.goal_id,goal.id); assert.equal([...kv.keys()].filter(k=>k.startsWith(root+'item:')).length,count);
  const conflict = structuredClone(p); conflict.project.description = 'Another description'; signed(conflict); await expect(conflict,409,'idempotency_conflict');
  const reused = payload(); reused.approval.approval_id = p.approval.approval_id; await expect(signed(reused),409,'approval_reused');
  p = payload(); p.project.name = 'New Synthetic Project'; p.project.existing_repository = 'example/synthetic'; signed(p); const stub = await expect(p,201); assert.equal(stub.body.project_status,'pending_stub'); const stubRecord = JSON.parse(kv.get(root+'catalog:new-synthetic-project')); assert.equal(stubRecord.claimedRepository,'example/synthetic'); assert.equal(stubRecord.status,'pending'); assert.equal(JSON.parse(kv.get(root+'item:'+stub.body.goal_id)).repository,null);
  const second = payload(); second.project.name = p.project.name; await expect(signed(second),201); assert.deepEqual(JSON.parse(kv.get(root+'catalog:new-synthetic-project')),stubRecord);
  const list = await goals.handle({method:'GET',headers:{},query:{project:'new-synthetic-project'}},env,fetchImpl); assert.equal(list.status,200); assert.equal(list.body.goals.length,2);
  assert(urls.every(url=>url===env.KV_REST_API_URL));
  kv.set(root+'intake-rate:2026-11-22',30); await expect(signed(payload()),429,'rate_limited');
  await expect(signed(payload()),503,'intake_store_unavailable',{fetchImpl:async()=>({ok:false})});
  // Store failure before the goal exists releases the reservation and approval, so a retry succeeds.
  kv.delete(root+'intake-rate:2026-11-22');
  const flaky = signed(payload()); flaky.project.existing_os_project = 'lavaall'; signed(flaky);
  const failingGoalWrite = async (url, opts) => { const args = JSON.parse(opts.body); if (args[0] === 'SET' && String(args[1]).startsWith(root+'item:')) return { ok: false }; return fetchImpl(url, opts); };
  await expect(flaky,503,'intake_store_unavailable',{fetchImpl:failingGoalWrite});
  assert(![...kv.keys()].some(k=>k.startsWith(root+'intake-idem:') && JSON.parse(kv.get(k)).requestHash && JSON.parse(kv.get(k)).status==='pending'));
  assert(!kv.has(root+'approvals:'+flaky.approval.approval_id));
  const retried = await expect(flaky,201); assert.equal(retried.body.project_id,'lavaall');
  // The deployed dynamic function routes only the project-intake feed to this handler.
  const feedHandler = require('../api/os/ingest/[feed].js');
  const saved = { OS_INTAKE_TOKEN: process.env.OS_INTAKE_TOKEN, OPS_CEO_BRIDGE_SECRET: process.env.OPS_CEO_BRIDGE_SECRET };
  process.env.OS_INTAKE_TOKEN = token; process.env.OPS_CEO_BRIDGE_SECRET = bridge;
  try {
    res = response(); await feedHandler({method:'POST',url:'/api/os/ingest/project-intake',query:{feed:'project-intake'},headers:{authorization:'Bearer '+token},body:'{'},res); assert.equal(res.statusCode,400); assert.equal(res.body.error,'invalid_json');
    res = response(); await feedHandler({method:'POST',url:'/api/os/ingest/project-intake',query:{feed:'project-intake'},headers:{authorization:'Bearer '+bridge},body:'{'},res); assert.equal(res.statusCode,401);
    res = response(); await feedHandler({method:'POST',url:'/api/os/ingest/morning-brief',query:{feed:'morning-brief'},headers:{authorization:'Bearer '+token},body:'{}'},res); assert.equal(res.statusCode,401);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  // Stub lookups only accept slug-shaped names.
  assert.equal(await goals.knownProject(env, fetchImpl, '../catalog'), false);
  console.log('test-os-intake: PASS (isolated fake KV)');
})().catch(err => { console.error(err); process.exitCode = 1; });
