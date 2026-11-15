'use strict';

const assert = require('node:assert/strict');
const { createService } = require('../api/_chat/service');
const { memoryStore, kvStore } = require('../api/_chat/store');
const { SpendCapError } = require('../api/_chat/llm-gateway');

const now = Date.UTC(2026, 10, 15, 12);
const monthKey = 'cost:2026-11';
const expires = Date.UTC(2026, 11, 1);
const text = 'What laptops are listed in the Technology catalogue?';
let checks = 0;

async function check(name, run) {
  await run();
  checks++;
  console.log('PASS ' + name);
}

function service(store, options = {}) {
  return createService({ store, now: () => now, salt: 'TEST ONLY spend salt', ...options });
}

function turn(chatService, session, event) {
  return chatService.turn(session.sessionId, session.proof, event, undefined, session.csrf, text);
}

async function ledger(store, n) {
  await store.transaction(records => records.set(monthKey, { n, exp: expires }));
}

async function main() {
  await check('SpendCapError stops a capped ledger before the chat hook', async () => {
    const store = memoryStore();
    let calls = 0;
    const chatService = service(store, { chat: async () => { calls++; return { content: 'TEST ONLY reply', costUsd: 0 }; } });
    const session = await chatService.start('TEST ONLY cap IP');
    await ledger(store, 2500);
    await assert.rejects(() => turn(chatService, session, 'at_cap'), error => error instanceof SpendCapError && error.code === 'cost_cap');
    assert.equal(calls, 0);
    assert.equal(await store.transaction(records => records.get(monthKey).n), 2500);
    assert.equal(await store.transaction(records => records.get('s:' + session.sessionId).turns), 0);
  });

  await check('an estimate that exceeds the remaining cents stops before chat', async () => {
    const store = memoryStore();
    let calls = 0;
    const chatService = service(store, { chat: async () => { calls++; return { content: 'TEST ONLY reply', costUsd: 0 }; } });
    const session = await chatService.start('TEST ONLY estimate IP');
    await ledger(store, 2499.99);
    await assert.rejects(() => turn(chatService, session, 'would_exceed'), error => error instanceof SpendCapError);
    assert.equal(calls, 0);
    assert.equal(await store.transaction(records => records.get(monthKey).n), 2499.99);
  });

  await check('a long-lived service re-reads the shared ledger after another writer fills it', async () => {
    const store = memoryStore();
    let calls = 0;
    const chatService = service(store, { chat: async () => { calls++; return { content: 'TEST ONLY reply', costUsd: 0 }; } });
    const session = await chatService.start('TEST ONLY stale IP');
    await turn(chatService, session, 'before_other_writer');
    assert.equal(calls, 1);
    await ledger(store, 2500);
    await assert.rejects(() => turn(chatService, session, 'after_other_writer'), error => error instanceof SpendCapError);
    assert.equal(calls, 1, 'the earlier uncapped ledger must not authorize another call');
  });

  await check('an in-flight reservation at exactly 2500 cents blocks another service instance', async () => {
    const store = memoryStore();
    let release;
    let calls = 0;
    const chat = async () => {
      calls++;
      await new Promise(resolve => { release = resolve; });
      return { content: 'TEST ONLY reply', costUsd: 0.01 };
    };
    const first = service(store, { chat });
    const second = service(store, { chat });
    const firstSession = await first.start('TEST ONLY concurrent first IP');
    const secondSession = await second.start('TEST ONLY concurrent second IP');
    await ledger(store, 2499);
    const pending = turn(first, firstSession, 'last_cent');
    while (!release) await new Promise(resolve => setImmediate(resolve));
    assert.equal(await store.transaction(records => records.get(monthKey).n), 2500);
    await assert.rejects(() => turn(second, secondSession, 'concurrent_cap'), error => error instanceof SpendCapError);
    release();
    await pending;
    assert.equal(calls, 1);
    assert.equal(await store.transaction(records => records.get(monthKey).n), 2500);
  });

  await check('the 80 percent hook fires once even when settlement lowers spend below the threshold', async () => {
    const store = memoryStore();
    const alerts = [];
    const chatService = service(store, {
      alert: async payload => {
        assert.equal(await store.transaction(records => records.get(monthKey).alerted), true, 'mark must be durable before the hook');
        alerts.push(payload);
      },
      chat: async () => ({ content: 'TEST ONLY reply', costUsd: 0 }),
    });
    const session = await chatService.start('TEST ONLY alert IP');
    await ledger(store, 1999.99);
    await turn(chatService, session, 'first_threshold');
    await turn(chatService, session, 'second_threshold');
    await turn(chatService, session, 'second_threshold');
    assert.deepEqual(alerts, [{ threshold: 80 }]);
    assert.equal(await store.transaction(records => records.get(monthKey).n), 1999.99);
  });

  await check('spend is logged without visitor data after reservation and before chat, then actual cost settles', async () => {
    const store = memoryStore();
    const entries = [];
    const order = [];
    const original = console.info;
    console.info = (...args) => { entries.push(args); order.push('log'); };
    try {
      const chatService = service(store, { chat: async () => {
        order.push('chat');
        assert.equal(entries.length, 1);
        const recorded = JSON.parse(entries[0][1]);
        assert.equal(await store.transaction(records => records.get(monthKey).n), recorded.reserved);
        return { content: 'TEST ONLY reply', costUsd: 0.001 };
      } });
      const session = await chatService.start('TEST ONLY private IP');
      await ledger(store, 10);
      const result = await turn(chatService, session, 'logged_turn');
      assert.equal(typeof result.text, 'string');
      assert.equal(await store.transaction(records => records.get(monthKey).n), 10.1);
      assert.deepEqual(await turn(chatService, session, 'logged_turn'), result);
      assert.deepEqual(order, ['log', 'chat']);
      assert.equal(entries[0][0], 'CHAT_SPEND');
      const recorded = JSON.parse(entries[0][1]);
      assert.deepEqual(Object.keys(recorded).sort(), ['estimate', 'month', 'n', 'reserved']);
      assert.equal(recorded.month, '2026-11');
      assert.equal(recorded.n, 10);
      assert(recorded.estimate > 0);
      assert.equal(recorded.reserved, recorded.n + recorded.estimate);
      assert(!JSON.stringify(entries).includes(text));
      assert(!JSON.stringify(entries).includes('TEST ONLY private IP'));
    } finally { console.info = original; }
  });

  await check('a retried durable reservation invokes the alert hook only after one successful commit', async () => {
    let persisted = null;
    let conflict = false;
    const store = kvStore({ url: 'https://kv.test', token: 'TEST ONLY synthetic credential', fetch: async (_url, options) => {
      const command = JSON.parse(options.body);
      let result;
      if (command[0] === 'GET') result = persisted;
      else if (command[0] === 'EVAL') {
        if (conflict) { conflict = false; result = 0; }
        else if ((persisted || '') !== command[4]) result = 0;
        else { persisted = command[5]; result = 1; }
      } else throw Error('TEST ONLY unexpected KV command');
      return { ok: true, json: async () => ({ result }) };
    } });
    let alerts = 0;
    const chatService = service(store, {
      alert: () => { alerts++; },
      chat: async () => ({ content: 'TEST ONLY reply', costUsd: 0 }),
    });
    const session = await chatService.start('TEST ONLY CAS IP');
    await ledger(store, 1999.99);
    conflict = true;
    await turn(chatService, session, 'cas_threshold');
    assert.equal(alerts, 1);
    assert.equal(await store.transaction(records => records.get(monthKey).alerted), true);
  });

  console.log(`${checks}/${checks} passed`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
