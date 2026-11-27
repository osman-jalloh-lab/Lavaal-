// api/ops/_os_knowledge.js — the shared memory (docs/os/knowledge/, git) as the OS sees it. Founder-only.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// Git is the source of truth. The deployed OS reads api/os/_data/knowledge.json, compiled from the git tree by
// scripts/build-knowledge-pack.js (with a content hash). KV holds only a cache of that pack plus its hash: when the
// hash differs, git wins and the cache is rebuilt. A fact that exists only in KV is never served.
// Writes are proposals: POST /ops/os/knowledge/propose returns a GitHub "new file" link that opens a branch and a
// pull request for Osman to review. Nothing here writes to git or to main.
//
// GET  /ops/os/knowledge          -> { tree_hash, source, files: [{ path, business, title, bytes }] }
// GET  /ops/os/knowledge?path=…   -> { path, text } for one file in the pack
// POST /ops/os/knowledge/propose  -> body { business, title, text } -> { path, url, body }

const { json, readBody, looksLikeAgentRequest, queryOf } = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');

const PACK = require('../os/_data/knowledge.json');
const KEY = 'lavaall-os-knowledge-cache-v1';
const REPO_NEW_FILE = 'https://github.com/osman-jalloh-lab/Lavaal-/new/main';
const ROOT = 'docs/os/knowledge/';
const MAX_NOTE = 2000;
const BUSINESSES = Object.freeze(['lavaall', 'web', 'salonehire', 'saloneworks']);

function routeOf(req) {
  const q = queryOf(req);
  const area = String((Array.isArray(q.area) ? q.area[0] : q.area) || '').replace(/^\/+|\/+$/g, '');
  const pathOnly = String(req.url || '').split('?')[0].replace(/^\/+|\/+$/g, '');
  const r = area || pathOnly.replace(/^ops\//, '');
  return ['os/knowledge', 'os/knowledge/propose'].includes(r) ? r : '';
}

function businessOf(p) {
  const m = /^docs\/os\/knowledge\/([a-z0-9-]+)\//.exec(p);
  return m ? m[1] : '';
}

function titleOf(text, p) {
  const h = /^#\s+(.+)$/m.exec(String(text || ''));
  return (h ? h[1] : p.split('/').pop().replace(/\.md$/, '')).trim().slice(0, 120);
}

function isPack(x) {
  return Boolean(x) && typeof x.tree_hash === 'string' && Array.isArray(x.files)
    && x.files.every((f) => f && typeof f.path === 'string' && f.path.startsWith(ROOT) && typeof f.text === 'string');
}

// The cache may serve only when it carries exactly the git tree's hash; anything else is stale or foreign.
// Even then, only paths that exist in git are kept, so a KV-only fact is never canonical.
function resolveKnowledge(gitPack, cached) {
  const git = isPack(gitPack) ? gitPack : { tree_hash: '', files: [] };
  if (!isPack(cached) || cached.tree_hash !== git.tree_hash) {
    return { source: 'git', rebuild: true, tree_hash: git.tree_hash, files: git.files };
  }
  const inGit = new Map(git.files.map((f) => [f.path, f.text]));
  const files = cached.files.filter((f) => inGit.has(f.path) && inGit.get(f.path) === f.text);
  return { source: 'cache', rebuild: files.length !== git.files.length, tree_hash: git.tree_hash, files: files.length === git.files.length ? files : git.files };
}

// Only facts that exist in git are canonical. Anything else (for example an old Saved memory in KV) is dropped.
function canonicalOnly(gitPack, facts) {
  const inGit = new Set((isPack(gitPack) ? gitPack.files : []).map((f) => f.path));
  return (Array.isArray(facts) ? facts : []).filter((f) => f && inGit.has(f.path));
}

function briefFor(business, pack) {
  const p = pack || PACK;
  const hit = (p.files || []).find((f) => f.path === `${ROOT}${business}/README.md`);
  return hit ? hit.text : '';
}

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'note';
}

