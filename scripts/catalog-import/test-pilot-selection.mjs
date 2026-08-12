import assert from 'node:assert/strict';
import selection from './pilot-selection.json' with { type: 'json' };
import { seedFromPilotSelection } from './build-pilot-seed.mjs';

const seed = seedFromPilotSelection(selection);
const seedIds = seed.targets.flatMap(target => target.identifiers.map(identifier => identifier.value));
assert.equal(selection.approved.length, 19);
assert.equal(seedIds.length, 19);
assert.deepEqual(new Set(seedIds), new Set(selection.approved.map(product => product.icecatId)));
assert.throws(() => seedFromPilotSelection({ approved: selection.approved.slice(0, 18) }), /exactly 19/);
console.log('pilot selection self-test: passed');
