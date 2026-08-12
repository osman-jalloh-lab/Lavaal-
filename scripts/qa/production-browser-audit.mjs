import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const configuredPython = process.env.PYTHON;
const executable = configuredPython || (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python314', 'python.exe')
  : 'python3');
const versionArgs = [];
const result = spawnSync(executable, [...versionArgs, path.join(here, 'production_browser_audit.py'), ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
