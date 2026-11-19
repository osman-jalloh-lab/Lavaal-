'use strict';
// Dialling-code → country resolver (api/_chat/dialcode.js). Pure and offline: static JSON table only.
const assert = require('node:assert/strict');
const { resolveCountryAnswer: resolve, isInternationalNumberAnswer, countryByName, meta } = require('../api/_chat/dialcode');
const data = require('../api/_chat/data/dialcodes.v1.json');

let count = 0;
const names = result => result.options.map(option => option.name);
function country(input, region, name, code) {
  const result = resolve(input);
  assert.equal(result.kind, 'country', input + ' → ' + JSON.stringify(result));
  assert.equal(result.region, region, input);
  if (name) assert.equal(result.name, name, input);
  if (code) assert.equal(result.callingCode, code, input);
  count++;
}
function ambiguous(input, code, expected, exact = true) {
  const result = resolve(input);
  assert.equal(result.kind, 'ambiguous', input + ' → ' + JSON.stringify(result));
  assert.equal(result.callingCode, code, input);
  if (exact) assert.deepEqual(names(result), expected, input);
  else for (const name of expected) assert.ok(names(result).includes(name), input + ' missing ' + name);
  count++;
}
function unknown(input) {
  const result = resolve(input);
  assert.equal(result.kind, 'unknown', JSON.stringify(input) + ' → ' + JSON.stringify(result));
  count++;
}
function none(input) {
  assert.deepEqual(resolve(input), { kind: 'none' }, JSON.stringify(input));
  count++;
}

// Dataset header: source, version and licences are recorded; every code maps to named regions.
assert.match(meta.source, /libphonenumber-js \d+\.\d+\.\d+ metadata\.max\.json/);
assert.equal(meta.licenses['libphonenumber-js'], 'MIT');
assert.equal(meta.licenses['google-libphonenumber-metadata'], 'Apache-2.0');
assert.ok(Object.keys(data.codes).length >= 200);
for (const regions of Object.values(data.codes)) for (const region of regions) assert.ok(data.names[region], region);

// Sierra Leone in every accepted format.
for (const input of ['+232', '232', '00232', '0232', '(+232)', ' +232 ', '+ 232', '+232.', '+23276123456', '0023276123456', '+232 76 123456',
  '+232-76-123-456', '+232 (76) 123 456', '00 232 76 123 456', '23276123456', '+232 25 123456']) {
  country(input, 'SL', 'Sierra Leone', '232');
}
assert.equal(resolve('232').via, 'code');
assert.equal(resolve('23276123456').via, 'number');
country('224', 'GN', 'Guinea', '224');
country('+231', 'LR', 'Liberia', '231');
country('245', 'GW', 'Guinea-Bissau', '245');
country('+233', 'GH', 'Ghana', '233');
country('+234 803 123 4567', 'NG', 'Nigeria', '234');
country('+383', 'XK', 'Kosovo', '383');

// Shared codes: code only → chips with the right countries, never a guess.
ambiguous('+1', '1', ['United States', 'Canada', 'Jamaica', 'Trinidad & Tobago'], false);
assert.deepEqual(names(resolve('+1')).slice(0, 4), ['United States', 'Canada', 'Jamaica', 'Trinidad & Tobago']);
assert.equal(resolve('+1').options.length, data.codes['1'].length);
ambiguous('1', '1', ['United States', 'Canada'], false);
ambiguous('001', '1', ['United States', 'Canada'], false);
ambiguous('+7', '7', ['Russia', 'Kazakhstan']);
ambiguous('7', '7', ['Russia', 'Kazakhstan']);
ambiguous('+44', '44', ['United Kingdom', 'Guernsey', 'Isle of Man', 'Jersey']);
ambiguous('0044', '44', ['United Kingdom', 'Guernsey', 'Isle of Man', 'Jersey']);
ambiguous('+47', '47', ['Norway', 'Svalbard & Jan Mayen']);
ambiguous('+61', '61', ['Australia', 'Cocos (Keeling) Islands', 'Christmas Island']);
ambiguous('+262', '262', ['Réunion', 'Mayotte']);
ambiguous('+590', '590', ['Guadeloupe', 'St. Barthélemy', 'St. Martin']);
ambiguous('+599', '599', ['Curaçao', 'Caribbean Netherlands']);
ambiguous('+358', '358', ['Finland', 'Åland Islands']);
ambiguous('+212', '212', ['Morocco', 'Western Sahara']);
ambiguous('+290', '290', ['St. Helena', 'Tristan da Cunha']);

