#!/usr/bin/env node
'use strict';
/*
 * Builds api/_chat/data/dialcodes.v1.json from libphonenumber-js metadata (dev only, offline).
 *
 *   node scripts/chat/build-dialcodes.js [--lib /path/to/node_modules/libphonenumber-js] [--date YYYY-MM-DD]
 *
 * The library is never fetched here: install it once outside the repo, e.g.
 *   mkdir -p /tmp/dialcode-gen && cd /tmp/dialcode-gen && npm i libphonenumber-js
 * Output is deterministic for a given library version and --date.
 */
const fs = require('node:fs');
const path = require('node:path');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const lib = path.resolve(arg('--lib', process.env.DIALCODES_LIB || '/tmp/dialcode-gen/node_modules/libphonenumber-js'));
const date = arg('--date', process.env.DIALCODES_DATE || '2026-11-19');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date must be YYYY-MM-DD');
const out = path.join(__dirname, '..', '..', 'api', '_chat', 'data', 'dialcodes.v1.json');

const pkg = require(path.join(lib, 'package.json'));
const raw = require(path.join(lib, 'metadata.max.json'));
const { Metadata } = require(path.join(lib, 'core'));
const metadata = new Metadata(raw);
const regionName = new Intl.DisplayNames('en', { type: 'region' });
// Short, readable English names where the ICU name is long or unclear in a chat chip.
const NAME_OVERRIDES = { TA: 'Tristan da Cunha', AC: 'Ascension Island', MM: 'Myanmar' };
const TYPES = ['FIXED_LINE', 'MOBILE', 'TOLL_FREE', 'PREMIUM_RATE', 'PERSONAL_NUMBER', 'VOICEMAIL', 'UAN', 'PAGER', 'VOIP', 'SHARED_COST'];

const codes = {};
const names = {};
const plans = {};
for (const code of Object.keys(raw.country_calling_codes).sort((a, b) => Number(a) - Number(b))) {
  const regions = raw.country_calling_codes[code].filter(region => region !== '001');
  if (!regions.length) continue;
  codes[code] = regions;
  for (const region of regions) {
    const name = NAME_OVERRIDES[region] || regionName.of(region);
    if (!name || name === region) throw new Error('No English name for ' + region);
    names[region] = name;
    metadata.selectNumberingPlan(region);
    const plan = metadata.numberingPlan;
    const types = [];
    // Per-type patterns are only needed to tell apart regions that share a calling code.
    if (regions.length > 1 && plan.hasTypes()) {
      for (const type of TYPES) {
        const desc = plan.type(type);
        if (desc && desc.pattern()) types.push(desc.possibleLengths() ? [desc.pattern(), desc.possibleLengths()] : [desc.pattern()]);
      }
    }
    plans[region] = regions.length > 1 ? {
      leadingDigits: plan.leadingDigits() || null,
      pattern: plan.nationalNumberPattern(),
      lengths: plan.possibleLengths(),
      types,
    } : { pattern: plan.nationalNumberPattern(), lengths: plan.possibleLengths() };
  }
}
const nonGeographic = Object.keys(raw.nonGeographic || {}).sort((a, b) => Number(a) - Number(b));
for (const code of nonGeographic) if (codes[code]) throw new Error('Non-geographic code also geographic: ' + code);

const data = {
  _meta: {
    name: 'LAVAALL chat dialling-code table',
    source: 'libphonenumber-js ' + pkg.version + ' metadata.max.json, derived from Google libphonenumber (github.com/google/libphonenumber) metadata',
    version: pkg.version,
    licenses: { 'libphonenumber-js': pkg.license, 'google-libphonenumber-metadata': 'Apache-2.0' },
    generated: date,
    generator: 'scripts/chat/build-dialcodes.js',
    names: 'English region names from ICU Intl.DisplayNames (Node ' + process.versions.icu + ' ICU), with NAME_OVERRIDES in the generator',
    counts: { callingCodes: Object.keys(codes).length, regions: Object.keys(names).length, sharedRegions: Object.values(codes).filter(list => list.length > 1).reduce((n, list) => n + list.length, 0), nonGeographic: nonGeographic.length },
    notes: 'Country calling codes only. Zip/postal codes are not covered. Do not edit by hand; regenerate.',
  },
  codes,
  names: Object.fromEntries(Object.keys(names).sort().map(k => [k, names[k]])),
  nonGeographic,
  plans: Object.fromEntries(Object.keys(plans).sort().map(k => [k, plans[k]])),
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(data, null, 1) + '\n');
process.stdout.write('wrote ' + path.relative(process.cwd(), out) + ' ' + JSON.stringify(data._meta.counts) + '\n');
