'use strict';

const COUNTRIES = [
  { code: '232', name: 'Sierra Leone', lengths: [8] },
  { code: '224', name: 'Guinea', lengths: [9] },
  { code: '231', name: 'Liberia', lengths: [8, 9] },
  { code: '1', name: 'US/Canada', lengths: [10] },
];

// Keep validation and length diagnostics together so every intake uses the same rules.
function contactPhone(value) {
  const raw = String(value || '').trim();
  if (!/^\+?[0-9 () .-]+$/.test(raw)) return { value: null };
  let digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+') && !raw.startsWith('00')) {
    return { value: /^0[23789]\d{7}$/.test(digits) ? '+232' + digits.slice(1) : null };
  }
  if (raw.startsWith('00')) digits = digits.slice(2);
  const country = COUNTRIES.find(item => digits.startsWith(item.code));
  if (!country) return { value: /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : null };
  let national = digits.slice(country.code.length);
  // NANP has no national trunk 0; the West African codes accept one trunk prefix.
  const trunk = country.code !== '1' && national.startsWith('0');
  if (trunk) national = national.slice(1);
  if (!country.lengths.includes(national.length)) return { value: null, wrongLength: country };
  if (country.code === '232' && !/^[23789]/.test(national)) return { value: null };
  return { value: country.code === '232' && raw.startsWith('+232') && !trunk
    ? raw : '+' + country.code + national };
}
function normalizeContactPhone(value) { return contactPhone(value).value; }
module.exports = { contactPhone, normalizeContactPhone };
