#!/usr/bin/env node
// scripts/build-notes-pack.js — turn the founders' private vault into a notes pack for /os.
//
//   node scripts/build-notes-pack.js                         (vault: C:\Users\osman\LAVAALL Ideas)
//   node scripts/build-notes-pack.js --vault "D:\some\vault"
//   node scripts/build-notes-pack.js --push                  (needs TOKEN in the environment)
//
// Notes content is NEVER committed: the pack goes to api/os/_data/notes.local.json, which is gitignored.
// Local /os (scripts/os-dev-server.js) reads that file; production /os reads the notes feed, which --push
// fills (POST https://www.lavaall.com/api/os/ingest/notes, bearer $TOKEN). Never runs in CI.
//
// Only the Ideas, Scout Finds, Research, Skills and Decisions folders are read. Sessions, Jev Scores,
// Templates, *.bak* files and dot files are left out. A note is DROPPED when its text matches
// the blocked-word pattern, or holds a phone number or an email-like string. The run prints the
// counts kept and dropped, and the dropped file names only, never their contents.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_VAULT = 'C:\\Users\\osman\\LAVAALL Ideas';
const OUT_FILE = path.join(__dirname, '..', 'api', 'os', '_data', 'notes.local.json');
const PUSH_URL = 'https://www.lavaall.com/api/os/ingest/notes';

const FOLDERS = Object.freeze({
  Ideas: 'idea',
  'Scout Finds': 'scout-find',
  Research: 'note',
  Skills: 'note',
  Decisions: 'decision',
});
const BODY_MAX = 4000;
const PACK_MAX_NOTES = 500;
// The notes feed accepts up to 900 KB (api/ops/_os_feeds.js). Leave room for the JSON envelope.
const PACK_MAX_BYTES = 880 * 1024;

// Built from pieces on purpose: the repo is public and must not carry these words as plain text.
const DROP = new RegExp(['star' + 'link', 'gui' + 'nea', '@', 'lead', 'customer'].join('|'), 'i');
const URL_RE = /https?:\/\/\S+/g;
const PHONE = [
  /\+\d[\d\s().-]{6,}\d/,
  /\(\d{3}\)\s?\d{3}[\s.-]\d{4}/,
  /\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/,
  /\b\d{2,4}[\s.-]\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}\b/,
];
const LONG_DIGITS = /\b\d{9,}\b/;
const EMAIL_LIKE = [
  /[^\s@]+@[^\s@]+/,
  /\b[\w.+-]+\s*[[(]?\s*at\s*[\])]?\s*[\w-]+\s*[[(]?\s*dot\s*[\])]?\s*[a-z]{2,}\b/i,
];

// ---- front matter (a small YAML subset: scalars, inline [a, b] lists and "- item" lists) -------------

function scalar(raw) {
  const t = String(raw).trim();
  if (t === '') return '';
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function inlineList(raw) {
  const inner = raw.trim().slice(1, -1);
  return inner.split(',').map((x) => scalar(x)).filter((x) => x !== '');
}

function parseFrontmatter(text) {
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) return { meta: {}, body: src };
  const end = src.indexOf('\n---', 4);
  if (end === -1) return { meta: {}, body: src };
  const block = src.slice(4, end).split('\n');
  const body = src.slice(end + 4).replace(/^\n/, '');
  const meta = {};
  let listKey = null;
  block.forEach((line) => {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) { meta[listKey].push(scalar(item[1])); return; }
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) return;
    const value = m[2].trim();
    if (value === '') { meta[m[1]] = []; listKey = m[1]; return; }
    listKey = null;
    meta[m[1]] = value.startsWith('[') && value.endsWith(']') ? inlineList(value) : scalar(value);
  });
  return { meta, body };
}

// ---- the drop filter -----------------------------------------------------------------------------------

// Returns the reason a note must not leave this machine, or '' when it is clean. The reason is a category
// name, never a piece of the note.
function dropReason(text) {
  const s = String(text);
  if (DROP.test(s)) return 'blocked word or @';
  const plain = s.replace(URL_RE, ' ');
  if (PHONE.some((re) => re.test(plain)) || LONG_DIGITS.test(plain)) return 'phone number';
  if (EMAIL_LIKE.some((re) => re.test(s))) return 'email-like string';
  return '';
}

// ---- building ------------------------------------------------------------------------------------------

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (e.name.startsWith('.')) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.md$/i.test(e.name) && !/\.bak/i.test(e.name)) out.push(p);
  });
  return out;
}

function day(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
  return m ? m[1] : '';
}

function deskIdFor(value, deskIds) {
  const want = String(value || '').trim().toLowerCase();
  return deskIds.indexOf(want) !== -1 ? want : '';
}

