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

// ================= 1. the drop filter: planted notes for every reason, and false positives that must be KEPT =================
const W1 = 'Star' + 'link', W2 = 'Gui' + 'nea', W3 = 'NA' + 'TCA', W4 = 'Space' + 'X';
const reasonsOf = (f) => builder.dropReason(Object.assign({ title: 'A note', path: 'Ideas/a-note.md', body: '' }, f)).join(',');

const DROPPED = [
  // [label, fields, expected reasons]
  ['email in the body', { body: 'write to a.b@example.org today' }, 'email'],
  ['a business email', { body: 'use support@company.example.com' }, 'email'],
  ['email in the title', { title: 'Mail me@example.org' }, 'email'],
  ['email in the path', { path: 'Ideas/me@example.org.md' }, 'email'],
  ['email in a tag', { tags: ['x@y.zz'] }, 'email'],
  ['phone, dashes', { body: 'call 737-704-4182 tomorrow' }, 'phone'],
  ['phone, brackets', { body: 'call (737) 704 4182' }, 'phone'],
  ['phone, international', { body: 'whatsapp +232 79 121651 now' }, 'phone'],
  ['phone, +1 with brackets', { body: 'whatsapp +1 (737) 704-4182' }, 'phone'],
  ['phone, plain digits', { body: 'number 7377044182' }, 'phone'],
  ['phone, dotted 3.3.4', { body: 'call 737.704.4182' }, 'phone'],
  ['phone, seven digits', { body: 'ring 5551234 after lunch' }, 'phone'],
  ['phone, local with brackets', { body: 'the shop (555-1234)' }, 'phone'],
  ['phone in the title', { title: 'Call 737-704-4182' }, 'phone'],
  ['blocked word one', { body: 'we looked at ' + W1 + ' kits' }, 'blocked-word'],
  ['blocked word two, any case', { body: 'market: ' + W2.toUpperCase() + ' is blocked' }, 'blocked-word'],
  ['blocked word three', { body: 'ask the ' + W3 + ' contact' }, 'blocked-word'],
  ['blocked word four', { body: 'a ' + W4.toLowerCase() + ' engineer' }, 'blocked-word'],
  ['blocked word in the title', { title: W1 + ' plan' }, 'blocked-word'],
  ['blocked word in the path', { path: 'Ideas/' + W2 + '-notes.md' }, 'blocked-word'],
  ['blocked word in a tag', { tags: [W4] }, 'blocked-word'],
  ['lead list title', { title: 'Lead list for Freetown' }, 'lead-data'],
  ['leads batch title', { title: 'SL leads batch 3' }, 'lead-data'],
  ['leads and a list', { title: 'New leads, ready list' }, 'lead-data'],
  ['outreach emails sent', { title: 'Outreach emails sent 22 Oct' }, 'lead-data'],
  ['outreach batch', { title: 'Outreach batch two' }, 'lead-data'],
  ['hotel batch', { title: 'Hotel batch approved' }, 'lead-data'],
  ['school batch', { title: 'School batch drafts' }, 'lead-data'],
  ['quote request', { title: 'Quote request from a buyer' }, 'lead-data'],
  ['rfq title', { title: 'RFQ for tablets' }, 'lead-data'],
  ['lead-data path', { path: 'Research/lead-list-2026.md' }, 'lead-data'],
  ['table with a Name column', { body: '| Name | Status |\n|---|---|\n| X | open |' }, 'lead-data'],
  ['table with a Business column', { body: '| Business | City |\n| --- | --- |\n| Y | Z |' }, 'lead-data'],
  ['table with a Contact column', { body: 'intro\n\n| Role | Contact |\n|:--|:--|\n| a | b |' }, 'lead-data'],
  ['table with a School column', { body: '| School | Year |\n|---|---|\n| a | 1 |' }, 'lead-data'],
  ['table with a Hotel column', { body: '| Hotel | Rooms |\n|---|---|\n| a | 9 |' }, 'lead-data'],
  ['table with Business Name header', { body: '| Business name | x |\n|---|---|\n| a | b |' }, 'lead-data'],
  ['two reasons are both reported', { body: 'mail a@b.cc and call 737-704-4182' }, 'email,phone'],
];
DROPPED.forEach(([label, fields, want]) => check(`dropped (${want}): ${label}`, reasonsOf(fields) === want));

