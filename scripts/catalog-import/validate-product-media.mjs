import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

export function isValidWebPath(value) {
  return typeof value === 'string' && /^images\/[A-Za-z0-9._/-]+$/.test(value) && !value.includes('\\') && !value.includes('..');
}

export function collectImageReferences(products) {
  return products.flatMap(product => {
    const images = Array.isArray(product.images) ? product.images : [];
    const fromImages = images.map(image => ({ product, path: typeof image === 'string' ? image : image?.src ?? image?.path ?? null }));
    if (fromImages.length) return fromImages;
    const legacy = product.primaryImage ?? product.image ?? null;
    return legacy ? [{ product, path: legacy }] : [];
  });
}

function probe(file) {
  return new Promise(resolve => {
    const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', file]);
    child.once('error', () => resolve(false));
    child.once('exit', code => resolve(code === 0));
  });
}

export async function validateProductMedia(catalog, options = {}) {
  const root = options.rootDir ?? rootDir;
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const references = collectImageReferences(products);
  const result = {
    totalProducts: products.length, totalImageReferences: references.length, validImages: 0,
    missingFiles: [], zeroByteFiles: [], undecodableFiles: [], duplicateLocalPaths: [],
    invalidWebPaths: [], productsWithZeroImages: [], productsWithOneImage: [], productsWithMultipleImages: []
  };
  const seen = new Map();
  for (const product of products) {
    const count = collectImageReferences([product]).length;
    const identity = product.id ?? product.sourceProductId ?? product.name ?? 'unknown-product';
    if (!count) result.productsWithZeroImages.push(identity);
    else if (count === 1) result.productsWithOneImage.push(identity);
    else result.productsWithMultipleImages.push(identity);
  }
  for (const reference of references) {
    const identity = reference.product.id ?? reference.product.sourceProductId ?? reference.product.name ?? 'unknown-product';
    if (!isValidWebPath(reference.path)) { result.invalidWebPaths.push({ product: identity, path: reference.path }); continue; }
    const local = path.join(root, ...reference.path.split('/'));
    const existing = seen.get(reference.path) ?? [];
    existing.push(identity); seen.set(reference.path, existing);
    try {
      const stats = await fs.stat(local);
      if (!stats.size) { result.zeroByteFiles.push({ product: identity, path: reference.path }); continue; }
      if (!await probe(local)) { result.undecodableFiles.push({ product: identity, path: reference.path }); continue; }
      result.validImages += 1;
    } catch { result.missingFiles.push({ product: identity, path: reference.path }); }
  }
  for (const [webPath, productsUsingPath] of seen) if (productsUsingPath.length > 1) result.duplicateLocalPaths.push({ path: webPath, products: productsUsingPath });
  return result;
}

async function main() {
  const catalogPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, 'assets/data/catalog-generated.json');
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  const result = await validateProductMedia(catalog);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.missingFiles.length || result.zeroByteFiles.length || result.undecodableFiles.length || result.invalidWebPaths.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
