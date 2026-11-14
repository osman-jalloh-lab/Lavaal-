'use strict';
/*
 * Read-only access to the generated public knowledge pack (api/_chat/knowledge/pack.v1.json).
 * The pack is produced by scripts/build-assistant-knowledge.js from existing public sources;
 * this module never adds facts of its own.
 *
 * Only the Technology section is mounted. The Web section is a stub: it is generated so the
 * team can review it, but selectFacts() returns nothing for it until LAVAALL Web (A4) is approved.
 */
const PACK = require('./knowledge/pack.v1.json');

const { terms } = require('./knowledge/terms');
const MOUNTED = Object.freeze({ technology: true, web: false });

function section(site = 'technology') {
  const key = site === 'web' ? 'web' : 'technology';
  const data = PACK.sections[key];
  return { site: key, mounted: MOUNTED[key] === true && data.mounted === true, stub: Boolean(data.stub), facts: data.facts };
}

// Simple keyword overlap over the pack. No embeddings; the catalogue itself is still looked up by
// api/_chat/catalog.js and narrow.js, so product names are never duplicated here.
function selectFacts(text, { site = 'technology', limit = 4 } = {}) {
  const current = section(site);
  if (!current.mounted) return [];
  const asked = new Set(terms(text));
  if (!asked.size) return [];
  const scored = [];
  for (const fact of current.facts) {
    let score = 0;
    for (const k of fact.keywords) if (asked.has(k)) score += k.length > 3 ? 2 : 1;
    if (score >= 2) scored.push({ fact, score });
  }
  scored.sort((a, b) => b.score - a.score || a.fact.id.localeCompare(b.fact.id));
  return scored.slice(0, Math.max(0, limit)).map(item => ({ id: item.fact.id, text: item.fact.text }));
}

function missingLine(site = 'technology') {
  return site === 'web' ? PACK.missing.web : PACK.missing.technology;
}

module.exports = {
  PACK,
  VERSION: PACK.version,
  CONTENT_HASH: PACK.contentHash,
  BEHAVIOUR: PACK.behaviour,
  section,
  selectFacts,
  missingLine,
};
