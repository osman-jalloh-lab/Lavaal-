'use strict';
const assert = require('assert/strict');
const { memoryStore, kvStore } = require('../api/_chat/store');
const { createHandler } = require('../api/chat-inquiry');
const { REQUEST_LIMIT, WINDOW_MS } = require('../api/_chat/request-rate-limit');
async function main() {
  let now = Date.UTC(2026, 10, 17), writes = 0, reads = 0, deliveries = 0;
  const backing = memoryStore();
  const store = { get: async key => { reads++; return backing.get(key); }, transaction: fn => { writes++; return backing.transaction(fn); } };
  const options = { store, now: () => now, env: {}, runtime: 'test', CHAT_ENABLED: true,
    salt: 'TEST ONLY salt', deepseekApiKey: 'TEST ONLY credential', trustedOrigins: ['https://preview.test'],
    vendorSecret: 'TEST ONLY vendor '.repeat(4), transport: async () => { deliveries++; return {ok:true,json:async()=>({ok:true})}; } };
  const handler = createHandler(options);
  async function request(action, body = {}, headers = {}, method = 'POST', h = handler) {
    const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.code=code; return this; }, send(value) { this.body=JSON.parse(value); return this; } };
    await h({method,query:{action},body,headers:{'content-type':'application/json',origin:'https://preview.test','x-forwarded-for':'TEST ONLY ip, proxy',...headers}},res);
    return res;
  }
  for (const method of ['GET','POST']) {
    const r = await request('config', {}, {}, method);
    assert.equal(r.code,200); assert.equal(r.body.CHAT_ENABLED,true); assert.equal(r.headers['Cache-Control'],'no-store');
  }
  assert.equal((await request(undefined, {}, {}, 'GET')).code,405);
  assert.equal(writes,0); assert.equal(reads,2);
  await backing.transaction(records=>records.set('chat:kill',true));
  assert.equal((await request('config',{}, {},'GET')).body.CHAT_ENABLED,false); assert.equal(writes,0);
  await backing.transaction(records=>records.delete('chat:kill'));
  // Invalid actions count too, without consuming the existing session quota.
  for (let i=0;i<REQUEST_LIMIT;i++) assert.equal((await request('invalid')).code,400);
  let r = await request('invalid');
  assert.equal(r.code,429); assert.equal(r.body.error,'rate_limited'); assert.match(r.body.message,/wait/i); assert.equal(r.headers['Retry-After'],'60');
  assert.equal((await request('invalid',{}, {'x-forwarded-for':'TEST ONLY other'})).code,400);
  now += WINDOW_MS;
  assert.equal((await request('invalid')).code,400);
  const state = await backing.get('chat:request-rate');
  assert(Object.keys(state.counters).every(key=>/^[a-f0-9]{64}$/.test(key)));
  // Successful browser + vendor draft/review/confirm through the same limiter.
  r = await request('session'); assert.equal(r.code,200);
  const browser = r.body, cookie = r.headers['Set-Cookie'].split(';')[0];
  assert.match(r.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/); assert.match(r.headers['Set-Cookie'],/Secure/);
  r = await request('draft',{sessionId:browser.sessionId,fields:{name:'TEST ONLY User',phone:'+12025550100',subject:'TEST ONLY'},eventId:'test_event'},{authorization:'Bearer '+options.vendorSecret});
  assert.equal(r.code,200); const draftId=r.body.draftId;
  r = await request('review',{...browser,draftId},{cookie}); assert.equal(r.code,200);
  r = await request('confirm',{...browser,draftId,token:r.body.token,idempotencyKey:r.body.idempotencyKey,privacyConsent:true},{cookie});
  assert.equal(r.code,200); assert.equal(r.body.status,'accepted'); assert.equal(deliveries,1);
  const failed = createHandler({...options,store:{get:async()=>undefined,transaction:async()=>{throw Error('TEST ONLY unavailable');}}});
  r = await request('session',{}, {},'POST',failed); assert.equal(r.code,503); assert.equal(r.body.error,'store_unavailable');
  const failedRead = createHandler({...options,store:{get:async()=>{throw Error('TEST ONLY unavailable');},transaction:async()=>{throw Error('unexpected write');}}});
  r = await request('config',{}, {},'GET',failedRead); assert.equal(r.code,503); assert.equal(r.body.CHAT_ENABLED,false);
  const commands=[];
  const kv=kvStore({url:'https://kv.test',token:'TEST ONLY',fetch:async(_,args)=>{commands.push(JSON.parse(args.body));return {ok:true,json:async()=>({result:JSON.stringify({records:[['chat:kill',true]]})})};}});
  assert.equal(await kv.get('chat:kill'),true); assert.deepEqual(commands,[['GET','chat:a2:state']]);
  console.log('PASS read-only config, request limits, fail-closed storage and successful handoff');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
