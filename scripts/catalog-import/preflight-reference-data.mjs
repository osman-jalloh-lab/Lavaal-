import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { downloadReferenceFile, probeReferenceAccess } from './lib/icecat-reference-client.mjs';
import { streamReferenceList } from './lib/index-parser.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(scriptDir, 'cache');
const discoveryDir = path.join(scriptDir, 'discovery');
const references = [
  { name: 'SuppliersList', element: 'Supplier', url: 'https://data.icecat.biz/export/freexml/refs/SuppliersList.xml.gz' },
  { name: 'CategoriesList', element: 'Category', url: 'https://data.icecat.biz/export/freexml/refs/CategoriesList.xml.gz' }
];

async function validateReference(file, element) {
  const validationPath = `${file}.validation`;
  try {
    await pipeline(createReadStream(file), createGunzip(), createWriteStream(validationPath));
    const xml = await fs.readFile(validationPath, 'utf8');
    const documentRoot = xml.replace(/^\s*<\?xml[^>]*\?>\s*(?:<!DOCTYPE[\s\S]*?>\s*)?(?:<!--[\s\S]*?-->\s*)*/, '').match(/^<([A-Za-z][\w:-]*)\b/);
    const expectedList = element === 'Category' ? 'CategoriesList' : 'SuppliersList';
    if (!documentRoot || documentRoot[1] !== 'ICECAT-interface' || !new RegExp(`<${expectedList}\\b`).test(xml)) throw new Error(`Unexpected XML reference structure in ${path.basename(file)}.`);
    const entries = []; await streamReferenceList(file, element, entry => entries.push(entry));
    if (!entries.length) throw new Error(`No ${element} entries found in ${path.basename(file)}.`);
    return entries;
  } finally { await fs.rm(validationPath, { force: true }); }
}

function key(value) { return value.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function resolveSupplier(requestedBrand, suppliers) {
  const aliases = { hp: ['hp', 'hewlettpackard'], lg: ['lg', 'lgelectronics'], hpe: ['hewlettpackardenterprise', 'hpe'] };
  const accepted = aliases[key(requestedBrand)] ?? [key(requestedBrand)];
  const matches = suppliers.filter(item => accepted.includes(key(item.name)));
  const exact = matches.find(item => key(item.name) === key(requestedBrand));
  const selected = exact ?? matches[0] ?? null;
  return { requestedBrand, sourceSupplierName: selected?.name ?? null, supplierId: selected?.id ?? null, matchType: exact ? 'exact-normalized' : selected ? 'alias' : 'unresolved', notes: matches.length > 1 ? `ambiguous aliases: ${matches.map(item => item.name).join(', ')}` : requestedBrand === 'HP' && selected ? 'HP resolved separately from HPE.' : null };
}

function reviewCategory(requestedCategory, categories, aliases, reviewNote = null) {
  const matches = categories.filter(item => aliases.includes(key(item.name)));
  return { requestedCategory, proposedMappings: matches.map(item => ({ sourceCategoryId: item.id, sourceCategoryName: item.name, approved: false })), notes: reviewNote ?? (matches.length === 1 ? null : matches.length ? 'Multiple possible source categories; review required.' : 'No exact normalized category match found; review required.') };
}

async function main() {
  const downloaded = [];
  for (const reference of references) {
    const file = path.join(cacheDir, `${reference.name}.xml.gz`);
    const result = await downloadReferenceFile(reference.url, file);
    const entries = await validateReference(file, reference.element);
    downloaded.push({ ...reference, ...result, entries });
  }
  const suppliers = downloaded.find(item => item.name === 'SuppliersList').entries;
  const categories = downloaded.find(item => item.name === 'CategoriesList').entries;
  const supplierReview = { generatedAt: new Date().toISOString(), suppliers: ['LG', 'Samsung', 'Apple', 'Dell', 'HP', 'Lenovo', 'Sony', 'TCL', 'Hisense'].map(brand => resolveSupplier(brand, suppliers)) };
  const categoryReview = { generatedAt: new Date().toISOString(), categories: [
    ['Tablet', ['tablets']], ['Notebook / Laptop', ['laptops']], ['Desktop PC', ['pcsworkstations'], 'Icecat combines desktop PCs and workstations in this source category; approval required.'], ['Workstation', ['pcsworkstations'], 'Icecat combines workstations and desktop PCs in this source category; approval required.'], ['Television', ['televisions']], ['Computer Monitor', ['computermonitors']], ['Refrigerator', ['refrigeratorsfreezers'], 'Icecat combines refrigerators and freezers in this source category; approval required.'], ['Freezer', ['freezers']]
  ].map(([requestedCategory, aliases, reviewNote]) => reviewCategory(requestedCategory, categories, aliases, reviewNote)) };
  await fs.mkdir(discoveryDir, { recursive: true });
  await fs.writeFile(path.join(discoveryDir, 'resolved-suppliers.json'), `${JSON.stringify(supplierReview, null, 2)}\n`);
  await fs.writeFile(path.join(discoveryDir, 'category-review.json'), `${JSON.stringify(categoryReview, null, 2)}\n`);
  let onMarket;
  try { onMarket = await probeReferenceAccess('https://data.icecat.biz/export/freexml/EN/on_market.index.xml.gz'); }
  catch (error) { onMarket = { status: error.status ?? null, message: error.message }; }
  console.log(JSON.stringify({ references: downloaded.map(({ name, status, size, destination, entries }) => ({ name, status, size, destination, entries: entries.length })), onMarket }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
