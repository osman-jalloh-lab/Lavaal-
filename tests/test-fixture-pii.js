#!/usr/bin/env node
// GRC review 2026-11-09, F3: inbox-triage docs and fixtures use clearly fake contacts only.
// Pure file check. No network, no env.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });

// 1. The contact that looked like a real buyer is gone from every tracked file.
// Pieces are split so this file does not itself carry the identifiers.
const removed = new RegExp(['nexus' + 'node', 'Austin ' + 'Foster', '1a0e728d' + '16db5c7f', 'APS1000W' + '-100NES'].join('|'), 'i');
let files = [];
try { files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { files = []; }
const textFiles = files.filter((f) => /\.(md|js|mjs|json|html|gs|txt|toml)$/.test(f) && fs.existsSync(path.join(root, f)));
const hits = textFiles.filter((f) => removed.test(fs.readFileSync(path.join(root, f), 'utf8')));
check(files.length ? `no tracked file carries the removed buyer identifiers (${textFiles.length} scanned)` : 'git unavailable (scan skipped)', hits.length === 0);
if (hits.length) console.log('  found in:', hits.join(', '));

// 2. Every email address in the inbox-triage doc and test is a reserved example/test domain, LAVAALL's own,
// a Google system sender, or a founder sign-in address already in api/ops/_lib.js (that one is F16, not a buyer).
const founders = (fs.readFileSync(path.join(root, 'api/ops/_lib.js'), 'utf8').match(/ALLOWLIST = Object\.freeze\(\[([^\]]*)\]/) || ['', ''])[1]
  .match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) || [];
const fake = /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|example|test|lavaall\.com)$/i;
const ok = { test: (e) => fake.test(e) || /^(workspace-noreply|mailer-daemon)@google\.com$/i.test(e) || founders.includes(e.toLowerCase()) };
['docs/ops/inbox-triage.md', 'tests/test-ops-inbox-triage.js'].forEach((f) => {
  const emails = (fs.readFileSync(path.join(root, f), 'utf8').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []);
  const bad = emails.filter((e) => !ok.test(e));
  check(`${f}: every email is an example/test or lavaall.com address (${emails.length} found)`, emails.length > 0 && bad.length === 0);
  if (bad.length) console.log('  not fake:', bad.join(', '));
});

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
