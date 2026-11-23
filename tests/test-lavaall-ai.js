// lavaall-ai CLI: argument parsing, --dry-run prompt composition, and handoff append.
// Spawns the real script in a temp home. No paid calls, no provider network.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'tools/lavaall-ai/lavaall-ai');

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lavaall-ai-'));
}

function write(dir, rel, text) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text, 'utf8');
  return full;
}

function initRepo(dir) {
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const git = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'test@localhost']);
  git(['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'test repo\n', 'utf8');
  git(['add', 'README.md']);
  git(['commit', '-q', '-m', 'init']);
  return repo;
}

function setup() {
  const dir = tmpDir();
  const repo = initRepo(dir);
  const handoff = write(dir, 'handoff.md', '# Test handoff\n\nExisting notes.\n\n## Log\n\n- 2026-11-22 12:00 CT (America/Chicago) — pipeline created\n');
  write(dir, 'RULES.md', '# Rules\n\n- No deploy without approval.\n- Synthetic data only.\n');
  const projects = {
    obsidian_root: path.join(dir, 'obsidian'),
    projects: [
      {
        name: 'salonehire',
        label: 'SaloneHire',
        category: 'SaloneWorks',
        repo,
        branch: 'feature/interview-tools',
        handoff,
        handoff_snapshot: 'handoffs/salonehire.md',
        obsidian: 'Projects/SaloneWorks/SaloneHire/ai-handoff.md',
      },
    ],
  };
  write(dir, 'projects.json', JSON.stringify(projects, null, 2));
  return { dir, repo, handoff };
}

function run(dir, args, extraEnv) {
  const env = Object.assign({
    PATH: process.env.PATH || '/usr/bin:/bin',
    TZ: 'America/Chicago',
    LAVAALL_AI_ROOT: dir,
    LAVAALL_AI_STATUS_SKIP_NETWORK: '1',
    PYTHONDONTWRITEBYTECODE: '1',
  }, extraEnv || {});
  // Drop inherited keys unless the test set them.
  delete env.DEEPSEEK_API_KEY;
  delete env.GEMINI_API_KEY;
  if (extraEnv && Object.prototype.hasOwnProperty.call(extraEnv, 'DEEPSEEK_API_KEY')) {
    env.DEEPSEEK_API_KEY = extraEnv.DEEPSEEK_API_KEY;
  }
  if (extraEnv && Object.prototype.hasOwnProperty.call(extraEnv, 'GEMINI_API_KEY')) {
    env.GEMINI_API_KEY = extraEnv.GEMINI_API_KEY;
  }
  const child = spawnSync('python3', [cli, ...args], {
    encoding: 'utf8',
    env,
    timeout: 20000,
  });
  return {
    status: child.status,
    stdout: child.stdout || '',
    stderr: child.stderr || '',
  };
}

const help = run(tmpDir(), ['--help']);
check('help exits 0', help.status === 0);
check('help lists all four harnesses', /codex/.test(help.stdout) && /claude/.test(help.stdout) && /deepseek/.test(help.stdout) && /gemini/.test(help.stdout));
check('help mentions dry-run and free status', /--dry-run/.test(help.stdout) && /status is free/.test(help.stdout));

const unknown = run(tmpDir(), ['watson', 'salonehire', 'do a thing']);
check('unknown harness exits 2', unknown.status === 2);
check('unknown harness names the command', /Unknown command: watson/.test(unknown.stderr));

const { dir, handoff } = setup();

const noTask = run(dir, ['codex', 'salonehire']);
check('missing task exits 2', noTask.status === 2);
check('missing task asks for a quoted task', /task in quotes/.test(noTask.stderr));

const noProject = run(dir, ['codex']);
check('missing project exits 2', noProject.status === 2);

const badProject = run(dir, ['codex', 'no-such-project', 'task']);
check('unknown project is rejected', badProject.status !== 0 && /Unknown project/.test(badProject.stderr));

const projects = run(dir, ['projects']);
check('projects lists salonehire', projects.status === 0 && /salonehire/.test(projects.stdout) && /feature\/interview-tools/.test(projects.stdout));

const status = run(dir, ['status']);
check('status exits 0', status.status === 0);
check('status lists salonehire and the four harnesses', /salonehire/.test(status.stdout) && /codex:/.test(status.stdout) && /claude:/.test(status.stdout) && /deepseek:/.test(status.stdout) && /gemini:/.test(status.stdout));
check('status says gemini key missing when unset', /gemini: key missing/.test(status.stdout));
check('status says deepseek key missing when unset', /deepseek: key missing/.test(status.stdout));

const FAKE = 'sk-test-DO-NOT-PRINT-9f3c2a1b0e8d7c6b';
const withKeys = run(dir, ['status'], { DEEPSEEK_API_KEY: FAKE, GEMINI_API_KEY: FAKE + '-gemini' });
check('status never prints a provided API key', !withKeys.stdout.includes(FAKE) && !withKeys.stderr.includes(FAKE) && !withKeys.stdout.includes(FAKE + '-gemini') && !withKeys.stderr.includes(FAKE + '-gemini'));
check('status with keys reports key present and skips network', /deepseek: key present/.test(withKeys.stdout) && /gemini:/.test(withKeys.stdout) && /key present/.test(withKeys.stdout));

for (const harness of ['codex', 'claude', 'deepseek', 'gemini']) {
  const dry = run(dir, [harness, 'salonehire', '--dry-run', 'Add a receipt hold flag']);
  check(harness + ' dry-run exits 0', dry.status === 0);
  check(harness + ' dry-run includes rules', /No deploy without approval/.test(dry.stdout) && /--- RULES.md ---/.test(dry.stdout));
  check(harness + ' dry-run includes handoff', /--- HANDOFF.md ---/.test(dry.stdout) && /Existing notes/.test(dry.stdout));
  check(harness + ' dry-run includes the task', /--- TASK ---/.test(dry.stdout) && /Add a receipt hold flag/.test(dry.stdout));
  check(harness + ' dry-run does not append a log line', fs.readFileSync(handoff, 'utf8').split('\n').filter((l) => l.startsWith('- ')).length === 1);
}

const before = fs.readFileSync(handoff, 'utf8');
const dryOrder = run(dir, ['--dry-run', 'codex', 'salonehire', 'should fail']);
// --dry-run before the harness is not in the official usage; official form is harness project --dry-run task
check('dry-run as the first word is not treated as a harness', dryOrder.status === 2 || dryOrder.status === 1);

// Append path: exercise append_log via a dry-run-free helper by invoking Python around a missing repo? 
// Instead, run a project whose repo exists but force the harness to fail before a model call
// by unsetting keys / missing CLIs, then confirm a log line is written for the failed run.
const PATH_ONLY = '/usr/bin:/bin';
const failed = run(dir, ['gemini', 'salonehire', 'Would call a model if a key existed'], { PATH: PATH_ONLY });
check('gemini without key or CLI exits nonzero', failed.status !== 0 && /key missing/.test(failed.stderr));
check('a run that dies before the model call does not append a log line', fs.readFileSync(handoff, 'utf8').split('\n').filter((l) => l.startsWith('- ')).length === 1);

// Directly test append by running a tiny python snippet that imports the CLI module.
const py = `
import os, sys
from importlib.machinery import SourceFileLoader
os.environ["LAVAALL_AI_ROOT"] = ${JSON.stringify(dir)}
os.environ["LAVAALL_AI_STATUS_SKIP_NETWORK"] = "1"
mod = SourceFileLoader("lavaall_ai", ${JSON.stringify(cli)}).load_module()
cfg = mod.load_config()
proj = mod.find_project(cfg, "salonehire")
mod.append_log(cfg, proj, "codex", "Add tests for the switcher", "1 file changed", "not run by switcher")
print("ok")
`;
const append = spawnSync('python3', ['-c', py], { encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH || '/usr/bin:/bin', TZ: 'America/Chicago', PYTHONDONTWRITEBYTECODE: '1', LAVAALL_AI_ROOT: dir } });
const after = fs.readFileSync(handoff, 'utf8');
check('append_log python hook ran', append.status === 0 && /ok/.test(append.stdout));
check('handoff gained a dated log line', after.length > before.length && /harness: codex/.test(after) && /project: salonehire/.test(after) && /Add tests for the switcher/.test(after));
check('log line includes changes and tests fields', /changes: 1 file changed/.test(after) && /tests: not run by switcher/.test(after));
check('log line is in America/Chicago and labeled CT', /CT \(America\/Chicago\)/.test(after));
const obsidian = path.join(dir, 'obsidian/Projects/SaloneWorks/SaloneHire/ai-handoff.md');
check('handoff is mirrored to the Obsidian path', fs.existsSync(obsidian) && fs.readFileSync(obsidian, 'utf8') === after);
const snap = path.join(dir, 'handoffs/salonehire.md');
check('handoff snapshot under the tools root is updated', fs.existsSync(snap) && fs.readFileSync(snap, 'utf8') === after);
check('previous log line is preserved', /pipeline created/.test(after));

const failedChecks = results.filter((r) => !r.pass);
for (const r of results) process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}\n`);
process.stdout.write(`${results.length - failedChecks.length}/${results.length} passed\n`);
if (failedChecks.length) process.exit(1);
