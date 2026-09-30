// Regression guard for SECURITY-AUDIT.md finding L2/H1: .vercelignore must
// keep excluding internal docs/scripts/tests from deployment, but must
// never accidentally shadow a file the live site (public storefront OR the
// /ops console) actually needs. Order-aware matcher replicating the
// gitignore-style semantics .vercelignore actually uses: patterns are
// applied in file order, a later negation ("!pattern") re-includes a path
// an earlier pattern excluded.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const rules = readFileSync(path.join(root, '.vercelignore'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

function matchesOne(filePath, pattern) {
  if (pattern.endsWith('/**')) return filePath.startsWith(pattern.slice(0, -3) + '/') || filePath === pattern.slice(0, -3);
  if (pattern.endsWith('/')) return filePath === pattern.slice(0, -1) || filePath.startsWith(pattern);
  if (pattern.startsWith('*.')) return filePath.split('/').pop().endsWith(pattern.slice(1));
  return filePath === pattern || filePath.startsWith(pattern + '/');
}

function isIgnored(filePath) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.startsWith('!')) {
      if (matchesOne(filePath, rule.slice(1))) ignored = false;
    } else if (matchesOne(filePath, rule)) {
      ignored = true;
    }
  }
  return ignored;
}

// Files the live site actually needs -- public storefront and /ops -- must
// NEVER be ignored.
const mustBeServed = [
  'index.html',
  'privacy.html',
  'terms.html',
  'api/contact.js',
  'api/quote.js',
  'api/schedule.js',
  'api/ops/index.js',
  'api/ops/auth.js',
  'api/slack/commands.js',
  'api/slack/events.js',
  'api/slack/interactions.js',
  'assets/js/catalog-data.js',
  'assets/js/catalog.js',
  'assets/css/main.css',
  'images/og-image.jpg',
  'vercel.json',
  // Required by vercel.json's api/ops/index.js "includeFiles" -- would
  // otherwise be caught by the broad *.md exclusion rule below.
  'docs/ops/souls/SOUL_lavaall-ceo.md',
  'docs/ops/souls/_SHARED_CONTEXT.md',
];

// Files confirmed exposed in production before this change -- must now be excluded.
const mustBeExcluded = [
  'MAGNUM.md',
  'AGENTS.md',
  'CATALOG_COMPLETION_REPORT.md',
  'debug.log',
  'scripts/email-router/contact-router.gs',
  'scripts/booking-scheduler/booking-router.gs',
  'tests/test-inquiry-and-schedule.js',
  'tests/test-ops-auth.js',
];

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

for (const f of mustBeServed) check(`${f} is NOT excluded (site/ops needs it)`, !isIgnored(f));
for (const f of mustBeExcluded) check(`${f} IS excluded`, isIgnored(f));

let failed = 0;
for (const r of results) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
