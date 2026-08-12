const DIFFERENCE_FIELDS = [/processor/i, /memory|ram/i, /storage|capacity/i, /display|resolution|panel/i, /graphics|gpu/i, /connect|bluetooth|wi-?fi/i, /colour|color/i];

export function sourceGroupName(record) { return record.family?.trim() || record.series?.trim() || record.productName?.trim() || null; }
export function groupKey(record) { return `${record.lavaallCategory}|${record.brand}|${sourceGroupName(record) ?? record.icecatId}`; }
export function variantIdentity(record) { return `${record.icecatId}|${record.officialMpn ?? record.mpn ?? ''}|${(record.officialGtins ?? record.gtins ?? []).join(',')}`; }

function relevantSpecs(record) {
  return Object.fromEntries((record.specifications ?? []).filter(item => DIFFERENCE_FIELDS.some(pattern => pattern.test(item.name))).map(item => [item.name, `${item.value}${item.unit ? ` ${item.unit}` : ''}`]));
}

export function buildVariantGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const key = groupKey(record); const group = groups.get(key) ?? { key, lavaallCategory: record.lavaallCategory, brand: record.brand, sourceGroupName: sourceGroupName(record), variants: [] };
    if (!group.variants.some(item => variantIdentity(item) === variantIdentity(record))) group.variants.push({ ...record, selected: false });
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const values = new Map(); for (const variant of group.variants) for (const [name, value] of Object.entries(relevantSpecs(variant))) { const set = values.get(name) ?? new Set(); set.add(value); values.set(name, set); }
    const differences = [...values.entries()].filter(([, set]) => set.size > 1).map(([name, set]) => ({ name, values: [...set] }));
    return { ...group, differences, possibleRedundantVariant: group.variants.length > 1 && differences.length === 0 };
  });
}

const targetCounts = { 'tablets:Samsung': 5, 'computers:Dell': 3, 'computers:HP': 3, 'computers:Lenovo': 3, 'tvs:Samsung': 3, 'tvs:LG': 3, 'tvs:Hisense': 3, 'tvs:TCL': 3 };
const statusRank = { 'strong-review': 3, review: 2, 'insufficient-information': 1, 'likely-legacy': 0 };
function score(record) { return [statusRank[record.reviewStatus] ?? 0, Number(Boolean(record.releaseDate)), record.specifications?.length ?? 0, Number(Boolean(record.officialMpn && record.officialGtins?.length)), record.galleryMetadata?.permittedCount ?? 0, String(record.icecatId ?? '')]; }
function compare(a, b) { const left = score(a); const right = score(b); for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return left[i] > right[i] ? -1 : 1; return 0; }

export function proposePilot(groups) {
  const proposals = []; const deferred = [];
  for (const group of groups) for (const variant of group.variants) {
    if (variant.conditionEvidence) deferred.push({ icecatId: variant.icecatId, productName: variant.productName, deferredReason: 'explicit-refurbished-condition', selected: false });
  }
  for (const [target, limit] of Object.entries(targetCounts)) {
    const [category, brand] = target.split(':'); const candidates = groups.filter(group => group.lavaallCategory === category && group.brand === brand).flatMap(group => group.variants.filter(variant => !variant.conditionEvidence).map(variant => ({ group, variant }))).sort((a, b) => compare(a.variant, b.variant));
    const usedGroups = new Map();
    for (const item of candidates) {
      if (proposals.filter(proposal => proposal.lavaallCategory === category && proposal.brand === brand).length >= limit) break;
      const count = usedGroups.get(item.group.key) ?? 0; if (count >= 2) continue;
      usedGroups.set(item.group.key, count + 1);
      proposals.push({ ...item.variant, variantGroupKey: item.group.key, variantGroupName: item.group.sourceGroupName, proposed: true, proposedReason: 'Source identity, specification coverage, gallery metadata, and review ranking support human pilot review.', selected: false });
    }
  }
  return { proposals, deferred };
}
