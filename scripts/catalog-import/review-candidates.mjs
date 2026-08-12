import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { legacySignal, meaningfulModelName } from './lib/candidate-quality.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const brandBySupplierId = { '293': 'LG', '26': 'Samsung', '292': 'Dell', '1': 'HP', '728': 'Lenovo' };

function classify(candidate) {
  const modelName = candidate.modelName?.trim() ?? '';
  const hasMpn = Boolean(candidate.mpn?.trim()); const hasGtin = Boolean(candidate.gtins?.length); const hasPreview = Boolean(candidate.previewImageUrl);
  const legacy = legacySignal(modelName);
  if (legacy) return { reviewStatus: 'likely-legacy', reviewReason: `Model name explicitly includes legacy-oriented terminology: ${legacy}.` };
  if (!modelName || !hasMpn) return { reviewStatus: 'insufficient-information', reviewReason: !modelName ? 'No model name is available in the index record.' : 'No MPN is available in the index record.' };
  if (hasGtin && hasPreview && meaningfulModelName(modelName)) return { reviewStatus: 'review', reviewReason: 'Model name, MPN, GTIN, and preview-image metadata are present. This supports human review but does not establish release age.' };
  if (hasPreview && (hasGtin || candidate.countryMarkets?.length)) return { reviewStatus: 'insufficient-information', reviewReason: hasGtin ? 'Identity metadata is present, but the model name is too generic to assess product age from the index alone.' : 'GTIN is absent, so the index record is not strong enough for a quality recommendation.' };
  return { reviewStatus: 'insufficient-information', reviewReason: 'The index fields do not provide enough identity or model-name detail for a confident review.' };
}

function reviewRecord(candidate, group) {
  const classification = classify(candidate);
  return {
    brand: brandBySupplierId[String(group.sourceBrandId)] ?? group.brand,
    lavaallCategory: group.lavaallCategory,
    modelName: candidate.modelName ?? null,
    icecatId: candidate.icecatId ?? null,
    mpn: candidate.mpn ?? null,
    gtins: candidate.gtins ?? [],
    sourceCategoryId: group.sourceCategoryId,
    quality: candidate.quality ?? null,
    updated: candidate.updated ?? null,
    countryMarkets: candidate.countryMarkets ?? [],
    previewImage: Boolean(candidate.previewImageUrl),
    ...classification,
    selected: false
  };
}

const statusRank = { recommended: 0, review: 1, 'insufficient-information': 2, 'likely-legacy': 3 };
function rank(a, b) { return statusRank[a.reviewStatus] - statusRank[b.reviewStatus] || Number(b.gtins.length > 0) - Number(a.gtins.length > 0) || b.countryMarkets.length - a.countryMarkets.length || String(b.updated ?? '').localeCompare(String(a.updated ?? '')); }

const input = JSON.parse(await fs.readFile(path.join(scriptDir, 'discovery', 'candidates.json'), 'utf8'));
const grouped = new Map();
for (const group of input.targets ?? []) {
  const brand = brandBySupplierId[String(group.sourceBrandId)] ?? group.brand;
  const key = `${group.lavaallCategory}:${brand}`;
  const aggregate = grouped.get(key) ?? { lavaallCategory: group.lavaallCategory, brand, sourceCategoryIds: [], candidates: [] };
  aggregate.sourceCategoryIds.push(String(group.sourceCategoryId));
  aggregate.candidates.push(...(group.candidates ?? []).map(candidate => reviewRecord(candidate, group)));
  grouped.set(key, aggregate);
}
const groups = [...grouped.values()].map(group => {
  const candidates = group.candidates.sort(rank);
  const counts = Object.fromEntries(['recommended', 'review', 'likely-legacy', 'insufficient-information'].map(status => [status, candidates.filter(item => item.reviewStatus === status).length]));
  return {
    lavaallCategory: group.lavaallCategory,
    brand: group.brand,
    sourceCategoryIds: [...new Set(group.sourceCategoryIds)],
    summary: { totalDiscovered: candidates.length, ...counts, reasonableReviewCandidates: counts.recommended + counts.review, withGtin: candidates.filter(item => item.gtins.length > 0).length, withMpn: candidates.filter(item => item.mpn).length },
    candidates,
    shortlist: candidates.filter(item => item.reviewStatus === 'recommended' || item.reviewStatus === 'review').slice(0, 10)
  };
});
const output = {
  generatedAt: new Date().toISOString(),
  source: 'open-icecat-on-market-index-candidates',
  classificationPolicy: 'Only explicit model-name signals and available index identity/market/image metadata are used. Icecat updated timestamps are not treated as release dates.',
  groups
};
await fs.writeFile(path.join(scriptDir, 'discovery', 'candidate-review.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Candidate review output: ${path.join(scriptDir, 'discovery', 'candidate-review.json')}`);
