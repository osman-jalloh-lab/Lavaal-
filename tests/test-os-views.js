// LAVAALL OS views: Desks, Decisions + Jev, Outreach, Routines, Notes.
// Loads the real core.js helpers and view files in a sandbox. Read only, nothing invented.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const osData = require(path.join(root, 'api/ops/_os_data.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function loadOS() {
  const win = {};
  const sandbox = {
    window: win,
    document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } },
    location: { hash: '' },
    setTimeout: () => 0,
    setInterval: () => 0,
    Intl,
  };
  vm.createContext(sandbox);
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f });
  run('core.js');
  ['home.js', 'desks.js', 'decisions.js', 'outreach.js', 'routines.js', 'notes.js'].forEach(run);
  return win.OS;
}

const OS = loadOS();
const drawers = [];
OS.openDrawer = (html) => { drawers.push(html); };

function build(store, health) {
  const data = osData.buildOsData({ store, health: health || null }, { env: {}, pack: null });
  OS.data = data;
  return data;
}
function buildWith(pack, store, health) {
  const data = osData.buildOsData({ store: store === undefined ? {} : store, health: health || null }, { env: {}, pack });
  OS.data = data;
  return data;
}
const html = (id, data, sub) => OS.views[id].render({ id, sub: sub || '', data });
function mount(id, data, sub) {
  drawers.length = 0;
  const rootStub = { addEventListener() {}, querySelector: () => null };
  OS.views[id].mount && OS.views[id].mount(rootStub, { id, sub: sub || '', data });
  return drawers[0] || '';
}

const DASH = '—';

// ---- core helpers (the shipped ones) -----------------------------------------
check('Jev 0.75 is PASS', /pass/.test(OS.jev(0.75)) && /PASS 0\.75/.test(OS.jev(0.75)));
check('Jev just below 0.75 is FLAG', /flag/.test(OS.jev(0.7499)) && /FLAG 0\.75/.test(OS.jev(0.7499)));
check('Jev 0 is a real FLAG, not "not run"', /FLAG 0\.00/.test(OS.jev(0)));
check('missing Jev says "Jev: not run"', /Jev: not run/.test(OS.jev(null)) && /Jev: not run/.test(OS.jev(undefined)) && /Jev: not run/.test(OS.jev(NaN)));
check('level badge falls back to a dash', OS.level('').includes(DASH) && OS.level('L3').includes('L3'));

// ---- Decisions + Jev ---------------------------------------------------------
const noLog = build({});
const dNull = html('decisions', noLog);
check('decisions: no log -> empty state with source', /No decision log yet\./.test(dNull) && /Source: /.test(dNull) && !/<table/.test(dNull));
check('decisions: the source line says where the log comes from', /Source: decisions\.json in the LAVAALL OS data pack/.test(dNull));
const dEmpty = html('decisions', build({ decisions: [] }));
check('decisions: empty log -> says so', /The decision log is empty\./.test(dEmpty) && !/<table/.test(dEmpty));

