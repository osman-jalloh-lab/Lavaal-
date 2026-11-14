'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { respond } = require('../api/_chat/responder');
const { loadCatalog } = require('../api/_chat/catalog');
const { buildTree } = require('../api/_chat/narrow');
const { createService } = require('../api/_chat/service');
const { memoryStore } = require('../api/_chat/store');

// Synthetic catalogue proves hierarchy construction without depending on brand lists.
const synthetic = [
  { id: 'generic', categoryId: 'devices', brand: 'ACME', family: 'Models', name: 'Nova Z8', options: [{ key: 'size', type: 'select', options: ['Large'] }] },
  { id: 'short', categoryId: 'devices', brand: 'acme', family: 'Nova', name: 'Nova Base', options: [] },
  { id: 'long', categoryId: 'devices', brand: 'Acme', family: 'Nova Z', name: 'Nova Z Base', source: 'site-catalog', options: [] },
  { id: 'duplicate', categoryId: 'devices', brand: 'acme', family: 'Series', name: 'NOVA Z8', options: [] },
  { id: 'embedded', categoryId: 'devices', brand: 'acme', family: '', name: 'Portable Nova Z Unit', options: [] },
  { id: 'other', categoryId: 'devices', brand: 'acme', family: 'Models', name: 'Unrelated Device', options: [] },
];
const originalSynthetic = structuredClone(synthetic);
const constructed = buildTree(synthetic);
assert.deepEqual(synthetic, originalSynthetic, 'catalogue input is never mutated');
assert.ok(constructed.every(item => item.brand === 'Acme'), 'site catalogue casing wins');
assert.equal(constructed.find(item => item.id === 'generic').family, 'Nova Z', 'longest normalized prefix wins');
assert.equal(constructed.find(item => item.id === 'embedded').family, 'Nova Z', 'whole words inside a name identify a family');
assert.equal(constructed.find(item => item.id === 'other').family, 'Other Acme models');
assert.equal(constructed.filter(item => item.name.toLowerCase() === 'nova z8').length, 1, 'normalized duplicate names collapse');
assert.notEqual(constructed[0], synthetic[0], 'products are copied');
assert.notEqual(constructed.find(item => item.id === 'generic').options[0].options, synthetic[0].options[0].options, 'option arrays are copied');

