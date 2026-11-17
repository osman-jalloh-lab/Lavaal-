'use strict';
// Dependency-free checks for branch schema, static branch details, and canonical routes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const origin = 'https://www.lavaall.com';

const covLiteral = html.match(/\bconst covData\s*=\s*(\{[\s\S]*?\n\});/);
assert.ok(covLiteral, 'coverage data literal exists');
const branches = vm.runInNewContext(`(${covLiteral[1]}).sl.branches`, Object.create(null), { timeout: 1000 });
assert.equal(branches.length, 6);
const blocks = [...html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => JSON.parse(match[1]));
const organization = blocks.find(block => block['@type'] === 'Organization');
assert.ok(organization, 'existing Organization exists');
assert.equal(organization.contactPoint[0].telephone, '+1-737-704-4182');
assert.equal(organization.contactPoint[0].email, 'support@lavaall.com');
const graphs = blocks.filter(block => Array.isArray(block['@graph']));
assert.equal(graphs.length, 1, 'one branch graph');
assert.equal(graphs[0]['@context'], 'https://schema.org');
const nodes = graphs[0]['@graph'];
assert.equal(nodes.length, 6, 'exactly six LocalBusiness nodes');
const slugs = ['bo', 'makeni', 'waterloo', 'freetown-brookfields', 'kenema', 'kono'];
const keys = ['@type', '@id', 'name', 'url', 'parentOrganization', 'address'];
nodes.forEach((node, i) => {
  const branch = branches[i];
  assert.equal(node['@type'], 'LocalBusiness');
  assert.equal(node['@id'], `${origin}/#branch-${slugs[i]}`);
  assert.equal(node.name, 'LAVAALL – ' + branch.city);
  assert.equal(node.url, `${origin}/#coverage`);
  assert.deepEqual(node.parentOrganization, { '@id': organization['@id'] });
  assert.deepEqual(Object.keys(node).sort(), [...keys, ...(i === 0 ? ['telephone'] : [])].sort());
  assert.deepEqual(Object.keys(node.address).sort(), ['@type', 'streetAddress', 'addressLocality', 'addressCountry'].sort());
  assert.deepEqual(node.address, {
    '@type': 'PostalAddress',
    streetAddress: branch.address,
    addressLocality: branch.city,
    addressCountry: 'SL'
  });
  if (i === 0) {
    assert.equal(branch.city, 'Bo');
    assert.equal(branch.phone, '076 658 960');
    assert.equal(node.telephone, branch.phone);
  } else assert.ok(!Object.hasOwn(node, 'telephone'), `${branch.city} has no telephone`);
});

const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const footer = markup.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i);
assert.ok(footer, 'footer exists');
const branchMarkup = footer[1].match(/<div\b[^>]*\bclass=["']fbranches["'][^>]*>([\s\S]*?)<\/div>/i);
assert.ok(branchMarkup, 'static footer branch block exists');
const addresses = [...branchMarkup[1].matchAll(/<li>\s*<address>([\s\S]*?)<\/address>\s*<\/li>/gi)];
assert.equal(addresses.length, 6, 'six static footer branch addresses');
addresses.forEach((match, i) => {
  const text = match[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  assert.ok(text.includes(branches[i].city), `${branches[i].city}: static city`);
  assert.ok(text.includes(branches[i].address), `${branches[i].city}: static address`);
});
assert.ok(addresses[0][1].includes('076 658 960'), 'Bo phone is static text');

const config = JSON.parse(read('vercel.json'));
const expectedRedirects = [
  { source: '/index.html', destination: '/', statusCode: 301 },
  { source: '/sierra-leone', destination: '/sierra-leone/', statusCode: 301 },
  { source: '/privacy', destination: '/privacy.html', statusCode: 301 },
  { source: '/privacy/', destination: '/privacy.html', statusCode: 301 }
];
assert.ok(Array.isArray(config.redirects), 'redirects array exists');
for (const expected of expectedRedirects) {
  assert.deepEqual(config.redirects.find(redirect => redirect.source === expected.source), expected);
}
const sources = new Set(config.redirects.map(redirect => redirect.source));
for (const redirect of config.redirects) assert.ok(!sources.has(redirect.destination), `no redirect loop from ${redirect.source}`);
let baseline;
try {
  baseline = execFileSync('git', ['show', 'origin/main:vercel.json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) {
  console.log('SKIP origin/main rewrites comparison: git or reference unavailable');
}
if (baseline !== undefined) assert.deepEqual(config.rewrites, JSON.parse(baseline).rewrites, 'rewrites unchanged from origin/main');

const expectedLastmods = {
  [`${origin}/`]: '2026-11-16',
  [`${origin}/sierra-leone/`]: '2026-11-08',
  [`${origin}/sierra-leone/laptops/`]: '2026-11-08',
  [`${origin}/sierra-leone/computers/`]: '2026-11-08',
  [`${origin}/sierra-leone/networking-equipment/`]: '2026-11-08',
  [`${origin}/sierra-leone/it-procurement/`]: '2026-11-08',
  [`${origin}/sierra-leone/phones/`]: '2026-11-08',
  [`${origin}/privacy.html`]: '2026-11-15',
  [`${origin}/terms.html`]: '2026-11-16'
};
const entries = [...read('sitemap.xml').matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g)];
assert.equal(entries.length, 9);
assert.deepEqual(Object.fromEntries(entries.map(entry => [entry[1], entry[2]])), expectedLastmods);
const terms = read('terms.html');
assert.ok(terms.includes('Sierra Leone, Guinea, Liberia, and Guinea-Bissau'));
assert.ok(!terms.includes('Sierra Leone, Guinea, and Guinea-Bissau'));
console.log('PASS SEO basics: branch schema and static footer, organization contacts, redirects, rewrites, sitemap dates, terms coverage');
