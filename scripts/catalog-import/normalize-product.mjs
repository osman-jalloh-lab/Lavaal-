import { attribute, descendants, first, parseXml, text } from './lib/xml-parser.mjs';

function year(value) { const match = String(value ?? '').match(/^(\d{4})/); return match ? Number(match[1]) : null; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

export function mapCategory(categoryNode, categoryMap) {
  const id = attribute(categoryNode, 'ID', 'Catid', 'Category_ID');
  const name = attribute(categoryNode, 'Name') ?? text(categoryNode);
  return categoryMap.mappings.find(mapping =>
    (mapping.sourceCategoryId && String(mapping.sourceCategoryId) === String(id)) ||
    (mapping.sourceCategoryName && mapping.sourceCategoryName === name)
  )?.lavaallCategory ?? null;
}

export function normalizeIcecatProduct(xml, { categoryMap }) {
  const document = parseXml(xml); const product = first(document, 'Product');
  if (!product) throw new Error('source-record-unavailable');
  const categoryNode = first(product, 'Category'); const category = mapCategory(categoryNode, categoryMap);
  const supplier = first(product, 'Supplier');
  const brand = attribute(product, 'Brand', 'Supplier') ?? attribute(supplier, 'Name') ?? text(first(product, 'Brand'));
  const sourceSupplierName = attribute(supplier, 'Name') ?? text(supplier) ?? brand;
  const sourceSupplierId = attribute(supplier, 'ID', 'Supplier_ID') ?? attribute(product, 'Supplier_ID') ?? null;
  const name = attribute(product, 'Name', 'Model_Name') ?? attribute(first(product, 'Model_Name'), 'Value') ?? text(first(product, 'Model_Name'));
  const sourceProductId = attribute(product, 'ID', 'Product_ID', 'Icecat_ID');
  const mpn = attribute(product, 'Prod_id', 'M_Prod_id', 'ProductCode');
  const gtins = unique([...descendants(product, 'EanCode'), ...descendants(product, 'EANCode')].map(node => attribute(node, 'EAN', 'Value') ?? text(node)));
  const gtin = gtins[0] ?? null;
  if (!category) throw new Error('unmapped-category');
  if (!brand?.trim()) throw new Error('missing-brand');
  if (!name?.trim()) throw new Error('missing-name');
  if (!sourceProductId && !(gtin || (brand && mpn))) throw new Error('missing-stable-identity');

  const productFeatureNodes = descendants(product, 'ProductFeature');
  const featureNodes = productFeatureNodes.length ? productFeatureNodes : descendants(product, 'Feature');
  const specifications = featureNodes.map(node => ({
    name: attribute(node, 'Name') ?? attribute(first(node, 'Name'), 'Value') ?? text(first(node, 'Name')),
    value: attribute(node, 'Presentation_Value', 'Value') ?? attribute(first(node, 'LocalValue'), 'Value') ?? attribute(first(node, 'Value'), 'Value') ?? text(first(node, 'Value')),
    unit: attribute(node, 'Measure') ?? text(descendants(node, 'Sign')[0]) ?? attribute(first(node, 'Measure'), 'Signs') ?? null
  })).filter(item => item.name && item.value);
  const gallery = descendants(product, 'ProductPicture').map(node => ({
    sourceUrl: attribute(node, 'Original', 'Pic'), originalUrl: attribute(node, 'Original'), picUrl: attribute(node, 'Pic'),
    isMain: attribute(node, 'IsMain') === 'Y', isRich: attribute(node, 'IsRich') === 'Y',
    expirationDate: attribute(node, 'ExpirationDate'), width: Number(attribute(node, 'PicWidth', 'OriginalWidth') ?? 0), height: Number(attribute(node, 'PicHeight', 'OriginalHeight') ?? 0)
  }));
  const generatedId = sourceProductId ? `icecat-${sourceProductId}` : `icecat-${brand}-${mpn}`;
  return {
    id: generatedId, category, brand, family: null, name, modelNumber: mpn ?? null,
    releaseYear: year(attribute(product, 'ReleaseDate') ?? text(first(product, 'ReleaseDate'))),
    shortDescription: text(first(product, 'SummaryDescription')) ?? text(first(product, 'DescriptionShort')) ?? null,
    specifications, primaryImage: null, images: [], source: 'open-icecat', sourceProductId: sourceProductId ?? null,
    mpn: mpn ?? null, gtin, gtins, sourceSupplierName, sourceSupplierId, mediaUsageStatus: gallery.length ? 'unknown' : 'unavailable',
    sourceUpdatedAt: attribute(product, 'Updated', 'UpdatedDate') ?? null, _gallery: gallery
  };
}