const KEPT = [
  ['a bare @handle', { body: 'follow @creator for tips' }],
  ['an @ alone', { body: 'the @ symbol is used in mentions, e.g. @' }],
  ['a handle with a path url', { body: 'see https://x.com/@creator/status/1 for the post' }],
  ['the word lead', { body: 'a lead developer joined' }],
  ['lead time', { body: 'supplier lead time is two weeks' }],
  ['leadership', { body: 'leadership notes for the founders' }],
  ['customer-facing', { body: 'keep the customer-facing page simple' }],
  ['the word customer', { body: 'the customer journey map' }],
  ['a title that only uses lead', { title: 'Lead time of the print run' }],
  ['an ISO date', { body: 'Decided 2026-10-23, updated 2026-10-01.' }],
  ['an ISO datetime', { body: 'ran at 2026-10-23T14:00:00Z' }],
  ['a date in a file name', { path: 'Scout Finds/2026-10-23_find.md' }],
  ['a compact date', { body: 'build 20261023 shipped' }],
  ['times', { body: 'at 6:02 PM and 14:32:10' }],
  ['a PR number', { body: 'merged in PR #67 and #1234' }],
  ['a version number', { body: 'needs v10.14.6 or 1.2.3' }],
  ['money', { body: 'cap is $25.00 and $1,234,567 in total' }],
  ['a year range', { body: 'FY 2025-2026 plan' }],
  ['a size', { body: 'a 1920x1080 (16:9) screen' }],
  ['a ticket id', { body: 'see ABC-1234-56789 for details' }],
  ['digits inside an identifier', { body: 'id abc12345678 is a hash' }],
  ['a tweet id in a url', { body: 'see https://x.com/user/status/2102481601435423209 for details' }],
  ['a score', { body: 'Jev 0.82 PASS, round 2 of 3, 12 notes' }],
  ['a table without a name-like column', { body: '| Tool | Status |\n|---|---|\n| a | open |' }],
  ['a plain table of numbers', { body: '| Day | Count |\n|---|---|\n| 1 | 10 |' }],
  ['a title with "list" but no lead', { title: 'Reading list' }],
  ['outreach with no batch or sent word', { title: 'Outreach plan ideas' }],
];
KEPT.forEach(([label, fields]) => check(`kept: ${label}`, reasonsOf(fields) === ''));
check('a reason names a category, never a piece of the note', reasonsOf({ body: 'secret ' + W1 + ' plan 737-704-4182 a@b.cc' }) === 'blocked-word,email,phone');

