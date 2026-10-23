// LAVAALL OS AI Council, Spend and Settings: stored records only, nothing estimated, nothing invented.
// Loads the real client files in a sandbox. No DOM library, no network, no model calls.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const osData = require(path.join(root, 'api/ops/_os_data.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function loadOS() {
  const sandbox = {
    window: {},
    document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } },
    location: { hash: '' }, setTimeout: () => 0, setInterval: () => 0, Intl,
  };
  vm.createContext(sandbox);
  ['core.js', 'home.js', 'council.js', 'spend.js', 'settings.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  return sandbox.window.OS;
}
const OS = loadOS();

const NOW = Date.UTC(2026, 9, 22, 23, 0, 0); // 22 Oct 2026, 6 PM in Chicago
function build(store, env) { OS.data = osData.buildOsData({ store, health: null }, { env: env || {}, now: NOW, pack: null }); return OS.data; }
const html = (id, data, sub) => OS.views[id].render({ id, sub: sub || '', data });
const DASH = '—';
const tileValues = (h) => (h.match(/<b class="num">([^<]*)<\/b>/g) || []).map((m) => m.replace(/<[^>]+>/g, ''));

// ================= adapter: council =================
check('no council records -> null', osData.councilFrom({}) === null && osData.councilFrom(null) === null && osData.councilFrom({ council: 'x' }) === null);
const rec = (o) => Object.assign({ id: 'r', title: 'Run', date: 1 }, o);
const c0 = osData.councilFrom({ council: [
  rec({ id: 'a', title: 'Alpha', level: 'L4', date: 3, status: 'waiting_l3', jev: 0.9, drafter: { name: 'D', role: 'builder' }, reviewer: { name: 'R' },
    rounds: [{ n: 2, draft: 'two', review: '' }, { n: 1, draft: 'one', review: 'r1' }, { n: 1, draft: 'dup', review: '' }, { n: 0, draft: 'bad' }, { n: 3, draft: '', review: '' }] }),
  rec({ id: 'b', title: 'Beta', level: 'L9', date: 5, status: 'banana', jev: 1.4, maxRounds: 99 }),
  rec({ id: 'c', title: '   ' }),
] });
check('council: rows without a title are dropped, newest first', c0.length === 2 && c0[0].id === 'b');
check('council: rounds sorted, deduplicated, empty and invalid ones dropped', c0[1].rounds.map((r) => r.n).join() === '1,2' && c0[1].rounds[0].draft === 'one');
check('council: current round is the highest stored round', c0[1].round === 2 && c0[0].round === 0);
check('council: max rounds defaults to 3, out-of-range falls back', c0[1].maxRounds === 3 && c0[0].maxRounds === 3);
check('council: invalid level, status and Jev are dropped, never clamped', c0[0].level === '' && c0[0].status === '' && c0[0].jev === null && c0[1].level === 'L4' && c0[1].jev === 0.9);
check('council: missing people become empty names', c0[0].drafter.name === '' && c0[1].reviewer.role === '');

