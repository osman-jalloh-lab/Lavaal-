import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentialsFromEnv, fetchProductXml } from './lib/icecat-client.mjs';
import { enrichCandidateMetadata, exactDuplicateGroups } from './lib/candidate-enrichment.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
function arg(name) { const index = process.argv.indexOf(name); return index === -1 ? null : process.argv[index + 1]; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function groupKey(candidate) { return `${candidate.lavaallCategory}:${candidate.brand}`; }

export function selectEnrichmentCandidates(review, limit = 10) {
  const allowed = new Set(['tvs:LG', 'tvs:Samsung', 'tvs:TCL', 'tvs:Hisense', 'computers:Dell', 'computers:HP', 'computers:Lenovo', 'tablets:Samsung']);
  const grouped = new Map();
  for (const group of review.groups ?? []) for (const candidate of group.candidates ?? []) {
    const key = groupKey(candidate); if (!allowed.has(key) || candidate.reviewStatus !== 'review') continue;
    const items = grouped.get(key) ?? []; items.push(candidate); grouped.set(key, items);
  }
  return [...grouped.values()].flatMap(items => items.slice(0, limit));
}

async function main() {
  const inputPath = path.resolve(arg('--input') ?? path.join(scriptDir, 'discovery', 'candidate-review-quality.json'));
  const outputPath = path.resolve(arg('--output') ?? path.join(scriptDir, 'discovery', 'enriched-review.json'));
  const delayMs = Number(arg('--delay-ms') ?? 500); const max = Math.min(Number(arg('--max') ?? 80), 80);
  if (!Number.isInteger(delayMs) || delayMs < 0 || !Number.isInteger(max) || max < 1) throw new Error('Invalid enrichment limits.');
  const review = JSON.parse(await fs.readFile(inputPath, 'utf8')); const categoryMap = JSON.parse(await fs.readFile(path.join(scriptDir, 'category-map.json'), 'utf8'));
  const credentials = credentialsFromEnv(); const candidates = selectEnrichmentCandidates(review).slice(0, max); const records = []; const failed = [];
  for (const candidate of candidates) {
    try {
      const response = await fetchProductXml({ type: 'icecat-id', value: String(candidate.icecatId) }, candidate.brand, { credentials });
      records.push(enrichCandidateMetadata(candidate, response.xml, categoryMap));
    } catch (error) { failed.push({ lavaallCategory: candidate.lavaallCategory, brand: candidate.brand, icecatId: String(candidate.icecatId), status: error.status ?? null, reason: error.status ? `http-${error.status}` : 'metadata-unavailable', selected: false }); }
    await sleep(delayMs);
  }
  const groups = [...new Set(candidates.map(groupKey))].map(key => {
    const [lavaallCategory, brand] = key.split(':'); const items = records.filter(record => groupKey(record) === key); const failures = failed.filter(record => groupKey(record) === key);
    const count = status => items.filter(record => record.reviewStatus === status).length;
    return { lavaallCategory, brand, attempted: items.length + failures.length, xmlSuccess: items.length, xmlFailed: failures.length, strongReview: count('strong-review'), review: count('review'), likelyLegacy: count('likely-legacy'), insufficientInformation: count('insufficient-information'), explicitReleaseDates: items.filter(record => record.releaseDate).length, usefulSpecificationCoverage: items.filter(record => record.specifications.length >= 3).length, galleryMetadata: items.filter(record => record.galleryMetadata.count > 0).length, refurbishedEvidence: items.filter(record => record.conditionEvidence).length };
  });
  const output = { generatedAt: new Date().toISOString(), source: 'icecat-productxml-metadata-only', requests: { attempted: candidates.length, succeeded: records.length, failed: failed.length, delayMs, concurrency: 1 }, groups, records, failed, exactDuplicateGroups: exactDuplicateGroups(records) };
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ attempted: candidates.length, succeeded: records.length, failed: failed.length, output: outputPath }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
