import assert from 'node:assert/strict';
import { enrichCandidateMetadata } from './lib/candidate-enrichment.mjs';
const xml = `<Product ID="1" Name="ThinkBook" Prod_id="M1"><Supplier ID="728" Name="Lenovo"/><Category ID="151" Name="Laptops"/><EanCode EAN="1"/><ProductFeature Name="Certified refurbished" Presentation_Value="No"/><ProductPicture Original="x"/></Product>`;
const base = enrichCandidateMetadata({ lavaallCategory: 'computers', brand: 'Lenovo', icecatId: '1' }, xml, { mappings: [{ sourceCategoryId: '151', sourceCategoryName: 'Laptops', lavaallCategory: 'computers' }] });
assert.equal(base.conditionEvidence, null);
console.log('condition evidence test: passed');
