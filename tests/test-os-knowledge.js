// LAVAALL OS shared memory (docs/os/knowledge/, git): one tree, git wins over the KV cache, a KV-only fact is never
// served, briefs reach chat, a knowledge edit is a draft-PR link, and the activity log adds one line per merge and
// skips its own commits. No network, no KV.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const K = require(path.join(root, 'api/ops/_os_knowledge.js'));
const { buildPack, unsourcedLines } = require(path.join(root, 'scripts/build-knowledge-pack.js'));
const A = require(path.join(root, 'scripts/os-activity-line.js'));
const { composePrompt } = require(path.join(root, 'api/ops/_harness_chat.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }
function mockRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; return res; };
  res.send = (b) => { res.body = b == null ? '' : String(b); return res; };
  return res;
}
function req(url, method, body) { return { url, method: method || 'GET', headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, body }; }

(async () => {
  // 1. One tree: the committed pack is exactly what the git tree compiles to.
  const fresh = buildPack();
  check('committed knowledge.json matches docs/os/knowledge (run scripts/build-knowledge-pack.js)', JSON.stringify(fresh) === JSON.stringify(K.PACK));
  check('pack holds only docs/os/knowledge/*.md files', K.PACK.files.length > 0 && K.PACK.files.every((f) => /^docs\/os\/knowledge\/.+\.md$/.test(f.path)));
  check('pack has a content hash', /^[0-9a-f]{16}$/.test(K.PACK.tree_hash));

  // 2. Git wins: a cache with an older hash is rebuilt from git; a KV-only fact is dropped.
  const git = { tree_hash: 'bbbbbbbbbbbbbbbb', files: [{ path: 'docs/os/knowledge/README.md', text: 'new' }] };
  const stale = { tree_hash: 'aaaaaaaaaaaaaaaa', files: [{ path: 'docs/os/knowledge/README.md', text: 'old' }, { path: 'docs/os/knowledge/kv-only.md', text: 'secret plan' }] };
  const r1 = K.resolveKnowledge(git, stale);
  check('newer git hash wins over the cache', r1.source === 'git' && r1.rebuild && r1.files.length === 1 && r1.files[0].text === 'new');
  const poisoned = { tree_hash: git.tree_hash, files: git.files.concat([{ path: 'docs/os/knowledge/kv-only.md', text: 'secret plan' }]) };
  const r2 = K.resolveKnowledge(git, poisoned);
  check('a KV-only fact is rejected even when the hash matches', !r2.files.some((f) => f.path.endsWith('kv-only.md')));
  check('a cache whose text differs from git is not served', K.resolveKnowledge(git, { tree_hash: git.tree_hash, files: [{ path: 'docs/os/knowledge/README.md', text: 'tampered' }] }).files[0].text === 'new');
  check('canonicalOnly keeps only paths that exist in git', K.canonicalOnly(git, [{ path: 'docs/os/knowledge/README.md' }, { path: 'kv:memory/1' }]).length === 1);
  check('no cache at all falls back to git', K.resolveKnowledge(git, null).source === 'git');

  // KV cache path: a stale cache is replaced by the git pack.
  const calls = [];
  const kvFetch = async (url, init) => {
    const args = JSON.parse(init.body); calls.push(args[0]);
    return { ok: true, json: async () => ({ result: args[0] === 'GET' ? JSON.stringify(stale) : 'OK' }) };
  };
  const loaded = await K.loadKnowledge({ KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 't' }, kvFetch, git);
  check('stale KV cache is rebuilt from git', loaded.cache === 'rebuilt' && calls.join(',') === 'GET,SET' && loaded.files[0].text === 'new');

  // 3. Route: founder-only, lists files, serves one, 404 for a KV-only path.
  const denied = mockRes();
  await K.handleKnowledge(req('/ops/os/knowledge'), denied, { session: null, env: {} });
  check('signed-out request is refused', denied.statusCode === 401);
  const list = mockRes();
  await K.handleKnowledge(req('/ops/os/knowledge'), list, { session: { email: 'f@x' }, env: {} });
  const lj = JSON.parse(list.body);
  check('list returns the git tree', list.statusCode === 200 && lj.tree_hash === K.PACK.tree_hash && lj.files.length === K.PACK.files.length);
  const one = mockRes();
  await K.handleKnowledge(req('/ops/os/knowledge?path=docs/os/knowledge/README.md'), one, { session: { email: 'f@x' }, env: {} });
  check('one file is served by path', one.statusCode === 200 && JSON.parse(one.body).text.length > 0);
  const miss = mockRes();
  await K.handleKnowledge(req('/ops/os/knowledge?path=docs/os/knowledge/kv-only.md'), miss, { session: { email: 'f@x' }, env: {} });
  check('a path not in git is 404', miss.statusCode === 404);
  const other = mockRes();
  check('other routes pass through', (await K.handleKnowledge(req('/ops/os/saved'), other, { session: { email: 'f@x' } })) === false);

  // 4. A knowledge edit is a draft-PR link, never a write.
  const p = K.proposeNote({ business: 'salonehire', title: 'Free plan is 5 jobs', text: 'Raised from 2 to 5.' }, Date.parse('2026-11-27T12:00:00Z'));
  const u = new URL(p.url);
  check('propose opens GitHub new-file on the repo', u.origin === 'https://github.com' && u.pathname === '/osman-jalloh-lab/Lavaal-/new/main');
  check('proposed note lands in the business notes folder', p.path === 'docs/os/knowledge/salonehire/notes/2026-11-27-free-plan-is-5-jobs.md' && u.searchParams.get('filename') === p.path);
  check('proposed note carries source and date', /^source: /m.test(p.body) && /^date: 2026-11-27$/m.test(p.body));
  check('unknown business is refused', K.proposeNote({ business: '../x', title: 't', text: 't' }).error === 'unknown_business');
  const post = mockRes();
  await K.handleKnowledge(req('/ops/os/knowledge/propose', 'POST', { business: 'web', title: 'x', text: 'y' }), post, { session: { email: 'f@x' } });
  check('propose route returns a link, 200', post.statusCode === 200 && JSON.parse(post.body).url.startsWith('https://github.com/'));
  const src = fs.readFileSync(path.join(root, 'api/ops/_os_knowledge.js'), 'utf8');
  check('knowledge module never writes files or calls GitHub APIs', !/writeFile|api\.github\.com|git push/.test(src));

  // 5. Memory and chat load briefs from docs/os/knowledge/.
  const brief = K.briefFor('lavaall', { tree_hash: 'x', files: [{ path: 'docs/os/knowledge/lavaall/README.md', text: 'LAVAALL brief text' }] });
  check('briefFor reads <business>/README.md', brief === 'LAVAALL brief text');
  check('briefFor is empty for a business without a brief', K.briefFor('nope') === '');
  const view = K.knowledgeView();
  check('Memory page view lists the pack files and a propose base', view.files.length === K.PACK.files.length && view.propose_base.startsWith('https://github.com/'));
  const savedSrc = fs.readFileSync(path.join(root, 'api/os/_client/saved.js'), 'utf8');
  check('Memory page shows Shared memory and a Propose link', /Shared memory/.test(savedSrc) && /Propose to shared memory/.test(savedSrc) && /notes\//.test(savedSrc));
  const chatSrc = fs.readFileSync(path.join(root, 'api/ops/_harness_chat.js'), 'utf8');
  const sysP = composePrompt({ name: 'salonehire', label: 'SaloneHire', group: 'salonehire' }, [], 'what is left', []).system;
  check('chat prompt includes the shared-memory brief', /SHARED MEMORY BRIEF \(docs\/os\/knowledge\/salonehire\/README\.md/.test(sysP) && /SHARED MEMORY BRIEF/.test(chatSrc));
  check('composePrompt still builds', typeof composePrompt === 'function');

  // 5b. Phase 1: business folders, aliases, sources, public pack untouched.
  ['lavaall', 'starlink', 'salonehire', 'web', 'saloneworks'].forEach((b) => {
    check(`${b}/ has README.md and SOURCES.md`, ['README.md', 'SOURCES.md'].every((f) => fs.existsSync(path.join(root, 'docs/os/knowledge', b, f))));
    check(`${b} brief reaches chat`, K.briefFor(b).length > 40);
  });
  check('starlink/ has its RULES.md', /No Starlink in public copy/.test(fs.readFileSync(path.join(root, 'docs/os/knowledge/starlink/RULES.md'), 'utf8')));
  check('no salonweb/ folder', !fs.existsSync(path.join(root, 'docs/os/knowledge/salonweb')));
  [['SalonWeb', 'web'], ['Laval Web', 'web'], ['LAVAALL Web', 'web'], ['open /web/', 'web'], ['Salone Works', 'saloneworks'], ['salon walks', 'saloneworks'],
    ['SaloneHire', 'salonehire'], ['salon hire', 'salonehire'], ['Starlink v4', 'starlink'], ['LAVAALL', 'lavaall'], ['the weather', '']]
    .forEach(([t, want]) => check(`"${t}" routes to ${want || 'nothing'}`, K.resolveBusiness(t) === want));
  check('every committed brief line is sourced', K.PACK.files.every((f) => unsourcedLines(f.path, f.text).length === 0));
  const brief0 = 'docs/os/knowledge/salonehire/README.md';
  check('an unsourced number is rejected', unsourcedLines(brief0, '# x\n\n- 3 million job seekers use it.\n').length === 1);
  check('a source path that does not exist is rejected', unsourcedLines(brief0, '- 3 million users. [src: docs/nope.md, 2026-11-26]\n').length === 1);
  check('a source without a date is rejected', unsourcedLines(brief0, '- Free plan is 5 jobs. [src: tools/lavaall-ai/projects.json]\n').length === 1);
  check('a Notion page source passes', unsourcedLines(brief0, '- Outreach is drafts only. [src: app.notion.com/p/408c49c22fef81049e3ee6f24027e7d4, 2026-10-29]\n').length === 0);
  check('a malformed Notion source is rejected', unsourcedLines(brief0, '- x. [src: app.notion.com/p/not-an-id, 2026-10-29]\n').length === 1 && unsourcedLines(brief0, '- x. [src: notion.so/anything, 2026-10-29]\n').length === 1);
  check('the Jack library note is in the pack with a source and date', K.PACK.files.some((f) => f.path === 'docs/os/knowledge/lavaall/notes/2026-11-27-jack-roberts-library.md' && /^source: Notion/m.test(f.text) && /^date: 2026-11-27$/m.test(f.text)));
  check('a sourced line passes', unsourcedLines(brief0, '- Free plan is 5 jobs. [src: github.com/osman-jalloh-lab/saloneworks/pull/73, 2026-11-26]\n').length === 0);
  check('unsourced lines only apply to business briefs, not root files', unsourcedLines('docs/os/knowledge/README.md', 'no tag here').length === 0);
  const builder = fs.readFileSync(path.join(root, 'scripts/build-knowledge-pack.js'), 'utf8');
  check('buildPack refuses to compile an unsourced brief', /const bad = unsourcedLines\(rel, text\);\s*if \(bad\.length\) throw/.test(builder));
  const pub = fs.readFileSync(path.join(root, 'api/_chat/knowledge/pack.v1.json'), 'utf8');
  check('public chat pack carries no founder knowledge', !/docs\/os\/knowledge|\[src: |founder only/i.test(pub));

  // 6. Activity log: a mocked merge gives one line; the log's own commits are skipped.
  const line = A.activityLine('f804749aaaa', '2026-11-27T00:58:00Z', 'Merge pull request #128 from osman-jalloh-lab/x', 'Parked: design skills\n\nmore');
  check('mocked merge gives one CT line', line === '- 26 Nov 2026, 6:58 PM CT · f804749 · #128 · Parked: design skills');
  check('squash subject is understood', A.activityLine('abcdef1234', '2026-11-27T18:00:00Z', 'OS core (#130)') === '- 27 Nov 2026, 12:00 PM CT · abcdef1 · #130 · OS core');
  check('a plain push (no PR) logs nothing', A.activityLine('abcdef1234', '2026-11-27T18:00:00Z', 'fix typo') === '');
  const md = '# Activity\n\nintro\n\n- old line · 1111111 · #1 · a\n';
  const added = A.insertLine(md, line);
  check('line goes on top of the list, once', added.indexOf(line) < added.indexOf('- old line') && A.insertLine(added, line) === added);
  check('ACTIVITY-only commit is skipped', A.shouldSkip(['docs/os/knowledge/ACTIVITY.md']) && A.shouldSkip(['docs/os/knowledge/ACTIVITY.md', 'api/os/_data/knowledge.json']));
  check('a real change is logged', !A.shouldSkip(['docs/os/knowledge/ACTIVITY.md', 'api/os/core.js']));
  const wf = fs.readFileSync(path.join(root, '.github/workflows/os-activity-log.yml'), 'utf8');
  check('Action opens a draft PR and never pushes main', /gh pr create --draft/.test(wf) && !/git push origin (main|HEAD:main)/.test(wf) && !/gh pr merge/.test(wf));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
