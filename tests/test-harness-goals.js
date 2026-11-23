// No network, no real secrets: validate durable /goal records and ownership checks.
'use strict';
const assert = require('node:assert/strict');
const goal = require('../api/ops/_harness_goals');
const kv = new Map();
const calls = [];
const env = { KV_REST_API_URL: 'https://kv.invalid', KV_REST_API_TOKEN: 'fake-kv-test-token' };
async function fetchImpl(url, opts) {
  assert.equal(url, env.KV_REST_API_URL);
  assert.equal(opts.headers.Authorization, 'Bearer ' + env.KV_REST_API_TOKEN);
  const [cmd, key, a, b] = JSON.parse(opts.body);
  calls.push(cmd);
  let value;
  switch (cmd) {
    case 'GET': value = kv.get(key) || null; break;
    case 'SET':
      if (b === 'NX' && kv.has(key)) value = null;
      else { kv.set(key, a); value = 'OK'; }
      break;
    case 'LPUSH': {
      const v = kv.get(key) || [];
      v.unshift(a); kv.set(key, v); value = v.length; break;
    }
    case 'RPUSH': {
      const v = kv.get(key) || [];
      v.push(a); kv.set(key, v); value = v.length; break;
    }
    case 'LRANGE': {
      const v = kv.get(key) || [];
      value = v.slice(a, Number(b) + 1); break;
    }
    default: throw Error('unknown mocked command ' + cmd);
  }
  return { ok: true, json: async () => ({ result: value }) };
}
const headers = { host: 'lavaal-preview.example', origin: 'https://lavaal-preview.example' };
const send = (method, body, query, h) => goal.handle({ method, body, query, headers: h || headers }, env, fetchImpl);
(async () => {
  assert.equal(goal.allowedOrigin({headers}), true);
  assert.equal(goal.allowedOrigin({headers:{...headers,origin:'https://evil.example'}}), false);
  assert.equal((await send('POST', {action:'create',project:'lavaall',objective:'test'}, null,
    {host:headers.host,origin:'https://evil.example'})).status, 403);
  assert.equal((await send('POST', {action:'create',project:'bad',objective:'test'})).status, 400);
  const created = await send('POST', {action:'create',project:'salonehire',
    objective:'Build a consent-safe screening view'});
  assert.equal(created.status, 201);
  assert.equal(created.body.goal.repository, 'osman-jalloh-lab/saloneworks');
  assert.equal(created.body.goal.execution, 'not_started');
  const id = created.body.goal.id;
  assert.match(id, goal.ID_RE);
  const listed = await send('GET', null, {project:'salonehire'});
  assert.equal(listed.status, 200);
  assert.equal(listed.body.goals[0].id, id);
  const checkpoint = await send('POST', {action:'checkpoint',id,
    state:'blocked',provider:'grok',note:'Needs founder review',
    evidenceUrl:'https://github.com/osman-jalloh-lab/saloneworks/pull/42'});
  assert.equal(checkpoint.status, 201);
  assert.equal(checkpoint.body.checkpoint.verification, 'unverified');
  assert.equal((await send('POST',{action:'checkpoint',id,note:'no external links',
    evidenceUrl:'https://untrusted.example/path'})).status, 400);
  const retrieved = await send('GET', null, {id});
  assert.equal(retrieved.status, 200);
  assert.equal(retrieved.body.goal.project, 'salonehire');
  assert.equal(retrieved.body.checkpoints.length, 1);
  assert.equal(retrieved.body.latest.state, 'blocked');
  assert.equal((await send('GET', null, {id:'goal-invalid'})).status, 404);
  assert.equal((await goal.handle({method:'POST',body:{action:'create',project:'lavaall',objective:'foo'},headers}, {},fetchImpl)).status,503);
  assert(calls.includes('LPUSH') && calls.includes('RPUSH'));
  console.log('test-harness-goals: PASS (isolated fake KV)');
})().catch(e => { console.error(e); process.exitCode=1; });
