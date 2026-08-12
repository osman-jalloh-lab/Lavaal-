import { normalizeIdentityPart } from './identity.mjs';
import { compareCandidateQuality } from './candidate-quality.mjs';

const LAVAALL_CATEGORIES = new Set(['phones', 'tablets', 'computers', 'tvs', 'monitors', 'gaming', 'audio', 'watches', 'cameras', 'printers', 'networking', 'servers', 'refrigeration', 'accessories']);
const brandKey = brand => normalizeIdentityPart(brand);

export function validateDiscoveryTargets(targets) {
  const errors = []; if (!Array.isArray(targets.targets) || !targets.targets.length) errors.push('missing-targets');
  for (const target of targets.targets ?? []) { if (!LAVAALL_CATEGORIES.has(target.lavaallCategory)) errors.push('unmapped-category'); if (!Array.isArray(target.brands) || !target.brands.length) errors.push('missing-brand'); }
  return errors;
}

export function resolveBrands(targets, suppliers) {
  const byName = new Map(suppliers.map(supplier => [brandKey(supplier.name), supplier])); const resolved = new Map(); const unresolved = [];
  for (const target of targets) for (const brand of target.brands) {
    const key = brandKey(brand); if (resolved.has(key) || unresolved.some(item => item.brand === brand)) continue;
    const supplier = byName.get(key); if (supplier) resolved.set(key, supplier); else unresolved.push({ brand, reason: 'unresolved-brand' });
  }
  return { resolved, unresolved };
}

export function categoryForSource(sourceCategoryId, categoryMap) {
  return categoryMap.mappings.find(item => String(item.sourceCategoryId ?? '') === String(sourceCategoryId ?? ''))?.lavaallCategory ?? null;
}

export function candidateFromRecord(record) {
  return { icecatId: record.icecatId, mpn: record.mpn ?? record.mappedMpn, gtins: record.gtins, modelName: record.modelName, quality: record.quality, onMarket: record.onMarket, limited: record.limited, updated: record.updated, countryMarkets: record.countryMarkets, previewImageUrl: record.previewImageUrl, selected: false };
}

export function createDiscoverySession({ targets, suppliers, categoryMap, market, onMarketOnly = false, maxCandidatesPerTarget, categories = [] }) {
  const errors = validateDiscoveryTargets({ targets }); if (errors.length) throw new Error(errors.join(','));
  const { resolved, unresolved } = resolveBrands(targets, suppliers); const groups = []; const identityOwners = new Map(); const unmapped = new Map(); const pools = new Map(); const replacements = [];
  const requestedBrand = supplierId => [...resolved.entries()].find(([, supplier]) => String(supplier.id) === String(supplierId))?.[0] ?? null;
  const groupFor = (category, supplierId, sourceCategoryId) => {
    const brand = requestedBrand(supplierId);
    if (!brand || !targets.some(target => target.lavaallCategory === category && target.brands.some(item => brandKey(item) === brand))) return null;
    const key = `${category}:${supplierId}:${sourceCategoryId}`;
    let group = groups.find(item => item._key === key);
    if (!group) {
      group = { _key: key, lavaallCategory: category, brand: suppliers.find(item => String(item.id) === String(supplierId))?.name ?? brand, sourceBrandId: supplierId, sourceCategoryId, candidates: [] };
      groups.push(group);
    }
    return group;
  };
  function consider(record) {
    const mappedCategory = categoryForSource(record.sourceCategoryId, categoryMap);
    if (!mappedCategory) { if (record.sourceCategoryId) unmapped.set(record.sourceCategoryId, true); return; }
    const group = groupFor(mappedCategory, record.supplierId, record.sourceCategoryId); if (!group || !record.icecatId || record.limited || (onMarketOnly && !record.onMarket)) return;
    if (market && !record.countryMarkets.includes(market)) return;
    const candidate = { ...candidateFromRecord(record), _groupKey: group._key }; const identity = record.gtins[0] ? `gtin:${record.gtins[0]}` : `icecat:${record.icecatId}`;
    const countKey = `${mappedCategory}:${record.supplierId}`;
    const owner = identityOwners.get(identity);
    if (owner && compareCandidateQuality(candidate, owner.candidate) <= 0) return;
    if (owner) {
      const ownerPool = pools.get(owner.countKey) ?? []; const ownerIndex = ownerPool.indexOf(owner.candidate);
      if (ownerIndex >= 0) ownerPool.splice(ownerIndex, 1);
      identityOwners.delete(identity);
    }
    const pool = pools.get(countKey) ?? []; pools.set(countKey, pool);
    if (pool.length < maxCandidatesPerTarget) {
      pool.push(candidate); identityOwners.set(identity, { candidate, countKey }); return;
    }
    let weakestIndex = 0;
    for (let index = 1; index < pool.length; index += 1) if (compareCandidateQuality(pool[index], pool[weakestIndex]) < 0) weakestIndex = index;
    const weakest = pool[weakestIndex];
    if (compareCandidateQuality(candidate, weakest) <= 0) return;
    const displacedIdentity = weakest.gtins[0] ? `gtin:${weakest.gtins[0]}` : `icecat:${weakest.icecatId}`;
    identityOwners.delete(displacedIdentity); pool[weakestIndex] = candidate; identityOwners.set(identity, { candidate, countKey });
    if (replacements.length < 50) replacements.push({ lavaallCategory: mappedCategory, supplierId: String(record.supplierId), displacedIcecatId: weakest.icecatId, replacementIcecatId: candidate.icecatId });
  }
  return {
    consider,
    result: () => {
      for (const group of groups) {
        const pool = pools.get(`${group.lavaallCategory}:${group.sourceBrandId}`) ?? [];
        group.candidates = pool.filter(candidate => candidate._groupKey === group._key).sort((a, b) => compareCandidateQuality(b, a));
      }
      return { targets: groups.map(({ _key, candidates, ...group }) => ({ ...group, candidates: candidates.map(({ _groupKey, ...candidate }) => candidate) })), unresolvedBrands: unresolved, proposedCategoryMap: [...unmapped.keys()].map(sourceCategoryId => ({ sourceCategoryId, sourceCategoryName: categories.find(category => String(category.id) === String(sourceCategoryId))?.name ?? null, lavaallCategory: null })), qualityReplacements: replacements };
    }
  };
}

export function discoverRecords(records, options) {
  const session = createDiscoverySession(options);
  records.forEach(record => session.consider(record));
  return session.result();
}

export function seedFromDiscovery(discovery) {
  const targets = [];
  for (const group of discovery.targets ?? []) {
    const identifiers = (group.candidates ?? []).filter(candidate => candidate.selected === true).map(candidate => {
      if (candidate.gtins?.[0]) return { type: 'gtin', value: candidate.gtins[0] };
      if (candidate.icecatId) return { type: 'icecat-id', value: String(candidate.icecatId) };
      if (candidate.mpn) return { type: 'mpn-and-brand', value: candidate.mpn };
      return null;
    }).filter(Boolean);
    if (identifiers.length) targets.push({ lavaallCategory: group.lavaallCategory, brand: group.brand, identifiers });
  }
  return { limits: { maxProducts: 100, maxImagesPerProduct: 4, requestDelayMs: 500 }, targets };
}
