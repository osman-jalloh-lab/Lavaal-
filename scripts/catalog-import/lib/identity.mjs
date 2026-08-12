export function normalizeIdentityPart(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export function productIdentity(product) {
  const gtin = normalizeIdentityPart(product.gtin);
  if (gtin) return { type: 'gtin', key: `gtin:${gtin}` };
  const sourceProductId = String(product.sourceProductId ?? '').trim();
  if (sourceProductId) return { type: 'source-product-id', key: `icecat:${sourceProductId}` };
  const brand = normalizeIdentityPart(product.brand);
  const mpn = normalizeIdentityPart(product.mpn ?? product.modelNumber);
  if (brand && mpn) return { type: 'brand-mpn', key: `brand-mpn:${brand}:${mpn}` };
  return null;
}

export function findDuplicate(product, seen) {
  const identity = productIdentity(product);
  if (!identity) return { identity: null, duplicate: null };
  return { identity, duplicate: seen.get(identity.key) ?? null };
}

export function rememberProduct(product, seen) {
  const identity = productIdentity(product);
  if (identity) seen.set(identity.key, product.id);
  return identity;
}
