// Future public-integration adapter. It is deliberately not loaded by the site.
// Only records explicitly approved by a human can cross this boundary.
function slug(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function spec(product, names) {
  const item = (product.specifications ?? []).find(entry => names.includes(entry.name));
  return item ? `${item.value}${item.unit ? ` ${item.unit}` : ''}` : null;
}

export function generatedProductToModel(product) {
  const sourceProductId = String(product.sourceProductId ?? '');
  return {
    id: `icecat-${sourceProductId}`,
    name: product.name,
    sourceProductId,
    mpn: product.mpn ?? product.modelNumber ?? null,
    gtin: product.gtin ?? null,
    primaryImage: product.primaryImage ?? null,
    images: (product.images ?? []).map(image => ({ src: image.path ?? image.src, alt: `${product.brand} ${product.name}`, isMain: (image.path ?? image.src) === product.primaryImage, source: product.source, sourceProductId })),
    specLine: [spec(product, ['Display diagonal']), spec(product, ['Internal memory']), spec(product, ['Internal storage capacity'])].filter(Boolean).join(' · '),
    desc: product.shortDescription ?? '',
    fields: [{ key: 'quantity', label: 'Quantity', type: 'number', min: 1, value: 1 }]
  };
}

export function approvedGeneratedCatalog(catalog) {
  const categories = new Map();
  for (const product of catalog.products ?? []) {
    if (product.integrationApproved !== true || product.identityStatus !== 'verified' || product.mediaUsageStatus !== 'permitted') continue;
    const categoryId = slug(product.category); const brandName = product.brand; const familyName = product.family || product.series || product.name;
    if (!categories.has(categoryId)) categories.set(categoryId, { id: categoryId, name: product.category, icon: 'box', brands: [] });
    const category = categories.get(categoryId); let brand = category.brands.find(item => item.name === brandName);
    if (!brand) { brand = { name: brandName, families: [] }; category.brands.push(brand); }
    let family = brand.families.find(item => item.name === familyName);
    if (!family) { family = { name: familyName, models: [] }; brand.families.push(family); }
    family.models.push(generatedProductToModel(product));
  }
  return [...categories.values()];
}
