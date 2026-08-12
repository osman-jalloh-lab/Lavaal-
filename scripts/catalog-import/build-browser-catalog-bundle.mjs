import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputPath = path.join(rootDir, 'assets', 'data', 'catalog-generated.json');
const outputPath = path.join(rootDir, 'assets', 'data', 'catalog-generated.js');

function approved(product) {
  return product && product.integrationApproved === true &&
    product.identityStatus === 'verified' &&
    product.visualQaStatus === 'PASS' &&
    product.mediaUsageStatus === 'permitted' &&
    product.quarantined !== true;
}

function browserProduct(product) {
  const images = (product.images || [])
    .filter(image => image && typeof (image.path || image.src) === 'string')
    .map(image => ({ path: image.path || image.src, isMain: (image.path || image.src) === product.primaryImage }));
  return {
    category: product.category,
    brand: product.brand,
    family: product.family || null,
    series: product.series || null,
    name: product.name,
    modelNumber: product.modelNumber || null,
    mpn: product.mpn || null,
    gtin: product.gtin || null,
    sourceProductId: String(product.sourceProductId),
    shortDescription: product.shortDescription || '',
    specifications: product.specifications || [],
    primaryImage: product.primaryImage,
    images,
    integrationApproved: true,
    identityStatus: 'verified',
    visualQaStatus: 'PASS',
    mediaUsageStatus: 'permitted'
  };
}

const source = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const products = (source.products || []).filter(approved).map(browserProduct);
const payload = { schemaVersion: 1, generatedAt: source.generatedAt, products };
const output = '/* Generated from catalog-generated.json. Do not edit manually. */\n' +
  'window.LAVAALL_GENERATED_CATALOG = Object.freeze(' + JSON.stringify(payload) + ');\n';
await fs.writeFile(outputPath, output);
console.log(`Built browser catalog bundle with ${products.length} approved products.`);