const products = loadCatalog().products;
const histories = new WeakMap();
const scenarios = [];
const byName = name => {
  const product = products.find(item => item.name === name);
  assert.ok(product, `fixture exists in catalogue: ${name}`);
  return product;
};
const visible = reply => [reply.text, ...(reply.chips || [])].join(' ');
function guide(text, previous) {
  const reply = respond(text, previous);
  const history = [...(previous && histories.get(previous) || []), text];
  histories.set(reply, history);
  scenarios.push({ history, expected: reply.text });
  assert.ok(reply.events.some(event => ['product-guide', 'category-guide', 'not-in-catalog'].includes(event)), `${text}: deterministic event`);
  assert.ok(reply.narrow, `${text}: narrowing state`);
  assert.ok((reply.chips || []).length <= 6, `${text}: chip cap`);
  assert.ok(reply.narrow.ids.every(id => typeof id === 'string' && products.some(item => item.id === id)), `${text}: catalogue IDs only`);
  return reply;
}
function has(reply, label) {
  assert.ok(visible(reply).includes(label), `expected ${JSON.stringify(label)} in ${visible(reply)}`);
}
function variant(product, previous) {
  const selected = guide(product.name, previous);
  const field = product.options.find(option => option.key === 'color')
    || product.options.find(option => option.type === 'select' && !['condition', 'quantity'].includes(option.key));
  if (!field) {
    assert.equal(selected.awaiting, 'variant', 'items without selects keep a light variant scope');
    assert.ok(selected.text.includes(`Yes, we have the ${product.name}. Our team will confirm the details with your quote.`));
    return selected;
  }
  assert.equal(selected.awaiting, field.key === 'color' ? 'color' : 'variant');
  for (const value of field.options.slice(0, 6)) has(selected, value);
  const answer = guide(field.options[0], selected);
  assert.ok(answer.text.includes(`Yes, we have the ${product.name} in ${field.options[0]}. Our team will confirm stock with your quote.`));
  const missing = guide('unlisted purple finish', selected);
  assert.ok(missing.text.includes(`We don't have the ${product.name} in unlisted purple finish, but we have it in `));
  for (const value of field.options) has(missing, value);
  return selected;
}
function unavailable(text, nearest, previous) {
  const reply = guide(text, previous);
  assert.match(reply.text, /don't (?:carry|have|see)/i);
  assert.equal(reply.narrow.level, 'not-carried', `${text}: missing model is not a missing variant`);
  assert.ok(nearest.some(item => visible(reply).includes(item.name) || visible(reply).includes(item.family)), `${text}: nearest catalogue models or families offered`);
  assert.ok(!(/We don't carry/i.test(reply.text) && /I don't see .* in our catalogue/i.test(reply.text)), 'missing-item explanation is not duplicated');
  assert.doesNotMatch(reply.text, /We can source it, let us check/);
  return reply;
}

const phone = guide('phone');
has(phone, 'Samsung');
assert.equal(phone.awaiting, 'brand');
const unmatchedBrand = guide('unlistedbrand', phone);
assert.equal(unmatchedBrand.awaiting, 'brand');
assert.deepEqual(unmatchedBrand.narrow.scope, phone.narrow.scope);
has(unmatchedBrand, 'Samsung');
const typoBrand = guide('samsng phones');
assert.equal(typoBrand.narrow.scope.brand, 'Samsung');
assert.equal(typoBrand.awaiting, 'family');
has(typoBrand, 'Galaxy S');
const samsung = guide('Samsung', phone);
assert.equal(samsung.awaiting, 'family');
has(samsung, 'Galaxy S');
assert.match(samsung.text, /^Yes, we have \*\*Samsung\*\* phones:/);
assert.doesNotMatch(samsung.text, /Which family|Samsungs/);
const unmatchedFamily = guide('unlistedfamily', samsung);
assert.equal(unmatchedFamily.awaiting, 'family');
assert.deepEqual(unmatchedFamily.narrow.scope, samsung.narrow.scope);
has(unmatchedFamily, 'Galaxy S');
const family = guide('Galaxy S', samsung);
assert.equal(family.awaiting, 'model');
for (const item of products.filter(item => item.source === 'site-catalog' && item.brand === 'Samsung' && item.family === 'Galaxy S')) has(family, item.name);
const ultra = byName('Galaxy S24 Ultra');
const ultraReply = variant(ultra, family);
assert.equal(ultraReply.text, 'Yes, we have that. What color are you looking for?');
assert.equal(guide('Do you have Galaxy S24 Ultra?').text, 'Yes, we have the Galaxy S24 Ultra. What color are you looking for?');
has(guide('Titanium Violet', ultraReply), 'in Titanium Violet');
const inlineVariant = guide('Samsung Galaxy S24 Ultra Titanium Violet');
assert.ok(inlineVariant.text.includes(`Yes, we have the ${ultra.name} in Titanium Violet. Our team will confirm stock with your quote.`));
unavailable('Galaxy S22', products.filter(item => item.brand === 'Samsung' && item.family === 'Galaxy S'), family);
const unscopedMissing = unavailable('Galaxy S22', products.filter(item => item.brand === 'Samsung' && item.family === 'Galaxy S'));
assert.doesNotMatch(visible(unscopedMissing), /Galaxy Tab/i);
assert.match(unscopedMissing.text, /^I don't see the Galaxy S22 in our catalogue\. The closest Galaxy S options we have are /);
assert.match(unscopedMissing.text, /Which one would you like\?$/);
const missingBrand = guide('Huawei phones');
assert.match(missingBrand.text, /don't (?:carry|have)/i);
has(missingBrand, 'Samsung');
assert.match(missingBrand.text, /^We don't carry Huawei phones\. Phone brands we have:/);
assert.doesNotMatch(missingBrand.text, /source it, let us check/i);

const google = guide('Google', phone);
assert.equal(google.lastModel.name, 'Pixel 8', 'single-model brand resolves its model without a trailing name');
variant(byName('Pixel 8'), google);
unavailable('Pixel 9', [byName('Pixel 8')], google);
const lowercasePixelMissing = unavailable('pixel 99', [byName('Pixel 8')]);
assert.match(lowercasePixelMissing.text, /The closest Pixel options we have are /, 'scope word keeps catalogue casing');

const laptop = guide('laptop');
has(laptop, 'Lenovo');
const lenovo = guide('Lenovo', laptop);
has(lenovo, 'ThinkPad');
assert.match(lenovo.text, /^Yes, we have \*\*Lenovo\*\* laptops:/);
assert.doesNotMatch(lenovo.text, /Lenovos|Which family/);
const thinkpad = guide('ThinkPad', lenovo);
has(thinkpad, 'ThinkPad');
const unmatchedModel = guide('16GB', thinkpad);
assert.equal(unmatchedModel.awaiting, 'model');
assert.match(unmatchedModel.text, /I don't see 16GB among our ThinkPad models\./);
assert.equal(unmatchedModel.narrow.scope.family, thinkpad.narrow.scope.family);
const laptopModel = byName('Lenovo ThinkPad');
assert.ok(!laptopModel.options.some(option => option.key === 'color'));
const laptopVariant = variant(laptopModel, thinkpad);
assert.match(laptopVariant.text, /Which RAM are you looking for\?$/);
assert.equal(guide('Lenovo ThinkPad').text, 'Yes, we have the Lenovo ThinkPad. Which RAM are you looking for?');
const dellMissing = unavailable('Dell Inspiron', products.filter(item => item.categoryId === 'computers' && item.brand.toLowerCase() === 'dell'), laptop);
const dellFamilies = [...new Set(buildTree(products).filter(item => item.categoryId === 'computers' && item.brand === 'Dell').map(item => item.family))];
assert.ok(dellMissing.narrow.labels.every(label => dellFamilies.includes(label)), 'nearest set spanning families displays family labels');
const otherDell = dellMissing.narrow.labels.indexOf('Other Dell models');
assert.ok(otherDell < 0 || otherDell === dellMissing.narrow.labels.length - 1, 'generated fallback family comes last');
const broadDellMissing = guide('Do you have a Dell Inspiron?');
assert.equal(broadDellMissing.text, "I don't see the Dell Inspiron in our catalogue. From Dell we have Computers, Monitors, and Servers. Which type are you looking for?");
assert.equal(broadDellMissing.narrow.level, 'not-carried');
assert.equal(broadDellMissing.awaiting, 'category');
assert.equal(broadDellMissing.narrow.scope.brand, 'Dell');
assert.deepEqual(broadDellMissing.chips, ['Computers', 'Monitors', 'Servers']);
assert.deepEqual(broadDellMissing.narrow.labels, broadDellMissing.chips);
for (const category of broadDellMissing.chips) {
  const continued = guide(category, broadDellMissing);
  const categoryId = products.find(item => item.category === category).categoryId;
  assert.equal(continued.narrow.scope.brand, 'Dell', `${category}: keeps the requested brand`);
  assert.equal(continued.narrow.scope.categoryId, categoryId, `${category}: selects the requested category`);
  assert.ok(continued.narrow.ids.every(id => {
    const product = products.find(item => item.id === id);
    return product.brand.toLowerCase() === 'dell' && product.categoryId === categoryId;
  }), `${category}: nearest-model continuation stays within brand and category`);
  assert.notEqual(continued.awaiting, 'category', `${category}: advances past category selection`);
}

const charger = guide('charger');
has(charger, byName('Chargers & Charging Cables').name);
assert.ok(!(charger.chips || []).includes('Various'));
const chargerModel = variant(byName('Chargers & Charging Cables'), charger);
assert.match(guide('Do you have Chargers & Charging Cables in blue?', chargerModel).text, /team will confirm the details with your quote/);
assert.equal(guide('black?', chargerModel).text, `A team member will confirm the available colors for the ${chargerModel.lastModel.name}.`);
const banks = guide('power bank');
has(banks, byName('Power Banks').name);
variant(byName('Power Banks'), banks);
unavailable('wireless earbuds charger case', [byName('Chargers & Charging Cables')]);

const kits = guide('starlink kit');
const kit = byName('Starlink 45m Cable Kit (Gen 3)');
has(kits, kit.name);
const kitSelected = variant(kit, kits);
assert.equal(guide('red', kitSelected).text, `A team member will confirm the available colors for the ${kit.name}.`);
const lowercaseStarlinkMissing = unavailable('starlink 100m cable', [kit]);
assert.match(lowercaseStarlinkMissing.text, /The closest Starlink options we have are /, 'matched name word keeps catalogue casing');
assert.ok(!respond('Do you have Starlink?').events.includes('product-guide'));

const broadSamsung = guide('samsung');
assert.equal(broadSamsung.awaiting, 'category');
assert.equal(broadSamsung.narrow.level, 'category');
assert.match(broadSamsung.text, /^Yes, we have Samsung products in: /);
assert.match(broadSamsung.text, /Which type are you looking for\?$/);
const samsungPhones = guide('Phones', broadSamsung);
assert.equal(samsungPhones.narrow.scope.brand, 'Samsung');
assert.equal(samsungPhones.narrow.scope.categoryId, 'phones');
has(samsungPhones, 'Galaxy S');
const invalidCategory = guide('unlistedtype', broadSamsung);
assert.equal(invalidCategory.awaiting, 'category');
assert.equal(invalidCategory.narrow.scope.brand, 'Samsung');
const iphoneFamily = guide('16', guide('I want an iPhone'));
assert.match(iphoneFamily.text, /Yes, we have the iPhone 16 in our catalogue/);
assert.doesNotMatch(iphoneFamily.text, /have the 16 in/);

const tv = guide('tv');
has(tv, 'Samsung');
assert.match(tv.text, /^Yes, we have \*\*TVs\*\*/);
assert.match(guide('tvs').text, /^Yes, we have \*\*TVs\*\*/);
const lowercaseSamsungTv = guide('samsung', tv);
assert.match(lowercaseSamsungTv.text, /^Yes, we have \*\*Samsung\*\* TVs:/);
const samsungTv = guide('Samsung', tv);
// Generated Models families are rehomed before they become visitor labels.
for (const family of new Set(buildTree(products).filter(item => item.categoryId === 'tvs' && item.brand === 'Samsung').map(item => item.family))) has(samsungTv, family);
const qled = guide('QLED', samsungTv);
variant(byName('Samsung QLED TV'), qled);
unavailable('Samsung QLED 999', products.filter(item => item.categoryId === 'tvs' && item.brand === 'Samsung'), samsungTv);

assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../api/_chat/narrow.js'), 'utf8'), /iphone|galaxy|samsung|macbook|starlink|thinkpad|pixel/i);

(async () => {
  let modelCalls = 0;
  const service = createService({
    store: memoryStore(), now: () => Date.UTC(2026, 10, 12), salt: 'catalog narrowing test salt',
    chat: async () => { modelCalls += 1; throw new Error('narrowing must not call the model'); },
  });
  const session = await service.start('203.0.113.84');
  const turns = ['phone', 'Samsung', 'Galaxy S', 'S24', 'Onyx Black'];
  let response;
  for (let index = 0; index < turns.length; index += 1) {
    response = await service.turn(session.sessionId, session.proof, `narrow-${index}`, undefined, session.csrf, turns[index]);
    assert.ok(response.text, `${turns[index]}: service response`);
    assert.doesNotMatch(response.text, /Something went wrong|unable to respond/i);
  }
  assert.ok(response.text.includes(`Yes, we have the ${byName('Galaxy S24').name} in Onyx Black.`), 'service retains scope between all five turns');
  // Replay each independently asserted catalogue branch through the real service.
  // Separate stores keep the unchanged Preview/session quotas meaningful.
  for (const scenario of scenarios) {
    const branchService = createService({
      store: memoryStore(), now: () => Date.UTC(2026, 10, 12), salt: 'catalog branch salt',
      chat: async () => { modelCalls += 1; throw new Error('catalogue branch called model'); },
    });
    const branchSession = await branchService.start('203.0.113.85');
    let result;
    for (let index = 0; index < scenario.history.length; index += 1) {
      result = await branchService.turn(branchSession.sessionId, branchSession.proof, `branch-${index}`, undefined, branchSession.csrf, scenario.history[index]);
    }
    assert.equal(result.text, scenario.expected, `service branch: ${scenario.history.join(' -> ')}`);
  }
  const sizeStore = memoryStore();
  const sizeService = createService({
    store: sizeStore, now: () => Date.UTC(2026, 10, 12), salt: 'catalog size salt',
    chat: async () => { modelCalls += 1; throw new Error('session-size branch called model'); },
  });
  const sizeSession = await sizeService.start('203.0.113.86');
  for (const [index, text] of ['laptop', 'Lenovo', 'ThinkPad'].entries()) {
    await sizeService.turn(sizeSession.sessionId, sizeSession.proof, `size-${index}`, undefined, sizeSession.csrf, text);
    const context = await sizeStore.transaction(records => records.get('s:' + sizeSession.sessionId).context);
    assert.ok(Buffer.byteLength(JSON.stringify(context)) < 20000, `${text}: session context remains below 20 KB`);
    assert.ok(context.lastProducts.length <= 24);
    for (const product of context.lastProducts) {
      assert.ok(Object.keys(product).every(key => ['id', 'name', 'brand', 'family', 'categoryId', 'options'].includes(key)), 'persisted products contain only compact fields');
    }
    assert.ok(context.narrow.ids.length <= 200);
    assert.ok(context.narrow.labels.length <= 24);
  }
  assert.equal(modelCalls, 0);
  console.log('PASS catalogue narrowing: phones, laptops, accessories, kits, TVs, variants, nearest options and service scope');
})().catch(error => { console.error(error); process.exitCode = 1; });
