// LAVAALL OS AI Council as one conversation: one lane and colour per role (Claude builds, Codex reviews, Jev scores,
// Osman approves), round by round, a legend, the old rounds[] shape mapped, council.json with 0 records, the
// schema doc, and the Brain's edges from links[] and desk. Uses a test-only fixture. No network.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const osData = require(path.join(root, 'api/ops/_os_data.js'));
const PACK = require(path.join(root, 'api/os/_data/index.js'));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/council-sample.json'), 'utf8'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const win = {};
const sandbox = { window: win, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } }, location: { hash: '' }, setTimeout: () => 0, setInterval: () => 0, Intl };
vm.createContext(sandbox);
['core.js', 'home.js', 'council.js', 'brain-graph.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
const OS = win.OS;
const build = (store, pack) => { const d = osData.buildOsData({ store, health: null }, { env: {}, pack: pack === undefined ? null : pack }); OS.data = d; return d; };
const draw = (d, sub) => OS.views.council.render({ id: 'council', sub: sub || '', data: d });
const text = (h) => h.replace(/<[^>]*>/g, ' ');

// 1. The pack file and the honest empty state.
const raw = fs.readFileSync(path.join(root, 'api/os/_data/council.json'), 'utf8');
check('council.json exists with 0 records, pure ASCII', JSON.parse(raw).length === 0 && Array.isArray(JSON.parse(raw)) && !/[^\x00-\x7F]/.test(raw) && Array.isArray(PACK.council) && PACK.council.length === 0);
const real = build({}, PACK);
check('the empty pack keeps council null: the empty state stays honest', real.council === null && real.sources.council.live === false && /No council records yet\./.test(draw(real)) && /Source: stored council records/.test(draw(real)));
check('the fixture is not shipped in the pack or the app', !JSON.stringify(PACK).includes('Sample run') && !fs.readFileSync(path.join(root, 'api/os/_client/council.js'), 'utf8').includes('Sample run'));

// 2. The council shape: normalised messages.
const d = build({ council: FIXTURE });
const rec = d.council[0];
check('fixture: 5 messages in round order, builder before reviewer before scorer', rec.messages.length === 5 && rec.messages.map((m) => m.round + m.role[0]).join() === '1b,1r,2b,2r,2s');
check('every role gets its fixed agent', rec.messages.every((m) => ({ builder: 'Claude', reviewer: 'Codex', scorer: 'Jev', approver: 'Osman' })[m.role] === m.agent));
check('the record score is the last scorer score; round and max rounds', rec.jev === 0.82 && rec.round === 2 && rec.maxRounds === 3 && rec.status === 'waiting_l3' && rec.level === 'L3');
const odd = osData.councilFrom({ council: [{ id: 'x', title: 'X', messages: [
  { round: 1, role: 'builder', agent: 'Somebody Else', text: 'A', draft: 'A1' },
  { round: 0, role: 'builder', text: 'bad round' },
  { round: 1, role: 'wizard', text: 'bad role' },
  { round: 1, role: 'scorer', text: '', score: 7 },
  { round: 1, role: 'scorer', text: 'ok', score: 0.5 },
  { round: 1, role: 'approver', text: 'Go.' },
  { round: 1, role: 'reviewer', text: '' },
  null,
] }] });
check('bad rounds, roles and empty messages are dropped; a wrong agent is replaced by the lane agent; out-of-range score dropped', odd[0].messages.map((m) => m.role).join() === 'builder,scorer,approver' && odd[0].messages[0].agent === 'Claude' && odd[0].messages[1].score === 0.5);
check('a builder message without draft uses its text as the draft', osData.councilFrom({ council: [{ id: 'y', title: 'Y', messages: [{ round: 1, role: 'builder', text: 'only text' }] }] })[0].messages[0].draft === 'only text');

// 3. The old rounds[] shape is mapped.
const old = osData.councilFrom({ council: [{ id: 'o', title: 'Old', status: 'approved', rounds: [{ n: 2, draft: 'two', review: 'r2' }, { n: 1, draft: 'one', review: 'r1' }] }] })[0];
check('old shape: rounds become builder and reviewer messages, in order', old.messages.map((m) => `${m.round}${m.role[0]}`).join() === '1b,1r,2b,2r' && old.messages[0].draft === 'one' && old.messages[1].agent === 'Codex' && old.round === 2);
check('the pack council.json is used when it holds records and the store has none', osData.councilFrom({}, { council: FIXTURE }).length === 1 && osData.councilFrom({}, { council: [] }) === null && osData.councilFrom({ council: [] }, { council: FIXTURE }).length === 0);

// 4. The conversation view.
const h = draw(d);
check('legend at the top: four roles, each with its colour lane', /class="clegend"/.test(h) && ['builder', 'reviewer', 'scorer', 'approver'].every((r) => new RegExp(`class="lg lane-${r}"`).test(h)) && /<b>Claude<\/b> builds/.test(h) && /<b>Codex<\/b> reviews/.test(h) && /<b>Jev<\/b> scores/.test(h) && /<b>Osman<\/b> approves/.test(h));
check('one chat thread: 2 Claude, 2 Codex, 1 Jev message, then the Osman gate', (h.match(/class="cmsg lane-builder"/g) || []).length === 2 && (h.match(/class="cmsg lane-reviewer"/g) || []).length === 2 && (h.match(/class="cmsg lane-scorer"/g) || []).length === 1 && (h.match(/class="cmsg lane-approver"/g) || []).length === 1);
check('order: draft, review, revision, review, score, gate', (() => { const t = h.indexOf('<span>draft</span>'); const r1 = h.indexOf('<span>review</span>'); const rv = h.indexOf('<span>revision</span>'); const r2 = h.indexOf('<span>review</span>', r1 + 10); const s = h.indexOf('<span>score</span>'); const g = h.indexOf('Waiting for L3 OK'); return t > 0 && t < r1 && r1 < rv && rv < r2 && r2 < s && s < g; })());
check('rounds are labelled and the gate sits under "Score + gate"', /Round 1/.test(h) && /Round 2/.test(h) && /Score \+ gate/.test(h));
check('the revision is a diff against the first draft; the first draft is shown whole', /<div class="d">- Step two<\/div>/.test(h) && /<div class="a">\+ Step two \(owner: sample desk\)<\/div>/.test(h) && /<div class="a">\+ Notes<\/div>/.test(h) && !/>- Plan</.test(h) && /<div class="diff plain">Plan\nStep one\nStep two\nEnd<\/div>/.test(h) && /<details class="full">/.test(h));
check('the Jev lane shows its score, PASS pill and bar', /PASS 0\.82/.test(h) && /class="bar"/.test(h) && /Evidence is thin/.test(h));
check('the Osman gate shows "Waiting for L3 OK" with typing dots', /cmsg lane-approver[\s\S]*Waiting for L3 OK <span class="typing"/.test(h));
check('the header shows the desk short name and level', /<span class="pill">Growth · L3<\/span>/.test(h) && /<dt>Round<\/dt><dd class="num">2 of 3<\/dd>/.test(h));
const approved = build({ council: [Object.assign({}, FIXTURE[0], { status: 'approved' })] });
check('an approved run ends with "Approved" in the Osman lane, no waiting', /lane-approver[\s\S]*<div>Approved<\/div>/.test(draw(approved)) && !/Waiting for/.test(draw(approved)));
const withDecision = build({ council: [Object.assign({}, FIXTURE[0], { status: 'approved', messages: FIXTURE[0].messages.concat([{ round: 2, role: 'approver', agent: 'Osman', text: 'Approved. Go.' }]) })] });
check('a stored Osman message is shown in his lane instead of a gate placeholder', /Approved\. Go\./.test(draw(withDecision)) && (draw(withDecision).match(/class="cmsg lane-approver"/g) || []).length === 1);
const bare = build({ council: [{ id: 'b', title: 'Bare run', rounds: [] }] });
check('a run with nothing stored says so, with "Jev: not run" and no invented gate', /No rounds are stored for this run\./.test(draw(bare)) && /Jev: not run/.test(draw(bare)) && /No gate status is stored for this run\./.test(draw(bare)));
check('titles and message text are escaped', (() => { const e = build({ council: [{ id: 'e', title: '<img src=x onerror=1>', messages: [{ round: 1, role: 'builder', text: 't', draft: '<b>d</b>' }, { round: 1, role: 'reviewer', text: '<script>alert(1)</script>' }] }] }); const o = draw(e); return !/<img src=x|<script>|<b>d<\/b>/.test(o) && /&lt;script&gt;/.test(o); })());
check('read only: no buttons, forms or inputs; no model call, no cost', !/<button|<form|<input|<textarea/.test(h) && !/Cost estimate|Model settings|\$\d/.test(h) && !/fetch\(/.test(fs.readFileSync(path.join(root, 'api/os/_client/council.js'), 'utf8')));
check('Home shows the latest run in lane words', (() => { const o = OS.views.home.render({ id: 'home', sub: '', data: d }); return /Claude drafted · Codex reviewed · Jev scored · waiting for L3 OK/.test(text(o)) && /round 2 of 3/.test(o); })());

// 5. CSS: one colour per lane, a phone layout.
const css = fs.readFileSync(path.join(root, 'api/os/_client/os.css'), 'utf8');
check('lane colours: blue, violet, amber, green', /\.lane-builder\{--lc:var\(--accent\)/.test(css) && /\.lane-reviewer\{--lc:var\(--c-violet\)/.test(css) && /\.lane-scorer\{--lc:var\(--c-amber\)/.test(css) && /\.lane-approver\{--lc:var\(--ok\)/.test(css));
check('lanes step in on desktop and tighten on a phone', /\.cmsg\{[^}]*margin-left:calc\(var\(--ln\)\*28px\)/.test(css) && /\.cmsg\{margin-left:calc\(var\(--ln\)\*10px\)\}/.test(css));

// 6. The record shape is documented, and the schema doc matches.
const readme = fs.readFileSync(path.join(root, 'api/os/_data/README.md'), 'utf8');
check('README documents the council record shape and the old-shape mapping', /council\.json/.test(readme) && /messages:\[\{round, role:"builder"\|"reviewer"\|"scorer"\|"approver", agent:"Claude"\|"Codex"\|"Jev"\|"Osman", at, text, draft\?, score\?\}\]/.test(readme) && /rounds\[\{n, draft, review, at\}\]/.test(readme));
const schema = fs.readFileSync(path.join(root, 'docs/os/SCHEMA.md'), 'utf8');
check('SCHEMA.md lists every common field', ['id', 'type', 'title', 'date', 'updated', 'desk', 'status', 'level', 'jev', 'tags', 'links', 'source'].every((f) => new RegExp('\\| `' + f + '` \\|').test(schema)));
check('SCHEMA.md lists every type and its extras', ['note', 'scout-find', 'idea', 'decision', 'routine', 'desk', 'skill', 'rule', 'council-run', 'message'].every((t) => schema.includes('`' + t + '`')) && /`schedule`/.test(schema) && /`steps`/.test(schema) && /`closedAt`/.test(schema) && /`channel`, `url`, `urgent`/.test(schema) && /`role`.*`agent`.*`at`/.test(schema));
check('SCHEMA.md has no banned word or email', !new RegExp(['star' + 'link', 'gui' + 'nea'].join('|'), 'i').test(schema) && !/[\w.+-]+@[\w-]+\.\w+/.test(schema + readme.replace(/support@ ranked inbox push/g, '')));

// 7. The Brain draws edges from links[] and desk.
const bd = osData.buildOsData({ store: {}, health: null }, { env: {}, pack: PACK, localNotes: [
  { id: 'nt-0000000001', title: 'Alpha', body: '', source: '', type: 'idea', folder: 'Ideas', desk: 'growth', status: '', level: '', jev: null, tags: [], links: ['nt-0000000002', 'nt-0000000999'], url: '', urgent: false, date: 1, updatedAt: 1 },
  { id: 'nt-0000000002', title: 'Beta', body: '', source: '', type: 'idea', folder: 'Ideas', desk: 'janitor', status: '', level: '', jev: null, tags: [], links: [], url: '', urgent: false, date: 2, updatedAt: 2 },
] });
const g = OS.brain.build(bd);
const rels = (rel) => g.links.filter((l) => l.why === rel);
check('Brain: a note\'s links[] become "links to" edges, only when both notes exist', rels('links to').length === 1);
check('Brain: a note\'s desk becomes an "owned by" edge, only for a real desk', rels('owned by').length === 1);

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
