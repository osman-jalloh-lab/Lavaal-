import fs from 'node:fs';

const webhook = process.env.CRM_WEBHOOK_URL || process.env.QUOTE_WEBHOOK_URL;
const secret = process.env.CRM_WEBHOOK_SECRET || process.env.QUOTE_WEBHOOK_SECRET;
const baseUrl = (process.env.LAVAALL_BASE_URL || 'https://www.lavaall.com').replace(/\/$/, '');

if (!webhook || !secret) {
  console.error('Missing CRM_WEBHOOK_URL/CRM_WEBHOOK_SECRET (or QUOTE_WEBHOOK_URL/QUOTE_WEBHOOK_SECRET).');
  process.exit(2);
}

const catalog = JSON.parse(fs.readFileSync('assets/data/catalog-generated.json', 'utf8'));
const products = (catalog.products || []).map((product) => {
  const sourceProductId = String(product.sourceProductId || product.source?.productId || product.id || '').replace(/^icecat-/, '');
  const images = Array.isArray(product.images) ? product.images : [];
  const primary = product.primaryImage || product.image || images[0] || '';
  const primaryImageUrl = primary
    ? new URL(String(primary).replace(/^\//, ''), `${baseUrl}/`).toString()
    : '';
  const gtin = product.gtin || product.gtins?.[0] || product.ean || product.upc || '';
  return {
    sourceProductId,
    brand: product.brand || '',
    productName: product.productName || product.name || '',
    mpn: product.mpn || product.modelNumber || '',
    gtin,
    category: product.category || '',
    listingType: 'verified',
    primaryImageUrl,
    galleryCount: images.length || (primary ? 1 : 0),
    verifiedAt: catalog.generatedAt || new Date().toISOString(),
    status: product.integrationApproved === false ? 'Blocked' : 'Live'
  };
});

const response = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ secret, eventType: 'product-sync', products })
});

const text = await response.text();
let body;
try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }

if (!response.ok || body.ok !== true) {
  console.error('CRM product sync failed:', response.status, body);
  process.exit(1);
}

console.log(`Synced ${body.products ?? products.length} verified products to Google Sheets CRM.`);
