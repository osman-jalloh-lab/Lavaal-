import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productIdentity } from './lib/identity.mjs';
import { imageDimensions } from './download-images.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowedCategories = new Set(['phones', 'tablets', 'computers', 'tvs', 'monitors', 'gaming', 'audio', 'watches', 'cameras', 'printers', 'networking', 'servers', 'refrigeration', 'accessories']);

export async function validateCatalog(catalog, options = {}) {
  const errors = []; const seen = new Map(); const baseDir = options.rootDir ?? rootDir;
  for (const product of catalog.products ?? []) {
    if (!product.sourceProductId) errors.push({ id: product.id, reason: 'missing-source-product-id' });
    if (!allowedCategories.has(product.category)) errors.push({ id: product.id, reason: 'unmapped-category' });
    if (!product.brand?.trim()) errors.push({ id: product.id, reason: 'missing-brand' });
    if (!product.name?.trim()) errors.push({ id: product.id, reason: 'missing-name' });
    if (product.source !== 'open-icecat') errors.push({ id: product.id, reason: 'invalid-source' });
    const identity = productIdentity(product);
    if (!identity) errors.push({ id: product.id, reason: 'missing-stable-identity' });
    else if (seen.has(identity.key)) errors.push({ id: product.id, reason: identity.type === 'gtin' ? 'duplicate-gtin' : identity.type === 'brand-mpn' ? 'duplicate-brand-mpn' : 'duplicate-source-product-id' });
    else seen.set(identity.key, product.id);
    const images = product.images ?? [];
    if (product.primaryImage && !images.some(image => image.path === product.primaryImage)) errors.push({ id: product.id, reason: 'primary-image-not-in-gallery' });
    for (const image of images) {
      if (image.mediaUsageStatus !== 'permitted') errors.push({ id: product.id, reason: 'restricted-image-referenced' });
      const absolute = path.join(baseDir, image.path);
      try {
        const stat = await fs.stat(absolute); if (!stat.size) throw new Error('zero');
        const dimensions = await imageDimensions(absolute); if (!dimensions.width || !dimensions.height) throw new Error('dimensions');
      } catch { errors.push({ id: product.id, reason: 'invalid-image' }); }
    }
  }
  return errors;
}

async function main() {
  const file = process.argv[2] ?? path.join(rootDir, 'assets', 'data', 'catalog-generated.json');
  const catalog = JSON.parse(await fs.readFile(file, 'utf8')); const errors = await validateCatalog(catalog);
  if (errors.length) { console.error(JSON.stringify({ valid: false, errors }, null, 2)); process.exitCode = 1; }
  else console.log(JSON.stringify({ valid: true, products: catalog.products?.length ?? 0 }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
