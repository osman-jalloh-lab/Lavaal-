import assert from 'node:assert/strict';
import { findDuplicate, rememberProduct } from './lib/identity.mjs';
import { collectApprovedGalleryImages, mediaSkipReason } from './download-images.mjs';
import { normalizeIcecatProduct } from './normalize-product.mjs';
import { assertApprovedPilotSeed, validateLockedProductIdentity, validateSeed } from './import-products.mjs';

const sampleXml = `<?xml version="1.0"?><ICECAT-interface><Product Product_ID="123" Brand="Example" Name="Example Tablet" Prod_id="TAB-1" ReleaseDate="2024-01-01"><Category ID="test-tablets"/><EanCode EAN="1234567890123"/><Feature Name="Memory" Value="128" Measure="GB"/><ProductGallery><ProductPicture Original="https://example.invalid/one.jpg" IsMain="Y" PicWidth="1000" PicHeight="700"/><ProductPicture Original="https://example.invalid/two.jpg" IsRich="Y"/></ProductGallery></Product></ICECAT-interface>`;
const product = normalizeIcecatProduct(sampleXml, { categoryMap: { mappings: [{ sourceCategoryId: 'test-tablets', lavaallCategory: 'tablets' }] } });
assert.equal(product.id, 'icecat-123'); assert.equal(product.category, 'tablets'); assert.equal(product.gtin, '1234567890123');
assert.deepEqual(product.gtins, ['1234567890123']); assert.equal(product.sourceSupplierName, 'Example'); assert.equal(product.sourceSupplierId, null);
assert.equal(product.specifications[0].name, 'Memory'); assert.equal(product._gallery.length, 2); assert.equal(mediaSkipReason(product._gallery[1]), 'restricted-image');
const skippedGallery = [];
const recoveredGallery = await collectApprovedGalleryImages([
  { sourceUrl: 'https://example.invalid/one', isRich: true },
  { sourceUrl: 'https://example.invalid/two', expirationDate: '2000-01-01' },
  { sourceUrl: null },
  { sourceUrl: 'https://example.invalid/four', isRich: true },
  { sourceUrl: 'https://example.invalid/five' },
  { sourceUrl: 'https://example.invalid/six' },
  { sourceUrl: 'https://example.invalid/seven' },
  { sourceUrl: 'https://example.invalid/eight' }
], {
  maxImages: 4,
  onSkipped: (_image, reason) => skippedGallery.push(reason),
  download: async (image, number) => ({ path: `images/test/${number}.webp`, sourceUrl: image.sourceUrl, isMain: number === 1 })
});
assert.deepEqual(recoveredGallery.map(image => image.sourceUrl), [
  'https://example.invalid/five', 'https://example.invalid/six', 'https://example.invalid/seven', 'https://example.invalid/eight'
]);
assert.deepEqual(skippedGallery, ['restricted-image', 'expired-image', 'invalid-image', 'restricted-image']);
const seen = new Map(); rememberProduct(product, seen); assert.ok(findDuplicate({ ...product, id: 'other' }, seen).duplicate);
assert.equal(findDuplicate({ brand: 'Brand A', mpn: 'SHARED' }, new Map()).duplicate, null);
const brandMpnSeen = new Map(); rememberProduct({ id: 'brand-a', brand: 'Brand A', mpn: 'SHARED' }, brandMpnSeen);
assert.equal(findDuplicate({ id: 'brand-b', brand: 'Brand B', mpn: 'SHARED' }, brandMpnSeen).duplicate, null);
assert.ok(validateSeed({ limits: { maxProducts: 1, maxImagesPerProduct: 4 }, targets: [{ lavaallCategory: 'tablets', brand: 'Example', identifiers: [{ type: 'icecat-id', value: '123' }] }] }).length === 0);
assert.ok(validateSeed({ limits: { maxProducts: 1, maxImagesPerProduct: 4 }, targets: [{ lavaallCategory: 'tablets', brand: 'Example', identifiers: [{ type: 'icecat-id', value: 'REPLACE_WITH_REAL_ID' }] }] }).includes('invalid-identifier'));
const pilot = { approved: Array.from({ length: 19 }, (_, index) => ({ icecatId: String(index + 1), approved: true })) };
assert.doesNotThrow(() => assertApprovedPilotSeed({ targets: [{ identifiers: pilot.approved.map(item => ({ value: item.icecatId })) }] }, pilot));
assert.throws(() => assertApprovedPilotSeed({ targets: [{ identifiers: [{ value: '1' }] }] }, pilot), /exactly match/);
const locked = { brand: 'Lenovo', mpn: '21XE000VGE', gtin: '0199275463945' };
assert.deepEqual(validateLockedProductIdentity({ brand: 'Lenovo', mpn: '21XE000VGE', gtins: ['0199275463945'] }, locked), { valid: true });
assert.equal(validateLockedProductIdentity({ brand: 'R-Go Tools', mpn: '21XE000VGE', gtins: ['0199275463945'] }, locked).reason, 'source-supplier-mismatch');
assert.equal(validateLockedProductIdentity({ brand: 'Lenovo', sourceSupplierName: 'R-Go Tools', mpn: '21XE000VGE', gtins: ['0199275463945'] }, locked).reason, 'source-supplier-mismatch');
assert.equal(validateLockedProductIdentity({ brand: 'Lenovo', mpn: 'DIFFERENT', gtins: ['0199275463945'] }, locked).reason, 'source-mpn-mismatch');
assert.equal(validateLockedProductIdentity({ brand: 'Lenovo', mpn: '21XE000VGE', gtins: ['0000000000000'] }, locked).reason, 'source-gtin-mismatch');
assert.equal(validateLockedProductIdentity({ brand: 'Lenovo Compatible Accessory', mpn: '21XE000VGE', gtins: ['0199275463945'] }, locked).reason, 'source-supplier-mismatch');
assert.equal(validateLockedProductIdentity({ brand: 'Lenovo', category: 'accessories', mpn: '21XE000VGE', gtins: ['0199275463945'] }, { ...locked, category: 'computers' }).reason, 'source-category-mismatch');
assert.equal(validateLockedProductIdentity({ brand: 'Lenovo', category: 'computers', limited: true, mpn: '21XE000VGE', gtins: ['0199275463945'] }, { ...locked, category: 'computers' }).reason, 'restricted-product');
assert.deepEqual(validateLockedProductIdentity({ brand: 'Lenovo', category: 'computers', mpn: '21XE000VGE', gtins: ['0199275463945', '0000000000000'] }, { ...locked, category: 'computers' }), { valid: true });
console.log('catalog-import self-test: passed');
