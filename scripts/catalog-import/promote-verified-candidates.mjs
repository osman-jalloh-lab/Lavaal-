import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogPath = path.join(root, 'assets/data/catalog-generated.json');
const reportPath = path.join(root, 'scripts/catalog-import/reports/candidate-promotion-import.json');
const allowed = new Set(['137510906', '120862582', '139920272']);
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const existing = new Set((catalog.products || []).map(product => String(product.sourceProductId)));
const additions = (report.products || []).map(item => item.product).filter(product => allowed.has(String(product.sourceProductId))).map(product => ({
  ...product, identityStatus: 'verified', visualQaStatus: 'PASS', integrationApproved: true,
  productionApprovedAt: new Date().toISOString()
}));
if (additions.length !== allowed.size || additions.some(product => existing.has(String(product.sourceProductId)))) throw new Error('Candidate promotion set is incomplete or duplicates production.');
for (const product of additions) {
  if (!product.sourceSupplierName || product.mediaUsageStatus !== 'permitted' || !product.primaryImage || product.images.length < 1 || !product.mpn || !product.gtin) throw new Error(`Production gate failed: ${product.sourceProductId}`);
}
catalog.products.push(...additions); catalog.generatedAt = new Date().toISOString();
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Promoted ${additions.length} verified candidates.`);
