// LAVAALL OS Home: every number traces to a source or shows a dash; nothing invented.
// Loads the real api/os/_client/home.js in a sandbox. No DOM library, no network.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const osData = require(path.join(root, 'api/ops/_os_data.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loadHome() {
  const views = {};
  const OS = {
    esc,
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    fmtDate: (ms) => (ms > 0 ? 'D' + ms : ''),
    chicagoHour: () => 20,
    registerView: (id, view) => { views[id] = view; },
    openPalette() {},
    openDrawer() {},
    data: {},
  };
  const code = fs.readFileSync(path.join(root, 'api/os/_client/home.js'), 'utf8');
  vm.runInNewContext(code, { window: { OS } }, { filename: 'home.js' });
  return { view: views.home, OS };
}

function renderWith(store) {
  const { view, OS } = loadHome();
  const data = osData.buildOsData({ store, health: null }, { env: {} });
  OS.data = data;
  return view.render({ data, id: 'home', sub: '' });
}

function kpiValues(html) {
  return (html.match(/<b class="num">([^<]*)<\/b>/g) || []).map((m) => m.replace(/<[^>]+>/g, ''));
}

const DASH = '—';

// 1. Store unreadable: no numbers at all.
const down = renderWith(null);
check('four KPI tiles', kpiValues(down).length === 4);
check('store down -> every KPI is a dash', kpiValues(down).every((v) => v === DASH));
check('store down -> says so', /could not be read/.test(down));
check('store down -> approvals card is an empty state', /Approvals could not be loaded/.test(down) && !/data-approval=/.test(down));

// 2. Store readable but empty: approvals is a real zero, the rest stay dashes.
const empty = renderWith({ chats: [] });
check('empty store -> awaiting approval is 0', kpiValues(empty)[0] === '0');
check('empty store -> open decisions, bounce rate, spend are dashes', kpiValues(empty).slice(1).every((v) => v === DASH));
check('empty store -> nothing-waiting message', /Nothing is waiting for your approval\./.test(empty) && /Nothing is waiting for approval\./.test(empty));

// 3. Pending proposals flow through.
const store = {
  chats: [{ proposals: [
    { id: 'a', kind: 'add-task', status: 'pending', title: 'First', createdAt: 300 },
    { id: 'b', kind: 'save-goal', status: 'pending', title: 'Second', createdAt: 200 },
    { id: 'c', kind: 'add-note', status: 'dismissed', title: 'Skipped', createdAt: 100 },
    { id: 'd', kind: 'update-task', status: 'pending', title: 'Third', createdAt: 50 },
  ] }],
};
const full = renderWith(store);
check('awaiting approval counts only pending', kpiValues(full)[0] === '3');
check('one Approve button per pending item', (full.match(/data-approval="/g) || []).length === 3 && (full.match(/>Approve</g) || []).length === 3);
check('dismissed proposals are not listed', !/Skipped/.test(full));
check('newest first', full.indexOf('First') < full.indexOf('Second') && full.indexOf('Second') < full.indexOf('Third'));
check('plural wording', /3 items are waiting for your approval\./.test(full));
check('singular wording', /1 item is waiting/.test(renderWith({ chats: [{ proposals: [{ id: 'x', kind: 'add-task', status: 'pending', title: 'Only' }] }] })));
check('other KPIs still dashes with data present', kpiValues(full).slice(1).every((v) => v === DASH));

// 4. HTML from the store is escaped.
const hostile = renderWith({ chats: [{ proposals: [{ id: 'h', kind: 'add-task', status: 'pending', title: '<img src=x onerror=alert(1)>', createdAt: 1 }] }] });
check('proposal titles are escaped', !/<img src=x/.test(hostile) && /&lt;img src=x/.test(hostile));
check('proposal ids are escaped in attributes', !/data-approval="[^"]*[<>]/.test(hostile));

// 5. Widgets without a source are empty states that name the source.
['No morning brief is stored yet.', 'No council records yet.', 'No decision log yet.'].forEach((t) => check(`empty state: ${t}`, full.includes(t)));
check('each empty state names where data would come from', (full.match(/Source: /g) || []).length === 3 && (empty.match(/Source: /g) || []).length === 4);
check('brain card is an honest placeholder', /The Brain graph is not built yet\./.test(full));
check('no sample content from the prototype', !/Kabala|Makama|Mania|Shalom|Metricool|\$18\.40|PASS 0\.8|Jev: not run|Hillside|Scout/.test(full));
check('no invented dollar amounts or percentages', !/\$\d|\d\s?%/.test(full));

// 6. Desks come from the registry; no invented status.
const deskRows = (full.match(/data-go="desks\//g) || []).length;
check('six desk rows', deskRows === 6);
check('desk status is not invented', (full.match(/Status not recorded yet/g) || []).length === 6);
check('desk rows deep-link to the desk', /data-go="desks\/lavaall-ceo"/.test(full) && /data-go="desks\/researchy"/.test(full));

// 7. Greeting: no guessed name.
check('greeting has no name', /<h1>Good evening<\/h1>/.test(full));

// 8. Public copy rules (FR-026 and brief section 6) across everything /os ships.
const shipped = ['api/os/_client/home.js', 'api/os/_client/core.js', 'api/os/_client/os.css', 'api/os/_page.js', 'api/ops/_os_data.js']
  .map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
check('no "free trial" wording', !/free[\s-]*trial/i.test(shipped));
check('no Starlink or Guinea mentions', !/starlink|guinea/i.test(shipped));
check('no emoji or sparkles', !/[\u{1F300}-\u{1FAFF}\u{2728}\u{2B50}]/u.test(shipped));
check('no lorem ipsum', !/lorem ipsum/i.test(shipped));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
