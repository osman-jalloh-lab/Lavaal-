#!/usr/bin/env node
// The vercel.json / sign-in scope guard (tests/_protected_scope.js, run by test-os-ingest.js) fires on every
// unexpected edit, not only when the ingest modules change. Unit checks on evaluate(), then an end-to-end run of
// test-os-ingest.js in a throwaway git worktree with each protected file mutated. No network.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const scope = require('./_protected_scope');

const root = path.join(__dirname, '..');
const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });
const read = (n) => fs.readFileSync(path.join(root, n));

// ---- unit: evaluate() --------------------------------------------------------------------------
const reviewed = Object.keys(scope.APPROVED);
check('the reviewed files are exactly vercel.json, api/ops/auth.js and api/ops/_google_signin.js', reviewed.sort().join(',') === 'api/ops/_google_signin.js,api/ops/auth.js,vercel.json');
check('this branch: no offender', scope.check(root).offenders.length === 0);
check('this branch: vercel.json keeps every main rule', scope.check(root).rulesKept);
check('unrelated files are ignored', scope.evaluate(['README.md', 'api/quote.js', 'tests/x.js'], read).length === 0);
reviewed.forEach((n) => {
  check(`${n}: reviewed content passes`, scope.evaluate([n], read).length === 0);
  check(`${n}: one extra byte fails`, scope.evaluate([n], () => Buffer.concat([read(n), Buffer.from(' ')])).join() === n);
  check(`${n}: deletion fails`, /deleted/.test(scope.evaluate([n], () => { throw new Error('ENOENT'); }).join()));
});
['api/ops/_signin_hardening.js', 'api/ops/_os_return.js'].forEach((n) => {
  check(`${n}: any change fails (not on the reviewed list)`, scope.evaluate([n], read).join() === n);
});
const mainVercel = spawnSync('git', ['show', 'origin/main:vercel.json'], { cwd: root, encoding: 'utf8' }).stdout;
if (mainVercel) {
  const m = JSON.parse(mainVercel);
  const dropRewrite = JSON.parse(mainVercel); dropRewrite.rewrites = dropRewrite.rewrites.slice(1);
  const dropSouls = JSON.parse(mainVercel); delete dropSouls.functions['api/ops/index.js'].includeFiles;
  const dropHeader = JSON.parse(mainVercel); dropHeader.headers = dropHeader.headers.slice(1);
  check('rule check: main vs main passes', scope.keepsMainRules(mainVercel, mainVercel));
  check('rule check: a removed /ops rewrite fails', !scope.keepsMainRules(mainVercel, JSON.stringify(dropRewrite)));
  check('rule check: a removed souls includeFiles fails', !scope.keepsMainRules(mainVercel, JSON.stringify(dropSouls)));
  check('rule check: a removed security header rule fails', !scope.keepsMainRules(mainVercel, JSON.stringify(dropHeader)));
  check('rule check: an added header rule alone passes', scope.keepsMainRules(mainVercel, JSON.stringify(Object.assign({}, m, { headers: [{ source: '/x', headers: [] }].concat(m.headers) }))));
} else {
  check('origin/main:vercel.json unavailable; rule checks need a clone with origin/main', false);
}

// ---- end to end: test-os-ingest.js fails when a protected file is edited outside the ingest modules ------
const git = (args, cwd) => spawnSync('git', args, { cwd: cwd || root, encoding: 'utf8' });
const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-guard-'));
const add = git(['worktree', 'add', '--detach', wt, 'HEAD']);
try {
  if (add.status !== 0) {
    check('could not create a git worktree for the end-to-end run', false);
  } else {
    // Run the current (possibly uncommitted) guard and ingest test inside the worktree.
    ['tests/_protected_scope.js', 'tests/test-os-ingest.js'].forEach((f) => fs.copyFileSync(path.join(root, f), path.join(wt, f)));
    const runIngest = () => spawnSync(process.execPath, ['tests/test-os-ingest.js'], { cwd: wt, encoding: 'utf8', env: Object.assign({}, process.env, { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' }) });
    const clean = runIngest();
    check('end to end: test-os-ingest.js passes on the unmodified tree', clean.status === 0);
    const cases = {
      'vercel.json': (s) => s.replace('"/ops/:path*"', '"/ops-open/:path*"'),
      'api/ops/auth.js': (s) => s + '\n// unexpected edit\n',
      'api/ops/_google_signin.js': (s) => s + '\n// unexpected edit\n',
      'api/ops/_signin_hardening.js': (s) => s + '\n// unexpected edit\n',
    };
    for (const [file, mutate] of Object.entries(cases)) {
      const p = path.join(wt, file);
      const orig = fs.readFileSync(p, 'utf8');
      fs.writeFileSync(p, mutate(orig));
      const r = runIngest();
      fs.writeFileSync(p, orig);
      check(`end to end: an unexpected ${file} edit makes test-os-ingest.js fail on the scope guard`, r.status !== 0 && /FAIL .*protected scope guard.*/.test(r.stdout) && r.stdout.includes(file));
    }
  }
} finally {
  git(['worktree', 'remove', '--force', wt]);
  fs.rmSync(wt, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
