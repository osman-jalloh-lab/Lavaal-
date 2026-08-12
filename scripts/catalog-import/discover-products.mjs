import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamIndex, streamReferenceList } from './lib/index-parser.mjs';
import { createDiscoverySession, seedFromDiscovery, validateDiscoveryTargets } from './lib/discovery.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
function arg(name) { const index = process.argv.indexOf(name); return index === -1 ? null : process.argv[index + 1]; }
function required(name) { const value = arg(name); if (!value) throw new Error(`Missing ${name}.`); return path.resolve(value); }
async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }

async function referenceEntries(file, elementName) { const entries = []; await streamReferenceList(file, elementName, entry => entries.push(entry)); return entries; }

async function discover() {
  const targetsPath = required('--targets'); const indexFile = required('--index-file'); const suppliersFile = required('--suppliers-file');
  const categoryMap = await readJson(path.resolve(arg('--category-map') ?? path.join(scriptDir, 'category-map.json')));
  const targetsConfig = await readJson(targetsPath); const errors = validateDiscoveryTargets(targetsConfig);
  if (errors.length) throw new Error(`Invalid discovery targets: ${errors.join(', ')}`);
  const indexType = arg('--index-type') ?? 'on-market';
  if (!['full', 'on-market', 'daily'].includes(indexType)) throw new Error('Invalid --index-type. Use full, on-market, or daily.');
  const maxCandidates = Number(arg('--max-candidates') ?? targetsConfig.maxCandidatesPerTarget ?? 50);
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1) throw new Error('Invalid --max-candidates.');
  const market = (arg('--market') ?? targetsConfig.market ?? '').toUpperCase() || null;
  const suppliers = await referenceEntries(suppliersFile, 'Supplier');
  const categories = arg('--categories-file') ? await referenceEntries(path.resolve(arg('--categories-file')), 'Category') : [];
  const onMarketOnly = process.argv.includes('--on-market-only') || indexType === 'on-market';
  const session = createDiscoverySession({ targets: targetsConfig.targets, suppliers, categoryMap, market, onMarketOnly, maxCandidatesPerTarget: maxCandidates, categories });
  await streamIndex(indexFile, record => session.consider(record));
  const result = { generatedAt: new Date().toISOString(), source: 'open-icecat-index', indexType, market, onMarketOnly, maxCandidatesPerTarget: maxCandidates, ...session.result() };
  const output = path.resolve(arg('--output') ?? path.join(scriptDir, 'discovery', 'candidates.json'));
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  if (result.proposedCategoryMap.length && arg('--proposed-category-map')) await fs.writeFile(path.resolve(arg('--proposed-category-map')), `${JSON.stringify({ version: 1, mappings: result.proposedCategoryMap }, null, 2)}\n`);
  console.log(`Discovery output: ${output}`);
}

async function generateSeed() {
  const approved = await readJson(required('--generate-seed')); const seed = seedFromDiscovery(approved); const output = path.resolve(arg('--seed-output') ?? path.join(scriptDir, 'catalog-seed.json'));
  await fs.writeFile(output, `${JSON.stringify(seed, null, 2)}\n`); console.log(`Seed output: ${output}`);
}

async function main() { if (arg('--generate-seed')) await generateSeed(); else await discover(); }
main().catch(error => { console.error(error.message); process.exitCode = 1; });
