// scripts/os-runner/platform.js — what the box runner needs to work the same on Linux, macOS and Windows.
//
// Windows differences handled here:
//   - Claude Code and Codex installed with npm are `.cmd` shims. Node will not start a `.cmd` without a shell, and a
//     shell would read the task text as commands. So a shim is resolved to the script it wraps and run with Node
//     itself: no shell, ever. A real `.exe` is run directly.
//   - Child programs need a few Windows system variables (SystemRoot and friends) or networking and git break.
//   - The home folder is USERPROFILE, not HOME; app data lives under APPDATA and LOCALAPPDATA.
//   - There is no /dev/null for git's hooks path, and Python is `python` or `py -3`, not `python3`.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WIN_SYSTEM_VARS = ['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'SystemDrive', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS'];

function isWin(platform) { return (platform || process.platform) === 'win32'; }

function pathOf(env) {
  const e = env || {};
  return String(e.PATH || e.Path || e.path || '');
}

// Where a command really is, and how to start it without a shell: { cmd, pre } (pre goes before the arguments).
function resolveBin(name, opts) {
  const o = opts || {};
  if (!isWin(o.platform)) return { cmd: name, pre: [] };
  const fsx = o.fs || fs;
  const execPath = o.execPath || process.execPath;
  const dirs = pathOf(o.env || process.env).split(';').map((d) => d.trim().replace(/^"|"$/g, '')).filter(Boolean);
  const exts = /\.[a-z0-9]+$/i.test(name) ? [''] : ['.exe', '.cmd', '.bat'];
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.win32.join(dir, name + ext);
      let stat = null;
      try { stat = fsx.statSync(full); } catch { stat = null; }
      if (!stat || !stat.isFile()) continue;
      if (/\.exe$/i.test(full)) return { cmd: full, pre: [] };
      // An npm shim: find the JavaScript file it starts (written as "%dp0%\node_modules\...\cli.js" or "%~dp0\...").
      let text = '';
      try { text = String(fsx.readFileSync(full, 'utf8')); } catch { text = ''; }
      const m = /"%~?dp0%?\\([^"%]+\.(?:c|m)?js)"/i.exec(text);
      if (m) return { cmd: execPath, pre: [path.win32.join(dir, m[1])] };
      const e = new Error('bin_needs_shell');
      e.detail = `${name} is a ${ext} file that does not start a Node script; install it so it has an .exe, or set OS_RUNNER_${name.toUpperCase()}_BIN`;
      throw e;
    }
  }
  const e = new Error('bin_not_found');
  e.detail = `${name} is not on PATH`;
  throw e;
}

// A command named in the env (OS_RUNNER_CLAUDE_BIN, OS_RUNNER_CODEX_BIN, ...) wins over PATH lookup.
function binFor(name, env, opts) {
  const override = env && env[`OS_RUNNER_${String(name).toUpperCase()}_BIN`];
  if (override) return /\.(c|m)?js$/i.test(override) ? { cmd: (opts && opts.execPath) || process.execPath, pre: [override] } : { cmd: override, pre: [] };
  return resolveBin(name, Object.assign({ env }, opts));
}

// The variables every child gets: PATH and LANG, plus the Windows system ones on Windows.
function baseEnv(env, platform) {
  const e = env || {};
  const out = { PATH: pathOf(e) || '/usr/bin:/bin', LANG: e.LANG || 'C.UTF-8' };
  if (isWin(platform)) WIN_SYSTEM_VARS.forEach((n) => { if (typeof e[n] === 'string' && e[n]) out[n] = e[n]; });
  return out;
}

// The real home folder (for finding the Claude and Codex logins).
function homeOf(env, platform) {
  const e = env || {};
  if (e.HOME) return e.HOME;
  if (isWin(platform) && e.USERPROFILE) return e.USERPROFILE;
  return '';
}

// Variables that point a child at a fresh, empty home: HOME everywhere, and the Windows profile folders too.
function isolatedHome(home, platform) {
  const out = { HOME: home, TMPDIR: home };
  if (isWin(platform)) {
    Object.assign(out, { USERPROFILE: home, APPDATA: path.win32.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.win32.join(home, 'AppData', 'Local'), TEMP: home, TMP: home });
  }
  return out;
}

// What git and gh need to find the box's GitHub login (publishing only; builders never get these).
function publisherVars(env, platform) {
  const names = ['HOME', 'XDG_CONFIG_HOME', 'GH_CONFIG_DIR', 'GH_TOKEN', 'GITHUB_TOKEN', 'SSH_AUTH_SOCK'];
  if (isWin(platform)) names.push('USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'ProgramData', 'ProgramFiles');
  const e = env || {};
  const out = {};
  names.forEach((n) => { if (typeof e[n] === 'string') out[n] = e[n]; });
  return out;
}

// An empty folder for git's core.hooksPath, so a cloned repository's hooks never run (works on every platform).
function emptyHooksDir(base) {
  const d = path.join(base || os.tmpdir(), 'no-hooks');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// The Python test command for the SaloneHire repository.
function pythonCmd(platform) {
  return isWin(platform) ? ['py', ['-3', '-m', 'pytest', 'tests/', '-q']] : ['python3', ['-m', 'pytest', 'tests/', '-q']];
}

// Same folder? Windows paths are not case sensitive.
function samePrefix(full, base, platform) {
  const a = isWin(platform) ? full.toLowerCase() : full;
  const b = isWin(platform) ? base.toLowerCase() : base;
  return a === b || a.startsWith(b + path.sep);
}

module.exports = { baseEnv, binFor, emptyHooksDir, homeOf, isWin, isolatedHome, publisherVars, pythonCmd, resolveBin, samePrefix };
