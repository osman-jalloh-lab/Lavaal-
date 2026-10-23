// api/os/_data/index.js — the LAVAALL OS data pack, built 22 Oct 2026.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// Static and read-only. The JSON files next to this one are committed exactly as exported and are
// bundled with the /os function through these literal require() calls, so no vercel.json change is
// needed. They are never written to the KV store. api/ops/_os_data.js reads them; nothing writes them.

module.exports = Object.freeze({
  builtAt: '2026-10-22',
  decisions: require('./decisions.json'),
  routines: require('./routines.json'),
  desks: require('./desks.json'),
  skills: require('./skills.json'),
  rules: require('./rules.json'),
});
