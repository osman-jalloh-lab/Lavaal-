'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { realAdapter } = require('../scripts/os-runner');

async function testSubprocessEnvironments() {
  const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'os-subprocess-test-'));
  const hostHome = path.join(fixtures, 'host-home');
  const receipt = path.join(fixtures, 'receipt.jsonl');
  const sha = 'a'.repeat(40);
  const secretNames = [
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY', 'GH_TOKEN',
    'OS_RUNNER_SECRET', 'OS_RUNNER_SECRET_FILE', 'KV_REST_API_TOKEN',
    'DATABASE_URL', 'NODE_OPTIONS', 'PYTHONPATH',
  ];
  try {
    fs.mkdirSync(hostHome);
    for (const executable of ['git', 'gh', 'codex', 'python3']) {
      const launch = `#!/bin/sh
exec '${process.execPath.replaceAll("'", "'\\''")}' '${path.join(fixtures, 'fixture.js').replaceAll("'", "'\\''")}' '${executable}' "$@"
`;
      fs.writeFileSync(path.join(fixtures, executable), launch, { mode: 0o700 });
    }
    fs.writeFileSync(path.join(fixtures, 'fixture.js'), `
      const fs = require('node:fs');
      const path = require('node:path');
      const [command, ...args] = process.argv.slice(2);
      const env = process.env;
      fs.appendFileSync(${JSON.stringify(receipt)}, JSON.stringify({
        command, env: Object.keys(env), home: env.HOME,
        privateHome: Boolean(env.HOME && (fs.statSync(env.HOME).mode & 0o777) === 0o700),
        codexHome: env.CODEX_HOME, appEnv: env.APP_ENV, emailEnabled: env.EMAIL_ENABLED,
      }) + '\\n');
      if (command === 'git' && args.includes('worktree')) {
        const work = args.at(-2);
        fs.mkdirSync(path.join(work, 'tests'), { recursive: true });
        fs.writeFileSync(path.join(work, 'tests/conftest.py'), '');
        fs.writeFileSync(path.join(work, 'requirements.txt'), '');
      }
      if (command === 'git' && args.includes('diff')) process.exitCode = 1;
      if (command === 'git' && args.includes('rev-parse')) console.log(${JSON.stringify(sha)});
      if (command === 'gh') console.log('https://github.com/osman-jalloh-lab/saloneworks/pull/42');
    `);
    const env = Object.fromEntries(secretNames.map(name => [name, 'synthetic-token']));
    Object.assign(env, {
      PATH: fixtures, HOME: hostHome, CODEX_HOME: '/untrusted-host-config',
      APP_ENV: 'production', EMAIL_ENABLED: 'true',
    });
    const result = await realAdapter({ env }).execute({
      repo: 'osman-jalloh-lab/saloneworks', branch: 'run/test-env', objective: 'Synthetic fixture',
    }, 15000);
    assert.equal(result.sha, sha);
    const runs = fs.readFileSync(receipt, 'utf8').trim().split('\n').map(JSON.parse);
    const codex = runs.find(run => run.command === 'codex');
    const pytest = runs.find(run => run.command === 'python3');
    for (const child of [codex, pytest]) {
      assert(child.privateHome);
      assert.notEqual(child.home, hostHome);
      for (const name of secretNames) assert(!child.env.includes(name), name);
    }
    assert.notEqual(codex.home, pytest.home);
    assert.equal(codex.codexHome, path.join(codex.home, '.codex'));
    assert.equal(pytest.codexHome, undefined);
    assert.equal(pytest.appEnv, 'test');
    assert.equal(pytest.emailEnabled, 'false');
    assert(runs.find(run => run.command === 'gh').env.includes('GH_TOKEN'));
    for (const child of runs.filter(run => run.command === 'git' || run.command === 'gh')) {
      assert(!child.env.includes('OS_RUNNER_SECRET'));
      assert(!child.env.includes('OPENAI_API_KEY'));
    }
    console.log('test-os-runner-subprocess-environment: PASS');
  } finally {
    fs.rmSync(fixtures, { recursive: true, force: true });
  }
}

testSubprocessEnvironments().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
