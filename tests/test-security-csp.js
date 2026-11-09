// Public CSP hardening checks. Plain Node; no requests or browser required.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildReportOnlyPolicy, hashInline, collectInline } = require('../scripts/security/csp-hashes');
const { OS_CSP } = require('../api/os/_page');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }
function metaPolicies(html) {
  return Array.from(html.matchAll(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"[^>]*>/gi), (match) => match[1]);
}

const publicCsp = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https://images.unsplash.com data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; base-uri 'self'; form-action 'self';";
for (const file of ['index.html', 'privacy.html', 'terms.html']) {
  const policies = metaPolicies(read(file));
  check(`${file} enforced meta CSP is unchanged`, policies.length === 1 && policies[0] === publicCsp);
}

const opsPolicies = {
  'api/ops/_html.js': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self' https://accounts.google.com;",
  'api/ops/_shell.js': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self';",
};
for (const [file, expected] of Object.entries(opsPolicies)) {
  const policies = metaPolicies(read(file));
  check(`${file} CSP is unchanged`, policies.length === 1 && policies[0] === expected);
}
check('/os CSP is unchanged', OS_CSP === "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");

const config = JSON.parse(read('vercel.json'));
const reportHeaders = config.headers.flatMap((entry) => entry.headers
  .filter((header) => header.key.toLowerCase() === 'content-security-policy-report-only')
  .map((header) => ({ source: entry.source, value: header.value })));
const expectedSources = ['/', '/index.html', '/privacy.html', '/terms.html'];
check('Report-Only headers cover exactly the four public paths',
  reportHeaders.length === expectedSources.length
  && JSON.stringify(reportHeaders.map((header) => header.source).sort()) === JSON.stringify(expectedSources.sort()));
const generated = buildReportOnlyPolicy();
check('Report-Only hashes match: run node scripts/security/csp-hashes.js and update vercel.json',
  reportHeaders.length === 4 && reportHeaders.every((header) => header.value === generated));
const scriptDirective = generated.split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src '));
check('Report-Only script-src has no unsafe-inline', scriptDirective && !scriptDirective.includes("'unsafe-inline'"));
check('Report-Only script-src allows hashed handlers', scriptDirective && scriptDirective.includes("'unsafe-hashes'"));

const sample = 'console.log("example.com");\n';
check('known sample hash matches SHA-256 base64',
  hashInline(sample) === `'sha256-${crypto.createHash('sha256').update(sample, 'utf8').digest('base64')}'`);
const inline = collectInline([
  '<script>\n  window.example = "&amp;";\n</script>',
  '<script type="text/javascript">void 0;</script>',
  '<script src="/example.js">ignored external content</script>',
  '<script type="application/ld+json">{"example":true}</script>',
  '<button onclick="show(&quot;A&amp;B&#39;&lt;&gt;&quot;)">Example</button>',
].join('\n'));
check('inline scripts preserve exact text and skip external scripts and JSON-LD',
  JSON.stringify(inline.scripts) === JSON.stringify(['\n  window.example = "&amp;";\n', 'void 0;']));
check('inline handlers decode HTML entities before hashing',
  JSON.stringify(inline.handlers) === JSON.stringify([`show("A&B'<>")`]));

let failed = 0;
for (const result of results) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'} - ${result.name}`);
  if (!result.pass) failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
