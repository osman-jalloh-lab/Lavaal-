import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const approvalPath = path.join(scriptDir, 'pilot-selection.json');
const outputPath = path.join(scriptDir, 'discovery', 'pilot-seed.json');

export function seedFromPilotSelection(selection) {
  const approved = selection.approved ?? [];
  const requiredIds = new Set(['134687128', '134687130', '134687132', '134688919', '131194172', '131193979', '131192058', '132385656', '132906013', '132385729', '145145130', '145145101', '79453785', '79809054', '55170975', '36393926', '120583473', '130695305', '130728217']);
  if (approved.length !== 19 || approved.some(product => !requiredIds.has(String(product.icecatId))) || new Set(approved.map(product => String(product.icecatId))).size !== requiredIds.size) throw new Error('Approved IDs do not exactly match the final 19-product pilot.');
  if ((selection.deferred ?? []).some(product => requiredIds.has(String(product.icecatId)))) throw new Error('A deferred ID cannot be approved.');
  const ids = new Set();
  const targets = [];
  for (const product of approved) {
    if (!product.approved || !product.icecatId || !product.category || !product.brand) throw new Error('Invalid approved product.');
    if (ids.has(String(product.icecatId))) throw new Error(`Duplicate approved Icecat ID: ${product.icecatId}.`);
    ids.add(String(product.icecatId));
    let target = targets.find(item => item.lavaallCategory === product.category && item.brand === product.brand);
    if (!target) { target = { lavaallCategory: product.category, brand: product.brand, identifiers: [] }; targets.push(target); }
    target.identifiers.push({ type: 'icecat-id', value: String(product.icecatId) });
  }
  const seed = { limits: { maxProducts: 19, maxImagesPerProduct: 4, requestDelayMs: 500 }, targets };
  const seedIds = seed.targets.flatMap(target => target.identifiers.map(identifier => identifier.value));
  if (seedIds.length !== 19 || seedIds.some(id => !ids.has(id)) || seedIds.some(id => !requiredIds.has(id))) throw new Error('Seed does not exactly match pilot approval.');
  return seed;
}

async function main() {
  const selection = JSON.parse(await fs.readFile(approvalPath, 'utf8'));
  const seed = seedFromPilotSelection(selection);
  await fs.writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`Pilot seed: ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
