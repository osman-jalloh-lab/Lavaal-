// Builder answers must be one of the exact options the v4 page offers.
const OPTIONS = {
  place: ['Home', 'Business', 'Office', 'School', 'Hotel', 'Organization', 'Other'],
  country: ['Sierra Leone', 'Liberia', 'Guinea', 'Guinea-Bissau', 'Somewhere else'],
  need: ['New complete setup', 'I already have Starlink', 'Installation only', 'Better Wi-Fi coverage', 'Power backup', 'Not sure'],
  size: ['Small', 'Medium', 'Large', 'Multiple buildings'],
  priority: ['Lowest starting cost', 'Best Wi-Fi coverage', 'Backup power', 'Fast installation', 'Business reliability'],
};

// Dialling codes used to turn a local number (076 123 456) into +232 76 123 456.
const DIAL = { 'Sierra Leone': '232', Liberia: '231', Guinea: '224', 'Guinea-Bissau': '245' };

const EMAIL = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]{2,}$/;

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[<>"'`]/g, '').replace(/\s+/g, ' ').slice(0, max) : '';
}

function validateAnswers(body) {
  const b = body && typeof body === 'object' ? body : {};
  const answers = {};
  const errors = [];
  for (const key of Object.keys(OPTIONS)) {
    const v = typeof b[key] === 'string' ? b[key].trim() : '';
    if (!OPTIONS[key].includes(v)) errors.push(key);
    else answers[key] = v;
  }
  const city = clean(b.city, 80);
  if (city) answers.city = city;
  return { ok: errors.length === 0, answers, errors };
}

function normalizePhone(raw, country) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (/[^0-9+\s\-().]/.test(s)) return null;
  s = s.replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  const cc = DIAL[country];
  if (!s.startsWith('+')) {
    if (cc && s.startsWith('0')) s = '+' + cc + s.slice(1);
    else if (cc && s.length >= 7 && s.length <= 9) s = '+' + cc + s;
    else s = '+' + s;
  }
  return /^\+[1-9][0-9]{7,14}$/.test(s) ? s : null;
}

function normalizeEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  return s.length <= 120 && EMAIL.test(s) ? s : null;
}

module.exports = { OPTIONS, DIAL, clean, validateAnswers, normalizePhone, normalizeEmail };
