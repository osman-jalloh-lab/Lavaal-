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
  const data = osData.buildOsData({ store, health: null }, { env: {}, pack: null });
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
['No morning brief has been received yet.', 'No council records yet.', 'No decision log yet.', 'No routine health has been received yet.'].forEach((t) => check(`empty state: ${t}`, full.includes(t)));
check('each empty state names where data would come from', (full.match(/Source: /g) || []).length === 6 && (empty.match(/Source: /g) || []).length === 7);
check('Waiting and Scout cards are empty states when their data is null', /No decision log yet\./.test(full) && /No notes yet\./.test(down) && /No Scout finds yet\./.test(empty));
check('Home has no Brain panel and no canvas (the Brain tab keeps the graph)', !/<canvas/.test(full) && !/bmini/.test(full) && !/data-go="brain"/.test(full) && !/>Brain</.test(full));
check('Today column has its four cards', /class="sect today-h">Today</.test(full) && ['Waiting on Osman', 'Routine health', 'Latest Scout finds', 'AI Council'].every((t) => full.includes('<h3>' + t + '</h3>')));
check('no sample content from the prototype', !/Kabala|Makama|Mania|Shalom|Metricool|\$18\.40|PASS 0\.8|Jev: not run|Hillside/.test(full));
check('no invented dollar amounts or percentages', !/\$\d|\d\s?%/.test(full));

// 5b. Today column with data: waiting list, routine failures, Scout finds.
(function () {
  const day = 86400000;
  const now = Date.now();
  const pack = {
    decisions: [
      { id: 'D-new', title: 'Newer L3', level: 'L3', status: 'Open', date: now - 2 * day },
      { id: 'D-old', title: 'Older L4', level: 'L4', status: 'Open', date: now - 12 * day },
      { id: 'D-l1', title: 'Small one', level: 'L1', status: 'Open', date: now - 30 * day },
      { id: 'D-done', title: 'Closed L3', level: 'L3', status: 'Closed', date: now - 40 * day },
    ],
    routines: [{ id: 'r1', name: 'Alpha run', schedule: '', owner: '', status: 'active' }, { id: 'r2', name: 'Beta run', schedule: '', owner: '', status: 'active' }],
  };
  const notes = [1, 2, 3, 4, 5, 6].map((i) => ({ id: 'n' + i, title: 'Find ' + i, type: 'scout-find', date: now - i * day, urgent: i === 1 }))
    .concat([{ id: 'x', title: 'Plain idea', type: 'idea', date: now }]);
  const { view, OS } = loadHome();
  OS.level = (l) => `<span class="lv">${l}</span>`;
  OS.jev = () => '';
  const health = { checkedLabel: 'now', routines: [{ slug: 'r1', status: 'ok', tone: 'ok', lastRunLabel: 'x' }, { slug: 'r2', status: 'failed', tone: 'bad', lastRunLabel: 'y' }] };
  const data = osData.buildOsData({ store: { notes }, health }, { env: {}, pack });
  OS.data = data;
  const html = view.render({ data, id: 'home', sub: '' });
  check('waiting card lists only open L3/L4, oldest first, with age and a link', html.indexOf('Older L4') > -1 && html.indexOf('Older L4') < html.indexOf('Newer L3') && !/Small one/.test(html.split('Waiting on Osman')[1].split('Latest Scout')[0].replace(/Recent decisions[\s\S]*/, '')) && /12 days open/.test(html) && /data-go="decisions\/D-old"/.test(html));
  check('routine health names the failed routine', /Failed: Beta run\./.test(html));
  check('Scout card shows the five newest scout-find notes only, with an urgent pill', (html.match(/data-go="notes\/n\d"/g) || []).length === 5 && !/Find 6/.test(html) && !/Plain idea/.test(html) && /<span class="pill bad">urgent<\/span>/.test(html));
})();

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
