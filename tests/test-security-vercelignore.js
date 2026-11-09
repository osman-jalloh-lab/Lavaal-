// Exercise Vercel upload exclusions with Git's real ignore parser. No network.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const results = [];
function check(name, pass) { results.push({ name, pass: !!pass }); }
function finish() {
  for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}`);
  const passed = results.filter((r) => r.pass).length;
  console.log(`${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}

const git = spawnSync('git', ['--version'], { cwd: root });
if (git.error && ['ENOENT', 'EACCES', 'EPERM'].includes(git.error.code)) {
  check(`git unavailable (${git.error.code}); ignore checks skipped`, true);
  finish();
} else {
  check('git available', !git.error && git.status === 0);
  function ignored(file, expected) {
    const result = spawnSync('git', [
      '-c', `core.excludesFile=${path.join(root, '.vercelignore')}`,
      'check-ignore', '--no-index', '-v', '--', file,
    ], { cwd: root, encoding: 'utf8' });
    // With -v, an explicit negation also returns status 0. Its pattern starts '!'.
    const match = /^.*?:\d+:([^\t]+)\t/m.exec(result.stdout || '');
    const excluded = result.status === 0 && match && !match[1].startsWith('!');
    check(`${expected ? 'excludes' : 'preserves'} ${file}`,
      !result.error && [0, 1].includes(result.status) && !!excluded === expected);
  }
  function filesUnder(dir) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const file = `${dir}/${entry.name}`;
      return entry.isDirectory() ? filesUnder(file) : [file];
    });
  }

  [
    'MAGNUM.md', 'AGENTS.md', 'OVERNIGHT_REPORT.md', 'PRODUCTION_AUDIT.md',
    'tests/test-ops-auth.js', 'docs/OPS-CEO-BRIDGE.md',
    'docs/ops/README.md', 'scripts/qa/quote-api-audit.mjs',
    'netlify/functions/submit-form.js', 'netlify.toml', '.env.example',
  ].forEach((file) => ignored(file, true));

  // All API files cover the web includeFiles tree, OS client/data reads,
  // Slack registry requires, and API-local helper dependencies.
  // OPS_STORE_FILE and notes.local.json are local-only reads, disabled on Vercel;
  // package.json is an optional Slack read (currently absent at the root).
  const runtimeFiles = filesUnder('api').filter((file) =>
    !/(^|\/)(node_modules|qa)\//.test(file) && !/(^|\/)\.env(?:\.|$)/.test(file));
  [
    'index.html', 'privacy.html', 'terms.html', 'vercel.json',
    'assets/js/catalog.js', 'images/products/apple-iphone-12.png', 'package.json',
    ...filesUnder('docs/ops/souls'), ...runtimeFiles,
  ].forEach((file) => ignored(file, false));
  finish();
}
