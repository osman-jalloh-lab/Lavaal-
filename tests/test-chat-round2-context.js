'use strict';
const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');

const initial = respond('I need 37 refurbished Lenovo laptops for teachers');
assert.equal(initial.slots.quantity, '37');
assert.equal(initial.slots.brand, 'Lenovo');
assert.equal(initial.slots.purpose, 'teachers');
const changedBrand = respond('Dell', initial);
assert.equal(changedBrand.slots.brand, 'Dell');
assert.equal(changedBrand.slots.quantity, '37');
assert.equal(changedBrand.slots.purpose, 'teachers');
assert.match(changedBrand.text, /Dell/);
const purpose = respond('for students', changedBrand);
assert.equal(purpose.slots.quantity, '37');
assert.equal(purpose.slots.brand, 'Dell');
assert.equal(purpose.slots.purpose, 'students');

const corrected = respond('not monitors but printers', respond('Do you sell monitors?'));
assert.equal(corrected.narrow.scope.categoryId, 'printers');
assert.doesNotMatch(corrected.text, /Monitors/);
assert.equal(respond('Not tablets but laptops').narrow.scope.categoryId, 'computers');

const local = respond('Wi wan forty-five computa fo di school');
assert.equal(local.slots.quantity, '45');
assert.equal(local.slots.purpose, 'school');
const range = respond('Need 24 to 36 used laptops for our staff');
assert.equal(range.slots.quantity, '24–36');
assert.ok(range.lastProducts.every(item => item.categoryId === 'computers'));
const mixed = respond('We need 28 laptops and 14 monitors');
assert.deepEqual(mixed.slots.items, [{ quantity: '28', category: 'laptops' }, { quantity: '14', category: 'monitors' }]);
const sentences = mixed.text.match(/[^.!?]+[.!?]/g).map(s => s.trim().toLowerCase());
assert.equal(new Set(sentences).size, sentences.length);
for (const query of ['iphon 15 pro max 256gb', '15 pro max 512']) {
  const reply = respond(query);
  assert.match(reply.text, /iPhone 15 Pro Max/);
  assert.match(reply.text, /(?:256|512)GB/);
  assert.match(reply.text, /confirms stock/);
  assert.doesNotMatch(reply.text, /in stock/i);
}
const price = respond('What is the price?');
assert.doesNotMatch(price.text, /\. our team/);
console.log('Round 2 context tests passed.');
const unsupported = respond('iPhone 15 Pro Max 999GB');
assert.doesNotMatch(unsupported.text, /999GB.*list it/);
assert.match(unsupported.text, /within 24 hours/);
assert.match(respond('iphne 15 pro max 256').text, /iPhone 15 Pro Max, 256GB/);

const { createService } = require('../api/_chat/service');
const { memoryStore } = require('../api/_chat/store');
(async () => {
  const store = memoryStore();
  const service = createService({ store, salt: 'round2 bulk context', now: () => Date.UTC(2026, 10, 12), chat: async () => { throw new Error('No model calls permitted'); } });
  const session = await service.start('203.0.113.79');
  for (const [index, input] of ['I need 37 refurbished Lenovo laptops for teachers', 'Dell', 'for students'].entries()) {
    await service.turn(session.sessionId, session.proof, 'bulk-' + index, undefined, session.csrf, input);
  }
  const context = await store.transaction(records => records.get('s:' + session.sessionId).context);
  assert.equal(context.slots.quantity, '37');
  assert.equal(context.slots.brand, 'Dell');
  assert.equal(context.slots.purpose, 'students');
  assert.equal(context.lastQty, '37');
  const mixedStore = memoryStore();
  const mixedService = createService({ store: mixedStore, salt: 'round2 mixed context', now: () => Date.UTC(2026, 10, 12), chat: async () => { throw new Error('No model calls permitted'); } });
  const mixedSession = await mixedService.start('203.0.113.80');
  for (const [index, input] of ['We need 28 laptops and 14 monitors', 'quantity 30'].entries()) {
    await mixedService.turn(mixedSession.sessionId, mixedSession.proof, 'mixed-' + index, undefined, mixedSession.csrf, input);
  }
  const mixedContext = await mixedStore.transaction(records => records.get('s:' + mixedSession.sessionId).context);
  assert.deepEqual(mixedContext.slots.items, mixed.slots.items);
  console.log('Round 2 service context tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
const cityFollowup = respond('Kenema', respond('Need 34 laptops'));
assert.equal(cityFollowup.slots.quantity, '34');
assert.equal(cityFollowup.slots.deliveryCity, 'Kenema');
const afterCityBrand = respond('Dell', cityFollowup);
assert.equal(afterCityBrand.slots.quantity, '34');
assert.equal(afterCityBrand.slots.brand, 'Dell');
const acrossTurns = respond('Also 23 scanners', respond('Need 18 printers'));
assert.deepEqual(acrossTurns.slots.items, [{ quantity: '18', category: 'printers' }, { quantity: '23', category: 'scanners' }]);
assert.match(respond('can you get 15 pro max 512gb').text, /iPhone 15 Pro Max, 512GB/);
assert.doesNotMatch(respond('not monitors but scanners').text, /your item/i);
const platforms = respond('Also 9 Linux computers', respond('22 Mac computers'));
assert.deepEqual(platforms.slots.items, [{ quantity: '22', category: 'Mac computers' }, { quantity: '9', category: 'Linux computers' }]);
assert.match(platforms.text, /22 Mac computers and 9 Linux computers/);
assert.doesNotMatch(platforms.text, /in stock|MOCK_MODEL_REPLY/);
