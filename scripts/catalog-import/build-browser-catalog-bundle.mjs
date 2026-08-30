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

// Icecat frequently lists several real, distinct SKUs (different CPU,
// storage, colour, ...) under the exact same short model name -- e.g. six
// different Dell "M7520" configurations. Left as-is they render as what
// look like duplicate listings. For any (category, brand, name) group with
// more than one product, append the first spec that actually differs
// between them so each listing reads as a distinct, real variant.
function disambiguateDuplicateNames(products) {
  const groups = new Map();
  products.forEach(function (p) {
    const key = p.category + '|' + p.brand + '|' + String(p.name || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  groups.forEach(function (group) {
    if (group.length < 2) return;
    const specNamesSeen = [];
    group.forEach(function (p) {
      (p.specifications || []).forEach(function (s) {
        if (s && s.name && specNamesSeen.indexOf(s.name) === -1) specNamesSeen.push(s.name);
      });
    });
    let diffSpecName = null;
    for (const specName of specNamesSeen) {
      const values = new Set(group.map(function (p) {
        const match = (p.specifications || []).find(function (s) { return s.name === specName; });
        return match ? String(match.value).trim() : '';
      }));
      if (values.size > 1) { diffSpecName = specName; break; }
    }
    group.forEach(function (p) {
      let suffix = null;
      if (diffSpecName) {
        const match = (p.specifications || []).find(function (s) { return s.name === diffSpecName; });
        suffix = match ? String(match.value).trim() : null;
      }
      if (!suffix) suffix = p.mpn || p.modelNumber || p.sourceProductId;
      if (suffix) p.name = p.name + ' (' + suffix + ')';
    });
    // The single chosen spec may not fully separate every member (e.g. 5 of
    // 6 variants happen to share the same panel type). Guarantee a unique
    // display name by appending the MPN to whichever renamed products still
    // collide with each other.
    const byNewName = new Map();
    group.forEach(function (p) {
      const key = p.name.trim().toLowerCase();
      if (!byNewName.has(key)) byNewName.set(key, []);
      byNewName.get(key).push(p);
    });
    byNewName.forEach(function (stillColliding) {
      if (stillColliding.length < 2) return;
      stillColliding.forEach(function (p) {
        const mpn = p.mpn || p.modelNumber || p.sourceProductId;
        if (mpn) p.name = p.name + ' \u00b7 ' + mpn;
      });
    });
  });
}

const source = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const products = (source.products || []).filter(approved).map(browserProduct);
disambiguateDuplicateNames(products);
const payload = { schemaVersion: 1, generatedAt: source.generatedAt, products };
const output = '/* Generated from catalog-generated.json. Do not edit manually. */\n' +
  'window.LAVAALL_GENERATED_CATALOG = Object.freeze(' + JSON.stringify(payload) + ');\n';
await fs.writeFile(outputPath, output);
console.log(`Built browser catalog bundle with ${products.length} approved products.`);
