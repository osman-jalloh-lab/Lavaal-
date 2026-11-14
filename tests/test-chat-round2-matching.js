'use strict';
const assert = require('node:assert/strict');
const { purchaseDetails, searchCatalog, loadCatalog } = require('../api/_chat/catalog');
const { resolve, displayLabel } = require('../api/_chat/narrow');

const commercial = purchaseDetails('24–36 refurbished Dell laptops for our teachers');
assert.deepEqual(commercial, { quantity: '24–36', condition: 'refurbished', purpose: 'teachers', query: 'dell laptops' });
assert.equal(purchaseDetails('Need seventy-two used notebooks for staff').quantity, '72');
const local = purchaseDetails('Wi wan forty-five computa fo di school');
assert.equal(local.quantity, '45');
assert.equal(local.purpose, 'school');
assert.equal(local.query, 'wi wan computer');
const baseline = searchCatalog('Dell laptops').all.map(item => item.id);
assert.deepEqual(searchCatalog('24 to 36 refurbished Dell laptops for our teachers').all.map(item => item.id), baseline);
assert.ok(searchCatalog('24–36 used laptops').all.every(item => !/accessories|audio/.test(item.categoryId)));
for (const query of ['ipone 15 pro max 256 GB', '15 pro max 512gb']) {
  const hit = resolve(query);
  assert.equal(hit.scope.modelId, 'iphone-15-pro-max');
  assert.notEqual(hit.level, 'not-carried');
}
assert.equal(purchaseDetails('iPhone 15 Pro Max').quantity, '');
const iphones = loadCatalog().products.filter(item => /iphone/i.test(item.name));
assert.equal(displayLabel('phones', iphones), 'iPhones');
console.log('Round 2 matching tests passed.');
