// LAVAALL OS live pages: the Day / Week calendar grid with a now line, the three-pane inbox, the End of day recap
// (agents' daily-recap feed plus Osman's own note) and launch countdowns from project groups with a go-live date.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const DAY = 86400000;
const now = Date.now();
function iso(ms) { return new Date(ms).toISOString(); }
function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function loadOS(data, stored) {
  const win = { innerWidth: 1280 };
  const json = JSON.stringify(Object.assign({ kpis: {}, sources: {}, harness: { groups: [], status: [] } }, data || {}));
  const storage = { v: stored || null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
  const sandbox = {
    window: win, localStorage: storage,
    document: { querySelector: (sel) => (sel === '#os-data' ? { textContent: json } : null), querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } },
    location: { hash: '' }, navigator: {}, setTimeout: () => 0, setInterval: () => 0, Intl,
  };
  vm.createContext(sandbox);
  ['core.js', 'home.js', 'google.js', 'inbox.js', 'saved.js', 'recap.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  return win.OS;
}

// ---- Calendar ----
{
  const OS = loadOS();
  OS.setGoogleStatus({ connected: true, email: 'support@lavaall.com' });
  const cur = { id: 'a', title: 'Standup <b>', start: iso(now - 10 * 60000), end: iso(now + 20 * 60000), allDay: false, link: 'https://www.google.com/calendar/event?eid=1' };
  const nxt = { id: 'b', title: 'Supplier call', start: iso(now + 60 * 60000), end: iso(now + 90 * 60000), allDay: false, link: 'javascript:alert(1)' };
  const all = { id: 'c', title: 'Launch week', start: dayKey(now), end: dayKey(now + DAY), allDay: true, link: '' };
  OS.setCalendarEvents([cur, nxt, all]);
  const nn = OS.calendarNowNext([cur, nxt, all], now);
  check('calendar: Now is the event in progress, Next the one after it', nn.now && nn.now.e.id === 'a' && nn.next && nn.next.e.id === 'b');
  const html = OS.calendarBody();
  check('calendar: the grid has seven day columns and a now line in today', (html.match(/class="cal-col/g) || []).length === 7 && (html.match(/data-nowline/g) || []).length === 1);
  check('calendar: Now and Next are shown above the grid', /nn-k live">Now/.test(html) && /Supplier call/.test(html) && /in 1h/.test(html));
  check('calendar: event text is escaped and only Google links are kept', !/Standup <b>/.test(html) && /Standup &lt;b&gt;/.test(html) && !/javascript:/.test(html) && /href="https:\/\/www\.google\.com\/calendar\//.test(html));
  check('calendar: the in-progress event is marked live and all-day events get their own row', /cal-ev live/.test(html) && /cal-adev">Launch week/.test(html));
  const home = OS.homeCalendarHtml([cur, nxt]);
  check('home calendar: shows Now / Next and a countdown to the next event', /nownext/.test(home) && /cal-soon">in 1h/.test(home));
  check('home calendar: connect prompt still shown when Google is not connected', /Connect Google to see your calendar here/.test(OS.homeCalendarHtml(null, null, false)));
  const calSrc = fs.readFileSync(path.join(root, 'api/os/_client/google.js'), 'utf8');
  check('calendar: asks the server for the visible range and refreshes on a timer', /\/ops\/os\/calendar\?from=' \+ r\.from \+ '&days=' \+ r\.days/.test(calSrc) && /setInterval/.test(calSrc) && /isConnected/.test(calSrc));
}

// ---- Calendar server range ----
{
  const g = require(path.join(root, 'api/ops/_os_google.js'));
  check('calendar server: the route doc names the from and days range', /\?from=<ms>&days=<1\.\.31>/.test(fs.readFileSync(path.join(root, 'api/ops/_os_google.js'), 'utf8')) && typeof g.handleOsGoogle === 'function');
}

// ---- Inbox ----
{
  const OS = loadOS();
  const PILES = [{ id: 'reply', label: 'Reply today' }, { id: 'sales', label: 'Sales and quotes' }, { id: 'other', label: 'Everything else' }];
  const items = [
    { id: 't1', from: '"Ada <x>" <ada@example.com>', subject: 'Quote for <laptops>', snippet: '<img src=x onerror=1>', unread: true, receivedAt: now - 3600000, pile: 'sales' },
    { id: 't2', from: 'Bob <bob@example.com>', subject: 'Hello', snippet: 'Hi there', unread: false, receivedAt: now - 2 * DAY, pile: 'reply' },
  ];
  const html = OS.inboxBody({ connected: true, piles: PILES, items });
  check('inbox: three panes (piles, messages, reading pane)', /class="mail-piles"/.test(html) && /class="mail-list card"/.test(html) && /class="card mail-pane"/.test(html));
  check('inbox: the newest message opens in the reading pane with a reply-draft button', /mail-rsubj">Quote for &lt;laptops&gt;/.test(html) && /data-reply="t1"/.test(html));
  check('inbox: mail is escaped, with avatars and a summary strip', !/<img src=x/.test(html) && /class="avatar t-/.test(html) && /<b class="num">1<\/b> unread/.test(html));
  check('inbox: a search box and the Gmail link remain', /id="mail-q"/.test(html) && /https:\/\/mail\.google\.com\/mail\/u\/0\/#inbox\/t1/.test(html));
  const src = fs.readFileSync(path.join(root, 'api/os/_client/inbox.js'), 'utf8');
  check('inbox: still read-only (one GET, no POST, no send)', (src.match(/window\.fetch\(/g) || []).length === 1 && !/method: 'POST'/.test(src) && !/messages\/send/.test(src));
}

// ---- Launches and End of day ----
{
  const launch = dayKey(now + 5 * DAY);
  const data = {
    harness: { status: [], groups: [{ id: 'lavaall', label: 'LAVAALL' }, { id: 'fourth-line', label: 'Fourth line', launch, goal: 'Go live in production' }] },
    recap: { receivedAt: 1, entries: [
      { id: 'g1', agent: 'grok', project: 'fourth-line', date: dayKey(now), happened: 'Checked <script>x</script> the plan', built: 'Draft', blocked: 'Needs a logo', next: '', updatedAt: now - 60000 },
      { id: 'c1', agent: 'claude', project: 'lavaall-os', date: dayKey(now - DAY), happened: 'Built the calendar', built: '', blocked: '', next: 'Merge', updatedAt: now - DAY },
    ] },
    sources: { recap: { live: true, from: 'the daily-recap feed' } },
  };
  const OS = loadOS(data);
  const l = OS.launches(now);
  check('launches: a project group with a go-live date shows a countdown', l.length === 1 && l[0].days === 5 && /5 days/.test(OS.launchesHtml(now)) && /Go live in production/.test(OS.launchesHtml(now)));
  const body = OS.recapBody(now);
  check('end of day: grouped Today then Yesterday, with agent names', body.indexOf('Today') < body.indexOf('Yesterday') && /<b>Grok \(xAI\)<\/b>/.test(body) && /<b>Claude<\/b>/.test(body));
  check('end of day: blocked entries are flagged and text is escaped', /rc blocked/.test(body) && /1 blocked/.test(body) && !/<script>x/.test(body));
  const home = OS.recapHomeHtml(now);
  check('home end of day: today only, with blocked flagged', /Grok \(xAI\)/.test(home) && !/Built the calendar/.test(home) && /pill bad">blocked/.test(home));
  OS.setSavedState({ goals: [], memories: [{ id: 'm-aaaaaaaaaaaa', text: 'Good day, shipped the inbox.', tags: ['recap', 'lavaall'], createdAt: now - 1000 }, { id: 'm-bbbbbbbbbbbb', text: 'Not a recap', tags: [], createdAt: now }] });
  const withMine = OS.recapBody(now);
  check("end of day: Osman's own recap memories show as You", /<b>You<\/b>/.test(withMine) && /shipped the inbox/.test(withMine) && !/Not a recap/.test(withMine));
  check('End of day is a Today section, in the phone More sheet, and in the Jarvis pages', OS.sectionOf('recap').group === 'Today' && OS.mobile.MORE.includes('recap') && require(path.join(root, 'api/ops/_voice.js')).VIEWS.includes('recap'));
}
{
  const OS = loadOS({ harness: { status: [], groups: [{ id: 'fourth-line', label: 'Fourth line', launch: '2026-12-01' }] }, recap: { receivedAt: 1, entries: [{ id: 'g1', agent: 'grok', project: 'fourth-line', date: dayKey(now), happened: 'x', built: '', blocked: '', next: '', updatedAt: now }] } }, 'salonehire');
  check('end of day and launches follow the business switch', !/Grok \(xAI\)<\/b>/.test(OS.recapBody(now)) && /No recaps yet for SaloneHire/.test(OS.recapBody(now)) && OS.launches(now).length === 0);
}

// ---- Server: harness groups carry the go-live date ----
{
  const pack = require(path.join(root, 'tools/lavaall-ai/projects.json'));
  const withLaunch = pack.groups.filter((g) => g.launch);
  check('projects.json: one group has a 1 Dec 2026 go-live date', withLaunch.length === 1 && withLaunch[0].launch === '2026-12-01');
  const src = fs.readFileSync(path.join(root, 'api/ops/_os_data.js'), 'utf8');
  check('the OS data passes a validated launch date and goal per group', /launch: \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test/.test(src) && /goal: text\(g && g\.goal, 160\)/.test(src));
}

// ---- Shipped client never names the private business ----
{
  const banned = new RegExp('star' + 'link', 'i');
  const files = ['google.js', 'inbox.js', 'recap.js', 'home.js', 'core.js', 'saved.js'];
  check('shipped client code never names the business kept off the website', files.every((f) => !banned.test(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'))));
}

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
