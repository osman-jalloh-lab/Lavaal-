const crypto = require('crypto');

// Same alphabet as the v4 page: no 0/O, 1/I to keep codes readable aloud.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^LV-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;

function newCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return 'LV-' + s;
}

function normalizeCode(value) {
  const c = String(value || '').trim().toUpperCase();
  return CODE_RE.test(c) ? c : '';
}

module.exports = { ALPHABET, CODE_RE, newCode, normalizeCode };
