'use strict';
// LAVAALL OS project intake (PR #105). Isolated fake KV; no network; synthetic data only.
const assert = require('node:assert/strict');
const lib = require('../api/ops/_lib');
process.env.OPS_AUTH_SECRET = 'test-ops-auth-secret-32chars!!';
const { handleProjectIntake, intakeRequestHash, INTAKE_APPROVERS, stubId } = require('../api/ops/_os_intake');
const approvals = require('../api/ops/_approvals');
const { handleIngest } = require('../api/ops/_os_ingest');
const { handleHarnessChat } = require('../api/ops/_harness_chat');
const goals = require('../api/ops/_harness_goals');
const { ALLOWLIST } = lib;
const token = 'synthetic-intake-token-1234567890-123456';
const bridge = 'synthetic-bridge-token-1234567890';
const env = { VERCEL_ENV: 'preview', OS_INTAKE_TOKEN: token, OPS_CEO_BRIDGE_SECRET: bridge, KV_REST_API_URL: 'https://kv.invalid', KV_REST_API_TOKEN: 'synthetic-kv-token' };
const now = Date.parse('2026-11-22T12:00:00Z');
const root = goals.PREVIEW_ROOT; // S4: non-production writes use the preview root
const kv = new Map(), urls = [];
async function fetchImpl(url, opts) {
  urls.push(url); assert.equal(url, env.KV_REST_API_URL);
  const [op, key, a, b, ...rest] = JSON.parse(opts.body);
  let result;
  switch (op) {
    case 'GET': result = kv.get(key) ?? null; break;
    case 'SET': if ([b, ...rest].includes('NX') && kv.has(key)) result = null; else if ([b, ...rest].includes('XX') && !kv.has(key)) result = null; else { kv.set(key, a); result = 'OK'; } break;
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
function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; return this; }, status(n) { this.statusCode = n; return this; }, send(s) { this.body = JSON.parse(s); return this; } }; }
let serial = 0;
function payload(name) {
  const n = ++serial;
  return { schema_version: 2, idempotency_key: 'synthetic-idempotency-' + String(n).padStart(4, '0'), source: 'business_assistant', approval_id: 'appr-00000000-0000-4000-8000-000000000000',
    project: { name: name || 'Intake Smoke Test ' + n, description: 'A synthetic project', business_objective: 'Improve operations', required_functionality: ['Provide a dashboard'], acceptance_criteria: ['Dashboard works'], proposed_next_task: 'Create a dashboard' } };
}
const osman = { email: INTAKE_APPROVERS[0] };
async function approve(p, e = env, at = now) {
  const m = await approvals.mintApproval(e, fetchImpl, osman, { action: 'intake_create', requestHash: intakeRequestHash(p) }, at);
  assert.equal(m.status, 201); p.approval_id = m.body.approval_id; return p;
}
async function send(body, options = {}) {
  const res = response();
  const req = { method: options.method || 'POST', headers: { authorization: 'Bearer ' + (options.bearer || token), ...(options.headers || {}) }, body };
  await handleProjectIntake(req, res, { env: options.env || env, fetchImpl: options.fetchImpl || fetchImpl, now: options.now || now });
  assert.equal(res.headers['Cache-Control'], 'no-store'); return res;
}
async function expect(body, status, error, opts) { const r = await send(body, opts); assert.equal(r.statusCode, status, JSON.stringify(r.body)); if (error) assert.equal(r.body.error, error); return r; }
const itemKeys = () => [...kv.keys()].filter(k => k.startsWith(root + 'item:'));
(async () => {
  // S1 environment gate.
  await expect({}, 404, 'not_found', { env: { ...env, VERCEL_ENV: 'production' } });
  await expect({}, 404, 'not_found', { env: { ...env, VERCEL_ENV: 'development' } });
  { const e = { ...env }; delete e.VERCEL_ENV; await expect({}, 404, 'not_found', { env: e }); }
  await expect({}, 401, 'unauthorized', { env: { ...env, VERCEL_ENV: 'production', OS_INTAKE_PRODUCTION_ENABLED: '1' }, bearer: 'wrong' });
  await expect({}, 404, 'not_found', { env: { ...env, VERCEL_ENV: 'production', OS_INTAKE_PRODUCTION_ENABLED: 'true' } });
  // Token scope.
  await expect({}, 401, 'unauthorized', { env: { VERCEL_ENV: 'preview' } });
  await expect({}, 401, 'unauthorized', { env: { ...env, OS_INTAKE_TOKEN: 'short' } });
  await expect({}, 401, 'unauthorized', { env: { ...env, OS_INTAKE_TOKEN: bridge } });
  await expect({}, 401, 'unauthorized', { bearer: 'wrong' });
  await expect({}, 401, 'unauthorized', { bearer: bridge });
  let res = response(); await handleIngest({ method: 'POST', url: '/api/os/ingest/morning-brief', headers: { authorization: 'Bearer ' + token }, body: {} }, res, { env, fetchImpl, now }); assert.equal(res.statusCode, 401);
  res = response(); await handleHarnessChat({ method: 'GET', url: '/ops/harness/goals', headers: { authorization: 'Bearer ' + token }, query: { project: 'lavaall' } }, res, { env, fetchImpl }); assert([401, 403].includes(res.statusCode));
  // S2: the intake token cannot mint an approval (the mint route needs Osman's session cookie).
  res = response(); await handleHarnessChat({ method: 'POST', url: '/ops/harness/approvals', headers: { authorization: 'Bearer ' + token, host: 'lavaal-preview.example', origin: 'https://lavaal-preview.example' }, query: {}, body: { action: 'intake_create', payload: payload() } }, res, { env, fetchImpl }); assert([401, 403].includes(res.statusCode));
  assert(![...kv.keys()].some(k => k.includes('approvals:')));
  // Basic request validation.
  await expect({}, 405, 'method_not_allowed', { method: 'GET' });
  await expect('x'.repeat(16385), 413, 'payload_too_large');
  await expect('{', 400, 'invalid_json');
  let p = payload(); delete p.idempotency_key; await expect(p, 400, 'idempotency_key_required');
  p = await approve(payload()); await expect(p, 400, 'idempotency_key_mismatch', { headers: { 'idempotency-key': 'different-idempotency-key' } });
  // Bare boolean and old-style self-signed approval objects are rejected.
  p = payload(); p.founder_approved = true; await expect(p, 400, 'unverified_approval_field');
  p = payload(); delete p.approval_id; await expect(p, 400, 'approval_required');
  p = payload(); delete p.approval_id; p.approval = { approval_id: 'approval-00000001', approver_email: INTAKE_APPROVERS[0], approved_at: new Date(now).toISOString(), action: 'intake_create', signature: '0'.repeat(64) }; await expect(p, 400, 'unknown_field');
  // S2: an approval id that no founder session minted is refused (token holder cannot invent one).
  p = payload(); p.approval_id = 'appr-00000000-0000-4000-8000-000000000000'; await expect(p, 403, 'approval_not_found');
  // A record planted without founder_session provenance or with a non-approver is refused.
  p = payload(); p.approval_id = 'appr-11111111-1111-4111-8111-111111111111';
  kv.set(root + 'approvals:' + p.approval_id, JSON.stringify({ id: p.approval_id, action: 'intake_create', requestHash: intakeRequestHash(p), approver: INTAKE_APPROVERS[0], createdVia: 'token', expiresAt: new Date(now + 60000).toISOString() }));
  await expect(p, 403, 'approval_not_found');
  // Only the dedicated approver list can mint, not other sign-in allowlisted founders.
  assert.deepEqual(INTAKE_APPROVERS, ['osmanjalloh104@gmail.com']);
  for (const other of ALLOWLIST.filter(e => !INTAKE_APPROVERS.includes(e))) assert.equal((await approvals.mintApproval(env, fetchImpl, { email: other }, { action: 'intake_create', requestHash: 'a'.repeat(64) }, now)).status, 403);
  assert(ALLOWLIST.includes('abdulhbah55@gmail.com'), 'founder sign-in allowlist must stay unchanged');
  assert.equal((await approvals.mintApproval(env, fetchImpl, osman, { action: 'deploy', requestHash: 'a'.repeat(64) }, now)).status, 400);
  // Approval bound to a different payload, or expired, is refused.
  p = await approve(payload()); p.project.description = 'Changed after approval'; await expect(p, 403, 'approval_mismatch');
  p = await approve(payload(), env, now - approvals.TTL_MS - 1000); await expect(p, 403, 'approval_expired');
  // S5: unknown fields rejected and never echoed.
  p = payload(); p.extra = true; let r = await expect(p, 400, 'unknown_field'); assert(!JSON.stringify(r.body).includes('extra'));
  p = payload(); p.project.client_email = 'x'; r = await expect(p, 400, 'unknown_field'); assert(!JSON.stringify(r.body).includes('client_email'));
  p = payload(); p.project.extra_detail = 'discard me'; await expect(p, 400, 'unknown_field');
  p = payload(); p.project.description = 'Write to person@example.invalid'; await expect(p, 400, 'pii_detected');
  p = payload(); p.project.description = 'Call +1 (555) 123-4567'; await expect(p, 400, 'pii_detected');
  p = payload(); p.project.description = 'x'.repeat(1201); await expect(p, 400, 'invalid_field');
  p = payload(); p.project.requirements = Array(21).fill('item'); await expect(p, 400, 'invalid_field');
  p = payload(); p.project.existing_os_project = 'not-a-catalog-project'; await expect(p, 400, 'invalid_existing_os_project');
  p = await approve(payload()); await expect(p, 503, 'intake_store_not_configured', { env: { ...env, KV_REST_API_URL: '' } });
  // Preview URLs use a trusted forwarded host; untrusted hosts fall back.
  const previewPayload = await approve(payload());
  const preview = await expect(previewPayload, 201, undefined, { headers: { 'x-forwarded-host': 'lavaal-git-feature-os-engineering-cleanup-osman14.vercel.app', 'x-forwarded-proto': 'https' } });
  assert.match(preview.body.url, /^https:\/\/lavaal-git-feature-os-engineering-cleanup-osman14\.vercel\.app\/os\//);
  const previewReplay = await expect(previewPayload, 200);
  assert.equal(previewReplay.body.url, preview.body.url);
  const evilPayload = await approve(payload());
  const evil = await expect(evilPayload, 201, undefined, { headers: { host: 'evil.example' } });
  assert.match(evil.body.url, /^https:\/\/www\.lavaall\.com\/os\//);
  // Happy path, explicit catalog attach.
  p = payload(); p.project.existing_os_project = 'lavaall'; await approve(p);
  const created = await expect(p, 201); assert.equal(created.body.project_id, 'lavaall'); assert.equal(created.body.project_status, 'catalog'); assert.match(created.body.goal_id, /^goal-/); assert.match(created.body.url, /^https:\/\/www\.lavaall\.com\/os\//); assert.equal(created.body.stripped_fields, undefined);
  const goal = JSON.parse(kv.get(root + 'item:' + created.body.goal_id)); assert.equal(goal.source, 'business_intake'); assert.equal(goal.repository, 'osman-jalloh-lab/Lavaal-'); assert.equal(goal.approvalId, p.approval_id);
  assert(kv.has(root + 'approvals-used:' + p.approval_id)); const intake = JSON.parse(kv.get(root + 'intake:' + created.body.intake_id)); assert.equal(intake.approver, INTAKE_APPROVERS[0]); assert.equal(JSON.parse(kv.get(root + 'tasks:' + goal.id)[0]).state, 'proposed'); assert(kv.get(root + 'project:lavaall').includes(goal.id));
  const count = itemKeys().length;
  const replay = await expect(p, 200); assert.equal(replay.body.replayed, true); assert.equal(replay.body.goal_id, goal.id); assert.equal(itemKeys().length, count);
  const late = await expect(p, 200, undefined, { now: now + 60 * 60 * 1000 }); assert.equal(late.body.replayed, true);
  const conflict = structuredClone(p); conflict.project.description = 'Another description'; await expect(conflict, 409, 'idempotency_conflict');
  // Reusing a consumed approval for a new request: the hash differs, so it is a mismatch; same hash with a new key is impossible (key is inside the hash).
  const reused = payload(); reused.approval_id = p.approval_id; await expect(reused, 403, 'approval_mismatch');
  { // Same approval consumed twice (marker set) -> 409.
    const q = await approve(payload()); kv.set(root + 'approvals-used:' + q.approval_id, '{}'); await expect(q, 409, 'approval_reused'); }
  // S3: a name matching a catalog project without existing_os_project becomes a pending stub, not the real project.
  for (const name of ['LAVAALL', 'lavaall', 'SaloneHire']) {
    const q = await approve(payload(name)); const s3 = await expect(q, 201);
    assert.equal(s3.body.project_status, 'pending_stub'); assert.equal(s3.body.project_id, stubId(name)); assert.match(s3.body.project_id, /^stub-/);
    assert.equal(JSON.parse(kv.get(root + 'item:' + s3.body.goal_id)).repository, null);
  }
  assert(!kv.get(root + 'project:lavaall').some(id => JSON.parse(kv.get(root + 'item:' + id)).intake && JSON.parse(kv.get(root + 'item:' + id)).intake.name === 'LAVAALL'));
  // Unknown project -> pending stub with claimed repo only.
  p = payload('New Synthetic Project'); p.project.existing_repository = 'example/synthetic'; await approve(p); const stub = await expect(p, 201);
  assert.equal(stub.body.project_status, 'pending_stub'); assert.equal(stub.body.project_id, 'stub-new-synthetic-project');
  const stubRecord = JSON.parse(kv.get(root + 'catalog:stub-new-synthetic-project')); assert.equal(stubRecord.claimedRepository, 'example/synthetic'); assert.equal(stubRecord.status, 'pending');
  const second = await approve(payload('New Synthetic Project')); await expect(second, 201); assert.deepEqual(JSON.parse(kv.get(root + 'catalog:stub-new-synthetic-project')), stubRecord);
  const list = await goals.handle({ method: 'GET', headers: {}, query: { project: 'stub-new-synthetic-project' } }, env, fetchImpl); assert.equal(list.status, 200); assert.equal(list.body.goals.length, 2);
  assert(urls.every(url => url === env.KV_REST_API_URL));
  kv.set(root + 'intake-rate:2026-11-22', 30); await expect(await approve(payload()), 429, 'rate_limited');
  await expect(await approve(payload()), 503, 'intake_store_unavailable', { fetchImpl: async () => ({ ok: false }) });
  // Store failure before the goal exists releases the reservation and approval, so a retry succeeds.
  kv.delete(root + 'intake-rate:2026-11-22');
  const flaky = await approve(payload());
  const failingGoalWrite = async (url, opts) => { const args = JSON.parse(opts.body); if (args[0] === 'SET' && String(args[1]).startsWith(root + 'item:')) return { ok: false }; return fetchImpl(url, opts); };
  await expect(flaky, 503, 'intake_store_unavailable', { fetchImpl: failingGoalWrite });
  assert(!kv.has(root + 'approvals-used:' + flaky.approval_id));
  assert.equal((await expect(flaky, 201)).body.project_status, 'pending_stub');
  // Founder-session mint route: Osman's cookie works; same-origin required; returns a hash-bound approval.
  const cookie = lib.SESSION_COOKIE + '=' + encodeURIComponent(lib.createSessionToken(INTAKE_APPROVERS[0]));
  const routeHeaders = { cookie, host: 'lavaal-preview.example', origin: 'https://lavaal-preview.example', accept: 'application/json', 'content-type': 'application/json' };
  const routePayload = payload('Route Minted Project'); delete routePayload.approval_id;
  res = response(); await handleHarnessChat({ method: 'POST', url: '/ops/harness/approvals', headers: routeHeaders, query: {}, body: { action: 'intake_create', payload: routePayload } }, res, { env, fetchImpl });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body)); assert.equal(res.body.request_hash, intakeRequestHash(routePayload));
  routePayload.approval_id = res.body.approval_id; assert.equal((await expect(routePayload, 201)).body.project_id, 'stub-route-minted-project');
  res = response(); await handleHarnessChat({ method: 'POST', url: '/ops/harness/approvals', headers: { ...routeHeaders, origin: 'https://evil.example' }, query: {}, body: { action: 'intake_create', payload: (() => { const x = payload(); delete x.approval_id; return x; })() } }, res, { env, fetchImpl }); assert.equal(res.statusCode, 403);
  const hameedCookie = lib.SESSION_COOKIE + '=' + encodeURIComponent(lib.createSessionToken('abdulhbah55@gmail.com'));
  res = response(); await handleHarnessChat({ method: 'POST', url: '/ops/harness/approvals', headers: { ...routeHeaders, cookie: hameedCookie }, query: {}, body: { action: 'intake_create', payload: (() => { const x = payload(); delete x.approval_id; return x; })() } }, res, { env, fetchImpl }); assert.equal(res.statusCode, 403); assert.equal(res.body.error, 'approver_not_allowed');
  res = response(); const bad = payload(); delete bad.approval_id; bad.project.extra = 1; await handleHarnessChat({ method: 'POST', url: '/ops/harness/approvals', headers: routeHeaders, query: {}, body: { action: 'intake_create', payload: bad } }, res, { env, fetchImpl }); assert.equal(res.statusCode, 400);
  // The deployed dynamic function routes only the project-intake feed to this handler.
  const feedHandler = require('../api/os/ingest/[feed].js');
  const saved = { VERCEL_ENV: process.env.VERCEL_ENV, OS_INTAKE_TOKEN: process.env.OS_INTAKE_TOKEN, OPS_CEO_BRIDGE_SECRET: process.env.OPS_CEO_BRIDGE_SECRET };
  process.env.OS_INTAKE_TOKEN = token; process.env.OPS_CEO_BRIDGE_SECRET = bridge; process.env.VERCEL_ENV = 'preview';
  try {
    res = response(); await feedHandler({ method: 'POST', url: '/api/os/ingest/project-intake', query: { feed: 'project-intake' }, headers: { authorization: 'Bearer ' + token }, body: '{' }, res); assert.equal(res.statusCode, 400); assert.equal(res.body.error, 'invalid_json');
    res = response(); await feedHandler({ method: 'POST', url: '/api/os/ingest/project-intake', query: { feed: 'project-intake' }, headers: { authorization: 'Bearer ' + bridge }, body: '{' }, res); assert.equal(res.statusCode, 401);
    res = response(); await feedHandler({ method: 'POST', url: '/api/os/ingest/morning-brief', query: { feed: 'morning-brief' }, headers: { authorization: 'Bearer ' + token }, body: '{}' }, res); assert.equal(res.statusCode, 401);
  } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  // S4: prefix scheme. One helper; production names byte-identical to #103; preview never overlaps.
  assert.equal(goals.PRODUCTION_ROOT, 'lavaall:goals:v1:'); assert.equal(goals.PREVIEW_ROOT, 'lavaall:preview:goals:v1:');
  assert.equal(goals.rootFor({ VERCEL_ENV: 'production' }), 'lavaall:goals:v1:');
  for (const v of ['preview', 'development', '', undefined]) assert.equal(goals.rootFor({ VERCEL_ENV: v }), 'lavaall:preview:goals:v1:');
  assert(!goals.PREVIEW_ROOT.startsWith(goals.PRODUCTION_ROOT));
  assert(itemKeys().length > 0); assert(![...kv.keys()].some(k => k.startsWith(goals.PRODUCTION_ROOT)), 'preview wrote a production key');
  const prodEnv = { ...env, VERCEL_ENV: 'production' };
  const prodStubList = await goals.handle({ method: 'GET', headers: {}, query: { project: 'stub-new-synthetic-project' } }, prodEnv, fetchImpl); assert.equal(prodStubList.status, 400);
  const prodLavaall = await goals.handle({ method: 'GET', headers: {}, query: { project: 'lavaall' } }, prodEnv, fetchImpl); assert.equal(prodLavaall.body.goals.length, 0);
  assert.equal((await goals.handle({ method: 'GET', headers: {}, query: { id: goal.id } }, prodEnv, fetchImpl)).status, 404);
  // A preview-minted approval cannot be used in production (different root).
  const crossEnv = payload(); crossEnv.project.existing_os_project = 'lavaall'; await approve(crossEnv);
  await expect(crossEnv, 403, 'approval_not_found', { env: { ...prodEnv, OS_INTAKE_PRODUCTION_ENABLED: '1' } });
  // Production intake (explicit flag) writes #103's unprefixed names unchanged.
  const prodP = payload(); prodP.project.existing_os_project = 'lavaall'; await approve(prodP, prodEnv);
  const prodRes = await expect(prodP, 201, undefined, { env: { ...prodEnv, OS_INTAKE_PRODUCTION_ENABLED: '1' } });
  assert(kv.has('lavaall:goals:v1:item:' + prodRes.body.goal_id)); assert(kv.has('lavaall:goals:v1:approvals:' + prodP.approval_id)); assert(kv.has('lavaall:goals:v1:intake:' + prodRes.body.intake_id));
  assert(kv.get('lavaall:goals:v1:project:lavaall').includes(prodRes.body.goal_id)); assert(!kv.has(root + 'item:' + prodRes.body.goal_id));
  const previewLavaall = await goals.handle({ method: 'GET', headers: {}, query: { project: 'lavaall' } }, env, fetchImpl); assert(!previewLavaall.body.goals.some(g => g.id === prodRes.body.goal_id));
  assert.equal(await goals.knownProject(env, fetchImpl, '../catalog'), false);
  console.log('test-os-intake: PASS (isolated fake KV)');
})().catch(err => { console.error(err); process.exitCode = 1; });
