import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogPath = path.join(rootDir, 'assets', 'data', 'catalog-generated.json');
const approvedPilotIds = new Set([
  '134687128', '134687130', '134687132', '134688919',
  '131194172', '131193979', '131192058', '132385656', '132906013', '132385729',
  '149919314', '130590632', '79453785', '79809054', '55170975', '36393926',
  '120583473', '130695305', '130728217'
]);
const quarantinedIds = new Set(['145145130', '145145101']);

const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
for (const product of catalog.products ?? []) {
  const id = String(product.sourceProductId);
  if (quarantinedIds.has(id)) throw new Error(`Quarantined product present: ${id}`);
  if (!approvedPilotIds.has(id)) continue;
  if (product.mediaUsageStatus !== 'permitted' || !product.primaryImage || !(product.images ?? []).some(image => (image.path ?? image.src) === product.primaryImage)) {
    throw new Error(`Production gate failed for ${id}`);
  }
  product.identityStatus = 'verified';
  product.visualQaStatus = 'PASS';
  product.integrationApproved = true;
}
const approved = (catalog.products ?? []).filter(product => product.integrationApproved === true);
if (approved.length !== approvedPilotIds.size || approved.some(product => !approvedPilotIds.has(String(product.sourceProductId)))) throw new Error('Unexpected approved production set.');
catalog.generatedAt = new Date().toISOString();
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Prepared ${approved.length} verified pilot products for production.`);
