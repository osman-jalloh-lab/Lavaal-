import assert from 'node:assert/strict';
import { collectImageReferences, isValidWebPath, validateProductMedia } from './validate-product-media.mjs';

assert.equal(isValidWebPath('images/catalog/tablets/samsung/1/01.webp'), true);
assert.equal(isValidWebPath('images\\catalog\\bad.webp'), false);
assert.equal(isValidWebPath('C:\\catalog\\bad.webp'), false);
assert.deepEqual(collectImageReferences([{ id: 'legacy', image: 'images/products/category-tablets.webp' }]).map(item => item.path), ['images/products/category-tablets.webp']);
assert.deepEqual(collectImageReferences([{ id: 'imported', primaryImage: 'images/catalog/tablets/samsung/1/01.webp', images: [{ src: 'images/catalog/tablets/samsung/1/01.webp' }, { src: 'images/catalog/tablets/samsung/1/02.webp' }] }]).map(item => item.path), ['images/catalog/tablets/samsung/1/01.webp', 'images/catalog/tablets/samsung/1/02.webp']);
const audit = await validateProductMedia({ products: [{ id: 'valid', image: 'images/products/category-tablets.webp' }, { id: 'missing', primaryImage: 'images/catalog/tablets/samsung/1/01.webp' }] }, { rootDir: process.cwd() });
assert.equal(audit.validImages, 1);
assert.equal(audit.missingFiles.length, 1);
console.log('product media validator self-test: passed');