// ================= 2. building from a vault with planted files =================
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lavaall-vault-'));
function put(rel, text) {
  const p = path.join(vault, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
const fm = (o, body) => '---\n' + Object.keys(o).map((k) => `${k}: ${o[k]}`).join('\n') + '\n---\n' + body;
// kept (some use words the old filter dropped)
put('Ideas/Clean idea.md', fm({ type: 'idea', title: '"Clean idea"', date: '2026-10-01', tags: '[alpha, beta]', status: 'open', source: 'vault', owner: 'growth', level: 'L2' }, 'Plain body. See [[Second idea]]. Follow @someone. A lead developer; customer-facing copy; lead time 2 weeks; PR #67.\n'));
put('Ideas/Second idea.md', fm({ title: 'Second idea', tags: '\n  - gamma\n  - delta' }, 'x'.repeat(5000)));
put('Scout Finds/Find one.md', fm({ type: 'scout-find', title: '"A find"', date: '2026-10-05', source: 'x', channel: '"@creator"', url: '"https://x.com/creator/status/2102481601435423209"', status: 'parked', urgent: 'true', jev: '"not run"', tags: '[scout]' }, 'Found something useful on 2026-10-05.'));
put('Scout Finds/Find with handle url.md', fm({ type: 'scout-find', title: 'Handle url', date: '2026-10-06', url: '"https://x.com/@creator/status/1"' }, 'Clean text.'));
put('Research/Note.md', '# Heading title\n\nNo front matter here.\n');
put('Skills/Skill one.md', fm({ name: 'skill-one', description: '"A skill"' }, 'Use it.'));
put('Decisions/Dec.md', fm({ id: 'D-1', title: 'Dec', level: 'L3', status: 'open' }, 'Decision text.'));
// dropped, one per reason
put('Ideas/Bad blocked.md', fm({ title: 'Bad one' }, 'about ' + W1));
put('Ideas/Bad phone.md', fm({ title: 'Phone' }, 'call 737-704-4182'));
put('Ideas/Bad email.md', fm({ title: 'Email' }, 'ask me@example.com'));
put('Research/Lead list 2026.md', fm({ title: 'A list' }, 'clean body'));
put('Research/Names table.md', fm({ title: 'Tools' }, '| Name | Use |\n|---|---|\n| a | b |\n'));
put('Ideas/private-thing.md', fm({ title: 'Private' }, 'clean body but excluded by a glob'));
put('Research/Secret/anything.md', fm({ title: 'Anything' }, 'clean body but its folder is excluded'));
put('Ideas/draft-a.md', fm({ title: 'Draft A' }, 'clean body, excluded by **/draft-*.md'));
put('Skills/_NEVER-LOAD.md', fm({ title: 'Never load' }, 'clean body, but never shipped'));
put('.os-exclude', '# manual drops, one glob per line\n\nIdeas/private-*\nResearch/Secret/\n**/draft-*.md\n');
// never read at all
put('Ideas/old.bak.md', fm({ title: 'Backup' }, 'clean text but a backup'));
put('Ideas/.hidden.md', fm({ title: 'Hidden' }, 'clean text but hidden'));
put('Sessions/2026/Session.md', fm({ title: 'Session' }, 'clean session text'));
put('Jev Scores/Score.md', fm({ title: 'Score' }, 'clean score text'));
put('Templates/Template.md', fm({ title: 'Template' }, 'clean template text'));
put('Diagrams/readme.md', 'clean');
put('Founder Rules.md', 'top-level file, not in an allowed folder');

const pack = builder.buildPack(vault, { deskIds: ['growth', 'technical'] });
const titles = pack.notes.map((n) => n.title);
const reasonFor = (file) => (pack.dropped.find((d) => d.file === file) || { reasons: [] }).reasons.join(',');
check('only the five allowed folders are read', pack.notes.every((n) => Object.keys(builder.FOLDERS).includes(n.folder)) && !titles.some((t) => /Session|Score|Template|Backup|Hidden|readme/.test(t)));
check('notes that only use "lead", "customer", an @handle, a date or a PR number are KEPT', ['Clean idea', 'Second idea', 'A find', 'Handle url', 'Heading title', 'Skill one', 'Dec'].every((t) => titles.includes(t)) && pack.notes.length === 7);
check('a scout find whose url holds an @handle is kept, only the url is left out', pack.notes.find((n) => n.title === 'Handle url').url === undefined);
check('dropped, with the specific reason for each file', reasonFor('Ideas/Bad blocked.md') === 'blocked-word' && reasonFor('Ideas/Bad phone.md') === 'phone' && reasonFor('Ideas/Bad email.md') === 'email' && reasonFor('Research/Lead list 2026.md') === 'lead-data' && reasonFor('Research/Names table.md') === 'lead-data');
check('.os-exclude drops by glob: a file pattern, a folder, and **/ patterns', reasonFor('Ideas/private-thing.md') === 'excluded' && reasonFor('Research/Secret/anything.md') === 'excluded' && reasonFor('Ideas/draft-a.md') === 'excluded');
check('Skills/_NEVER-LOAD.md is never shipped', reasonFor('Skills/_NEVER-LOAD.md') === 'excluded' && !titles.includes('Never load'));
check('exactly nine dropped, no more', pack.dropped.length === 9);
check('dropped entries hold a file name and reasons only', pack.dropped.every((d) => Object.keys(d).sort().join() === 'file,reasons' && Array.isArray(d.reasons) && d.reasons.length > 0));
check('no dropped content is in the pack', !JSON.stringify(pack.notes).includes(W1) && !JSON.stringify(pack.notes).includes('737-704') && !JSON.stringify(pack.notes).includes('me@example.com') && !JSON.stringify(pack.notes).includes('Never load'));
const one = pack.notes.find((n) => n.title === 'Clean idea');
check('front matter: tags, status, level, desk (known desks only), dates, type', one.tags.join() === 'alpha,beta' && one.status === 'open' && one.level === 'L2' && one.desk === 'growth' && one.date === '2026-10-01' && one.type === 'idea' && one.folder === 'Ideas');
const second = pack.notes.find((n) => n.title === 'Second idea');
check('front matter: a "- item" list is read', second.tags.join() === 'gamma,delta');
check('the body is cut to 4000 characters', second.body.length === 4000 && pack.bodyCap === 4000);
check('a [[wikilink]] to a kept note becomes a link by id', one.links.join() === second.id && /^nt-[0-9a-f]{10}$/.test(one.id));
check('a note without front matter takes its heading as the title and has no jev', pack.notes.find((n) => n.title === 'Heading title').jev === 'not run');
const find = pack.notes.find((n) => n.title === 'A find');
check('a scout find keeps urgent and its url; the channel handle is never exported', find.urgent === true && /status\/2102481601435423209/.test(find.url) && !('channel' in find) && !JSON.stringify(pack).includes('@creator'));
check('every pack note passes the feed validator, so a push would be accepted (kept notes may use "lead", "customer", @handle)', feeds.validate('notes', pack.notes, { now: Date.now(), deskIds: null }).ok === true);
check('the newest note comes first', pack.notes[0].date >= pack.notes[pack.notes.length - 1].date);
check('globToRegex: * stays in a folder, ** crosses folders, a bare name matches anywhere', builder.globToRegex('Ideas/*.md').test('Ideas/a.md') && !builder.globToRegex('Ideas/*.md').test('Ideas/x/a.md') && builder.globToRegex('**/a.md').test('Ideas/x/a.md') && builder.globToRegex('a.md').test('Ideas/x/a.md') && builder.globToRegex('Research/').test('Research/x/y.md') && !builder.globToRegex('Research/').test('Ideas/Research/y.md'));
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
