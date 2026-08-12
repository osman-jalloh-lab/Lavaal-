import assert from 'node:assert/strict';
import { splitPilotForReview } from './build-pilot-visual-review.mjs';

const selection = { quarantined: [{ icecatId: 'q1', reason: 'source-supplier-mismatch' }, { icecatId: 'q2', reason: 'source-supplier-mismatch' }] };
const catalog = { products: [
  ...Array.from({ length: 17 }, (_, index) => ({ sourceProductId: `valid-${index}` })),
  { sourceProductId: 'q1', brand: 'R-Go Tools', name: 'Mismatch one' },
  { sourceProductId: 'q2', brand: 'R-Go Tools', name: 'Mismatch two' }
] };
const review = splitPilotForReview(catalog, selection);
assert.equal(review.valid.length, 17);
assert.equal(review.quarantined.length, 2);
assert.deepEqual(review.quarantined.map(product => product.icecatId), ['q1', 'q2']);
console.log('pilot visual review self-test: passed');