// Full numbers that the metadata decides (libphonenumber example numbers / reserved 555-01xx).
country('+1 201 555 0123', 'US', 'United States');
country('+1 416 555 0123', 'CA', 'Canada');
country('+1 506 234 5678', 'CA', 'Canada');
country('+1 876 210 1234', 'JM', 'Jamaica');
country('1268', 'AG', 'Antigua & Barbuda');
country('1-268', 'AG');
country('+1 268', 'AG');
country('+1 876', 'JM');
country('+7 912 345 6789', 'RU', 'Russia');
country('+7 771 000 9998', 'KZ', 'Kazakhstan');
country('+44 7400 123456', 'GB', 'United Kingdom');
country('+44 1481 256789', 'GG', 'Guernsey');
country('+44 7624 123456', 'IM', 'Isle of Man');
country('+44 7797 712345', 'JE', 'Jersey');
country('+61 2 1234 5678', 'AU', 'Australia');
country('+262 692 12 34 56', 'RE', 'Réunion');
country('+262 639 01 23 45', 'YT', 'Mayotte');
// …and ones it does not decide: shared mobile ranges or too-short / unallocated national parts.
ambiguous('+61 412 345 678', '61', ['Australia', 'Cocos (Keeling) Islands', 'Christmas Island']);
ambiguous('+590 690 00 12 34', '590', ['Guadeloupe', 'St. Barthélemy', 'St. Martin']);
ambiguous('+44 1234', '44', ['United Kingdom', 'Guernsey', 'Isle of Man', 'Jersey']);
ambiguous('+1 555', '1', ['United States', 'Canada'], false);
ambiguous('+7 000 000 0000', '7', ['Russia', 'Kazakhstan']);

// Unknown: unassigned and non-geographic codes, local numbers with no code, junk.
for (const input of ['999', '+999', '00999', '+969', '+801', '+0', '0', '00', '000', '000232', '12', '+800', '+882 1234 5678', '+979',
  '076 123456', '076123456', '0 76 123 456', '+', '++232', '+-', '--', '()', '+232+', '232/76', '#232', '1234567890123456789012', '+23', '99 99',
  '7 912 345 6789 0']) unknown(input);
assert.equal(resolve('+800').callingCode, '800');
// Bare digits must look like a real number: "76123456" is a Sierra Leone national number, not Russia.
unknown('76123456');
unknown('2327');

// Text answers keep the existing path untouched.
for (const input of ['Ghana', 'Sierra Leone', 'Sierra Leone, Freetown', 'Guinea-Bissau', 'skip', '12a', 'zone 4', 'Freetown 232', '', '   ', null, undefined]) none(input);

// Phone vs code: a bare short code is a code, a long +/00 string is a number for the same country.
assert.equal(resolve('232').via, 'code');
assert.equal(resolve('+232 76 123456').kind, 'country');
assert.equal(resolve('076 123456').kind, 'unknown');

// Card screening helper: +/00 numbers count as phone answers, card-checksum strings never do.
assert.equal(isInternationalNumberAnswer('+232 76 123456'), true);
assert.equal(isInternationalNumberAnswer('0023276123456'), true);
assert.equal(isInternationalNumberAnswer('+1'), true);
assert.equal(isInternationalNumberAnswer('232'), false);
assert.equal(isInternationalNumberAnswer('+999'), false);
assert.equal(isInternationalNumberAnswer('+4111111111111111'), false);
assert.equal(isInternationalNumberAnswer('4111 1111 1111 1111'), false);

assert.deepEqual(countryByName('canada'), { region: 'CA', name: 'Canada' });
assert.deepEqual(countryByName('Reunion'), { region: 'RE', name: 'Réunion' });
assert.equal(countryByName('Atlantis'), null);

// Never throws on odd input.
for (const input of [{}, [], 232, 0, '\u0000', '+'.repeat(500), '9'.repeat(500)]) assert.doesNotThrow(() => resolve(input));

console.log('test-chat-dialcode: ' + count + ' resolver cases passed');
