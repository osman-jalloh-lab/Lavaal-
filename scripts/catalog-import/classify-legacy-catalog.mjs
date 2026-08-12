import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataPath = path.join(rootDir, 'assets', 'js', 'catalog-data.js');
const outputPath = path.join(rootDir, 'scripts', 'catalog-import', 'legacy-catalog-classification.json');
const source = await fs.readFile(dataPath, 'utf8');
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.__catalog = CATALOG;`, context, { filename: dataPath });

const generated = JSON.parse(await fs.readFile(path.join(rootDir, 'assets', 'data', 'catalog-generated.json'), 'utf8'));
const verifiedNames = new Set((generated.products || []).filter(product => product.integrationApproved === true).map(product => `${product.brand} ${product.name}`.toLowerCase()));
const approvedCategoryArt = new Set(['fiber-optic-cable', 'structured-cabling', 'refrigerator-compact']);
const records = [];

for (const category of context.globalThis.__catalog) {
  for (const brand of category.brands) for (const family of brand.families) for (const model of family.models) {
    const displayName = `${brand.name} ${model.name}`.toLowerCase();
    const hasIdentity = Boolean(model.sourceProductId && (model.mpn || model.modelNumber) && model.gtin);
    const hasProvenance = Boolean(model.imageSource || model.mediaUsageStatus === 'permitted');
    let classification = 'SOURCING_ONLY';
    if (brand.name === 'Apple') classification = 'BLOCKED_SOURCE';
    else if (verifiedNames.has(displayName)) classification = 'VERIFIED_EQUIVALENT_EXISTS';
    else if (model.image && !approvedCategoryArt.has(model.id) && (!hasIdentity || !hasProvenance)) classification = 'MISLEADING_OR_LOW_VALUE';
    records.push({
      id: model.id, category: category.id, brand: brand.name, family: family.name,
      modelName: model.name, existingSpecLine: model.specLine || '', existingImage: model.image || null,
      sourceProductId: model.sourceProductId || null, mpn: model.mpn || model.modelNumber || null, gtin: model.gtin || null,
      exactSkuClaim: false, customerFacingRoute: `#products/${category.id}/${String(brand.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}/${String(family.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      classification, listingType: 'sourcing', reason: hasIdentity && hasProvenance ? 'Legacy record needs structured verification before exact-SKU presentation.' : 'No authoritative identity and permitted exact-media provenance in handwritten catalog.'
    });
  }
}
const counts = Object.fromEntries(['VERIFIED_EQUIVALENT_EXISTS', 'CAN_VERIFY_TODAY', 'SOURCING_ONLY', 'DUPLICATE', 'MISLEADING_OR_LOW_VALUE', 'BLOCKED_SOURCE'].map(key => [key, records.filter(record => record.classification === key).length]));
await fs.writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), policy: 'Legacy records without authoritative identity and permitted exact media are customer-facing sourcing listings, not verified exact SKUs.', counts, records }, null, 2)}\n`);
console.log(`Classified ${records.length} legacy records.`);
