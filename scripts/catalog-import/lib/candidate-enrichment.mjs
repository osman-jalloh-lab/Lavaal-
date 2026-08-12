import { attribute, descendants, first, parseXml, text } from './xml-parser.mjs';
import { normalizeIcecatProduct } from '../normalize-product.mjs';
import { legacySignal } from './candidate-quality.mjs';

function values(nodes, names) { return [...new Set(nodes.map(node => attribute(node, ...names) ?? text(node)).filter(Boolean))]; }
function explicitYear(value) { const match = String(value ?? '').match(/^(\d{4})/); return match ? Number(match[1]) : null; }

export function enrichCandidateMetadata(candidate, xml, categoryMap) {
  const document = parseXml(xml); const product = first(document, 'Product');
  if (!product) throw new Error('source-record-unavailable');
  const normalized = normalizeIcecatProduct(xml, { categoryMap }); const categoryNode = first(product, 'Category');
  const releaseDate = (attribute(product, 'ReleaseDate') ?? text(first(product, 'ReleaseDate'))) || null;
  const productName = attribute(product, 'Name', 'Model_Name') ?? text(first(product, 'Model_Name')) ?? normalized.name;
  const officialBrand = attribute(product, 'Brand', 'Supplier') ?? attribute(first(product, 'Supplier'), 'Name') ?? normalized.brand;
  const officialMpn = attribute(product, 'Prod_id', 'M_Prod_id', 'ProductCode') ?? normalized.mpn;
  const officialGtins = values(descendants(product, 'EanCode'), ['EAN', 'Value']);
  const family = attribute(product, 'Family') ?? attribute(first(product, 'Family'), 'Name', 'Value') ?? text(first(product, 'Family')) ?? null;
  const series = attribute(product, 'Series') ?? attribute(first(product, 'Series'), 'Name', 'Value') ?? text(first(product, 'Series')) ?? null;
  const haystack = [productName, normalized.shortDescription, ...normalized.specifications.flatMap(item => [item.name, item.value])].filter(Boolean).join(' ');
  const conditionMatch = haystack.match(/\brefurbished\b/i);
  const gallery = normalized._gallery ?? []; const permitted = gallery.filter(item => !item.isRich && !item.expirationDate);
  const base = {
    lavaallCategory: candidate.lavaallCategory, brand: candidate.brand, icecatId: String(candidate.icecatId), mpn: candidate.mpn ?? null, gtins: candidate.gtins ?? [], indexModelName: candidate.modelName ?? null, countryMarkets: candidate.countryMarkets ?? [], indexUpdated: candidate.updated ?? null, selected: false,
    productName: productName ?? null, officialBrand: officialBrand ?? null, officialMpn: officialMpn ?? null, officialGtins,
    releaseDate, releaseYear: explicitYear(releaseDate), family, series, shortDescription: normalized.shortDescription ?? null,
    specifications: normalized.specifications, galleryMetadata: { count: gallery.length, permittedCount: permitted.length, restrictedCount: gallery.length - permitted.length, mainImageMetadataPresent: gallery.some(item => item.isMain) },
    sourceCategoryId: attribute(categoryNode, 'ID', 'Catid', 'Category_ID') ?? candidate.sourceCategoryId ?? null,
    sourceCategoryName: attribute(categoryNode, 'Name') ?? categoryMap.mappings.find(item => String(item.sourceCategoryId) === String(attribute(categoryNode, 'ID', 'Catid', 'Category_ID')))?.sourceCategoryName ?? null,
    conditionEvidence: conditionMatch ? conditionMatch[0] : null
  };
  const legacy = legacySignal(`${base.productName ?? ''} ${base.family ?? ''} ${base.series ?? ''}`);
  const identityComplete = Boolean(base.officialMpn && base.officialGtins.length); const usefulSpecs = base.specifications.length >= 3;
  if (legacy) return { ...base, reviewStatus: 'likely-legacy', reviewNotes: [`Explicit legacy signal in source metadata: ${legacy}.`] };
  if (base.releaseDate && identityComplete && usefulSpecs) return { ...base, reviewStatus: 'strong-review', reviewNotes: ['Explicit source release date, complete identity, and useful source specifications are available.'] };
  if (identityComplete && usefulSpecs) return { ...base, reviewStatus: 'review', reviewNotes: ['Complete identity and useful source specifications are available; no release-date inference was made.'] };
  return { ...base, reviewStatus: 'insufficient-information', reviewNotes: ['Source metadata lacks enough identity or specification coverage for a stronger review.'] };
}

export function exactDuplicateGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.officialBrand ?? record.brand}|${record.officialMpn ?? record.mpn}|${record.officialGtins.join(',')}|${JSON.stringify(record.specifications)}`;
    const items = groups.get(key) ?? []; items.push(record); groups.set(key, items);
  }
  return [...groups.values()].filter(items => items.length > 1).map(items => items.map(item => item.icecatId));
}
