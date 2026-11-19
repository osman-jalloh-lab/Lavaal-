'use strict';
/*
 * Deterministic country lookup for a numeric "which country?" answer: +232, 232, 00232, or a full
 * international number. Uses only the checked-in table in ./data/dialcodes.v1.json (generated from
 * libphonenumber metadata; see ./data/README.md). No network, no model, no guessing: when a calling
 * code is shared and the digits do not decide it, the caller must ask with chips.
 *
 * resolveCountryAnswer(text) returns one of:
 *   { kind: 'none' }                                   not a numeric answer (has letters); keep the text path
 *   { kind: 'country', region, name, callingCode, via } via is 'code' or 'number'
 *   { kind: 'ambiguous', callingCode, options }        options: [{ region, name }], never guessed
 *   { kind: 'unknown', callingCode? }                  digits that name no country
 */
const DATA = require('./data/dialcodes.v1.json');

// Chip order for codes shared by many regions (the rest follow in metadata order).
const PRIORITY = { 1: ['US', 'CA', 'JM', 'TT'] };
const NONE = Object.freeze({ kind: 'none' });
const MAX_DIGITS = 17;
const nonGeographic = new Set(DATA.nonGeographic);
const regexCache = new Map();
function regex(source, anchoredEnd) {
  const key = (anchoredEnd ? '$' : '^') + source;
  if (!regexCache.has(key)) regexCache.set(key, new RegExp('^(?:' + source + ')' + (anchoredEnd ? '$' : '')));
  return regexCache.get(key);
}
const fullMatch = (source, digits) => Boolean(source) && regex(source, true).test(digits);
const startsWith = (source, digits) => Boolean(source) && regex(source, false).test(digits);

function option(region) { return { region, name: DATA.names[region] }; }
function orderedOptions(code, regions) {
  const first = (PRIORITY[code] || []).filter(region => regions.includes(region));
  return first.concat(regions.filter(region => !first.includes(region))).map(option);
}
function country(code, region, via) { return { kind: 'country', region, name: DATA.names[region], callingCode: code, via }; }
function unknown(code) { return code ? { kind: 'unknown', callingCode: code } : { kind: 'unknown' }; }

// Mirrors libphonenumber's getNumberType() != undefined for one region.
function validFor(region, national) {
  const plan = DATA.plans[region];
  if (!plan || !fullMatch(plan.pattern, national)) return false;
  return (plan.types || []).some(([pattern, lengths]) => (!lengths || lengths.includes(national.length)) && fullMatch(pattern, national));
}
function possibleFor(region, national) {
  const plan = DATA.plans[region];
  return Boolean(plan) && plan.lengths.includes(national.length) && fullMatch(plan.pattern, national);
}

// Same checks as libphonenumber's getCountryByNationalNumber(), but every matching region is kept:
// libphonenumber returns the first match (e.g. US for a toll-free number Canada also uses); we ask instead.
function sharedMatches(regions, national) {
  return regions.filter(region => {
    const leading = DATA.plans[region] && DATA.plans[region].leadingDigits;
    return leading ? startsWith(leading, national) : validFor(region, national);
  });
}
function minLength(regions) {
  return Math.min(...regions.map(region => Math.min(...DATA.plans[region].lengths)));
}

function splitCode(digits) {
  for (const size of [1, 2, 3]) {
    const code = digits.slice(0, size);
    if (DATA.codes[code] || nonGeographic.has(code)) return { code, national: digits.slice(size) };
  }
  return null;
}

function resolveCountryAnswer(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw || /\p{L}/u.test(raw)) return NONE;
  if (!/\d/.test(raw)) return unknown();
  if (!/^[+\d\s().\-]+$/.test(raw)) return unknown();
  let digits = raw.replace(/[\s().\-]/g, '');
  if (!/^\+?\d+$/.test(digits)) return unknown();
  let international = false;
  if (digits.startsWith('+')) { international = true; digits = digits.slice(1); }
  else if (digits.startsWith('00')) { international = true; digits = digits.slice(2); }
  else if (/^0+\d{1,3}$/.test(digits)) digits = digits.replace(/^0+/, '');
  else if (digits.startsWith('0')) return unknown(); // a local number has no country code in it
  if (!/^[1-9]\d*$/.test(digits) || digits.length > MAX_DIGITS) return unknown();

  // A code on its own: 1 to 3 digits that must be an assigned code exactly.
  if (digits.length <= 3) {
    const regions = DATA.codes[digits];
    if (!regions) return unknown(nonGeographic.has(digits) ? digits : undefined);
    return regions.length === 1 ? country(digits, regions[0], 'code') : { kind: 'ambiguous', callingCode: digits, options: orderedOptions(digits, regions) };
  }

  const split = splitCode(digits);
  if (!split || nonGeographic.has(split.code)) return unknown(split && split.code);
  const { code, national } = split;
  const regions = DATA.codes[code];
  if (regions.length === 1) {
    // "+232 76..." names Sierra Leone by its code. Without + or 00 the rest must look like a real number.
    if (international || possibleFor(regions[0], national)) return country(code, regions[0], international ? 'code' : 'number');
    return unknown();
  }
  const ambiguous = list => ({ kind: 'ambiguous', callingCode: code, options: orderedOptions(code, list) });
  if (national.length < minLength(regions)) {
    // NANP style area code ("1268", "+1 876"): decided only by a region's own leading digits.
    const byLeading = regions.filter(region => startsWith(DATA.plans[region].leadingDigits, national));
    if (national.length >= 3 && byLeading.length === 1) return country(code, byLeading[0], 'number');
    return international ? ambiguous(regions) : unknown();
  }
  // Without + or 00 the digits must also be a possible number for the region, not just start right.
  const matches = sharedMatches(regions, national).filter(region => international || possibleFor(region, national));
  if (matches.length === 1) return country(code, matches[0], 'number');
  if (matches.length > 1) return ambiguous(matches);
  return international ? ambiguous(regions) : unknown();
}

// Exact English region name from the table (case and accent insensitive), for a tapped chip.
const fold = value => String(value || '').trim().replace(/[.!]+$/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const byName = new Map(Object.entries(DATA.names).map(([region, name]) => [fold(name), region]));
function countryByName(text) {
  const region = byName.get(fold(text));
  return region ? option(region) : null;
}

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
// True for an answer that is only a phone-style number written with + or 00. A 13-19 digit string
// that passes the card checksum is never treated as a phone number, so card screening still applies.
function isInternationalNumberAnswer(text) {
  const raw = String(text || '').trim();
  if (!/^[\s(]*(?:\+|00)[\d\s().\-]+$/.test(raw)) return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return false;
  const kind = resolveCountryAnswer(raw).kind;
  return kind === 'country' || kind === 'ambiguous';
}

module.exports = { resolveCountryAnswer, isInternationalNumberAnswer, countryByName, meta: DATA._meta };
