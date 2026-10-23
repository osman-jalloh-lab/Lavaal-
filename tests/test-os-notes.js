// LAVAALL OS notes pack: the vault builder's drop filter (with planted bad notes), the gitignore entry, no notes
// content in git, the notes feed's 401, and the Notes / Home rendering. No network; --push is never run.

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const builder = require(path.join(root, 'scripts/build-notes-pack.js'));
const osData = require(path.join(root, 'api/ops/_os_data.js'));
const feeds = require(path.join(root, 'api/ops/_os_feeds.js'));
const { handleIngest } = require(path.join(root, 'api/ops/_os_ingest.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

// ================= 1. the drop filter, with planted bad notes =================
const BAD = {
  'blocked word one': 'we looked at ' + 'Star' + 'link kits',
  'blocked word two, any case': 'market: ' + 'GUI' + 'NEA is blocked',
  'an at sign': 'handle @someone said so',
  'an email address': 'write to person at their address: a.b@example.org',
  'the word lead': 'a hot lead from the daily run',
  'leadership counts too': 'leadership notes',
  'the word customer': 'the customer asked for a quote',
  'US phone, dashes': 'call 737-704-4182 tomorrow',
  'US phone, brackets': 'call (737) 704 4182',
  'international phone': 'whatsapp +232 79 121651 now',
  'long digit run': 'account 123456789012',
  'email spelled out': 'reach me at name [at] example [dot] com',
};
Object.keys(BAD).forEach((k) => check(`dropped: ${k}`, builder.dropReason(`Title\n${BAD[k]}`) !== ''));
const CLEAN = {
  'a plain note': 'Scout found a tool for ads.',
  'ISO dates': 'Decided 2026-09-25, updated 2026-10-01 14:32.',
  'a tweet url with a long id': 'see https://x.com/user/status/2102481601435423209 for details',
  'FR ids and money': 'FR-026 applies; cap is $25.00 per month.',
};
Object.keys(CLEAN).forEach((k) => check(`kept: ${k}`, builder.dropReason(CLEAN[k]) === ''));
check('the drop pattern is exactly the one specified', String(builder.DROP) === '/' + ['star' + 'link', 'gui' + 'nea', '@', 'lead', 'customer'].join('|') + '/i');
check('the reason names a category, never a piece of the note', builder.dropReason('secret ' + 'Star' + 'link plan') === 'blocked word or @');

// ================= 2. building from a vault with planted files =================
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lavaall-vault-'));
function put(rel, text) {
  const p = path.join(vault, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
const fm = (o, body) => '---\n' + Object.keys(o).map((k) => `${k}: ${o[k]}`).join('\n') + '\n---\n' + body;
put('Ideas/Clean idea.md', fm({ type: 'idea', title: '"Clean idea"', date: '2026-10-01', tags: '[alpha, beta]', status: 'open', source: 'vault', owner: 'growth', level: 'L2' }, 'Plain body. See [[Second idea]].\n'));
put('Ideas/Second idea.md', fm({ title: 'Second idea', tags: '\n  - gamma\n  - delta' }, 'x'.repeat(5000)));
put('Ideas/Bad word.md', fm({ title: 'Bad one' }, 'about ' + 'Star' + 'link'));
put('Ideas/Bad phone.md', fm({ title: 'Phone' }, 'call 737-704-4182'));
put('Ideas/Bad at.md', fm({ title: 'At' }, 'ask me@example.com'));
put('Ideas/old.bak.md', fm({ title: 'Backup' }, 'clean text but a backup'));
put('Ideas/.hidden.md', fm({ title: 'Hidden' }, 'clean text but hidden'));
put('Scout Finds/Find one.md', fm({ type: 'scout-find', title: '"A find"', date: '2026-10-05', source: 'x', channel: '"@creator"', url: '"https://x.com/creator/status/2102481601435423209"', status: 'parked', urgent: 'true', jev: '"not run"', tags: '[scout]' }, 'Found something useful.'));
put('Scout Finds/Find with handle url.md', fm({ type: 'scout-find', title: 'Handle url', date: '2026-10-06', url: '"https://x.com/@creator/status/1"' }, 'Clean text.'));
put('Research/Note.md', '# Heading title\n\nNo front matter here.\n');
put('Skills/Skill one.md', fm({ name: 'skill-one', description: '"A skill"' }, 'Use it.'));
put('Decisions/Dec.md', fm({ id: 'D-1', title: 'Dec', level: 'L3', status: 'open' }, 'Decision text.'));
put('Sessions/2026/Session.md', fm({ title: 'Session' }, 'clean session text'));
put('Jev Scores/Score.md', fm({ title: 'Score' }, 'clean score text'));
put('Templates/Template.md', fm({ title: 'Template' }, 'clean template text'));
put('Diagrams/readme.md', 'clean');
put('Founder Rules.md', 'top-level file, not in an allowed folder');

const pack = builder.buildPack(vault, { deskIds: ['growth', 'technical'] });
const titles = pack.notes.map((n) => n.title);
check('only the five allowed folders are read', pack.notes.every((n) => Object.keys(builder.FOLDERS).includes(n.folder)) && !titles.some((t) => /Session|Score|Template|Backup|Hidden|readme/.test(t)));
check('clean notes are kept (the handle-url scout find is dropped for its @)', ['Clean idea', 'Second idea', 'A find', 'Heading title', 'Skill one', 'Dec'].every((t) => titles.includes(t)) && !titles.includes('Handle url') && pack.notes.length === 6);
check('the four planted bad notes are dropped, by file name', pack.dropped.length === 4 && ['Ideas/Bad word.md', 'Ideas/Bad phone.md', 'Ideas/Bad at.md', 'Scout Finds/Find with handle url.md'].every((f) => pack.dropped.some((d) => d.file === f)));
check('dropped entries hold a file name and a category only', pack.dropped.every((d) => Object.keys(d).sort().join() === 'file,reason'));
check('no dropped content is in the pack', !JSON.stringify(pack).includes('Star' + 'link') && !JSON.stringify(pack).includes('737-704') && !JSON.stringify(pack).includes('me@example.com'));
const one = pack.notes.find((n) => n.title === 'Clean idea');
check('front matter: tags, status, level, desk (known desks only), dates, type', one.tags.join() === 'alpha,beta' && one.status === 'open' && one.level === 'L2' && one.desk === 'growth' && one.date === '2026-10-01' && one.type === 'idea' && one.folder === 'Ideas');
const second = pack.notes.find((n) => n.title === 'Second idea');
check('front matter: a "- item" list is read', second.tags.join() === 'gamma,delta');
check('the body is cut to 4000 characters', second.body.length === 4000 && pack.bodyCap === 4000);
check('a [[wikilink]] to a kept note becomes a link by id', one.links.join() === second.id && /^nt-[0-9a-f]{10}$/.test(one.id));
check('a note without front matter takes its heading as the title and has no jev', pack.notes.find((n) => n.title === 'Heading title').jev === 'not run');
const find = pack.notes.find((n) => n.title === 'A find');
check('a scout find keeps urgent and its url; the channel handle is never exported', find.urgent === true && /status\/2102481601435423209/.test(find.url) && !('channel' in find) && !JSON.stringify(pack).includes('@creator'));
check('every pack note passes the feed validator, so a push would be accepted', feeds.validate('notes', pack.notes, { now: Date.now(), deskIds: null }).ok === true);
check('the newest note comes first', pack.notes[0].date >= pack.notes[pack.notes.length - 1].date);
fs.rmSync(vault, { recursive: true, force: true });

// ================= 3. gitignore and git =================
const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
check('.gitignore lists api/os/_data/notes.local.json', /^api\/os\/_data\/notes\.local\.json\s*$/m.test(gi));
check('the builder writes to that ignored file by default', path.relative(root, builder.OUT_FILE).replace(/\\/g, '/') === 'api/os/_data/notes.local.json');
let git = true;
const run = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
try { run(['rev-parse', '--git-dir']); } catch { git = false; }
if (git) {
  check('git ignores the pack file', (() => { try { return run(['check-ignore', 'api/os/_data/notes.local.json']).trim() !== ''; } catch { return false; } })());
  check('no notes pack file is tracked', run(['ls-files', 'api/os/_data']).split('\n').filter(Boolean).every((f) => !/notes/i.test(f)));
  if (fs.existsSync(builder.OUT_FILE)) {
    // Decision notes are left out: the committed decisions pack already carries those rows.
    const local = JSON.parse(fs.readFileSync(builder.OUT_FILE, 'utf8')).notes.filter((n) => n.type !== 'decision' && n.body.length > 160).slice(0, 60);
    const leaked = local.filter((n) => {
      const snippet = n.body.slice(80, 140).trim();
      if (snippet.length < 30 || snippet.includes('\n')) return false;
      try { return run(['grep', '-F', '-l', '--', snippet, '--', ':!api/os/_data/notes.local.json']).trim() !== ''; } catch { return false; }
    });
    check(`no vault note text is in any tracked file (${local.length} notes sampled)`, leaked.length === 0);
  } else {
    check('no local pack on this machine: nothing to leak', true);
  }
}
const shipped = ['scripts/build-notes-pack.js', 'api/os/_client/notes.js', 'api/ops/_os_feeds.js', 'api/os/_data/INGEST.md'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
check('no banned word appears as plain text in the shipped files', !new RegExp(['star' + 'link', 'gui' + 'nea'].join('|'), 'i').test(shipped));

(async () => {
  // ================= 4. --push: built, never run =================
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { status: 200 }; };
  let threw = false;
  try { await builder.push([], builder.PUSH_URL, {}); } catch { threw = true; }
  check('--push without TOKEN refuses and sends nothing', threw && calls.length === 0);
  const status = await builder.push([{ id: 'nt-0000000001' }], builder.PUSH_URL, { TOKEN: 'test-token-not-real-0123456789' });
  check('--push POSTs the pack to the production notes feed with the bearer from TOKEN', status === 200 && calls.length === 1 && calls[0].url === 'https://www.lavaall.com/api/os/ingest/notes' && calls[0].init.method === 'POST' && calls[0].init.headers.Authorization === 'Bearer test-token-not-real-0123456789' && Array.isArray(JSON.parse(calls[0].init.body)));
  globalThis.fetch = async () => { throw new Error('network is off in this test'); };
  check('requiring the builder does not run it', /if \(require\.main === module\) \{\s*main\(\)/.test(fs.readFileSync(path.join(root, 'scripts/build-notes-pack.js'), 'utf8')));

  // ================= 5. the notes feed answers 401 without the secret =================
  const mockRes = () => { const r = { statusCode: 200, body: null, headers: {} }; r.status = (c) => { r.statusCode = c; return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; }; r.send = (b) => { try { r.body = JSON.parse(b); } catch { r.body = b; } return r; }; return r; };
  const ENV = { OPS_CEO_BRIDGE_SECRET: 'test-bridge-secret-for-notes-only', KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'kv' };
  const kvCmds = [];
  const fetchImpl = async (u, init) => { kvCmds.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ result: 'OK' }) }; };
  const good = [{ id: 'nt-0000000001', type: 'idea', folder: 'Ideas', title: 'T', date: '2026-10-20', updated: '', desk: '', status: '', level: null, jev: 'not run', tags: [], links: [], source: '', body: 'b' }];
  const post = async (headers, body) => { const res = mockRes(); await handleIngest({ method: 'POST', url: '/api/os/ingest/notes', query: { feed: 'notes' }, headers: Object.assign({ 'content-type': 'application/json' }, headers), body }, res, { env: ENV, now: Date.parse('2026-10-23T18:00:00Z'), fetchImpl }); return res; };
  const none = await post({}, good);
  const wrong = await post({ authorization: 'Bearer nope-nope-nope-nope-nope' }, good);
  check('notes feed: no token or a wrong token -> 401 and nothing stored', none.statusCode === 401 && wrong.statusCode === 401 && kvCmds.length === 0);
  const ok = await post({ authorization: 'Bearer test-bridge-secret-for-notes-only' }, good);
  check('notes feed: with the token -> 200, one SET to its own key lavaall-os-feed-notes-v1', ok.statusCode === 200 && kvCmds.filter((c) => c[0] === 'SET').length === 1 && kvCmds.find((c) => c[0] === 'SET')[1] === 'lavaall-os-feed-notes-v1');
  check('notes feed cap is 900 KB, the others stay at 20 KB', feeds.maxBytesFor('notes') === 900 * 1024 && feeds.maxBytesFor('spend') === 20 * 1024 && feeds.maxBytesFor('morning-brief') === 20 * 1024);

  // ================= 6. rendering =================
  const win = {};
  const sandbox = { window: win, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } }, location: { hash: '' }, setTimeout: () => 0, setInterval: () => 0, Intl };
  vm.createContext(sandbox);
  ['core.js', 'home.js', 'notes.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  const OS = win.OS;
  const clock = { now: Date.parse('2026-10-23T18:00:00Z') };
  const mk = (over) => Object.assign({ id: 'nt-0000000001', type: 'idea', folder: 'Ideas', title: 'Alpha idea', date: '2026-10-20', updated: '2026-10-21', desk: 'growth', status: 'open', level: null, jev: 'not run', tags: ['alpha', 'shared'], links: [], source: 'vault', body: 'Body <b>bold?</b> text' }, over);
  const rows = [
    mk({}),
    mk({ id: 'nt-0000000002', type: 'scout-find', folder: 'Scout Finds', title: 'Newest find', date: '2026-10-22', tags: ['shared'], urgent: true, url: 'https://example.com/p', links: ['nt-0000000001'] }),
    mk({ id: 'nt-0000000003', type: 'note', folder: 'Research', title: 'Other note', date: '2026-10-19', tags: [], body: 'findme needle' }),
  ].map((n) => feeds.notePackRow(feeds.validate('notes', [n], clock).value[0]));
  const build = (localNotes) => osData.buildOsData({ store: {}, health: null }, { env: {}, pack: null, localNotes });
  const data = build(rows);
  OS.data = data;
  const view = OS.views.notes.render({ id: 'notes', sub: '', data });
  check('Notes: a search box, folder chips, type chips and a tag list', /id="notes-q"/.test(view) && /data-nf="folder" data-v="Scout Finds"/.test(view) && /data-nf="type" data-v="scout-find"/.test(view) && /data-nf="tag" data-v="shared"/.test(view));
  check('Notes: newest first, the newest is open, with an urgent pill and its link text', view.indexOf('Newest find') < view.indexOf('Alpha idea') && /<h2>Newest find<\/h2>/.test(view) && /pill bad">urgent/.test(view) && /Link: https:\/\/example\.com\/p/.test(view));
  check('Notes: the reader lists linked notes', /Linked notes[\s\S]*Alpha idea/.test(view));
  const alpha = OS.views.notes.render({ id: 'notes', sub: 'nt-0000000001', data });
  check('Notes: the desk shows its short name and the body stays plain text', /<\/i>Growth<\/span>/.test(alpha) && !/<b>bold\?<\/b>/.test(alpha) && /&lt;b&gt;bold\?&lt;\/b&gt;/.test(alpha));
  check('Notes: tags are counted (shared = 2)', /data-v="shared">shared <span class="num">2<\/span>/.test(view));
  const empty = build(null);
  OS.data = empty;
  const emptyView = OS.views.notes.render({ id: 'notes', sub: '', data: empty });
  check('Notes: with no pack and no store notes it is the honest empty state naming the vault pack', /No notes yet\./.test(emptyView) && /build-notes-pack/.test(emptyView));
  OS.data = data;
  const handlers = {};
  const els = { '#notes-filters': { innerHTML: '' }, '#notes-list': { innerHTML: '' }, '#notes-reader': { innerHTML: '' } };
  OS.views.notes.mount({ addEventListener: (t, fn) => { handlers[t] = fn; }, querySelector: (s) => els[s] }, { id: 'notes', sub: '', data });
  const chip = (kind, value) => ({ target: { closest: () => ({ getAttribute: (a) => (a === 'data-nf' ? kind : value) }) } });
  handlers.input({ target: { id: 'notes-q', value: 'findme' } });
  check('Notes: searching narrows the list and opens the first match', /Other note/.test(els['#notes-list'].innerHTML) && !/Newest find/.test(els['#notes-list'].innerHTML) && /<h2>Other note<\/h2>/.test(els['#notes-reader'].innerHTML));
  handlers.input({ target: { id: 'notes-q', value: '' } });
  handlers.click(chip('folder', 'Research'));
  check('Notes: a folder chip filters', /Other note/.test(els['#notes-list'].innerHTML) && !/Alpha idea/.test(els['#notes-list'].innerHTML));
  handlers.click(chip('folder', 'All'));
  handlers.click(chip('tag', 'alpha'));
  check('Notes: a tag filters', /Alpha idea/.test(els['#notes-list'].innerHTML) && !/Other note/.test(els['#notes-list'].innerHTML));
  handlers.click(chip('tag', 'alpha'));
  check('Notes: clicking the tag again clears it', /Other note/.test(els['#notes-list'].innerHTML));

  OS.data = data;
  const home = OS.views.home.render({ id: 'home', sub: '', data });
  const scout = home.split('Latest Scout finds')[1].split('AI Council')[0];
  check('Home: Latest Scout finds shows the scout-find note with its urgent pill, not the ideas', /Newest find/.test(scout) && /pill bad">urgent/.test(scout) && !/Alpha idea|Other note/.test(scout));
  OS.data = empty;
  check('Home: with no notes pack Latest Scout finds is an empty state', /No Scout finds yet\./.test(OS.views.home.render({ id: 'home', sub: '', data: empty })));

  const gated = osData.buildOsData({ store: {}, health: null }, { env: {}, pack: null });
  check('the local pack file is not read unless OS_LOCAL_NOTES=1 (tests and production never touch it)', Array.isArray(gated.notes) && gated.notes.length === 0);

  globalThis.fetch = realFetch;
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
