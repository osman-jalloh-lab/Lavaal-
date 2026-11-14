'use strict';
// Shared keyword rules for the knowledge pack generator and runtime lookup.
const STOP = new Set(('the and for with our you your are can from that this not any all into its out has have will also of to in on ' +
  'a an or is be we it as by at do does how what who where when which me my i una de ' +
  // Boilerplate that appears in many facts and would match every question.
  'price prices pricing stock confirmation confirm listing listed catalogue catalog entries entry brands including public team ' +
  'lavaall visitor offer request inquiry').split(' '));
function stem(word) {
  return word.replace(/(ations?|ings?|ers?|ies|es|s)$/, '') || word;
}
function terms(...texts) {
  const out = new Set();
  for (const t of texts) {
    for (const w of String(t || '').toLowerCase().match(/[a-z0-9][a-z0-9+-]{1,}/g) || []) {
      if (!STOP.has(w)) { const s = stem(w); if (s.length >= 2 && !STOP.has(s)) out.add(s); }
    }
  }
  return [...out].sort();
}
module.exports = { terms, stem, STOP };
