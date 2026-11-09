#!/usr/bin/env node
// Public surface (GRC review 2026-11-09, F2): internal repo files must not be deployed as public
// static files, and nothing the site or its functions need may be hidden. Pure config check: reads
// .vercelignore, vercel.json and the git file list. No network, no env, no deploy.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });

// A small gitignore-style matcher, enough for the patterns this repo uses:
// "/x/" (root dir), "x/y/" (anchored dir), "/*.md" (root glob), "a/b.js" (anchored file), "name" (any level).
function compile(line) {
  let p = line.trim();
  if (!p || p.startsWith('#')) return null;
  if (p.startsWith('!')) throw new Error('negation not supported by this checker: ' + p);
  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);
  const anchored = p.startsWith('/') || p.includes('/');
  if (p.startsWith('/')) p = p.slice(1);
  const body = p.split('/').map((seg) => seg.split('*').map((t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('/');
  const re = new RegExp((anchored ? '^' : '(^|/)') + body + (dirOnly ? '/' : '(/|$)'));
  return (file) => re.test(file);
}
const rules = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/).map(compile).filter(Boolean);
const ignored = (file) => rules.some((r) => r(file));

let files;
try {
  files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  files = [];
}
const hasGit = files.length > 0;

// 1. Every path the review saw served with HTTP 200 is now kept off the deployment.
const reviewed = ['MAGNUM.md', 'AGENTS.md', 'OVERNIGHT_REPORT.md', 'PRODUCTION_BROWSER_AUDIT.md', 'netlify.toml',
  'docs/ops/inbox-triage.md', 'docs/ops/souls/SOUL_sales.md', 'docs/os/DECISIONS.md', 'docs/os/screens/step11-spend-desktop.png',
  'tests/test-ops-auth.js', 'scripts/email-router/contact-router.gs'];
reviewed.forEach((f) => check(`not deployed: /${f}`, ignored(f)));

// 2. Whole internal trees and root notes are kept off, file by file.
if (hasGit) {
  const internal = files.filter((f) => /^(docs|tests|scripts|netlify)\//.test(f) || /^[^/]+\.md$/.test(f) || f === 'netlify.toml');
  const leaked = internal.filter((f) => !ignored(f));
  check(`all ${internal.length} tracked files under docs/, tests/, scripts/, netlify/ and root *.md are not deployed`, internal.length > 50 && leaked.length === 0);
  if (leaked.length) console.log('  leaked:', leaked.slice(0, 10).join(', '));

  // 3. Nothing the site or its functions need is hidden.
  const needed = files.filter((f) => /^(api|assets|images)\//.test(f) || ['index.html', 'privacy.html', 'terms.html', 'vercel.json'].includes(f));
  const hidden = needed.filter(ignored);
  check(`none of the ${needed.length} files under api/, assets/, images/ or the public pages are hidden`, needed.length > 100 && hidden.length === 0);
  if (hidden.length) console.log('  hidden:', hidden.slice(0, 10).join(', '));

  // 4. No deployed function reads a file from a hidden tree at runtime.
  const fnSrc = files.filter((f) => /^api\/.*\.(js|mjs|cjs)$/.test(f) && !/\/node_modules\//.test(f));
  const badReads = fnSrc.filter((f) => /__dirname[^)\n]*['"`][^'"`]*\.\.\/(\.\.\/)*(docs|tests|scripts|netlify)\//.test(fs.readFileSync(path.join(root, f), 'utf8')));
  check('no api/ function reads from docs/, tests/, scripts/ or netlify/ at runtime', badReads.length === 0);
  if (badReads.length) console.log('  reads:', badReads.join(', '));

  // 5. The public pages do not link to a hidden path.
  const pages = ['index.html', 'privacy.html', 'terms.html'].concat(files.filter((f) => /^assets\/.*\.(js|css|html)$/.test(f)));
  const badLinks = pages.filter((f) => /["'(]\/?(docs|tests|scripts|netlify)\/|["'(]\/[A-Z_]+\.md\b/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  check('public pages and assets do not link to a hidden path', badLinks.length === 0);
  if (badLinks.length) console.log('  links:', badLinks.join(', '));
} else {
  check('git file list unavailable (tree checks skipped)', true);
}

// 6. The /ops function still bundles its persona files, from a path that is deployed but never served.
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const inc = vercel.functions && vercel.functions['api/ops/index.js'] && vercel.functions['api/ops/index.js'].includeFiles;
check('/ops includeFiles points at api/ops/_data/souls/** (under api/, so not a public static file)', inc === 'api/ops/_data/souls/**');
const soulDir = path.join(root, 'api/ops/_data/souls');
const soulFiles = fs.existsSync(soulDir) ? fs.readdirSync(soulDir) : [];
check('the seven persona files moved intact (shared context + six desks), none hidden', soulFiles.length === 7 && soulFiles.includes('_SHARED_CONTEXT.md') && soulFiles.every((f) => !ignored('api/ops/_data/souls/' + f)));
check('docs/ops/souls is gone from the repo (moved, not copied)', !fs.existsSync(path.join(root, 'docs/ops/souls')));
const souls = require(path.join(root, 'api/ops/_souls.js'));
let loaded = false;
try {
  loaded = souls.SOUL_IDS.every((id) => souls.deskSoul(id).length > 100) && souls.sharedContext().length > 100;
} catch (e) {
  console.log('  soul load error:', e.message);
}
check('every desk persona and the shared context load from the new path', loaded);

// 7. The other function bundle (api/web/_site) is untouched and not hidden.
check('/web includeFiles is unchanged and not hidden', vercel.functions['api/web/index.js'].includeFiles === 'api/web/_site/**' && !ignored('api/web/_site/index.html'));

// 8. The matcher itself behaves (guards against a silent pass).
check('matcher: root-anchored patterns do not hide nested names', !ignored('api/os/_data/INGEST.md') && !ignored('api/x/docs/a.md') && ignored('docs/a/b.md') && ignored('README.md'));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
