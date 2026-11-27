#!/usr/bin/env node
// Compile docs/os/knowledge/**/*.md into api/os/_data/knowledge.json so the deployed OS can read the shared
// memory (Vercel ships only files the code requires). Git stays the source of truth: the pack carries a
// content hash, and tests/test-os-knowledge.js fails if the pack and the folder disagree.
//   node scripts/build-knowledge-pack.js          write the pack
//   node scripts/build-knowledge-pack.js --check  exit 1 if the pack is stale
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'os', 'knowledge');
const OUT = path.join(ROOT, 'api', 'os', '_data', 'knowledge.json');
const MAX_FILE = 64 * 1024;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    .filter((f) => f.endsWith('.md'));
}

// Business briefs: docs/os/knowledge/<business>/README.md and RULES.md. Every line that is not a heading or blank
// must end with "[src: <repo path or github.com/...>, YYYY-MM-DD]", and the repo path must exist. Notes proposed
// from the OS carry their own source:/date: header and are checked separately.
const SRC_TAG = /\[src: ([^,\]]+), (\d{4}-\d{2}-\d{2})\]\s*$/;
function isBrief(rel) { return /^docs\/os\/knowledge\/[a-z0-9-]+\/(README|RULES)\.md$/.test(rel); }
function unsourcedLines(rel, text, root) {
  const base = root || ROOT;
  if (!isBrief(rel)) return [];
  return String(text).split('\n').map((line, i) => ({ line: line.trim(), n: i + 1 })).filter(({ line }) => {
    if (!line || line.startsWith('#')) return false;
    const m = SRC_TAG.exec(line);
    if (!m) return true;
    const ref = m[1].trim();
    if (/^github\.com\/osman-jalloh-lab\/[\w.-]+(\/[\w./#-]*)?$/.test(ref)) return false;
    return !fs.existsSync(path.join(base, ref));
  }).map(({ n, line }) => `${rel}:${n}: ${line.slice(0, 80)}`);
}

function buildPack(src) {
  const base = src || SRC;
  const files = walk(base).map((file) => {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    if (Buffer.byteLength(text) > MAX_FILE) throw new Error(`${rel} is over 64 KB; split it`);
    const bad = unsourcedLines(rel, text);
    if (bad.length) throw new Error(`unsourced lines (add [src: path, YYYY-MM-DD]):\n${bad.join('\n')}`);
    return { path: rel, text };
  });
  const hash = crypto.createHash('sha256');
  files.forEach((f) => { hash.update(f.path); hash.update('\0'); hash.update(f.text); hash.update('\0'); });
  return { version: 1, tree_hash: hash.digest('hex').slice(0, 16), files };
}

if (require.main === module) {
  const pack = buildPack();
  const text = `${JSON.stringify(pack, null, 1)}\n`;
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== text) { console.error('knowledge.json is stale: run node scripts/build-knowledge-pack.js'); process.exit(1); }
    console.log(`knowledge pack up to date (${pack.files.length} files, ${pack.tree_hash})`);
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`wrote ${path.relative(ROOT, OUT)} (${pack.files.length} files, ${pack.tree_hash})`);
  }
}

module.exports = { buildPack, unsourcedLines, OUT, SRC };
