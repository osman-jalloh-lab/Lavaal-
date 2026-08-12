import assert from 'node:assert/strict';
import { approvedGeneratedCatalog } from './adapt-generated-catalog.mjs';
const base = { sourceProductId: '1', category: 'phones', brand: 'Samsung', family: 'Galaxy S', name: 'Galaxy S', mpn: 'SM-1', gtin: '1', source: 'open-icecat', mediaUsageStatus: 'permitted', primaryImage: 'images/1.webp', images: [{ path: 'images/1.webp' }], specifications: [{ name: 'Internal storage capacity', value: '128', unit: 'GB' }] };
assert.equal(approvedGeneratedCatalog({ products: [base] }).length, 0);
assert.equal(approvedGeneratedCatalog({ products: [{ ...base, integrationApproved: true }] })[0].brands[0].families[0].models[0].sourceProductId, '1');
assert.equal(approvedGeneratedCatalog({ products: [{ ...base, integrationApproved: true, identityStatus: 'quarantined' }] }).length, 0);
console.log('generated catalog adapter self-test: passed');
