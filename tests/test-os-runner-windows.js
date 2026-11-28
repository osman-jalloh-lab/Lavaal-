// tests/test-os-runner-windows.js — the box runner on Windows (scripts/os-runner/platform.js, scripts/os-runner/windows/).
// No network, no real Windows: a fake file system stands in for PATH lookups.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pf = require(path.join(root, 'scripts/os-runner/platform.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function fakeFs(files) {
  const norm = (p) => p.toLowerCase();
  const map = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]));
  return {
    statSync(p) { if (!map.has(norm(p))) throw new Error('ENOENT'); return { isFile: () => true }; },
    readFileSync(p) { if (!map.has(norm(p))) throw new Error('ENOENT'); return map.get(norm(p)); },
  };
}
const WIN = { platform: 'win32', execPath: 'C:\\Program Files\\nodejs\\node.exe' };
const NPM = 'C:\\Users\\osman\\AppData\\Roaming\\npm';
const env = { Path: `C:\\Windows\\System32;${NPM};C:\\Program Files\\Git\\cmd` };

check('linux and mac: commands are started by name', JSON.stringify(pf.resolveBin('claude', { platform: 'linux' })) === JSON.stringify({ cmd: 'claude', pre: [] }));

{
  const f = fakeFs({ 'C:\\Program Files\\Git\\cmd\\git.exe': '' });
  const r = pf.resolveBin('git', Object.assign({ env, fs: f }, WIN));
  check('windows: an .exe on PATH is started directly', r.cmd === 'C:\\Program Files\\Git\\cmd\\git.exe' && r.pre.length === 0);
}
{
  const shim = '@ECHO off\r\nSET dp0=%~dp0\r\n"%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n';
  const f = fakeFs({ [`${NPM}\\claude.cmd`]: shim });
  const r = pf.resolveBin('claude', Object.assign({ env, fs: f }, WIN));
  check('windows: an npm .cmd shim runs its script with Node, no shell', r.cmd === WIN.execPath && r.pre[0] === `${NPM}\\node_modules\\@anthropic-ai\\claude-code\\cli.js`);
  const codexShim = '"%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*';
  const r2 = pf.resolveBin('codex', Object.assign({ env, fs: fakeFs({ [`${NPM}\\codex.cmd`]: codexShim }) }, WIN));
  check('windows: the %~dp0 shim form works too (Codex)', r2.cmd === WIN.execPath && /codex\.js$/.test(r2.pre[0]));
}
{
  let err = '';
  try { pf.resolveBin('tool', Object.assign({ env, fs: fakeFs({ [`${NPM}\\tool.cmd`]: 'echo hi' }) }, WIN)); } catch (e) { err = e.message; }
  check('windows: a .cmd that is not a Node shim is refused (never run through a shell)', err === 'bin_needs_shell');
  try { pf.resolveBin('missing', Object.assign({ env, fs: fakeFs({}) }, WIN)); } catch (e) { err = e.message; }
  check('windows: a missing command says so', err === 'bin_not_found');
}
{
  const o = pf.binFor('codex', { OS_RUNNER_CODEX_BIN: 'D:\\tools\\codex.js' }, { execPath: 'node.exe' });
  const x = pf.binFor('claude', { OS_RUNNER_CLAUDE_BIN: 'D:\\tools\\claude.exe' });
  check('OS_RUNNER_<NAME>_BIN overrides the PATH lookup', o.cmd === 'node.exe' && o.pre[0] === 'D:\\tools\\codex.js' && x.cmd === 'D:\\tools\\claude.exe');
}
{
  const src = { Path: 'C:\\x', SystemRoot: 'C:\\Windows', ComSpec: 'cmd.exe', PATHEXT: '.EXE;.CMD', USERPROFILE: 'C:\\Users\\osman', KV_REST_API_TOKEN: 'secret' };
  const w = pf.baseEnv(src, 'win32');
  const l = pf.baseEnv(src, 'linux');
  check('windows: children get PATH and the system variables they need', w.PATH === 'C:\\x' && w.SystemRoot === 'C:\\Windows' && w.PATHEXT === '.EXE;.CMD');
  check('children never get the profile, KV or other secrets from the base env', !w.USERPROFILE && !w.KV_REST_API_TOKEN && !l.KV_REST_API_TOKEN && !l.SystemRoot);
  const iso = pf.isolatedHome('C:\\Temp\\os-build-1\\codex-home', 'win32');
  check('windows: a builder gets an empty profile (USERPROFILE, APPDATA, LOCALAPPDATA, TEMP)', iso.USERPROFILE === 'C:\\Temp\\os-build-1\\codex-home' && /AppData\\Roaming$/.test(iso.APPDATA) && iso.TEMP === iso.USERPROFILE && iso.HOME === iso.USERPROFILE);
  check('windows: the logins are found under USERPROFILE when HOME is not set', pf.homeOf({ USERPROFILE: 'C:\\Users\\osman' }, 'win32') === 'C:\\Users\\osman' && pf.homeOf({ USERPROFILE: 'C:\\Users\\osman' }, 'linux') === '');
  const pub = pf.publisherVars(Object.assign({ APPDATA: 'C:\\Users\\osman\\AppData\\Roaming', GH_TOKEN: 't' }, src), 'win32');
  check('windows: git and gh keep the profile so they find the GitHub login', pub.APPDATA && pub.USERPROFILE && pub.GH_TOKEN === 't' && !pub.KV_REST_API_TOKEN);
}
check('windows: paths compare without case; linux keeps case', pf.samePrefix('c:\\work\\a.js'.replace(/\\/g, path.sep), 'C:\\WORK'.replace(/\\/g, path.sep), 'win32') && !pf.samePrefix('/Work/a.js', '/work', 'linux'));
check('windows: SaloneHire tests run with py -3', pf.pythonCmd('win32')[0] === 'py' && pf.pythonCmd('win32')[1][0] === '-3' && pf.pythonCmd('linux')[0] === 'python3');
{
  const d = pf.emptyHooksDir(path.join(require('os').tmpdir(), 'os-hooks-test'));
  check('git hooks point at an empty folder (no /dev/null)', fs.statSync(d).isDirectory() && fs.readdirSync(d).length === 0);
}

