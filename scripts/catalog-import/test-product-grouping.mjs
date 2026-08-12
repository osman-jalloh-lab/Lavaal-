import assert from 'node:assert/strict';
import { buildVariantGroups, proposePilot } from './lib/product-grouping.mjs';
const base = { lavaallCategory: 'computers', brand: 'Dell', productName: 'PB16250', reviewStatus: 'review', officialMpn: 'A', officialGtins: ['1'], icecatId: '1', specifications: [{ name: 'Processor family', value: 'A' }], galleryMetadata: { permittedCount: 1 }, selected: false };
const variant = { ...base, officialMpn: 'B', officialGtins: ['2'], icecatId: '2', specifications: [{ name: 'Processor family', value: 'B' }] };
const duplicate = { ...base }; const refurbished = { ...base, productName: 'PB14250', officialMpn: 'C', officialGtins: ['3'], icecatId: '3', conditionEvidence: 'Refurbished' };
const groups = buildVariantGroups([base, variant, duplicate, refurbished]); assert.equal(groups.length, 2); assert.equal(groups[0].variants.length, 2); assert.equal(groups[0].differences.length, 1); assert.equal(groups[0].sourceGroupName, 'PB16250');
const result = proposePilot(groups); assert.ok(result.deferred.some(item => item.icecatId === '3')); assert.ok(result.proposals.every(item => item.selected === false && item.proposed === true));
console.log('product grouping self-test: passed');
