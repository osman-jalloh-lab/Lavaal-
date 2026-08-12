import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogPath = path.join(rootDir, 'assets', 'data', 'catalog-generated.json');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
for (const product of catalog.products || []) {
  // Normalise an old camel-casing variant so case-insensitive JSON tooling
  // (including PowerShell) can consume the canonical production artifact.
  if (product.visualQaStatus == null && product.visualQAStatus != null) product.visualQaStatus = product.visualQAStatus;
  delete product.visualQAStatus;
}
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Normalised ${catalog.products?.length || 0} production catalog products.`);
