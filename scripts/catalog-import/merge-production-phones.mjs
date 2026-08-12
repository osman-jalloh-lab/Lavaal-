import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogPath = path.join(rootDir, 'assets', 'data', 'catalog-generated.json');
const reviewPath = path.join(rootDir, 'scripts', 'catalog-import', 'cache', 'samsung-phone-generated.local.json');

// This is the deliberately small, source-verified launch assortment. Image indexes
// are curated from the permitted local source files; excluded files remain local.
const curation = new Map([
  ['134687004', { keep: [1, 2, 3, 4], primary: 1 }],
  ['148400072', { keep: [2, 3, 4], primary: 2, excluded: [{ index: 1, reason: 'marketing-text-overlay' }] }],
  ['148400062', { keep: [2, 3, 4], primary: 2, excluded: [{ index: 1, reason: 'marketing-text-overlay' }] }],
  ['148400059', { keep: [2, 3, 4], primary: 2, excluded: [{ index: 1, reason: 'marketing-text-overlay' }] }],
  ['132622687', { keep: [1, 2, 3, 4], primary: 1 }],
  ['132622684', { keep: [1, 2, 3, 4], primary: 1 }],
  ['142313844', { keep: [1, 2, 3, 4], primary: 1 }],
  ['141819608', { keep: [1, 2, 3, 4], primary: 1 }],
  ['134662666', { keep: [1, 2, 3, 4], primary: 1 }]
]);

const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const review = JSON.parse(await fs.readFile(reviewPath, 'utf8'));
const candidates = new Map((review.products ?? []).map(product => [String(product.sourceProductId), product]));
const existing = new Set((catalog.products ?? []).map(product => String(product.sourceProductId)));
const products = [];

for (const [id, selection] of curation) {
  const product = candidates.get(id);
  if (!product) throw new Error(`Missing reviewed Samsung phone ${id}`);
  if (existing.has(id)) throw new Error(`Duplicate production product ${id}`);
  if (product.category !== 'phones' || product.sourceSupplierName !== 'Samsung' || product.sourceSupplierId !== '26') {
    throw new Error(`Identity gate failed for ${id}`);
  }
  if (!product.mpn || !(product.gtins ?? []).includes(product.gtin) || product.mediaUsageStatus !== 'permitted') {
    throw new Error(`Identity/media gate failed for ${id}`);
  }
  const byIndex = new Map((product.images ?? []).map(image => [Number(path.basename(image.path, '.webp')), image]));
  const images = selection.keep.map(index => byIndex.get(index));
  if (images.some(image => !image?.path || image.mediaUsageStatus !== 'permitted')) throw new Error(`Curated media gate failed for ${id}`);
  const primaryImage = byIndex.get(selection.primary)?.path;
  if (!primaryImage || !images.some(image => image.path === primaryImage)) throw new Error(`Primary media gate failed for ${id}`);

  products.push({
    ...product,
    images: images.map(image => ({ ...image, isMain: image.path === primaryImage })),
    primaryImage,
    excludedImages: (selection.excluded ?? []).map(({ index, reason }) => ({ path: byIndex.get(index)?.path, qaStatus: 'excluded', qaReason: reason })),
    identityStatus: 'verified',
    visualQaStatus: 'PASS',
    integrationApproved: true,
    productionApprovedAt: new Date().toISOString()
  });
  delete products[products.length - 1].visualQAStatus;
}

catalog.products = [...(catalog.products ?? []), ...products];
catalog.generatedAt = new Date().toISOString();
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Merged ${products.length} curated Samsung phones into the production catalog.`);
