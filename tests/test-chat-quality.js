'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { memoryStore } = require('../api/_chat/store');
const { createService } = require('../api/_chat/service');
const { createHandler } = require('../api/chat-inquiry');
const contact = require('../api/contact');
let checks = 0;

async function test(name, operation) {
  await operation();
  checks++;
  console.log('PASS ' + name);
}

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.code = code; return this; },
    send(body) { this.body = JSON.parse(body); return this; },
  };
}

function handlerOptions(changes = {}) {
  return {
    CHAT_ENABLED: true,
    runtime: 'test',
    store: memoryStore(),
    salt: 'TEST ONLY server salt',
    trustedOrigins: ['https://preview.test'],
    vendorSecret: 'TEST_ONLY_'.repeat(5),
    transport: async () => { throw new Error('Unexpected TEST ONLY transport'); },
    ...changes,
  };
}

async function invoke(handler, action, body, headers = {}) {
  const result = response();
  await handler({
    method: 'POST', query: { action }, body,
    headers: { 'content-type': 'application/json', origin: 'https://preview.test', ...headers },
  }, result);
  return result;
}

async function main() {
  await test('transaction throws roll back additions, nested mutations and deletion', async () => {
    const store = memoryStore();
    await store.transaction(records => records.set('keep', { nested: { n: 1 } }));
    await assert.rejects(store.transaction(records => {
      records.get('keep').nested.n = 99;
      records.set('new', { n: 3 });
      records.delete('keep');
      throw new Error('TEST ONLY rollback');
    }));
    assert.deepEqual(await store.transaction(records => Array.from(records)), [
      ['keep', { nested: { n: 1 } }],
    ]);
  });

  await test('returned references and callback captures cannot mutate committed records', async () => {
    const store = memoryStore();
    let captured;
    const result = await store.transaction(records => {
      captured = { n: 1 };
      records.set('item', captured);
      return captured;
    });
    result.n = 20;
    captured.n = 30;
    assert.equal(await store.transaction(records => records.get('item').n), 1);
  });

  await test('async operations serialize and continue after rejected transaction', async () => {
    const store = memoryStore();
    const outcomes = await Promise.allSettled(Array.from({ length: 30 }, (_, index) =>
      store.transaction(async records => {
        const counter = records.get('counter') || { n: 0 };
        await Promise.resolve();
        counter.n++;
        records.set('counter', counter);
        if (index === 12) throw new Error('TEST ONLY aborted increment');
        return counter.n;
      })));
    assert.equal(outcomes.filter(item => item.status === 'rejected').length, 1);
    assert.equal(await store.transaction(records => records.get('counter').n), 29);
  });

  await test('review responses cannot mutate stored fields or their consent digest', async () => {
    const service = createService(handlerOptions());
    const session = await service.start('TEST ONLY IP');
    const draft = await service.draft(session.sessionId, {
      name: 'TEST ONLY User', phone: '+12025550100',
    }, 'TEST_event');
    const review = await service.review(session.sessionId, session.proof, session.csrf, draft.draftId);
    review.summary.name = 'TEST ONLY changed outside transaction';
    const again = await service.review(session.sessionId, session.proof, session.csrf, draft.draftId);
    assert.equal(again.summary.name, 'TEST ONLY User');
  });

  await test('all malformed opaque IDs, arrays and object inputs fail before lookup', async () => {
    const service = createService(handlerOptions());
    for (const value of [undefined, null, [], {}, 42, '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64)]) {
      await assert.rejects(service.draft(value, {}, 'TEST_event'), error => error.code === 'session');
      await assert.rejects(service.review(value, 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)), error => error.code === 'session');
    }
  });

  await test('malformed draft, token, event and CSRF never grant confirmation', async () => {
    const service = createService(handlerOptions());
    const session = await service.start('TEST ONLY input');
    const draft = await service.draft(session.sessionId, {
      name: 'TEST ONLY User', phone: '+12025550100',
    }, 'TEST_event');
    for (const value of [[], {}, '', 'x'.repeat(101)]) {
      await assert.rejects(service.draft(session.sessionId, {}, value), error => error.code === 'event');
    }
    for (const value of [[], {}, '', 'f'.repeat(65)]) {
      await assert.rejects(service.review(session.sessionId, session.proof, session.csrf, value), error => error.code === 'draft');
      await assert.rejects(service.confirm(session.sessionId, session.proof, session.csrf, draft.draftId, value, 'e'.repeat(64)), error => error.code === 'consent');
      await assert.rejects(service.review(session.sessionId, session.proof, value, draft.draftId), error => error.code === 'csrf');
    }
  });

  await test('configured origins reject HTTP, paths, credentials, malformed and non-string entries', async () => {
    for (const origins of [
      ['http://preview.test'], ['https://preview.test/'], ['https://preview.test/path'],
      ['https://preview.test?x=1'], ['https://user:pass@preview.test'],
      ['https://preview.test#hash'], ['https://preview.test', {}], 'https://preview.test',
      ['http://localhost'], [],
    ]) {
      const handler = createHandler(handlerOptions({ trustedOrigins: origins }));
      assert.equal((await invoke(handler, 'session', {})).code, 503);
    }
  });

  await test('loopback HTTP exemption requires explicit local test option', async () => {
    const handler = createHandler(handlerOptions({
      localTests: true, trustedOrigins: ['http://127.0.0.1:8080'],
    }));
    const result = await invoke(handler, 'session', {}, { origin: 'http://127.0.0.1:8080' });
    assert.equal(result.code, 200);
    assert(!result.headers['Set-Cookie'].includes('; Secure'));
    const denied = await invoke(handler, 'session', {}, { origin: 'http://127.0.0.1:8081' });
    assert.equal(denied.code, 403);
  });

  await test('array/object action and opaque fields denied without raw input in response', async () => {
    const handler = createHandler(handlerOptions());
    for (const action of [[], {}, ['review'], 'constructor', '__proto__']) {
      assert.equal((await invoke(handler, action, {})).code, 400);
    }
    const raw = 'TEST ONLY NEVER ECHO';
    for (const value of [[], {}, raw]) {
      const result = await invoke(handler, 'review', { sessionId: value, csrf: value, draftId: value });
      assert.equal(result.code, 400);
      assert(!JSON.stringify(result.body).includes(raw));
    }
  });

  await test('original public contact validator still rejects phone-only without any transport', async () => {
    let attempts = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => {
      attempts++;
      return { ok: true, json: async () => ({ ok: true }) };
    };
    try {
      const result = response();
      await contact({
        method: 'POST', headers: { 'x-forwarded-for': 'TEST ONLY validator' },
        body: { inquiryType: 'general-inquiry', name: 'TEST ONLY User', phone: '+12025550100', consent: true },
      }, result);
      assert.equal(result.code, 400);
      assert.equal(result.body.error, 'invalid_contact_request');
      assert(result.body.errors.includes('A valid email address is required.'));
      assert.equal(attempts, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test('review artifacts are inert, default off and no privileged customer tools', () => {
    const directory = path.join(__dirname, '../docs/customer-assistant');
    const config = JSON.parse(fs.readFileSync(path.join(directory, 'agent-config.json'), 'utf8'));
    assert.equal(config.enabled, false);
    assert.deepEqual(config.allowedTools, ['draft_inquiry']);
    assert.deepEqual(config.privilegedTools, []);
    const example = fs.readFileSync(path.join(directory, 'env.example'), 'utf8');
    assert.match(example, /defaults off/i);
    for (const name of ['CHAT_ENABLED', 'CHAT_VOICE_ENABLED', 'CHAT_BROWSER_VOICE_ENABLED', 'CHAT_INQUIRY_DELIVERY', 'DEEPSEEK_API_KEY', 'AI_GATEWAY_API_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
      assert(example.split(/\r?\n/).includes(name));
    }
    assert(example.split(/\r?\n/).filter(line => line && !line.startsWith('#')).every(line => /^[A-Z][A-Z0-9_]*$/.test(line)));
    assert.equal(config.voiceEnabled, false);
    assert.equal(config.browserVoiceEnabled, false);
    assert.equal(fs.existsSync(path.join(directory, 'embed-template.html')), false, 'no vendor widget embed');
    assert.doesNotMatch(JSON.stringify(config), /elevenlabs/i);
  });

  console.log(`${checks}/${checks} passed`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
