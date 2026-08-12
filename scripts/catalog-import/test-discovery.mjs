import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamIndex } from './lib/index-parser.mjs';
import { discoverRecords, seedFromDiscovery } from './lib/discovery.mjs';

const base = path.dirname(fileURLToPath(import.meta.url)); const records = [];
await streamIndex(path.join(base, 'fixtures', 'fake-icecat-index.xml'), record => records.push(record));
assert.equal(records.length, 7); assert.deepEqual(records[0].gtins, ['1000000000001']); assert.equal(records[0].mpn, 'FAKE-TAB-A');
const options = { targets: [{ lavaallCategory: 'tablets', brands: ['FAKE_BRAND', 'MISSING_BRAND'] }], suppliers: [{ id: '10', name: 'FAKE_BRAND' }, { id: '20', name: 'OTHER_FAKE_BRAND' }], categoryMap: { mappings: [{ sourceCategoryId: '100', lavaallCategory: 'tablets' }] }, market: 'US', onMarketOnly: true, maxCandidatesPerTarget: 1, categories: [{ id: '999', name: 'FAKE UNKNOWN' }] };
const discovery = discoverRecords(records, options);
assert.equal(discovery.unresolvedBrands[0].reason, 'unresolved-brand'); assert.equal(discovery.targets.length, 1); assert.equal(discovery.targets[0].candidates.length, 1);
assert.equal(discovery.targets[0].candidates[0].icecatId, '9001'); assert.equal(discovery.targets[0].candidates[0].selected, false);
assert.ok(discovery.proposedCategoryMap.some(item => item.sourceCategoryId === '999' && item.sourceCategoryName === 'FAKE UNKNOWN'));
assert.equal(seedFromDiscovery(discovery).targets.length, 0); discovery.targets[0].candidates[0].selected = true;
const seed = seedFromDiscovery(discovery); assert.equal(seed.targets[0].identifiers[0].type, 'gtin'); assert.equal(seed.targets[0].identifiers[0].value, '1000000000001');
console.log('catalog discovery self-test: passed');
