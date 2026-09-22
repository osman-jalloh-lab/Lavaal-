// Talk persona source of truth: docs/ops/souls.
// Every desk loads _SHARED_CONTEXT.md first, then SOUL_<id>.md.
// Literal readFileSync paths so the server function tracer ships the files.
// vercel.json includeFiles is the Preview bundle backup. No npm. No secrets.

const fs = require('fs');
const path = require('path');

const SOUL_IDS = Object.freeze([
  'lavaall-ceo',
  'sales',
  'technical',
  'growth',
  'lifecycle',
  'researchy',
]);

const cache = new Map();

function readCached(key, filePath) {
  if (cache.has(key)) return cache.get(key);
  const text = fs.readFileSync(filePath, 'utf8').replace(/\s+$/, '');
  if (!text) throw new Error(`empty_soul:${key}`);
  cache.set(key, text);
  return text;
}

function sharedContext() {
  return readCached('shared', path.join(__dirname, '../../docs/ops/souls/_SHARED_CONTEXT.md'));
}

function deskSoul(agentId) {
  switch (agentId) {
    case 'lavaall-ceo':
      return readCached('lavaall-ceo', path.join(__dirname, '../../docs/ops/souls/SOUL_lavaall-ceo.md'));
    case 'sales':
      return readCached('sales', path.join(__dirname, '../../docs/ops/souls/SOUL_sales.md'));
    case 'technical':
      return readCached('technical', path.join(__dirname, '../../docs/ops/souls/SOUL_technical.md'));
    case 'growth':
      return readCached('growth', path.join(__dirname, '../../docs/ops/souls/SOUL_growth.md'));
    case 'lifecycle':
      return readCached('lifecycle', path.join(__dirname, '../../docs/ops/souls/SOUL_lifecycle.md'));
    case 'researchy':
      return readCached('researchy', path.join(__dirname, '../../docs/ops/souls/SOUL_researchy.md'));
    default: {
      const unknown = agentId;
      void unknown;
      throw new Error(`unknown_desk_soul:${String(agentId || '')}`);
    }
  }
}

function talkSystemPrompt(agentId, trustedContext) {
  const records = typeof trustedContext === 'string' ? trustedContext.trim() : '';
  return [sharedContext(), deskSoul(agentId), records].filter(Boolean).join('\n\n');
}

module.exports = {
  SOUL_IDS,
  sharedContext,
  deskSoul,
  talkSystemPrompt,
};
