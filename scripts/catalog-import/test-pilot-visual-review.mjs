import assert from 'node:assert/strict';
import { curatePilotForVisualQA, splitPilotForReview } from './build-pilot-visual-review.mjs';

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
const curated = curatePilotForVisualQA([{ sourceProductId: '130695305', primaryImage: 'images/catalog/tvs/hisense/130695305/01.webp', images: ['01.webp', '02.webp', '03.webp', '04.webp'].map(path => ({ path })) }]);
assert.equal(curated[0].images.length, 1);
assert.equal(curated[0].primaryImage, '02.webp');
assert.equal(curated[0].visualQa.status, 'REVIEW');
assert.deepEqual(curated[0].visualQa.excludedImages.map(image => image.qaReason), ['marketing-heavy', 'near-duplicate', 'marketing-heavy']);
console.log('pilot visual review self-test: passed');
