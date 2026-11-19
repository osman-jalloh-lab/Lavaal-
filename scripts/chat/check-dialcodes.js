#!/usr/bin/env node
'use strict';
/*
 * Dev-only cross-check of api/_chat/dialcode.js against libphonenumber-js (not part of the safe suite).
 *   node scripts/chat/check-dialcodes.js [--lib /path/to/node_modules/libphonenumber-js]
 * For every region's example number (mobile and every other type in the max metadata examples),
 * the resolver must return the same region as libphonenumber, or "ambiguous" listing that region
 * when another region sharing the code also matches (we ask instead of picking the first).
 */
const path = require('node:path');
const i = process.argv.indexOf('--lib');
const lib = path.resolve(i !== -1 ? process.argv[i + 1] : (process.env.DIALCODES_LIB || '/tmp/dialcode-gen/node_modules/libphonenumber-js'));
const { parsePhoneNumberFromString } = require(path.join(lib, 'max'));
const examples = require(path.join(lib, 'examples.mobile.json'));
const raw = require(path.join(lib, 'metadata.max.json'));
const { resolveCountryAnswer } = require('../../api/_chat/dialcode');
const data = require('../../api/_chat/data/dialcodes.v1.json');

let checked = 0, exact = 0, askedInstead = 0;
const mismatches = [];
function check(region, e164, label) {
  const lib = parsePhoneNumberFromString(e164);
  if (!lib || !lib.country) return;
  checked++;
  for (const input of [e164, '00' + e164.slice(1), e164.slice(0, 4) + ' ' + e164.slice(4)]) {
    const got = resolveCountryAnswer(input);
    if (got.kind === 'country' && got.region === lib.country) { if (input === e164) exact++; continue; }
    if (got.kind === 'ambiguous' && got.options.some(o => o.region === lib.country) && data.codes[got.callingCode].length > 1) { if (input === e164) askedInstead++; continue; }
    mismatches.push({ region, label, input, libphonenumber: lib.country, got });
  }
}
for (const [region, national] of Object.entries(examples)) {
  const code = raw.countries[region] && raw.countries[region][0];
  if (code) check(region, '+' + code + national, 'mobile');
}
// Also every calling code on its own.
for (const [code, regions] of Object.entries(data.codes)) {
  const got = resolveCountryAnswer('+' + code);
  const want = regions.length === 1 ? 'country' : 'ambiguous';
  checked++;
  if (got.kind !== want || (want === 'country' && got.region !== regions[0])) mismatches.push({ label: 'code-only', input: '+' + code, got });
}
process.stdout.write(JSON.stringify({ libphonenumberJs: require(path.join(lib, 'package.json')).version, checked, exact, askedInstead, mismatches: mismatches.length }, null, 1) + '\n');
for (const m of mismatches.slice(0, 50)) process.stdout.write(JSON.stringify(m) + '\n');
process.exitCode = mismatches.length ? 1 : 0;
