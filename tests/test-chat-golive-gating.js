'use strict';
const assert = require('node:assert/strict');
const defaultHandler = require('../api/chat-inquiry');
const { createHandler, publicConfig } = defaultHandler;
const { memoryStore } = require('../api/_chat/store');

let checks = 0;
async function test(name, fn) {
  await fn();
  checks++;
  console.log('PASS ' + name);
}
function options() {
  return {
    env: { VERCEL_ENV: 'production', CHAT_ENABLED: 'true', DEEPSEEK_API_KEY: 'TEST ONLY mock credential',
      CHAT_IP_HASH_SALT: 'TEST ONLY salt', CHAT_TRUSTED_ORIGINS: 'https://www.lavaall.com,https://lavaall.com' },
    store: memoryStore(), now: () => Date.UTC(2026, 10, 15, 12),
    chat: async () => { throw Error('TEST ONLY vendor must not run'); },
    transport: async () => { throw Error('TEST ONLY delivery must not run'); },
    // Callers cannot turn on Preview behavior in production.
    previewLimits: true, previewDebug: true,
  };
}
async function request(handler, action = 'config', origin = 'https://www.lavaall.com', body = {}, headers = {}) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; },
    send(value) { this.body = JSON.parse(value); return this; } };
  await handler({ method: action === 'config' ? 'GET' : 'POST', query: { action }, body,
    headers: { 'content-type': 'application/json', origin, ...headers } }, res);
  return res;
}
async function disabled(o) {
  assert.equal((await publicConfig(o)).CHAT_ENABLED, false);
  const h = createHandler(o);
  for (const action of ['config', 'session']) {
    const res = await request(h, action);
    assert.equal(res.code, 503);
    assert.equal(res.body.error, 'chat_disabled');
    assert.equal(res.body.CHAT_ENABLED, false);
  }
}
async function main() {
  await test('default export remains off with empty chat environment', async () => {
    assert.equal((await request(defaultHandler)).code, 503);
    assert.equal((await publicConfig({ env: {} })).CHAT_ENABLED, false);
  });
  await test('production enables only with flag and every dependency', async () => {
    const o = options(), h = createHandler(o);
    const config = await request(h);
    assert.equal(config.code, 200);
    assert.deepEqual(config.body, { CHAT_ENABLED: true, CHAT_VOICE_ENABLED: false, CHAT_BROWSER_VOICE_ENABLED: false,
      environment: 'production', name: 'LAVAALL Assistant' });
    assert.deepEqual(await publicConfig(o), config.body);
    assert.equal((await request(h, 'session')).code, 200);
    assert.equal((await request(h, 'session', 'https://lavaall.com')).code, 200);
    assert.equal((await request(h, 'session', 'https://evil.test', {}, { host: 'www.lavaall.com' })).code, 403);
    for (const flag of [undefined, '', 'false', 'TRUE', '1', true]) {
      const off = options();
      if (flag === undefined) delete off.env.CHAT_ENABLED;
      else off.env.CHAT_ENABLED = flag;
      await disabled(off);
    }
    for (const key of ['DEEPSEEK_API_KEY', 'CHAT_IP_HASH_SALT', 'CHAT_TRUSTED_ORIGINS']) {
      const off = options(); delete off.env[key]; await disabled(off);
    }
    for (const salt of ['short', 'x'.repeat(257), 12345678]) {
      const off = options(); off.env.CHAT_IP_HASH_SALT = salt; await disabled(off);
    }
    const noStore = options(); delete noStore.store; await disabled(noStore);
    const invalidStore = options(); invalidStore.store = {}; await disabled(invalidStore);
    const testFlag = options(); delete testFlag.env.CHAT_ENABLED; testFlag.CHAT_ENABLED = true;
    assert.equal((await publicConfig(testFlag)).CHAT_ENABLED, true);
  });
  await test('production trusts its explicit allowlist and never auto-adds Preview hosts', async () => {
    const o = options();
    o.env.VERCEL_URL = 'TEST-ONLY-preview.vercel.app';
    o.env.VERCEL_BRANCH_URL = 'TEST-ONLY-branch.vercel.app';
    o.trustedOrigins = ['https://option-only.test'];
    const h = createHandler(o);
    for (const origin of ['https://TEST-ONLY-preview.vercel.app', 'https://TEST-ONLY-branch.vercel.app', 'https://option-only.test']) {
      assert.equal((await request(h, 'session', origin)).code, 403);
    }
    for (const origin of ['', 'http://www.lavaall.com', 'https://www.lavaall.com/path', 'https://user:pass@www.lavaall.com']) {
      const off = options(); off.env.CHAT_TRUSTED_ORIGINS = origin; await disabled(off);
    }
  });
  await test('KV kill disables current requests and public config, clearing it recovers', async () => {
    const o = options(), h = createHandler(o);
    for (const value of [true, 'true', '1', 'kill']) {
      for (const record of [value, { value, exp: o.now() + 60000 }]) {
        await o.store.transaction(records => records.set('chat:kill', record));
        assert.equal((await publicConfig(o)).CHAT_ENABLED, false);
        for (const action of ['config', 'session']) {
          const res = await request(h, action);
          assert.equal(res.code, 503);
          assert.equal(res.body.error, 'chat_disabled');
          assert.equal(res.body.CHAT_ENABLED, false);
        }
      }
    }
    for (const record of [false, 'false', { value: false }, { value: 'kill', exp: o.now() }]) {
      await o.store.transaction(records => records.set('chat:kill', record));
      assert.equal((await request(h)).body.CHAT_ENABLED, true);
    }
    await o.store.transaction(records => records.delete('chat:kill'));
    assert.equal((await request(h, 'session')).code, 200);
  });
  await test('long-lived default-env handler re-reads flag, dependencies, and origins', async () => {
    const keys = [...Object.keys(options().env), 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
    const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    const o = options(); delete o.env;
    try {
      for (const key of keys) delete process.env[key];
      const h = createHandler(o);
      assert.equal((await request(h)).code, 503);
      Object.assign(process.env, options().env);
      assert.equal((await request(h)).code, 200);
      assert.equal((await publicConfig(o)).CHAT_ENABLED, true);
      process.env.CHAT_ENABLED = 'false';
      assert.equal((await request(h, 'session')).code, 503);
      assert.equal((await publicConfig(o)).CHAT_ENABLED, false);
      process.env.CHAT_ENABLED = 'true';
      delete process.env.DEEPSEEK_API_KEY;
      assert.equal((await request(h)).code, 503);
      process.env.DEEPSEEK_API_KEY = 'TEST ONLY replacement mock credential';
      process.env.CHAT_TRUSTED_ORIGINS = 'https://new-origin.test';
      assert.equal((await request(h, 'session')).code, 403);
      assert.equal((await request(h, 'session', 'https://new-origin.test')).code, 200);
    } finally {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
      }
    }
  });
  await test('production HTTP enforces 3 sessions and 10 turns without Preview debug', async () => {
    const o = options(), h = createHandler(o);
    const first = await request(h, 'session');
    for (let i = 0; i < 2; i++) assert.equal((await request(h, 'session')).code, 200);
    const deniedSession = await request(h, 'session');
    assert.equal(deniedSession.code, 429);
    assert.equal(deniedSession.body.error, 'quota');
    const cookie = first.headers['Set-Cookie'].split(';')[0];
    for (let i = 0; i < 10; i++) {
      const turn = await request(h, 'turn', undefined, { ...first.body, eventId: 'TEST_turn_' + i, text: 'Hello' }, { cookie });
      assert.equal(turn.code, 200);
      assert.equal(Object.hasOwn(turn.body, 'debug'), false);
    }
    const deniedTurn = await request(h, 'turn', undefined, { ...first.body, eventId: 'TEST_turn_limit', text: 'Hello' }, { cookie });
    assert.equal(deniedTurn.code, 429);
    assert.equal(deniedTurn.body.error, 'quota');
    // Delivery gate applies to Preview only; production reaches draft auth.
    assert.equal((await request(h, 'draft')).code, 403);
  });
  await test('Preview keeps automatic origins, debug, and delivery gate', async () => {
    const o = options();
    o.env.VERCEL_ENV = 'preview'; delete o.env.CHAT_TRUSTED_ORIGINS;
    o.env.VERCEL_URL = 'test-only-preview.vercel.app'; o.env.VERCEL_BRANCH_URL = 'test-only-branch.vercel.app';
    const h = createHandler(o);
    const a = await request(h, 'session', 'https://test-only-preview.vercel.app');
    assert.equal(a.code, 200);
    for (let i = 0; i < 6; i++) assert.equal((await request(h, 'session', 'https://test-only-branch.vercel.app')).code, 200);
    const cookie = a.headers['Set-Cookie'].split(';')[0];
    for (let i = 0; i < 11; i++) {
      const turn = await request(h, 'turn', 'https://test-only-preview.vercel.app', { ...a.body, eventId: 'TEST_preview_' + i, text: 'Hello' }, { cookie });
      assert.equal(turn.code, 200); assert.ok(turn.body.debug);
    }
    for (const action of ['draft', 'review', 'confirm']) assert.equal((await request(h, action)).body.error, 'delivery_disabled');
    o.env.CHAT_INQUIRY_DELIVERY = 'true';
    assert.equal((await request(h, 'draft')).code, 403);
  });
  console.log(`${checks}/${checks} passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