const log = build({ decisions: [
  { id: 'a', title: 'Alpha', level: 'L3', status: 'Open', desk: 'sales', jev: 0.82, date: '2026-10-21T15:00:00Z', text: 'Full alpha text', source: 'src a' },
  { id: 'b', title: 'Beta', level: 'L0', status: 'Closed', desk: 'Growth', jev: 0.4, date: '2026-10-20T15:00:00Z' },
  { id: 'c', title: '<img src=x onerror=alert(1)>', level: 'L4', status: 'Open', date: '2026-10-19T15:00:00Z', text: '<script>alert(1)</script>' },
  { id: 'd', title: 'Delta', level: 'L9', status: 'Parked', jev: 1.5, date: 1 },
] });
const dTable = html('decisions', log);
check('decisions: one card per decision', (dTable.match(/<article class="dcard/g) || []).length === 4);
check('decisions: all three Jev states render', /PASS 0\.82/.test(dTable) && /FLAG 0\.40/.test(dTable) && /Jev: not run/.test(dTable));
check('decisions: out-of-range score becomes "not run", never clamped', !/1\.50|PASS 1\.00/.test(dTable));
check('decisions: invalid level shows a dash', (dTable.match(/class="lv num">—/g) || []).length === 1);
check('decisions: levels L0 to L4 shown', /L0/.test(dTable) && /L3/.test(dTable) && /L4/.test(dTable));
check('decisions: filter chips with counts', /All <span class="num">4<\/span>/.test(dTable) && /Open <span class="num">2<\/span>/.test(dTable) && /Closed <span class="num">1<\/span>/.test(dTable));
check('decisions: status filters are All / Open / Closed', (dTable.match(/data-f="status"/g) || []).length === 3);
check('decisions: desk and level filters sit next to them', /data-f="desk" data-v="All"/.test(dTable) && /data-f="level" data-v="L3"/.test(dTable) && /data-f="level" data-v="L4"/.test(dTable) && !/data-f="level" data-v="L9"/.test(dTable));
check('decisions: titles are escaped', !/<img src=x/.test(dTable) && /&lt;img src=x/.test(dTable));
check('decisions: groups run Waiting on you, Open, Closed, Other; waiting is oldest first', dTable.indexOf('<h2>Waiting on you') < dTable.indexOf('<h2>Closed ') && dTable.indexOf('<h2>Closed ') < dTable.indexOf('<h2>Other ') && dTable.indexOf('&lt;img') < dTable.indexOf('Alpha') && dTable.indexOf('Alpha') < dTable.indexOf('Beta') && dTable.indexOf('Beta') < dTable.indexOf('Delta'));
check('decisions: no Open group when every open decision is L3/L4', !/<h2>Open </.test(dTable));
check('decisions: status pills are amber for Open, muted green for Closed', /pill open">Open/.test(dTable) && /pill closed">Closed/.test(dTable));
check('decisions: L3 and L4 chips are orange, L0 is not', /lv num hi">L3/.test(dTable) && /lv num hi">L4/.test(dTable) && /lv num">L0/.test(dTable));
check('decisions: desk shows its short name, not the id', /<\/i>Sales<\/span>/.test(dTable) && /<\/i>Growth<\/span>/.test(dTable) && !/>sales</.test(dTable));
check('decisions: age reads "N days open" for open items', /\d+ days open/.test(dTable));
const dDrawer = mount('decisions', log, 'a');
check('decisions: deep link opens a drawer', /Full alpha text/.test(dDrawer) && /src a/.test(dDrawer));
check('decisions: drawer shows the Jev score and PASS line', /0\.82/.test(dDrawer) && /0\.75 = PASS line/.test(dDrawer));
check('decisions: drawer for an unscored decision says not run', /Jev: not run/.test(mount('decisions', log, 'c')));
check('decisions: drawer escapes full text', !/<script>alert/.test(mount('decisions', log, 'c')));
check('decisions: drawer has no approve or park actions', !/Approve|Park/.test(dDrawer));
check('decisions: unknown deep link opens nothing', mount('decisions', log, 'nope') === '');

// ---- Desks -------------------------------------------------------------------
const desksNoLog = build({});
const dk = html('desks', desksNoLog);
check('desks: six cards from the registry when there is no pack', (dk.match(/class="card deskcard"/g) || []).length === 6);
check('desks: no invented desk status', (dk.match(/Status not recorded yet/g) || []).length === 6);
check('desks: no skill or routine counts without a pack', !/class="dc-m/.test(dk));
const dkDrawer = mount('desks', desksNoLog, 'sales');
check('desks: deep link opens the sales drawer', /LAVAALL Sales/.test(dkDrawer));
check('desks: drawer has now, rules, skills, routines, decisions', ['Now', 'Rules', 'Skills', 'Routines', 'Recent decisions'].every((s) => dkDrawer.includes(`<div class="sect">${s}</div>`)));
check('desks: nothing recorded -> empty states, not samples', /No rules are recorded for this desk\./.test(dkDrawer) && /No skills are recorded for this desk\./.test(dkDrawer) && /No "now" line is recorded for this desk\./.test(dkDrawer));
check('desks: the old SOUL-deferral wording is gone', !/SOUL/.test(dk + dkDrawer));
check('desks: no FR ids invented', !/FR-\d{3}/.test(dkDrawer));
check('desks: Talk is a plain link into /ops', /href="\/ops\/chat\/sales"/.test(dkDrawer));
check('desks: unknown desk opens nothing', mount('desks', desksNoLog, 'zzz') === '');
const desksWithLog = build({ decisions: [
  { id: 'a', title: 'Sales thing', level: 'L2', status: 'Open', desk: 'Sales', date: 5 },
  { id: 'b', title: 'Other', level: 'L2', status: 'Open', desk: 'technical', date: 6 },
] });
check('desks: decisions match by desk id or short name, any case', /Sales thing/.test(mount('desks', desksWithLog, 'sales')) && !/Other/.test(mount('desks', desksWithLog, 'sales')));

const DPACK = {
  desks: {
    desks: [{ id: 'sales', now: 'Quoting this week', rules: ['I do not close a price.', 'I do not send anything.'], skills: ['quote-pack', 'plain-rephrase'] }],
    extraDesks: [{ id: 'scout', name: 'Scout', short: 'Scout', now: null, rules: ['Scans and reports only.'], skills: [] }],
  },
  skills: [{ id: 'quote-pack', name: 'quote-pack', whenToUse: 'When a quote is needed', desks: ['sales'] }],
  routines: [
    { id: 'r1', name: 'Sales sync', schedule: 'Mon 9 AM CT', owner: 'sales', status: 'active' },
    { id: 'r2', name: 'Scout scan', schedule: 'Daily 8 AM CT', owner: 'scout', status: 'active' },
  ],
};
const dp = buildWith(DPACK);
const dpk = html('desks', dp);
check('desks: Scout is a seventh card from the pack', (dpk.match(/class="card deskcard"/g) || []).length === 7 && /data-go="desks\/scout"/.test(dpk));
check('desks: cards show real skill and routine counts', /2 skills \u00b7 1 routine</.test(dpk) && /0 skills \u00b7 1 routine</.test(dpk));
const growthCard = dpk.split('class="card deskcard"').find((c) => /desks\/growth/.test(c)) || '';
check('desks: a desk the pack has no row for shows its routine count but no skill count', /0 routines</.test(growthCard) && !/skill/.test(growthCard));
const sd = mount('desks', dp, 'sales');
check('desks: drawer shows the now line, rules, skills with their purpose, and routines with their schedule', /Quoting this week/.test(sd) && /I do not close a price\./.test(sd) && /title="When a quote is needed">quote-pack/.test(sd) && /Sales sync/.test(sd) && /Mon 9 AM CT/.test(sd));
const sc = mount('desks', dp, 'scout');
check('desks: Scout has rules, no skills, one routine and no Talk link', /Scans and reports only\./.test(sc) && /No skills are recorded for this desk\./.test(sc) && /Scout scan/.test(sc) && !/Talk in \/ops/.test(sc));
check('desks: a desk with no pack row still gets its empty states', /No rules are recorded for this desk\./.test(mount('desks', dp, 'growth')) && /No routines are linked to this desk\./.test(mount('desks', dp, 'growth')));

// ---- Outreach ----------------------------------------------------------------
const oNull = html('outreach', build({}));
check('outreach: empty state naming the leads routine', /No outreach counts have been received yet\./.test(oNull) && /Sierra Leone leads routine/.test(oNull));
check('outreach: five stages, in order', ['Drafted', 'Approved', 'Sent', 'Replied', 'Bounced'].map((s) => oNull.indexOf(`data-stage="${s}"`)).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1])));
check('outreach: no Follow-up column', !/Follow-up/.test(oNull));
check('outreach: counts are dashes when there is no data', (oNull.match(/data-count>—</g) || []).length === 5 && !/class="kc"/.test(oNull));
const leadData = build({});
leadData.outreach = [
  { id: '1', name: 'Lead A', kind: 'Hotel', place: 'X', stage: 'drafted', note: 'n' },
  { id: '2', name: '<b>Lead B</b>', stage: 'Bounced', note: 'bad address' },
  { id: '3', name: 'Lead C', stage: 'Nonsense' },
];
const oFull = html('outreach', leadData);
check('outreach: cards land in their stage, case-insensitive', /data-stage="Drafted"[\s\S]*?Lead A[\s\S]*?data-stage="Approved"/.test(oFull));
check('outreach: unknown stage is not shown', !/Lead C/.test(oFull));
check('outreach: lead names are escaped', !/<b>Lead B/.test(oFull) && /&lt;b&gt;Lead B/.test(oFull));
check('outreach: bounced note is styled as an error', /pill bad">bad address/.test(oFull));
check('outreach: nothing can be sent from here', !/<form|<a href|Send|New draft run|Leads sheet/.test(oFull));

// ---- Routines ----------------------------------------------------------------
check('routines: no pack -> empty state', /Routines could not be loaded\./.test(html('routines', build({}))));
check('routines: an empty list says so', /No routines are listed\./.test(html('routines', buildWith({ routines: [] }))));
const health = { ok: true, empty: false, checkedLabel: 'x', routines: [
  { slug: 'r-ok', status: 'OK', tone: 'ok', reason: 'ran fine', lastRunAt: '2026-10-09T08:53:00Z', lastRunLabel: 'Oct 9, 3:53 AM CT' },
  { slug: 'r-bad', status: 'FAILED', tone: 'bad', reason: 'boom' },
  { slug: 'r-warn', status: 'PARTIAL', tone: 'warn', reason: 'half' },
] };
const RPACK = { routines: [
  { id: 'r-ok', name: 'Routine OK', schedule: 'Weekdays 7:30 AM CT', owner: 'lavaall-ceo', status: 'active', lastRunAt: 1792790000000, lastRunStatus: 'helper_failed' },
  { id: 'r-bad', name: 'Routine Bad', schedule: 'Fri 9:23 AM CT', owner: 'sales', status: 'active' },
  { id: 'r-warn', name: 'Routine Warn', schedule: 'Mon 8:22 AM CT', owner: 'researchy', status: 'paused' },
  { id: 'r-none', name: 'Routine <None>', schedule: '—', owner: '', status: '' },
] };
const rt = html('routines', buildWith(RPACK, {}, health));
check('routines: six columns', ['Routine', 'Desk', 'Schedule (CT)', 'Last run', 'Health', 'Status'].every((h) => rt.includes(`>${h}</th>`)));
check('routines: the schedule also sits under the name, for phones', (rt.match(/class="sub m-only">/g) || []).length === 4 && /class="sub m-only">Weekdays 7:30 AM CT</.test(rt));
check('routines: schedule comes from the pack', /Weekdays 7:30 AM CT/.test(rt) && /Fri 9:23 AM CT/.test(rt) && /Mon 8:22 AM CT/.test(rt));
check('routines: the desk is the owner, linked to its drawer', /data-go="desks\/lavaall-ceo">CEO</.test(rt) && /data-go="desks\/sales">Sales</.test(rt) && /data-go="desks\/researchy">Researchy</.test(rt));
check('routines: status shows active and paused as pills', /pill pass">active/.test(rt) && /pill flag">paused/.test(rt));
check('routines: a routine with no owner or status shows dashes', /Routine &lt;None&gt;[\s\S]*?<span class="dim">—<\/span>/.test(rt));
check('routines: health tones map to pill states', /pill pass" title="ran fine">OK/.test(rt) && /pill bad" title="boom">FAILED/.test(rt) && /pill flag" title="half">PARTIAL/.test(rt));
check('routines: last run is from live health only', /Oct 9, 3:53 AM CT/.test(rt) && (rt.match(/class="dim num rt-last">—<\/td>/g) || []).length === 3);
check("routines: the pack's stale last-run status is never shown", !/helper failed|helper_failed/.test(rt));
check('routines: footnote with a health record', /Schedule, desk and status are from the data pack\./.test(rt) && /Last run and health are from the routine-health record\./.test(rt));
check('routines: footnote without a health record', /there is none yet\./.test(html('routines', buildWith({ routines: [{ id: 'a', name: 'A' }] }))));
check('routines: view only, no toggles or run buttons', !/<button|class="sw|Run now|Pause/.test(rt));
check('routines: names are escaped', !/<None>/.test(rt));

// ---- Notes -------------------------------------------------------------------
check('notes: store down -> empty state', /Notes could not be loaded\./.test(html('notes', build(null))));
check('notes: none -> says so', /No notes yet\./.test(html('notes', build({ notes: [] }))));
const nd = build({ notes: [
  { id: 'n1', title: 'Older', body: 'old body', source: 'chat', updatedAt: 10 },
  { id: 'n2', title: 'Newer', body: '<b>bold?</b>\nline two', source: '', updatedAt: 20 },
  { id: 'n3', title: 'Deleted', body: 'gone', deletedAt: 5, updatedAt: 30 },
  { id: 'n4', title: 'Empty body', body: '', updatedAt: 5 },
] });
const nv = html('notes', nd);
check('notes: deleted notes are hidden', !/Deleted/.test(nv));
check('notes: newest is selected by default', /<h2>Newer<\/h2>/.test(nv));
check('notes: deep link selects a note', /<h2>Older<\/h2>/.test(html('notes', nd, 'n1')) && /Source: chat/.test(html('notes', nd, 'n1')));
check('notes: unknown deep link falls back to the newest', /<h2>Newer<\/h2>/.test(html('notes', nd, 'zzz')));
check('notes: body is plain text, never HTML', !/<b>bold\?<\/b>/.test(nv) && /&lt;b&gt;bold\?&lt;\/b&gt;/.test(nv));
check('notes: a note without a body says so', /This note has no body\./.test(html('notes', nd, 'n4')));
check('notes: list marks the open note', /class="li on"[^>]*data-go="notes\/n2"/.test(nv));

// ---- Home picks up a real decision log -----------------------------------------
const homeLog = html('home', log);
check('home: Open decisions KPI counts open rows', /<span>Open decisions<\/span><b class="num">2<\/b>/.test(homeLog));
check('home: recent decisions lists real rows with Jev pills', /Alpha/.test(homeLog) && /PASS 0\.82/.test(homeLog) && /Jev: not run/.test(homeLog));
check('home: recent decisions deep-link to the drawer', /data-go="decisions\/a"/.test(homeLog));
check('home: without a log the KPI stays a dash', /<span>Open decisions<\/span><b class="num">—<\/b>/.test(html('home', build({}))));

// ---- every view: read only, no emoji, no banned copy -------------------------
const all = ['desks', 'decisions', 'outreach', 'routines', 'notes'].map((id) => html(id, id === 'decisions' ? log : nd)).join('\n') + dkDrawer + dDrawer;
check('views contain no forms or inputs that could write (the only input is the Notes search box)', !/<form|<textarea/.test(all) && (all.match(/<input/g) || []).length === 1 && /<input class="q" id="notes-q" type="search"/.test(all));
const src = ['desks', 'decisions', 'outreach', 'routines', 'notes'].map((f) => fs.readFileSync(path.join(root, `api/os/_client/${f}.js`), 'utf8')).join('\n');
check('views make no network calls', !/fetch\(|XMLHttpRequest|sendBeacon|navigator\./.test(src));
check('views avoid banned copy and emoji', !/free[\s-]*trial|starlink|guinea|lorem ipsum/i.test(src) && !/[\u{1F300}-\u{1FAFF}\u{2728}]/u.test(src));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
