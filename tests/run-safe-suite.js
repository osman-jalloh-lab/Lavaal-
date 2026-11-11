'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(__dirname).filter(name => /^test-.*\.js$/.test(name)).sort();
const results = [];
for (const file of files) {
  // Deliberately do not inherit HOME, NODE_OPTIONS, credentials or provider settings.
  const child = spawnSync(process.execPath, ['--require', path.join(__dirname, 'network-guard.js'), path.join(__dirname, file)], {
    cwd: root, env: { PATH: '/usr/local/bin:/usr/bin:/bin', TZ: 'UTC', NODE_ENV: 'test', SAFE_TEST_NETWORK: 'loopback-only' },
    encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
  const result = { file, status: child.status, signal: child.signal, error: child.error ? child.error.message : null, stdout: child.stdout, stderr: child.stderr };
  results.push(result);
  process.stdout.write(`${file}: ${child.status === 0 ? 'PASS' : 'FAIL'}\n`);
  if (child.status !== 0) process.stdout.write((child.stdout || '') + (child.stderr || '') + (child.error ? child.error.message + '\n' : ''));
}
const failed = results.filter(r => r.status !== 0);
process.stdout.write(`TOTAL ${files.length}; PASS ${files.length - failed.length}; FAIL ${failed.length}\n`);
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(results, null, 2) + '\n');
process.exitCode = failed.length ? 1 : 0;
