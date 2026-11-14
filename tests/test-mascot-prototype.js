'use strict';
// Runs IBM Bob's mascot Node suite (mascot/tests/run-all.js), including the RealChatAdapter tests.
// Local only: the suite uses in-memory fakes and never opens a network connection.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const child = spawnSync(process.execPath, ['--require', path.join(__dirname, 'network-guard.js'), path.join(__dirname, '../mascot/tests/run-all.js')], {
  cwd: path.join(__dirname, '../mascot'), env: process.env, encoding: 'utf8', timeout: 110000, maxBuffer: 8 * 1024 * 1024,
});
const out = (child.stdout || '') + (child.stderr || '');
const summary = out.match(/Results: (\d+) passed, (\d+) failed/);
if (child.status !== 0 || !summary || summary[2] !== '0') {
  process.stdout.write(out);
  process.exitCode = 1;
} else {
  console.log('mascot suite: ' + summary[1] + ' passed, 0 failed');
}
