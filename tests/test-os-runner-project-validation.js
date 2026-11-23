'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validationCommand } = require('../scripts/os-runner');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'os-test-policy-'));
try {
  const touch = p => {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), '', 'utf8');
  };
  assert.throws(() => validationCommand('osman-jalloh-lab/Lavaal-', root), /required_tests_missing/);
  assert.throws(() => validationCommand('osman-jalloh-lab/saloneworks', root), /required_tests_missing/);
  assert.throws(() => validationCommand('somewhere/else', root), /repository_not_supported/);
  touch('tests/run-safe-suite.js');
  const node = validationCommand('osman-jalloh-lab/Lavaal-', root);
  assert.deepEqual([node.command, ...node.args], ['node', 'tests/run-safe-suite.js']);
  touch('tests/conftest.py');
  touch('requirements.txt');
  const python = validationCommand('osman-jalloh-lab/saloneworks', root);
  assert.deepEqual([python.command, ...python.args],
    ['python3', '-m', 'pytest', 'tests/', '-q', '--tb=short']);
  assert(!python.label.includes('Skipped'));
  console.log('test-os-runner-project-validation: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
