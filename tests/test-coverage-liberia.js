'use strict';
// Public coverage map and the assistant agree that LAVAALL delivers to Liberia.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const { respond } = require('../api/_chat/responder');
assert.match(html, /"areaServed": \[[^\]]*"Liberia"/);
assert.match(html, /data-code="lr" onclick="pickCountry\(this,'lr'\)"[^>]*>.*data-i18n="cov\.lr">Liberia</);
assert.match(html, /const validCodes = \['sl', 'gn', 'gw', 'lr'\];/);
assert.match(html, /\n  lr:\{flag:'🇱🇷',en:\{name:'Liberia',text:'We deliver to Liberia/);
for (const label of ["'cov.lr':'Liberia'", "'cov.lr':'Libéria'", "'cov.lr':'Laybiria'"]) assert.ok(html.includes(label), label);
assert.ok(html.includes('<span class="sw-chip">Liberia</span>'));
// Osman: do not change the Bo branch number.
assert.ok(html.includes("{city:'Bo',address:'28 Bojon Street',phone:'076 658 960'}"));
const install = respond('Do you install equipment in Sierra Leone?', {});
assert.match(install.text, /Sierra Leone, Guinea, Liberia, and Guinea-Bissau/);
const delivery = respond('Do you deliver to Liberia?', {});
assert.match(delivery.text, /Liberia/);
assert.doesNotMatch(delivery.text, /don't|do not deliver/i);
const kb = fs.readFileSync(path.join(__dirname, '..', 'docs', 'customer-assistant', 'kb-technology.md'), 'utf8');
assert.doesNotMatch(kb, /describes? Sierra Leone, Guinea, and Guinea-Bissau/);
console.log('PASS Liberia coverage: site map, i18n, schema, bot install/delivery lines, KB; Bo number unchanged');
