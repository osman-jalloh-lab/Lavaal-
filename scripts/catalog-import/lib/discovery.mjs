import { normalizeIdentityPart } from './identity.mjs';

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
  const { resolved, unresolved } = resolveBrands(targets, suppliers); const groups = []; const duplicateKeys = new Set(); const unmapped = new Map(); const targetCounts = new Map();
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
    const identity = record.gtins[0] ? `gtin:${record.gtins[0]}` : `icecat:${record.icecatId}`;
    const countKey = `${mappedCategory}:${record.supplierId}`;
    if (duplicateKeys.has(identity) || (targetCounts.get(countKey) ?? 0) >= maxCandidatesPerTarget) return;
    duplicateKeys.add(identity); targetCounts.set(countKey, (targetCounts.get(countKey) ?? 0) + 1); group.candidates.push(candidateFromRecord(record));
  }
  return {
    consider,
    result: () => {
      for (const group of groups) group.candidates.sort((a, b) => Number(b.onMarket) - Number(a.onMarket) || Number(b.gtins.length > 0) - Number(a.gtins.length > 0) || String(b.updated ?? '').localeCompare(String(a.updated ?? '')));
      return { targets: groups.map(({ _key, ...group }) => group), unresolvedBrands: unresolved, proposedCategoryMap: [...unmapped.keys()].map(sourceCategoryId => ({ sourceCategoryId, sourceCategoryName: categories.find(category => String(category.id) === String(sourceCategoryId))?.name ?? null, lavaallCategory: null })) };
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
