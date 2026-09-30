// Regression guard for SECURITY-AUDIT.md finding M1 (CSP): the
// script-src 'sha256-...' values in vercel.json only work as long as they
// match each page's actual inline <script> content byte-for-byte. This test
// recomputes the real hashes for index.html, privacy.html, and terms.html
// and fails loudly if vercel.json has drifted -- the failure message tells
// you to re-run scripts/security/compute-csp-hashes.mjs and update
// vercel.json.
//
// CRLF note: this repo's git blobs are LF (verified: 0 CRLF bytes in any of
// the three pages' committed content), but a contributor's local working
// tree can be checked out as CRLF (e.g. Windows with core.autocrlf=true --
// confirmed present on this exact machine). Hashing raw local bytes without
// normalizing would produce a hash that matches the LOCAL checkout but never
// matches what Vercel's Linux build actually serves. Both this test and
// scripts/security/compute-csp-hashes.mjs normalize CRLF -> LF before
// hashing so they agree with the real deployed bytes regardless of the
// contributor's line-ending settings.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const vercelConfig = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));

const scriptBlockPattern = /<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/g;

function actualHashesFor(file) {
  const html = readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const hashes = [];
  let match;
  scriptBlockPattern.lastIndex = 0;
  while ((match = scriptBlockPattern.exec(html))) {
    hashes.push(`sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}`);
  }
  return hashes;
}

function declaredHashesFor(source) {
  const block = vercelConfig.headers.find((h) => h.source === source);
  assert.ok(block, `Expected a headers block with source "${source}" in vercel.json`);
  const cspHeader = block.headers.find((h) => h.key === 'Content-Security-Policy-Report-Only' || h.key === 'Content-Security-Policy');
  assert.ok(cspHeader, `Expected a CSP (or CSP-Report-Only) header on source "${source}"`);
  const scriptSrcMatch = cspHeader.value.match(/script-src ([^;]+)/);
  if (!scriptSrcMatch) return []; // a page with no script-src (no inline scripts) is valid
  return (scriptSrcMatch[1].match(/'sha256-[^']+'/g) || []).map((s) => s.slice(1, -1));
}

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

// index.html is served at both "/" and "/index.html" (and "/schedule",
// which rewrites to the same page) -- all three sources must carry the same
// pair of hashes.
for (const source of ['/', '/index.html', '/schedule']) {
  const actual = actualHashesFor('index.html');
  const declared = declaredHashesFor(source);
  check(`${source}: declares ${actual.length} hash(es) matching index.html's actual inline scripts`,
    actual.length === declared.length && actual.every((h) => declared.includes(h)));
}

for (const [file, source] of [['privacy.html', '/privacy.html'], ['terms.html', '/terms.html']]) {
  const actual = actualHashesFor(file);
  const declared = declaredHashesFor(source);
  check(`${source}: declares ${actual.length} hash(es) matching ${file}'s actual inline scripts`,
    actual.length === declared.length && actual.every((h) => declared.includes(h)));
}

let failed = 0;
for (const r of results) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) console.log('\nIf this failed after an intentional edit to an inline <script> block, re-run scripts/security/compute-csp-hashes.mjs and update vercel.json.');
process.exit(failed ? 1 : 0);
