// LAVAALL OS: one shared helper turns desk ids into short names; no raw desk id shows in the UI.
// Loads the real core.js and view files in a sandbox. No network, no store.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const osData = require(path.join(root, 'api/ops/_os_data.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const win = {};
const sandbox = {
  window: win,
  document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } },
  location: { hash: '' }, setTimeout: () => 0, setInterval: () => 0, Intl,
};
vm.createContext(sandbox);
['core.js', 'home.js', 'desks.js', 'decisions.js', 'routines.js', 'council.js', 'brain-graph.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f });
});
const OS = win.OS;
const drawers = [];
OS.openDrawer = (h) => { drawers.push(h); };

const data = osData.buildOsData({ store: { chats: [], council: [{ id: 'c1', title: 'Run', desk: 'lavaall-ceo', level: 'L3', status: 'waiting_l3', date: 5, rounds: [] }] }, health: null }, { env: {} });
OS.data = data;

// 1. The helper.
const expect = { 'lavaall-ceo': 'CEO', sales: 'Sales', technical: 'Technical', growth: 'Growth', lifecycle: 'Lifecycle', researchy: 'Researchy', scout: 'Scout' };
Object.keys(expect).forEach((id) => check(`deskShort(${id}) = ${expect[id]}`, OS.deskShort(id) === expect[id]));
check('deskShort accepts a short name or a full name, any case', OS.deskShort('CEO') === 'CEO' && OS.deskShort('GROWTH') === 'Growth');
check('an unknown id is tidied, never shown raw', OS.deskShort('night-shift') === 'Night shift' && OS.deskShort('') === '' && OS.deskShort(null) === '');
check('deskChip escapes and falls back to a dash', /<span class="dim">—<\/span>/.test(OS.deskChip('')) && !/<img/.test(OS.deskChip('<img src=x>')));
check('each desk gets its own dot colour', new Set(Object.keys(expect).map((id) => /background:([^"]+)"/.exec(OS.deskChip(id))[1])).size === 7);

// 2. No raw id in any view's visible text (tags and attribute values stripped).
const text = (html) => html.replace(/<[^>]*>/g, ' ');
const html = (id, sub) => OS.views[id].render({ id, sub: sub || '', data });
['home', 'decisions', 'council', 'routines', 'desks'].forEach((v) => {
  check(`${v}: no raw "lavaall-ceo" in visible text`, !/lavaall-ceo/.test(text(html(v))));
});
check('decisions: CEO decisions are labelled CEO', /<\/i>CEO<\/span>/.test(html('decisions')));
check('home recent list shows short names', /\d+ \w+ · (CEO|Technical|Growth|Sales)/.test(text(html('home'))) || /(CEO|Technical|Growth|Sales)/.test(text(html('home'))));
check('council desk shows CEO', /CEO · L3/.test(text(html('council'))));

// 3. The decision drawer uses the short name.
OS.views.decisions.mount({ addEventListener() {}, querySelector: () => null }, { id: 'decisions', sub: data.decisions.find((d) => d.desk === 'lavaall-ceo').id, data });
check('decision drawer shows Desk: CEO and no raw id', /<dt>Desk<\/dt><dd>CEO<\/dd>/.test(drawers[0] || '') && !/lavaall-ceo/.test(text(drawers[0] || '')));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
