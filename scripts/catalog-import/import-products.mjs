import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentialsFromEnv, fetchProductXml, IcecatConfigurationError } from './lib/icecat-client.mjs';
import { findDuplicate, normalizeIdentityPart, rememberProduct } from './lib/identity.mjs';
import { createReport, addFailed, addImageSkipped, addSkipped, writeReport } from './lib/logger.mjs';
import { normalizeIcecatProduct } from './normalize-product.mjs';
import { downloadPermittedImages } from './download-images.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url)); const rootDir = path.resolve(scriptDir, '../..');
function arg(name) { const index = process.argv.indexOf(name); return index === -1 ? null : process.argv[index + 1]; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export function assertApprovedPilotSeed(seed, selection) {
  const approved = new Set((selection.approved ?? []).filter(item => item.approved).map(item => String(item.icecatId)));
  const seedIds = seed.targets.flatMap(target => target.identifiers.map(identifier => String(identifier.value)));
  if (approved.size !== 19 || seedIds.length !== 19 || seedIds.some(id => !approved.has(id)) || approved.size !== new Set(seedIds).size) {
    throw new Error('Seed does not exactly match the 19-product pilot approval.');
  }
}

export function validateLockedProductIdentity(product, approval) {
  const normalize = value => normalizeIdentityPart(value);
  if (!approval) return { valid: true };
  if (product.limited || product.mediaUsageStatus === 'restricted') return { valid: false, reason: 'restricted-product' };
  if (normalize(product.sourceSupplierName ?? product.brand) !== normalize(approval.brand)) return { valid: false, reason: 'source-supplier-mismatch' };
  if (approval.category && product.category !== approval.category) return { valid: false, reason: 'source-category-mismatch' };
  if (approval.mpn && normalize(product.mpn) !== normalize(approval.mpn)) return { valid: false, reason: 'source-mpn-mismatch' };
  const sourceGtins = new Set((product.gtins ?? [product.gtin]).map(normalize));
  if (approval.gtin && !sourceGtins.has(normalize(approval.gtin))) return { valid: false, reason: 'source-gtin-mismatch' };
  return { valid: true };
}

export function validateSeed(seed) {
  const errors = []; const categories = new Set(['phones', 'tablets', 'computers', 'tvs', 'monitors', 'gaming', 'audio', 'watches', 'cameras', 'printers', 'networking', 'servers', 'refrigeration', 'accessories']);
  if (!Array.isArray(seed.targets) || !seed.targets.length) errors.push('missing-targets');
  if (!Number.isInteger(seed.limits?.maxProducts) || seed.limits.maxProducts < 1) errors.push('invalid-max-products');
  if (!Number.isInteger(seed.limits?.maxImagesPerProduct) || seed.limits.maxImagesPerProduct < 0 || seed.limits.maxImagesPerProduct > 4) errors.push('invalid-max-images');
  for (const target of seed.targets ?? []) {
    if (!categories.has(target.lavaallCategory)) errors.push('unmapped-category');
    if (!target.brand?.trim()) errors.push('missing-brand');
    for (const identifier of target.identifiers ?? []) {
      if (!['icecat-id', 'gtin', 'mpn-and-brand'].includes(identifier.type) || !identifier.value?.trim() || /^REPLACE_WITH_REAL_/i.test(identifier.value)) errors.push('invalid-identifier');
    }
  }
  return errors;
}

async function main() {
  const seedPath = path.resolve(arg('--seed') ?? path.join(scriptDir, 'catalog-seed.json')); const dryRun = process.argv.includes('--dry-run'); const validateOnly = process.argv.includes('--validate-seed');
  const seed = JSON.parse(await fs.readFile(seedPath, 'utf8')); const report = createReport(); const errors = validateSeed(seed);
  let selection = null;
  if (arg('--pilot-selection')) {
    selection = JSON.parse(await fs.readFile(path.resolve(arg('--pilot-selection')), 'utf8'));
    assertApprovedPilotSeed(seed, selection);
  }
  report.requested = (seed.targets ?? []).reduce((sum, target) => sum + (target.identifiers?.length ?? 0), 0);
  if (errors.length) {
    errors.forEach(reason => addFailed(report, { seed: seedPath }, reason));
    console.error(JSON.stringify({ valid: false, errors }, null, 2));
    console.log(`Report: ${await writeReport(path.join(scriptDir, 'reports'), report)}`);
    process.exitCode = 1; return;
  }
  if (dryRun || validateOnly) {
    console.log(JSON.stringify({ valid: true, mode: validateOnly ? 'validate-seed' : 'dry-run', requested: report.requested }, null, 2));
    console.log(`Report: ${await writeReport(path.join(scriptDir, 'reports'), report)}`);
    return;
  }
  let credentials; try { credentials = credentialsFromEnv(); } catch (error) {
    if (error instanceof IcecatConfigurationError) {
      addFailed(report, { seed: seedPath }, 'authentication-failed');
      console.error(error.message); console.log(`Report: ${await writeReport(path.join(scriptDir, 'reports'), report)}`);
      process.exitCode = 1; return;
    }
    throw error;
  }
  const categoryMap = JSON.parse(await fs.readFile(path.join(scriptDir, 'category-map.json'), 'utf8')); const seen = new Map(); const products = [];
  const outputPath = path.join(rootDir, 'assets', 'data', 'catalog-generated.json');
  const overwrite = process.argv.includes('--overwrite');
  if (!overwrite) {
    try {
      const existing = JSON.parse(await fs.readFile(outputPath, 'utf8'));
      for (const existingProduct of existing.products ?? []) { products.push(existingProduct); rememberProduct(existingProduct, seen); }
      report.existingBeforeRun = products.length;
    } catch (error) { if (error.code !== 'ENOENT') throw error; report.existingBeforeRun = 0; }
  }
  const requests = seed.targets.flatMap(target => target.identifiers.map(identifier => ({ target, identifier }))).slice(0, seed.limits.maxProducts);
  report.requested = requests.length;
  for (const request of requests) {
    try {
      const response = await fetchProductXml(request.identifier, request.target.brand, { credentials });
      const product = normalizeIcecatProduct(response.xml, { categoryMap });
      const approval = selection?.approved?.find(item => String(item.icecatId) === String(product.sourceProductId)) ?? { brand: request.target.brand };
      const lockedIdentity = validateLockedProductIdentity(product, approval);
      if (!lockedIdentity.valid) { report.quarantined.push({ item: request.identifier, reason: lockedIdentity.reason, expected: approval, authoritative: { brand: product.brand, supplierName: product.sourceSupplierName, supplierId: product.sourceSupplierId, category: product.category, mpn: product.mpn, gtins: product.gtins } }); continue; }
      product.identityStatus = 'verified';
      if (product.category !== request.target.lavaallCategory) { addSkipped(report, request.identifier, 'unmapped-category'); continue; }
      const { identity, duplicate } = findDuplicate(product, seen);
      if (!identity) { addSkipped(report, request.identifier, 'missing-stable-identity'); continue; }
      if (duplicate) { report.duplicates.push({ item: request.identifier, reason: identity.type === 'gtin' ? 'duplicate-gtin' : identity.type === 'brand-mpn' ? 'duplicate-brand-mpn' : 'duplicate-source-product-id' }); continue; }
      await downloadPermittedImages(product, { rootDir, maxImages: seed.limits.maxImagesPerProduct, onSkipped: (image, reason) => addImageSkipped(report, image.sourceUrl, reason) });
      const qualityTier = request.identifier.quality || 'SUPPLIER';
      if (product.images.length > 0) {
        product.integrationApproved = true;
        product.visualQaStatus = qualityTier === 'ICECAT' ? 'PASS' : 'PENDING';
      } else {
        product.integrationApproved = false;
        product.visualQaStatus = 'PENDING';
      }
      report.imagesDownloaded += product.images.length; rememberProduct(product, seen); products.push(product); report.accepted += 1;
    } catch (error) {
      const status = error.status; const reason = status === 401 ? 'authentication-failed' : status === 403 ? 'restricted-product' : status === 404 ? 'product-not-found' : error.message === 'unmapped-category' ? 'unmapped-category' : error.message === 'missing-brand' ? 'missing-brand' : error.message === 'missing-name' ? 'missing-name' : 'network-error';
      addFailed(report, request.identifier, reason);
    }
    await sleep(seed.limits.requestDelayMs ?? 500);
  }
  await fs.writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: 'open-icecat', products }, null, 2)}\n`);
  console.log(`Report: ${await writeReport(path.join(scriptDir, 'reports'), report)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
