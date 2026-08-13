import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogPath = path.join(root, 'assets/data/catalog-generated.json');
const reviewPaths = process.argv.slice(2);
const quarantinedIds = new Set(['145145130', '145145101']);
const displayBrands = new Map([['DELL', 'Dell']]);
// These reviewed source assets are intentionally declared here rather than
// promoted wholesale from an importer cache. Each set was visually reviewed
// against the exact XML-verified SKU before it can enter production.
const reviewedMonitorImages = new Map([
  ['143869546', [1, 2, 3, 4]], ['141908412', [1, 2, 3, 4]],
  ['129621622', [1, 2, 3, 4]], ['143869544', [1, 2, 3, 4]],
  ['149804904', [1, 2, 3, 4]], ['128735604', [1, 2]],
  ['125298849', [1, 2]], ['130803576', [1, 2, 3, 4]],
  ['130808294', [1, 2, 3, 4]]
]);

if (!reviewPaths.length) throw new Error('Provide one or more reviewed promotion JSON files.');

const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const existing = new Set((catalog.products || []).map(product => String(product.sourceProductId)));
const candidates = [];
for (const reviewPath of reviewPaths) {
  const review = JSON.parse(await fs.readFile(path.resolve(root, reviewPath), 'utf8'));
  for (const candidate of review.products || []) candidates.push(candidate.product || candidate);
}

for (const product of candidates) {
  const selected = reviewedMonitorImages.get(String(product.sourceProductId));
  if (!selected) continue;
  const images = (product.images || []).filter(image => selected.includes(Number(path.basename(image.path, '.webp'))));
  if (images.length !== selected.length) throw new Error(`Reviewed monitor media missing: ${product.sourceProductId}`);
  product.images = images;
  product.primaryImage = images[0].path;
  product.curation = {
    qaStatus: 'PASS',
    excludedImages: selected.length === 2
      ? { '3': 'marketing-heavy-or-feature-diagram', '4': 'marketing-heavy-or-feature-diagram' }
      : {}
  };
}

const seen = new Set();
for (const product of candidates) {
  const id = String(product.sourceProductId || '');
  const images = product.images || [];
  if (!id || quarantinedIds.has(id)) throw new Error(`Quarantined or missing source ID: ${id || '(missing)'}`);
  if (existing.has(id) || seen.has(id)) throw new Error(`Duplicate production source ID: ${id}`);
  if (product.source !== 'open-icecat' || !product.category || !product.brand || !product.name || !product.sourceSupplierName || !product.sourceSupplierId || !product.mpn || !product.gtin) {
    throw new Error(`Identity/provenance gate failed: ${id}`);
  }
  if (product.mediaUsageStatus !== 'permitted' || !product.primaryImage || !images.length || !images.some(image => image.path === product.primaryImage) || images.some(image => image.mediaUsageStatus !== 'permitted')) {
    throw new Error(`Media gate failed: ${id}`);
  }
  if (product.conditionEvidence) throw new Error(`Condition gate failed: ${id}`);
  const visualStatus = product.visualQaStatus || product.curation?.qaStatus;
  if (visualStatus !== 'PASS') throw new Error(`Visual QA gate failed: ${id}`);
  seen.add(id);
}

const approvedAt = new Date().toISOString();
for (const candidate of candidates) {
  catalog.products.push({
    ...candidate,
    brand: displayBrands.get(candidate.brand) || candidate.brand,
    identityStatus: 'verified',
    visualQaStatus: 'PASS',
    integrationApproved: true,
    productionApprovedAt: approvedAt
  });
}
catalog.generatedAt = approvedAt;
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Promoted ${candidates.length} reviewed products.`);
