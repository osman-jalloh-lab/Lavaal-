'use strict';
// Handoff receipt for UI adapters + topic reset after narrowing. Model mocked; no network.
const assert = require('node:assert/strict');
const { createService } = require('../api/_chat/service');
const { memoryStore } = require('../api/_chat/store');
let modelCalls = 0;
function fixture() {
  const store = memoryStore();
  const service = createService({ store, salt: 'synthetic-receipt-salt', now: () => Date.UTC(2026, 10, 13, 12), previewLimits: true,
    transport: () => { throw Error('transport must not be called'); },
    chat: async () => { modelCalls++; return { content: 'MOCK', usage: {}, costUsd: 0, model: 'deepseek-flash', provider: 'deepseek' }; } });
  let session, n = 0;
  return {
    store,
    async turn(text) { session = session || await service.start('203.0.113.7'); return service.turn(session.sessionId, session.proof, 'rt_' + (n++), undefined, session.csrf, text); },
  };
}
const sinks = store => store.transaction(rows => [...rows].filter(([key]) => key.startsWith('test-handoff:')).length);
async function main() {
  // A) receipt only after Confirm; exact chips on the summary step.
  for (const [start, kind] of [['I want to speak to a person on your team, please.', 'person'], ['I want to request a quote.', 'quote']]) {
    const f = fixture();
    for (const text of [start, 'Ada Test', '+232 76 000 000']) assert.equal((await f.turn(text)).handoff, undefined);
    const summary = await f.turn(kind === 'quote' ? '10 laptops' : 'an order');
    assert.match(summary.text, /^Please confirm your details:/);
    assert.deepEqual(summary.chips, ['Confirm', 'Cancel']);
    assert.equal(summary.handoff, undefined);
    assert.equal(await sinks(f.store), 0);
    const done = await f.turn('Confirm');
    assert.equal(done.text, 'Thank you, someone from our team will reach out to you shortly.');
    assert.deepEqual(done.handoff, { status: 'received', test: true, route: 'customer-success' });
    assert.doesNotMatch(JSON.stringify(done.handoff), /Ada|232|@/);
    assert.equal(await sinks(f.store), 1);
  }
  const cancelled = fixture();
  for (const text of ['talk to someone', 'Ada Test', 'ada@example.com', 'an order']) await cancelled.turn(text);
  const cancel = await cancelled.turn('Cancel');
  assert.equal(cancel.text, 'Request cancelled. What else can I help with?');
  assert.equal(cancel.handoff, undefined);
  assert.equal(await sinks(cancelled.store), 0);

  // B) a new category/topic after narrowing to a family resets the narrowing context.
  for (const next of ['router', 'Starlink router', 'Do you have a Starlink router?', 'Galaxy', 'printer', 'what about a TP-Link router']) {
    const f = fixture();
    await f.turn('iPhone');
    const family = await f.turn('iPhone 16');
    assert.match(family.text, /iPhone 16 models/);
    const reply = await f.turn(next);
    assert.doesNotMatch(reply.text, /among our iPhone 16/i, next);
    assert.doesNotMatch((reply.chips || []).join('|'), /iPhone 16/, next);
  }
  // In-scope answers still continue the narrowing.
  for (const [steps, next, expect] of [[['iPhone', 'iPhone 16'], 'Pro Max', /color/i], [['routers'], 'MikroTik', /configuration/i], [['Dell laptop'], 'Latitude', /RAM/]]) {
    const f = fixture();
    for (const text of steps) await f.turn(text);
    assert.match((await f.turn(next)).text, expect, next);
  }
  assert.equal(modelCalls <= 1, true, 'only the open TP-Link question may use the model');
  console.log('PASS handoff receipt (status received, Confirm/Cancel chips) and topic reset after narrowing');
}
main().catch(error => { console.error(error); process.exit(1); });
