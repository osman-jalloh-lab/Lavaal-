import path from 'node:path';

export function normalizePathPart(value) {
  const output = String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return output || 'unknown';
}

export function productImageDirectory(rootDir, product) {
  return path.join(rootDir, 'images', 'catalog', normalizePathPart(product.category), normalizePathPart(product.brand), String(product.sourceProductId));
}

export function localImagePath(rootDir, product, number) {
  return path.join(productImageDirectory(rootDir, product), `${String(number).padStart(2, '0')}.webp`);
}

export function publicImagePath(product, number) {
  return `images/catalog/${normalizePathPart(product.category)}/${normalizePathPart(product.brand)}/${product.sourceProductId}/${String(number).padStart(2, '0')}.webp`;
}
