'use strict';
const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');
const { createService } = require('../api/_chat/service');
const { memoryStore } = require('../api/_chat/store');

for (const correction of ['not routers, a tablet', 'not routers but tablets']) {
  const reply = respond(correction, respond('Show me routers'));
  assert.equal(reply.narrow.scope.categoryId, 'tablets');
  assert.match(reply.text, /Got it, Tablets/);
  assert.doesNotMatch(reply.text, /Routers/);
}
for (const phrase of ['them', 'for those', 'of them', 'those']) {
  const reply = respond(phrase, respond('quantity 7', respond('What would the price be?')));
  assert.match(reply.text, /7 units.*which item/i);
  assert.equal(reply.fields.quantity, '7');
  assert.doesNotMatch(reply.text, /24 hours|quick form/);
  assert.ok(!reply.reset);
}
for (const query of ['I need connectivity for my workshop', 'I want a battery for equipment', 'I want something durable']) {
  const reply = respond(query);
  assert.match(reply.text, /\?/);
  assert.doesNotMatch(reply.text, /24 hours|quick form/);
}
const phone = respond('samsong a56');
assert.match(phone.text, /Galaxy A56/);
assert.match(phone.text, /nearest catalogue.*Did you mean/);
assert.doesNotMatch(phone.text, /24 hours/);
const listed = respond('those', { ...respond('Show me tablets'), slots: { quantity: '8' } });
assert.ok(listed.lastProducts.length);
assert.match(listed.text, /8 units.*from that list/);

(async () => {
  const store = memoryStore();
  const service = createService({ store, salt: 'cleanup-context', chat: async () => { throw Error('No model calls'); } });
  const start = await service.start('203.0.113.62');
  for (const [i, text] of ['Show me routers', 'not routers, a tablet'].entries()) {
    const reply = await service.turn(start.sessionId, start.proof, 'correction-' + i, undefined, start.csrf, text);
    if (i) { assert.match(reply.text, /Got it, Tablets/); assert.doesNotMatch(reply.text, /Routers/); }
  }
  const context = await store.transaction(records => records.get('s:' + start.sessionId).context);
  assert.equal(context.narrow.scope.categoryId, 'tablets');
  console.log('Cleanup context tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
