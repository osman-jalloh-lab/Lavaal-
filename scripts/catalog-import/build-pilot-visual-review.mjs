import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const catalogPath = path.join(rootDir, 'assets', 'data', 'catalog-generated.json');
const selectionPath = path.join(scriptDir, 'pilot-selection.json');
const outputPath = path.join(scriptDir, 'discovery', 'pilot-generated.json');
const reviewPath = path.join(scriptDir, 'discovery', 'pilot-visual-review.html');

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function imagePaths(product) { return (product.images ?? []).map(image => typeof image === 'string' ? image : image?.src ?? image?.path).filter(Boolean); }
function keySpecs(product) { return (product.specifications ?? []).slice(0, 5).map(spec => `${spec.name}: ${spec.value}${spec.unit ? ` ${spec.unit}` : ''}`); }

export function splitPilotForReview(catalog, selection) {
  const quarantinedIds = new Set((selection.quarantined ?? []).map(item => String(item.icecatId)));
  const products = catalog.products ?? [];
  const valid = products.filter(product => !quarantinedIds.has(String(product.sourceProductId)));
  const quarantined = products.filter(product => quarantinedIds.has(String(product.sourceProductId))).map(product => ({
    icecatId: product.sourceProductId, brand: product.brand, productName: product.name,
    reason: selection.quarantined.find(item => String(item.icecatId) === String(product.sourceProductId))?.reason ?? 'quarantined'
  }));
  if (valid.length !== 17 || quarantined.length !== 2) throw new Error(`Expected 17 valid and 2 quarantined products; found ${valid.length} valid and ${quarantined.length} quarantined.`);
  return { valid, quarantined };
}

function renderProduct(product) {
  const images = imagePaths(product); const primary = product.primaryImage ?? images[0] ?? '';
  const thumbnails = images.map((image, index) => `<button class="thumb${image === primary ? ' active' : ''}" data-image="/${esc(image)}" aria-label="Image ${index + 1}"><img src="/${esc(image)}" alt=""></button>`).join('');
  const specs = keySpecs(product).map(spec => `<li>${esc(spec)}</li>`).join('');
  return `<article class="product"><img class="primary" src="/${esc(primary)}" alt="${esc(`${product.brand} ${product.name}`)}"><div class="thumbs">${thumbnails}</div><h2>${esc(product.brand)} — ${esc(product.name)}</h2><p>Icecat ID: ${esc(product.sourceProductId)} · MPN: ${esc(product.mpn ?? 'not provided')} · GTIN: ${esc(product.gtin ?? 'not provided')}</p><ul>${specs}</ul><label><input type="checkbox"> PASS</label> <label><input type="checkbox"> REVIEW</label></article>`;
}

async function main() {
  const [catalog, selection] = await Promise.all([fs.readFile(catalogPath, 'utf8').then(JSON.parse), fs.readFile(selectionPath, 'utf8').then(JSON.parse)]);
  const { valid, quarantined } = splitPilotForReview(catalog, selection);
  await fs.writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), products: valid, quarantined }, null, 2)}\n`);
  const html = `<!doctype html><meta charset="utf-8"><title>LAVAALL pilot visual review</title><style>body{font:16px system-ui;margin:24px;background:#f4f9ff;color:#0a0a14}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}.product{background:#fff;border:2px solid #0a0a14;border-radius:16px;padding:16px}.primary{width:100%;height:240px;object-fit:contain}.thumbs{display:flex;gap:8px;margin:8px 0}.thumb{padding:2px;border:2px solid transparent;background:#fff}.thumb.active{border-color:#00c2ff}.thumb img{width:56px;height:44px;object-fit:contain}h1{margin-top:0}.quarantine{border-left:5px solid #ff5c5c;padding-left:12px}</style><h1>VALID FOR HUMAN VISUAL REVIEW: 17</h1><p>Local-only artifact. No public integration.</p><main class="grid">${valid.map(renderProduct).join('')}</main><h1>QUARANTINED: 2</h1><section class="quarantine">${quarantined.map(item => `<p>${esc(item.icecatId)} — ${esc(item.brand)} ${esc(item.productName)}: ${esc(item.reason)}</p>`).join('')}</section><script>document.querySelectorAll('.thumb').forEach(button=>button.addEventListener('click',()=>{const card=button.closest('.product');card.querySelector('.primary').src=button.dataset.image;card.querySelectorAll('.thumb').forEach(item=>item.classList.toggle('active',item===button));}));</script>`;
  await fs.writeFile(reviewPath, html);
  console.log(`QA data: ${outputPath}`); console.log(`QA page: ${reviewPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
