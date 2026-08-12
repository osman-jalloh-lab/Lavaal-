import assert from 'node:assert/strict';
import selection from './pilot-selection.json' with { type: 'json' };
import { seedFromPilotSelection } from './build-pilot-seed.mjs';

const seed = seedFromPilotSelection(selection);
const seedIds = seed.targets.flatMap(target => target.identifiers.map(identifier => identifier.value));
assert.equal(selection.approved.length, 19);
assert.equal(selection.selectionDeferred.length, 7);
assert.equal(selection.conditionDeferred.length, 5);
assert.equal(selection.quarantined.length, 2);
assert.equal(seedIds.length, 19);
assert.deepEqual(new Set(seedIds), new Set(selection.approved.map(product => product.icecatId)));
assert.throws(() => seedFromPilotSelection({ approved: selection.approved.slice(0, 18) }), /final 19-product/);
assert.throws(() => seedFromPilotSelection({ approved: [...selection.approved.slice(0, 18), { ...selection.approved[18], icecatId: 'unexpected' }] }), /final 19-product/);
console.log('pilot selection self-test: passed');
