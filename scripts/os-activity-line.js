#!/usr/bin/env node
// scripts/os-activity-line.js — one line for docs/os/knowledge/ACTIVITY.md from a merge on main.
// Used by .github/workflows/os-activity-log.yml. Pure functions are exported for tests/test-os-knowledge.js.
//
//   node scripts/os-activity-line.js line  <sha> <iso-time> <subject>   -> prints the line, or nothing to skip
//   node scripts/os-activity-line.js insert < line                      -> adds it to ACTIVITY.md (exit 3: already there)
//   node scripts/os-activity-line.js skip  <changed files, one per arg>  -> exit 0 to skip, 1 to log
'use strict';

const ACTIVITY = 'docs/os/knowledge/ACTIVITY.md';
const PACK = 'api/os/_data/knowledge.json';

// Commits that only touch the log (or the log plus its compiled pack) are the Action's own: never log them.
function shouldSkip(changed) {
  const files = (Array.isArray(changed) ? changed : []).map((f) => String(f).trim()).filter(Boolean);
  if (!files.length) return true;
  return files.every((f) => f === ACTIVITY || f === PACK);
}

function ctTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod} CT`;
}

// Put the new line at the top of the list (newest first), once.
function insertLine(md, line) {
  const text = String(md || '');
  if (!line || text.includes(line.split(' · ')[1] ? ` · ${line.split(' · ')[1]} · ` : line)) return text;
  const i = text.indexOf('\n- ');
  return i === -1 ? `${text.replace(/\s*$/, '')}\n\n${line}\n` : `${text.slice(0, i + 1)}${line}\n${text.slice(i + 1)}`;
}

// "Merge pull request #128 from owner/branch" + body title, or a squash subject "Title (#128)".
function activityLine(sha, iso, subject, body) {
  const s = String(subject || '').trim();
  let pr = '', title = '';
  const merge = /^Merge pull request #(\d+) from \S+/.exec(s);
  const squash = /^(.*\S)\s+\(#(\d+)\)$/.exec(s);
  if (merge) { pr = merge[1]; title = String(body || '').split('\n').map((l) => l.trim()).find(Boolean) || ''; }
  else if (squash) { title = squash[1]; pr = squash[2]; }
  else return '';
  const when = ctTime(iso);
  const sha7 = String(sha || '').slice(0, 7);
  if (!when || !/^[0-9a-f]{7}$/.test(sha7)) return '';
  const clean = title.replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || '(no title)';
  return `- ${when} · ${sha7} · #${pr} · ${clean}`;
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'skip') process.exit(shouldSkip(rest) ? 0 : 1);
  if (cmd === 'insert') {
    const fs = require('fs');
    const line = require('fs').readFileSync(0, 'utf8').trim();
    const before = fs.readFileSync(ACTIVITY, 'utf8');
    const after = insertLine(before, line);
    if (after !== before) fs.writeFileSync(ACTIVITY, after);
    process.exit(after !== before ? 0 : 3);
  }
  if (cmd === 'line') {
    const [sha, iso, subject, body] = rest;
    const line = activityLine(sha, iso, subject, body);
    if (line) process.stdout.write(line + '\n');
    process.exit(0);
  }
  process.stderr.write('usage: os-activity-line.js line <sha> <iso> <subject> [body] | skip <files...>\n');
  process.exit(2);
}

module.exports = { ACTIVITY, activityLine, ctTime, insertLine, shouldSkip };