function buildPack(vault, opts) {
  const o = opts || {};
  const deskIds = o.deskIds || [];
  const kept = [];
  const dropped = [];
  const skipped = { notes: 0 };
  Object.keys(FOLDERS).forEach((folder) => {
    const dir = path.join(vault, folder);
    if (!fs.existsSync(dir)) return;
    walk(dir, []).forEach((file) => {
      const rel = path.relative(vault, file).replace(/\\/g, '/');
      const raw = fs.readFileSync(file, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      const heading = /^#\s+(.+)$/m.exec(body);
      const title = String(meta.title || (heading && heading[1]) || path.basename(file, path.extname(file))).trim().slice(0, 200);
      const tags = (Array.isArray(meta.tags) ? meta.tags : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 12).map((t) => t.slice(0, 40));
      const source = String(meta.source || '').trim().slice(0, 240);
      const url = typeof meta.url === 'string' && /^https?:\/\/[^\s@]+$/.test(meta.url.trim()) ? meta.url.trim().slice(0, 500) : '';
      // Scanned: everything that would leave this machine (the channel handle is never exported).
      const scanned = [title, tags.join(' '), source, typeof meta.url === 'string' ? meta.url : '', String(meta.status || ''), body].join('\n');
      const reason = dropReason(scanned);
      if (reason) { dropped.push({ file: rel, reason }); return; }
      const stat = fs.statSync(file);
      const created = day(meta.date) || day(meta.created) || day(path.basename(file)) || day(stat.birthtime) || day(stat.mtime);
      const updated = day(meta.updated) || day(stat.mtime) || created;
      const level = /^L[0-4]$/.test(String(meta.level || '')) ? String(meta.level) : null;
      const jev = typeof meta.jev === 'number' && meta.jev >= 0 && meta.jev <= 1 ? meta.jev : 'not run';
      const note = {
        id: 'nt-' + crypto.createHash('sha1').update(rel).digest('hex').slice(0, 10),
        type: FOLDERS[folder],
        folder,
        title,
        date: created,
        updated,
        desk: deskIdFor(meta.desk || meta.owner, deskIds),
        status: String(meta.status || '').trim().slice(0, 40),
        level,
        jev,
        tags,
        links: [],
        source,
        body: body.trim(),
        _stem: path.basename(file, path.extname(file)).toLowerCase(),
      };
      if (note.type === 'scout-find') { note.urgent = meta.urgent === true; if (url) note.url = url; }
      kept.push(note);
    });
  });

  // [[wikilinks]] to another kept note become links by id.
  const byName = new Map();
  kept.forEach((n) => { byName.set(n._stem, n.id); byName.set(n.title.toLowerCase(), n.id); });
  kept.forEach((n) => {
    const ids = new Set();
    (n.body.match(/\[\[([^\]|#]+)/g) || []).forEach((m) => {
      const id = byName.get(m.slice(2).trim().toLowerCase());
      if (id && id !== n.id) ids.add(id);
    });
    n.links = Array.from(ids).slice(0, 30);
  });

  kept.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  let notes = kept.slice(0, PACK_MAX_NOTES);
  const clipped = kept.length - notes.length;

  // Cut each body to BODY_MAX, then tighter if the whole pack would not fit the feed's size cap.
  let cap = BODY_MAX;
  const render = () => JSON.stringify({ notes: notes.map((n) => finish(n, cap)) });
  while (Buffer.byteLength(render(), 'utf8') > PACK_MAX_BYTES && cap > 500) cap = Math.floor(cap * 0.8);
  notes = notes.map((n) => finish(n, cap));
  return { notes, dropped, clipped, bodyCap: cap, builtAt: new Date().toISOString().slice(0, 10) };
}

function finish(n, cap) {
  const out = Object.assign({}, n, { body: n.body.length > cap ? n.body.slice(0, cap) : n.body });
  delete out._stem;
  return out;
}

// ---- command line --------------------------------------------------------------------------------------

function args(argv) {
  const a = { vault: DEFAULT_VAULT, out: OUT_FILE, push: false, url: PUSH_URL };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--vault') a.vault = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--url') a.url = argv[++i];
    else if (argv[i] === '--push') a.push = true;
    else throw new Error('unknown argument: ' + argv[i]);
  }
  return a;
}

async function push(notes, url, env) {
  const token = env.TOKEN;
  if (!token) throw new Error('--push needs TOKEN in the environment (the OPS_CEO_BRIDGE_SECRET value)');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(notes),
  });
  return response.status;
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!fs.existsSync(a.vault)) throw new Error('vault folder not found: ' + a.vault);
  let deskIds = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'api', 'os', '_data', 'desks.json'), 'utf8'));
    deskIds = (d.desks || []).concat(d.extraDesks || []).map((x) => String(x.id));
  } catch { /* desk ids are optional */ }
  const pack = buildPack(a.vault, { deskIds });
  fs.writeFileSync(a.out, JSON.stringify({ builtAt: pack.builtAt, notes: pack.notes }));
  console.log(`Notes pack: ${pack.notes.length} kept, ${pack.dropped.length} dropped.`);
  const counts = {};
  pack.notes.forEach((n) => { counts[n.folder] = (counts[n.folder] || 0) + 1; });
  console.log('Kept by folder: ' + Object.keys(counts).map((k) => `${k} ${counts[k]}`).join(', '));
  if (pack.clipped) console.log(`Not included (over ${PACK_MAX_NOTES} notes): ${pack.clipped}`);
  if (pack.bodyCap < BODY_MAX) console.log(`Bodies cut to ${pack.bodyCap} characters to fit the feed size cap.`);
  if (pack.dropped.length) {
    console.log('Dropped files (names only):');
    pack.dropped.forEach((d) => console.log(`  ${d.file}  [${d.reason}]`));
  }
  console.log('Wrote ' + a.out);
  if (a.push) {
    const status = await push(pack.notes, a.url, process.env);
    console.log(`Pushed to ${a.url}: HTTP ${status}`);
    if (status !== 200) process.exit(1);
  } else {
    console.log('Not pushed (use --push to send it to production).');
  }
}

module.exports = { BODY_MAX, DROP, FOLDERS, OUT_FILE, PACK_MAX_BYTES, PUSH_URL, buildPack, dropReason, parseFrontmatter, push };

if (require.main === module) {
  main().catch((err) => { console.error(String(err && err.message || err)); process.exit(1); });
}