// A proposed note: never written here. The link opens GitHub's new-file page on a fresh branch and pull request.
function proposeNote(input, now) {
  const business = String(input && input.business || '').trim().toLowerCase();
  if (!BUSINESSES.includes(business)) return { error: 'unknown_business' };
  const title = String(input && input.title || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  const text = String(input && input.text || '').replace(/\r/g, '').trim();
  if (!title || !text) return { error: 'missing_text' };
  if (text.length > MAX_NOTE) return { error: 'too_long' };
  const day = new Date(Number.isFinite(now) ? now : Date.now()).toISOString().slice(0, 10);
  const path = `${ROOT}${business}/notes/${day}-${slug(title)}.md`;
  const body = [`# ${title}`, '', `source: LAVAALL OS Memory page, proposed by Osman`, `date: ${day}`, '', text, ''].join('\n');
  const url = `${REPO_NEW_FILE}?${new URLSearchParams({ filename: path, value: body }).toString()}`;
  return { path, body, url };
}

function kvOn(env) { return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN); }
function keyFor(env) {
  const e = String(env.VERCEL_ENV || '').trim().toLowerCase();
  const prefix = !e || e === 'production' ? '' : e.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return prefix ? `${prefix}:${KEY}` : KEY;
}
async function kv(args, env, fetchImpl) {
  const res = await fetchImpl(String(env.KV_REST_API_URL).replace(/\/$/, ''), {
    method: 'POST', headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('kv');
  return res.json();
}

async function loadKnowledge(env, fetchImpl, pack) {
  const git = pack || PACK;
  if (!kvOn(env) || !fetchImpl) return Object.assign(resolveKnowledge(git, null), { cache: 'off' });
  let cached = null;
  try {
    const out = await kv(['GET', keyFor(env)], env, fetchImpl);
    cached = out && out.result ? JSON.parse(out.result) : null;
  } catch { cached = null; }
  const r = resolveKnowledge(git, cached);
  if (r.rebuild) {
    try { await kv(['SET', keyFor(env), JSON.stringify({ tree_hash: git.tree_hash, files: git.files })], env, fetchImpl); } catch { /* cache only */ }
  }
  return Object.assign(r, { cache: r.source === 'cache' ? 'hit' : 'rebuilt' });
}

async function handleKnowledge(req, res, opts) {
  const route = routeOf(req);
  if (!route) return false;
  const env = (opts && opts.env) || process.env;
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  if (looksLikeAgentRequest(req)) { json(res, 403, { error: 'agent_denied' }); return true; }
  const session = opts && opts.session !== undefined ? opts.session : await readLiveSession(req);
  if (!session || !session.email) { json(res, 401, { error: 'sign_in_required' }); return true; }
  const method = String(req.method || 'GET').toUpperCase();
  if (route === 'os/knowledge/propose') {
    if (method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
    const out = proposeNote(readBody(req) || {}, opts && opts.now);
    json(res, out.error ? 400 : 200, out);
    return true;
  }
  if (method !== 'GET' && method !== 'HEAD') { json(res, 405, { error: 'method_not_allowed' }); return true; }
  const k = await loadKnowledge(env, fetchImpl, opts && opts.pack);
  const q = queryOf(req);
  const want = String((Array.isArray(q.path) ? q.path[0] : q.path) || '');
  if (want) {
    const hit = k.files.find((f) => f.path === want);
    json(res, hit ? 200 : 404, hit ? { path: hit.path, text: hit.text, tree_hash: k.tree_hash } : { error: 'not_found' });
    return true;
  }
  json(res, 200, {
    tree_hash: k.tree_hash, source: k.source, cache: k.cache, businesses: BUSINESSES,
    files: k.files.map((f) => ({ path: f.path, business: businessOf(f.path), title: titleOf(f.text, f.path), bytes: Buffer.byteLength(f.text) })),
  });
  return true;
}

// What the OS page embeds (no client fetch): the files in the pack, their business, and the base of the propose link.
function knowledgeView(pack) {
  const p = isPack(pack) ? pack : PACK;
  return {
    tree_hash: p.tree_hash,
    propose_base: REPO_NEW_FILE,
    businesses: BUSINESSES,
    files: p.files.map((f) => ({ path: f.path, business: businessOf(f.path), title: titleOf(f.text, f.path), text: f.text })),
  };
}

module.exports = { BUSINESSES, knowledgeView, KEY, PACK, briefFor, canonicalOnly, handleKnowledge, loadKnowledge, proposeNote, resolveKnowledge, routeOf };
