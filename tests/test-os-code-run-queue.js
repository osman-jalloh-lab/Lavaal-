'use strict';
const assert = require('node:assert/strict');
const goals = require('../api/ops/_harness_goals');
const approvals = require('../api/ops/_approvals');
const jobs = require('../api/ops/_harness_jobs');
const { handleHarnessChat } = require('../api/ops/_harness_chat');
const env = { KV_REST_API_URL:'https://kv.invalid', KV_REST_API_TOKEN:'fake-token' };
const kv = new Map();
async function fetchImpl(_url, opts) {
  const [cmd, key, a, b] = JSON.parse(opts.body); let result;
  if (cmd === 'GET') result = kv.get(key) || null;
  else if (cmd === 'SET') { result = b === 'NX' && kv.has(key) ? null : 'OK'; if (result) kv.set(key, a); }
  else if (cmd === 'LPUSH') { const list = kv.get(key) || []; list.unshift(a); kv.set(key, list); result = list.length; }
  else if (cmd === 'LRANGE') result = (kv.get(key) || []).slice(a, b + 1);
  else if (cmd === 'DEL') { kv.delete(key); result = 1; }
  else throw Error('Unexpected command');
  return { ok:true, json:async()=>({result}) };
}
const headers = { host:'test.example', origin:'https://test.example' };
const post = body => jobs.handle({method:'POST',headers,body},env,fetchImpl);
(async () => {
  const goal = await goals.createGoal(env,fetchImpl,{project:'lavaall',objective:'Synthetic task'});
  const payload = { goalId:goal.id,project:'lavaall',repo:goal.repository,branch:'feature/os-run-test',objective:goal.objective };
  const mint = async (p=payload, action='code_run', now=Date.now()) => (await approvals.mintApproval(env,fetchImpl,{email:approvals.APPROVERS[0]},{action,requestHash:jobs.requestHash(p)},now)).body.approval_id;
  assert.equal((await post({...payload,approvalId:'missing'})).status,403);
  assert.equal((await post({...payload,repo:'evil/repo',approvalId:'missing'})).body.error,'repo_not_allowed');
  assert.equal((await post({...payload,branch:'main',approvalId:'missing'})).body.error,'invalid_branch');
  assert.equal((await post({...payload,extra:1})).body.error,'invalid_payload');
  const expired = await mint(payload,'code_run',Date.now()-approvals.TTL_MS-1000);
  assert.equal((await post({...payload,approvalId:expired})).body.error,'approval_expired');
  const wrong = await mint(payload,'intake_create');
  assert.equal((await post({...payload,approvalId:wrong})).body.error,'approval_mismatch');
  const id = await mint();
  assert.equal((await post({...payload,objective:'changed',approvalId:id})).body.error,'approval_mismatch');
  const created = await post({...payload,approvalId:id}); assert.equal(created.status,201);
  assert.equal((await post({...payload,approvalId:id})).body.error,'approval_reused');
  const job = created.body.job; assert.equal(job.state,'queued');
  assert.equal(JSON.parse(kv.get(goals.rootFor(env)+'approvals-used:'+id)).consumer,'code_run:'+job.id);
  const list = await jobs.handle({method:'GET',query:{goalId:goal.id,project:'lavaall'}},env,fetchImpl);
  assert.equal(list.body.jobs[0].id,job.id);
  assert([...kv.keys()].every(k=>k.startsWith(goals.PREVIEW_ROOT)));
  assert.equal(goals.rootFor({VERCEL_ENV:'production'}),goals.PRODUCTION_ROOT);
  assert.equal((await jobs.handle({method:'DELETE'},env,fetchImpl)).status,405);
  const response = { status(code){this.statusCode=code;return this;}, send(body){this.body=JSON.parse(body);return this;}, setHeader(){return this;} };
  await handleHarnessChat({method:'GET',url:'/ops/harness/jobs',headers:{},query:{}},response,{env,fetchImpl});
  assert([401,403].includes(response.statusCode));
  console.log('test-os-code-run-queue: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
