// Scope guard for vercel.json and the /ops sign-in code (used by test-os-ingest.js and test-protected-scope.js).
// Any change to these files against origin/main fails unless it is the exact reviewed change listed in APPROVED
// (pinned by SHA-256 of the whole file). A new edit to a protected file therefore needs a deliberate, reviewed
// update of this list in the same PR. vercel.json must also keep every function, header rule, rewrite and redirect
// that origin/main has, unchanged.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROTECTED = /^vercel\.json$|^api\/ops\/auth\.js$|^api\/ops\/_google_signin\.js$|^api\/ops\/_signin_hardening\.js$|^api\/ops\/_os_return\.js$/;

// Reviewed changes, PR #76 (security/hardening-2026-11-09): CSP Report-Only header rules in vercel.json,
// shared rate limits in auth.js, shared OAuth-state replay guard in _google_signin.js.
const APPROVED = {
  'vercel.json': '3ed4fe623973444ffc9a8b4d6b7cb39aa3c3c9e1457f9ed51f9c2a3e94db05cd',
  'api/ops/auth.js': '7a141b2f0d7954b83717d2d3d372486578f9d6afe7fdd8edb37f245d986faf28',
  'api/ops/_google_signin.js': 'ea32cfe0f1fd687732cb31b3501c31a5dfde1e89e3866b9ded5f8db094ea7cca',
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// changed: file names (relative, forward slashes); read(name) -> Buffer|string, throws if the file is gone.
function evaluate(changed, read) {
  const offenders = [];
  for (const name of [...new Set(changed)].filter((n) => PROTECTED.test(n))) {
    let body;
    try { body = read(name); } catch { offenders.push(name + ' (deleted)'); continue; }
    if (APPROVED[name] !== sha256(body)) offenders.push(name);
  }
  return offenders;
}

// Every rule origin/main has in vercel.json is still there, unchanged (additions are allowed by the hash pin only).
function keepsMainRules(mainJson, headJson) {
  const main = JSON.parse(mainJson);
  const head = JSON.parse(headJson);
  const has = (list, item) => (list || []).some((x) => JSON.stringify(x) === JSON.stringify(item));
  return JSON.stringify(main.functions || {}) === JSON.stringify(head.functions || {})
    && ['headers', 'rewrites', 'redirects'].every((k) => (main[k] || []).every((item) => has(head[k], item)));
}

function changedFiles(root) {
  const run = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  return (run(['diff', '--name-only', 'origin/main...HEAD']) + run(['diff', '--name-only', 'HEAD']))
    .split('\n').map((s) => s.trim()).filter(Boolean);
}

function check(root) {
  const changed = changedFiles(root);
  const offenders = evaluate(changed, (n) => fs.readFileSync(path.join(root, n)));
  const mainVercel = execFileSync('git', ['show', 'origin/main:vercel.json'], { cwd: root, encoding: 'utf8' });
  const rulesKept = keepsMainRules(mainVercel, fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  return { changed, offenders, rulesKept };
}

module.exports = { PROTECTED, APPROVED, evaluate, keepsMainRules, check, sha256 };