// ================= adapter: spend =================
check('no spend records -> null everywhere', osData.spendFrom({}) === null && build({}).spendMonth === null && build({}).kpis.aiSpendMonth === null);
const spendStore = { spend: [
  { id: '1', date: '2026-10-02T15:00:00Z', amount: 0.1, provider: 'A' },
  { id: '2', date: '2026-10-02T16:00:00Z', amount: 0.2, provider: 'A' },
  { id: '3', date: '2026-10-20T15:00:00Z', amount: 1.5, provider: 'B', note: 'n' },
  { id: '4', date: '2026-09-30T15:00:00Z', amount: 9 },
  { id: '5', date: '2026-10-21T15:00:00Z', amount: 5, currency: 'EUR' },
  { id: '6', date: '2026-10-25T15:00:00Z', amount: 4 },
  { id: '7', date: 'not a date', amount: 1 },
  { id: '8', date: '2026-10-05T00:00:00Z', amount: -1 },
  { id: '9', date: '2026-10-05T00:00:00Z', amount: '3' },
  { id: '10', date: '2026-11-01T06:30:00Z', amount: 2 },
] };
const sd = build(spendStore);
check('spend: only valid USD records in the current Chicago month, up to today', sd.spendMonth.count === 3 && sd.spendMonth.totalCents === 180);
check('spend: 0.1 + 0.2 is exactly 30 cents (no float noise)', sd.spendMonth.series[1].cumulativeCents === 30 && sd.spendMonth.entries.length === 3);
check('spend: other-currency, future, past-month, bad-date, negative and string amounts are excluded', !sd.spendMonth.entries.some((e) => ['4', '5', '6', '7', '8', '9', '10'].includes(e.id)));
check('spend: amounts that misround in floating point still land on exact cents', (() => {
  const r = osData.spendFrom({ spend: [{ id: 'a', date: '2026-10-03T12:00:00Z', amount: 0.29 }, { id: 'b', date: '2026-10-03T13:00:00Z', amount: 1.15 }, { id: 'c', date: '2026-10-03T14:00:00Z', amount: 4.35 }] });
  return r.map((x) => x.cents).sort((x, y) => x - y).join() === '29,115,435' && Number.isInteger(r[0].cents);
})());
check('spend: a total of misrounding amounts is an exact integer', (() => {
  const d = osData.buildOsData({ store: { spend: [{ id: 'a', date: '2026-10-03T12:00:00Z', amount: 0.29 }, { id: 'b', date: '2026-10-03T13:00:00Z', amount: 1.15 }] } }, { env: {}, now: NOW, pack: null });
  return d.spendMonth.totalCents === 144 && Number.isInteger(d.spendMonth.series[2].cumulativeCents) && d.kpis.aiSpendMonth === 1.44;
})());
check('spend: KPI is the month total', sd.kpis.aiSpendMonth === 1.8);
check('spend: series runs day 1 to today and is cumulative', sd.spendMonth.series.length === 22 && sd.spendMonth.series.every((p, i, a) => i === 0 || p.cumulativeCents >= a[i - 1].cumulativeCents));
check('spend: month length and today are Chicago-based', sd.spendMonth.daysInMonth === 31 && sd.spendMonth.today === 22 && sd.spendMonth.month === 10);
check('spend: 1 Nov 06:30 UTC is still 31 Oct in Chicago, and past "today" so excluded', !sd.spendMonth.entries.some((e) => e.id === '10'));
check('spend: providers are grouped in cents', sd.spendMonth.providers.map((p) => `${p.name}:${p.cents}`).join() === 'A:30,B:150');
check('spend: records in earlier months only -> a real zero, not a dash', (() => { const d = build({ spend: [{ id: 'z', date: '2026-09-30T15:00:00Z', amount: 9 }] }); return d.spendMonth.totalCents === 0 && d.kpis.aiSpendMonth === 0 && d.spendMonth.last === null; })());
check('sources flip live with real records', sd.sources.spend.live === true && build({}).sources.spend.live === false && build({ council: [rec({})] }).sources.council.live === true);

// ================= views: council =================
const lineDiff = OS.lineDiff;
const kinds = (a, b) => lineDiff(a, b).map((l) => l.t[0]).join('');
check('diff: identical text has no changes', kinds('a\nb', 'a\nb') === 'ss');
check('diff: an added line', kinds('a\nb', 'a\nx\nb') === 'sas');
check('diff: a removed line', kinds('a\nx\nb', 'a\nb') === 'sds');
check('diff: a replaced line is a delete then an add', kinds('a\nold\nc', 'a\nnew\nc') === 'sdas');
check('diff: from empty and to empty', kinds('', 'x') === 'da' || kinds('', 'x') === 'ad');
check('diff: round trip rebuilds both sides', (() => { const a = 'one\ntwo\nthree\nfour', b = 'one\n2\nthree\nfour\nfive'; const d = lineDiff(a, b); return d.filter((l) => l.t !== 'add').map((l) => l.s).join('\n') === a && d.filter((l) => l.t !== 'del').map((l) => l.s).join('\n') === b; })());