// Nothing in the runner starts a shell.
const runnerSrc = ['scripts/os-runner/index.js', 'scripts/os-runner/claude-session.js', 'scripts/os-runner/platform.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
check('the runner never starts a shell', !/shell\s*:\s*true/.test(runnerSrc) && !/core\.hooksPath=\/dev\/null/.test(runnerSrc));

// The Windows scripts.
const setup = fs.readFileSync(path.join(root, 'scripts/os-runner/windows/setup-runner.ps1'), 'utf8');
const start = fs.readFileSync(path.join(root, 'scripts/os-runner/windows/start-runner.ps1'), 'utf8');
check('setup checks the tools and both logins without printing them', /git/.test(setup) && /gh auth status/.test(setup) && /\.credentials\.json/.test(setup) && /auth\.json/.test(setup) && !/Get-Content[^\n]*credentials/.test(setup));
check('setup reads the KV token as a secure prompt and locks the env file to Osman', /AsSecureString/.test(setup) && /icacls/.test(setup) && /KV_REST_API_TOKEN/.test(setup));
check('setup ends with the runner off (one disabled tick)', /tick/.test(setup) && !/OS_RUNNER_ENABLED=1/.test(setup));
check('start turns the runner on only for its own process and honours the stop file', /OS_RUNNER_ENABLED/.test(start) && /\.os-runner-stop/.test(start) && /tick/.test(start));
check('start runs one loop per builder so Codex, Sonnet and Opus can work at once', /1\.\.3|for\s*\(\$i\s*=\s*1;\s*\$i\s*-le\s*3/.test(start));
check('the Windows guide exists and names both scripts', /setup-runner\.ps1/.test(fs.readFileSync(path.join(root, 'docs/os/BOX-SETUP-WINDOWS.md'), 'utf8')) && /start-runner\.ps1/.test(fs.readFileSync(path.join(root, 'docs/os/BOX-SETUP-WINDOWS.md'), 'utf8')));

results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
