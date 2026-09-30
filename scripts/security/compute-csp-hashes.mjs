// Recomputes the CSP 'sha256-...' source values for every inline
// non-external <script> block in index.html, privacy.html, and terms.html.
// Run this and paste the output into the matching source's script-src in
// vercel.json whenever one of those pages' inline <script> blocks changes --
// the hash is exact-byte-content-sensitive, so even a single-character edit
// invalidates the old value.
//
//   node scripts/security/compute-csp-hashes.mjs
//
// Long-term recommendation (see SECURITY-AUDIT.md finding M1): index.html's
// large inline script block is ~97KB and changes often. Hashing it works but
// requires re-running this on every edit. Extracting it to an external file
// under assets/js/ would let script-src rely on 'self' instead and remove
// the need for hashes/this script entirely -- left as a follow-up, not part
// of this security-hardening pass (it would be a structural refactor, not a
// security fix).
//
// Scope note: this only covers the public storefront pages (index.html,
// privacy.html, terms.html). /ops manages its own CSP independently (see
// api/ops/_shell.js) and is intentionally out of scope here.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const scriptBlockPattern = /<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/g;

for (const file of ['index.html', 'privacy.html', 'terms.html']) {
  // Normalize CRLF -> LF before hashing: git stores these files as LF (this
  // repo has no .gitattributes forcing otherwise), so that's what Vercel's
  // Linux build actually checks out and serves, regardless of what line
  // endings a contributor's local working tree has (e.g. Windows with
  // core.autocrlf=true checks files out as CRLF locally). Hashing the raw
  // local bytes on such a machine would silently produce a hash that never
  // matches what's actually deployed.
  const html = readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  let match;
  let i = 0;
  const hashes = [];
  scriptBlockPattern.lastIndex = 0;
  while ((match = scriptBlockPattern.exec(html))) {
    i++;
    const content = match[1];
    const lineNo = html.slice(0, match.index).split('\n').length;
    const digest = createHash('sha256').update(content, 'utf8').digest('base64');
    const value = `sha256-${digest}`;
    hashes.push(value);
    console.log(`${file} block #${i} (starts near line ${lineNo}, ${content.length} chars): '${value}'`);
  }
  console.log(`${file} script-src hash sources: ${hashes.map((h) => `'${h}'`).join(' ')}\n`);
}