check('council: no records -> empty state naming the source', (() => { const h = html('council', build({})); return /No council records yet\./.test(h) && /Source: stored council records/.test(h) && !/<table/.test(h); })());
const cd = build({ council: [
  { id: 'run-1', title: 'First <b>run</b>', desk: 'sales', level: 'L3', date: 20, status: 'waiting_l3', jev: 0.82, drafter: { name: 'Dee', role: 'builder' }, reviewer: { name: 'Rae', role: 'reviewer' },
    rounds: [{ n: 1, draft: 'Hello\nOld line\nEnd', review: 'Fix the old line.' }, { n: 2, draft: 'Hello\nNew line\nEnd\nExtra', review: 'Approve.' }] },
  { id: 'run-2', title: 'Second run', desk: 'growth', level: 'L4', date: 10, status: 'approved', jev: 0.5, rounds: [{ n: 1, draft: 'only draft' }] },
  { id: 'run-3', title: 'Third run', date: 5, rounds: [] },
] });
const ch = html('council', cd);
check('council: one lane per role, Claude builds, Codex reviews (old drafter/reviewer rows map to them)', /<b>Claude<\/b>/.test(ch) && /<b>Codex<\/b>/.test(ch) && /cmsg lane-builder/.test(ch) && /cmsg lane-reviewer/.test(ch) && !/<dt>Drafter<\/dt>/.test(ch));
check('council: round number is "n of 3"', /<dt>Round<\/dt><dd class="num">2 of 3<\/dd>/.test(ch));
check('council: round 2 shows only the changed lines against round 1', /<div class="d">- Old line<\/div>/.test(ch) && /<div class="a">\+ New line<\/div>/.test(ch) && /<div class="a">\+ Extra<\/div>/.test(ch) && !/>- Hello</.test(ch));
check('council: the diff holds exactly the changed lines (one removed, two added)', (ch.match(/<div class="d">/g) || []).length === 1 && (ch.match(/<div class="a">/g) || []).length === 2 && !/<div class="[da]">[-+] (Hello|End)<\/div>/.test(ch));
check('council: round 1 shows the draft as written, with no diff', /ROUND|Round 1/.test(ch) && /<div class="diff plain">Hello\nOld line\nEnd<\/div>/.test(ch));
check('council: the full draft stays available behind a toggle', /<details class="full">/.test(ch));
check('council: Jev score is shown with its PASS pill and bar', /0\.82/.test(ch) && /PASS 0\.82/.test(ch) && /class="bar"/.test(ch));
check('council: waiting state names the level', /Waiting for L3 OK/.test(ch) && /class="typing"/.test(ch));
check('council: a waiting L4 run says L4', /Waiting for L4 OK/.test(html('council', build({ council: [{ id: 'q', title: 'q', level: 'L4', status: 'waiting_l3', rounds: [] }] }))));
check('council: an approved run says Approved, not waiting', (() => { const h = html('council', cd, 'run-2'); return /<div class="bd"><div>Approved<\/div><\/div>/.test(h) && !/Waiting for/.test(h); })());
check('council: a run with no score says "Jev: not run"', /Jev: not run/.test(html('council', cd, 'run-3')));
check('council: a run with no rounds says so', /No rounds are stored for this run\./.test(html('council', cd, 'run-3')));
check('council: a run with no gate status says so', /No gate status is stored for this run\./.test(html('council', cd, 'run-3')));
check('council: deep link selects the run, unknown id falls back to the newest', /Run · Second run/.test(html('council', cd, 'run-2')) && /Run · First/.test(html('council', cd, 'nope')));
check('council: history lists every run with a deep link', (ch.match(/<tr class="row/g) || []).length === 3 && /data-go="council\/run-2"/.test(ch));
check('council: titles are escaped', !/<b>run<\/b>/.test(ch) && /First &lt;b&gt;run&lt;\/b&gt;/.test(ch));
check('council: read only, no buttons, forms or inputs', !/<button|<form|<input|<textarea/.test(ch) && !/Approve draft|Request changes|New run|Replay|Ask Osman/.test(ch));
check('council: no cost estimates or model settings', !/Cost estimate|Model settings|Spend cap|\$\d/.test(ch));

// ================= views: spend =================
const emptySpend = html('spend', build({}));
check('spend: no records -> every tile is a dash', tileValues(emptySpend).length === 4 && tileValues(emptySpend).every((v) => v === DASH));
check('spend: empty chart says "No spend records yet"', /No spend records yet/.test(emptySpend) && /aria-label="No spend records yet"/.test(emptySpend));
check('spend: empty chart prints no axis numbers', !/text-anchor="end"/.test(emptySpend) && !/\$\d/.test(emptySpend));
check('spend: empty state names the source', /Source: the spend feed; none has been received yet/.test(emptySpend));
const fullSpend = html('spend', sd);
check('spend: tiles show real values', tileValues(fullSpend)[0] === '$1.80' && tileValues(fullSpend)[1] === '3' && tileValues(fullSpend)[2] === '$1.50' && /20 Oct/.test(tileValues(fullSpend)[3]));
check('spend: chart has a gradient fill, a line and an end dot', /<linearGradient id="spend-grad"/.test(fullSpend) && /fill="url\(#spend-grad\)"/.test(fullSpend) && (fullSpend.match(/<circle /g) || []).length === 2);
check('spend: chart is described for screen readers', /aria-label="Cumulative spend in October 2026: \$1\.80 by day 22"/.test(fullSpend));
check('spend: axis tops out at a round figure above the total', /\$2\.00/.test(fullSpend) && !/\$1\.80<\/text>/.test(fullSpend));
check('spend: provider breakdown and entries table', /By provider/.test(fullSpend) && /\$0\.30/.test(fullSpend) && /\$1\.50/.test(fullSpend) && /Entries this month/.test(fullSpend));
check('spend: no budget, forecast or projection tiles', !/Budget left|Forecast|Projected|On track/i.test(fullSpend.replace('Nothing here is estimated or projected.', '')));
check('spend: provider and note text is escaped', !/<script/.test(html('spend', build({ spend: [{ id: 'x', date: '2026-10-05T12:00:00Z', amount: 1, provider: '<script>x</script>', note: '<b>n</b>' }] }))));

// ================= views: settings =================
const secretEnv = { KV_REST_API_URL: 'https://secret-host.example', KV_REST_API_TOKEN: 'TOKEN-VALUE-1', OPS_GMAIL_CLIENT_SECRET: 'MAIL-VALUE-2', VERCEL: '1' };
const sv = html('settings', build({}, secretEnv));
check('settings: lists GitHub, Vercel, Mail and the store', ['GitHub', 'Vercel', 'Mail', 'Store (KV)'].every((n) => sv.includes(`<div>${n}</div>`)));
check('settings: env var names are shown', /<code class="tag mono">KV_REST_API_URL<\/code>/.test(sv) && /VERCEL_ENV/.test(sv));
check('settings: values and secrets are never shown', !/TOKEN-VALUE-1|MAIL-VALUE-2|secret-host/.test(sv));
check('settings: GitHub is unknown, not connected', /GitHub<\/div><small class="dim">No environment variable[\s\S]*?pill ">unknown/.test(sv) && !/Connected/i.test(sv));
check('settings: configured and not configured are distinguished', /pill pass">configured/.test(sv) && /pill flag">not configured/.test(html('settings', build({}, {}))));
check('settings: read only', !/<button|<form|<input/.test(sv));

// ================= Home picks up real council and spend =================
const home = html('home', Object.assign(build({ council: [{ id: 'r1', title: 'Latest run', level: 'L3', status: 'waiting_l3', jev: 0.8, date: 9, drafter: { name: 'Dee' }, reviewer: { name: 'Rae' }, rounds: [{ n: 2, draft: 'x' }] }], spend: spendStore.spend })));
check('home: spend KPI shows the real month total', /AI spend this month<\/span><b class="num">\$1\.80<\/b>/.test(home) && /from spend records/.test(home));
check('home: council card shows the latest run', /Latest run/.test(home) && /Claude drafted/.test(home) && !/Codex reviewed/.test(home) && /waiting for L3 OK/.test(home) && /round 2 of 3/.test(home) && /PASS 0\.80/.test(home));
check('home: without records the spend KPI is a dash', (() => { const h = html('home', build({})); return /AI spend this month<\/span><b class="num">—<\/b>/.test(h) && /No council records yet\./.test(h); })());

// ================= source hygiene =================
const files = ['council.js', 'spend.js', 'settings.js'].map((f) => fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'));
const code = files.join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('no network, no eval, no model SDK names', !/fetch\(|XMLHttpRequest|sendBeacon|\beval\s*\(|new Function\(|anthropic|openai|xai/i.test(code));
check('banned copy and emoji absent', !/free[\s-]*trial|starlink|guinea|lorem ipsum/i.test(code) && !/[\u{1F300}-\u{1FAFF}\u{2728}]/u.test(code));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
