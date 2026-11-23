'use strict';
// No real GitHub, Redis or provider calls. Exercises the authenticated execution boundary.
const assert = require('node:assert/strict');
const runner = require('../api/ops/_harness_execute');
const baseReq = {
  method: 'POST',
  headers: { origin: 'https://preview.example.test', host: 'preview.example.test' },
  body: { project: 'lavaall', task: 'Add a synthetic unit test', confirm: true },
};
const env = {
  OS_CODE_RUNS_ENABLED: 'true',
  OS_GITHUB_RUNNER_TOKEN: 'synthetic-github-token',
  KV_REST_API_URL: 'https://kv.example.test',
  KV_REST_API_TOKEN: 'synthetic-kv-token',
};
async function main() {
  let n = 0, dispatched = [];
  const fakeFetch = async (url, options) => {
    if (String(url).includes('kv.example.test')) {
      const cmd = JSON.parse(options.body);
      if (cmd[0] === 'INCR') return { ok: true, json: async () => ({ result: ++n }) };
      if (cmd[0] === 'EXPIRE') return { ok: true, json: async () => ({ result: 1 }) };
    }
    if (String(url).includes('/dispatches')) {
      dispatched.push({ url, body: JSON.parse(options.body), headers: options.headers });
      return { status: 204, ok: true };
    }
    if (String(url).includes('/runs?')) {
      return { ok: true, json: async () => ({ workflow_runs: [
        { display_title: 'LAVAALL OS coding: ' + dispatched[0].body.inputs.request_id,
          status: 'completed', conclusion: 'success', id: 55,
          html_url: 'https://github.com/osman-jalloh-lab/Lavaal-/actions/runs/55' },
      ] }) };
    }
    throw new Error('unexpected network');
  };
  assert.equal(runner.originOK(baseReq), true);
  assert.equal(runner.originOK({ ...baseReq, headers: { host: 'preview.example.test', origin: 'https://evil.example' } }), false);
  assert.equal(runner.ready({ ...env, OS_CODE_RUNS_ENABLED: 'false' }), false);
  assert.equal((await runner.dispatch({ ...baseReq, method: 'GET' }, env, fakeFetch)).status, 405);
  assert.equal((await runner.dispatch({ ...baseReq, headers: { ...baseReq.headers, origin: 'https://other.example' } }, env, fakeFetch)).status, 403);
  assert.equal((await runner.dispatch({ ...baseReq, body: { ...baseReq.body, confirm: false } }, env, fakeFetch)).status, 400);
  assert.equal((await runner.dispatch({ ...baseReq, body: { ...baseReq.body, project: 'salonehire' } }, env, fakeFetch)).status, 400);
  assert.equal((await runner.dispatch({ ...baseReq, body: { ...baseReq.body, task: 'x'.repeat(2001) } }, env, fakeFetch)).status, 400);
  assert.equal((await runner.dispatch(baseReq, { ...env, OS_CODE_RUNS_ENABLED: 'false' }, fakeFetch)).status, 503);
  const first = await runner.dispatch(baseReq, env, fakeFetch);
  assert.equal(first.status, 202);
  assert.match(first.body.requestId, /^os-[a-f0-9-]{36}$/);
  assert.equal(dispatched[0].body.ref, 'main');
  assert.equal(dispatched[0].body.inputs.task, 'Add a synthetic unit test');
  assert.equal(dispatched[0].headers.Authorization, 'Bearer ' + env.OS_GITHUB_RUNNER_TOKEN);
  assert.equal((await runner.dispatch(baseReq, env, fakeFetch)).status, 202);
  assert.equal((await runner.dispatch(baseReq, env, fakeFetch)).status, 429);
  assert.equal(dispatched.length, 2);
  const status = await runner.status({ method: 'GET', query: { request_id: first.body.requestId } }, env, fakeFetch);
  assert.equal(status.status, 200);
  assert.equal(status.body.conclusion, 'success');
  assert.equal((await runner.status({ method: 'GET', query: { request_id: 'unsafe' } }, env, fakeFetch)).status, 400);
  assert.equal((await runner.dispatch(baseReq, { ...env, KV_REST_API_TOKEN: '' }, fakeFetch)).status, 503);
  console.log('OS code runner boundary tests passed');
}
main().catch(err => { console.error(err); process.exit(1); });
