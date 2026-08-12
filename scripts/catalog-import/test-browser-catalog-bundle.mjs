import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = JSON.parse(await fs.readFile(path.join(rootDir, 'assets/data/catalog-generated.json'), 'utf8'));
const bundle = await fs.readFile(path.join(rootDir, 'assets/data/catalog-generated.js'), 'utf8');
const context = { window: {}, Object };
vm.runInNewContext(bundle, context);
const fromJson = (json.products || []).filter(product => product.integrationApproved === true && product.identityStatus === 'verified' && product.visualQaStatus === 'PASS' && product.mediaUsageStatus === 'permitted' && product.quarantined !== true).map(product => String(product.sourceProductId)).sort();
const fromBundle = (context.window.LAVAALL_GENERATED_CATALOG.products || []).map(product => String(product.sourceProductId)).sort();
assert.equal(JSON.stringify(fromBundle), JSON.stringify(fromJson));
assert.ok(fromBundle.length >= 28, 'approved catalog cannot regress below the initial released baseline');
assert.equal(fromBundle.some(id => id === '145145130' || id === '145145101'), false);
console.log(`browser catalog bundle parity: ${fromBundle.length} products`);
