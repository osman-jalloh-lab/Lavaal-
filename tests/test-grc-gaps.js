#!/usr/bin/env node
// GRC review 2026-11-09 gaps on top of the security hardening branch:
// F2 (root *.md catch-all; tests/, scripts/, netlify/ anchored to the repo root) and F13 (security.txt).
// Uses Git's ignore parser on .vercelignore like test-security-vercelignore.js. No network.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });

function excluded(file) {
  // Only .vercelignore: point excludesFile at it and disable the repo's own .gitignore files.
  const r = spawnSync('git', ['-c', `core.excludesFile=${path.join(root, '.vercelignore')}`, 'check-ignore', '--no-index', '-v', '--', file], { cwd: root, encoding: 'utf8' });
  const m = /^(.*?):\d+:([^\t]+)\t/m.exec(r.stdout || '');
  return { ok: !r.error && [0, 1].includes(r.status), hit: r.status === 0 && !!m && m[1].endsWith('.vercelignore') && !m[2].startsWith('!') };
}
const git = spawnSync('git', ['--version']);
if (git.error) {
  check('git unavailable; ignore checks skipped', true);
} else {
  // A new root note that no named pattern covers is still kept off the site.
  ['NOTES.md', 'README.md', 'HANDOFF.md', 'SECURITY-REPORT-2026-11-09.md', 'OVERVIEW_MEDIA_RECOVERY_REPORT.md'].forEach((f) => {
    const e = excluded(f);
    check(`root ${f} is not deployed`, e.ok && e.hit);
  });
  // Anchored: a nested folder called tests/scripts/netlify under api/ or assets/ is not dropped from the deploy.
  ['api/ops/tests/x.js', 'api/web/_lib/scripts/x.js', 'assets/scripts/x.js', 'api/netlify/x.js', 'api/os/_data/INGEST.md'].forEach((f) => {
    const e = excluded(f);
    check(`nested ${f} is still deployed`, e.ok && !e.hit);
  });
  ['tests/test-ops-auth.js', 'scripts/email-router/contact-router.gs', 'netlify/functions/submit-form.js'].forEach((f) => {
    const e = excluded(f);
    check(`root ${f} is still not deployed`, e.ok && e.hit);
  });
  const e = excluded('.well-known/security.txt');
  check('.well-known/security.txt is deployed', e.ok && !e.hit);
}

// F13: security.txt (RFC 9116) with the LAVAALL mailbox and an Expires under a year out.
const txtPath = path.join(root, '.well-known/security.txt');
const txt = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8') : '';
check('security.txt has Contact: mailto:support@lavaall.com', /^Contact: mailto:support@lavaall\.com$/m.test(txt));
const exp = Date.parse((/^Expires: (\S+)$/m.exec(txt) || [])[1] || '');
check('security.txt Expires is a valid date no more than 366 days after 2026-11-09', Number.isFinite(exp) && exp > Date.parse('2026-11-09T00:00:00Z') && exp <= Date.parse('2026-11-09T00:00:00Z') + 366 * 864e5);
check('security.txt Canonical is the www URL; no other email, phone or name', /^Canonical: https:\/\/www\.lavaall\.com\/\.well-known\/security\.txt$/m.test(txt) && (txt.match(/@/g) || []).length === 1 && !/\+?\d[\d ()-]{7,}/.test(txt.replace(/^Expires: .*$/m, '')));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
