// LAVAALL OS static data pack (api/os/_data, built 22 Oct 2026): integrity, loaders, Brain and views.
// Reads the real committed pack. No network, no KV, no model calls.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'api/os/_data');
const osData = require(path.join(root, 'api/ops/_os_data.js'));
const PACK = require(path.join(dataDir, 'index.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const FILES = ['decisions.json', 'routines.json', 'desks.json', 'skills.json', 'rules.json'];
const raw = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(dataDir, f), 'utf8')]));
const D = JSON.parse(raw['decisions.json']);
const RT = JSON.parse(raw['routines.json']);
const K = JSON.parse(raw['desks.json']);
const S = JSON.parse(raw['skills.json']);
const R = JSON.parse(raw['rules.json']);
const count = (rows, fn) => rows.filter(fn).length;
const deskIds = K.desks.map((d) => d.id).concat(K.extraDesks.map((d) => d.id));

// ================= 1. the pack as committed =================
check('pack loads through require() and is frozen', Object.isFrozen(PACK) && PACK.builtAt === '2026-10-22' && Array.isArray(PACK.decisions) && Array.isArray(PACK.skills));
check('counts: 52 decisions (22 Open, 30 Closed, 6 with a Jev score)', D.length === 52 && count(D, (r) => r.status === 'Open') === 22 && count(D, (r) => r.status === 'Closed') === 30 && count(D, (r) => r.jev !== null) === 6);
check('counts: 14 routines (13 active, 1 paused), 54 skills, 30 rules, 6 desks plus Scout', RT.length === 14 && count(RT, (r) => r.status === 'active') === 13 && count(RT, (r) => r.status === 'paused') === 1 && S.length === 54 && R.length === 30 && K.desks.length === 6 && K.extraDesks.length === 1);
check('every id is unique (the stale duplicate decision is gone)', [D, RT, S, R].every((rows) => new Set(rows.map((r) => r.id)).size === rows.length));
check('D-2026-09-25-38 appears once, as Closed', D.filter((r) => r.id === 'D-2026-09-25-38').length === 1 && D.find((r) => r.id === 'D-2026-09-25-38').status === 'Closed');
check('the files are pure ASCII JSON (no BOM, no replacement characters)', FILES.every((f) => !/[^\x00-\x7F]/.test(raw[f]) && !raw[f].startsWith('﻿')));
check('decision rows have exactly the loader fields', D.every((r) => Object.keys(r).sort().join() === 'date,desk,id,jev,level,source,status,text,title'));
check('decision values are valid: level L0-L4 or empty, status Open/Closed, date in ms, Jev null or 0-1', D.every((r) => /^(L[0-4])?$/.test(r.level) && ['Open', 'Closed'].includes(r.status) && Number.isInteger(r.date) && r.date > 1.7e12 && (r.jev === null || (r.jev >= 0 && r.jev <= 1))));
check('decision desk is set on 25 (technical 16, lavaall-ceo 5, growth 2, sales 2), blank on 27; 10 levels stay empty', count(D, (r) => r.desk !== '') === 25 && ['technical', 'lavaall-ceo', 'growth', 'sales'].map((d) => count(D, (r) => r.desk === d)).join() === '16,5,2,2' && count(D, (r) => r.desk === '') === 27 && D.every((r) => r.desk === '' || deskIds.includes(r.desk)) && count(D, (r) => r.level === '') === 10);
check('routine rows have the pack fields (steps added in phase 4) and a known desk owner', RT.every((r) => Object.keys(r).sort().join() === 'id,lastRunAt,lastRunStatus,name,owner,schedule,status,steps' && deskIds.includes(r.owner)));
check('routine owners: 10 CEO, 3 Scout, 1 Researchy', count(RT, (r) => r.owner === 'lavaall-ceo') === 10 && count(RT, (r) => r.owner === 'scout') === 3 && count(RT, (r) => r.owner === 'researchy') === 1);
check('desks.json ids match the registry order, then Scout', K.desks.map((d) => d.id).join() === 'lavaall-ceo,sales,technical,growth,lifecycle,researchy' && K.extraDesks[0].id === 'scout');
check('every skill a desk names exists in skills.json', K.desks.concat(K.extraDesks).every((d) => d.skills.every((id) => S.some((s) => s.id === id))));
check('rule ids are FR-numbers, skill rows have id, name, whenToUse, desks', R.every((r) => /^FR-\d{3}$/.test(r.id) && r.title && r.rule) && S.every((s) => s.id && s.name && typeof s.whenToUse === 'string' && Array.isArray(s.desks)));
check('Researchy rules keep their "I do not" wording', K.desks.find((d) => d.id === 'researchy').rules.length === 3 && K.desks.find((d) => d.id === 'researchy').rules.every((r) => r.startsWith('I do not ')));
check('only the lifecycle desk has a now line', K.desks.concat(K.extraDesks).filter((d) => d.now).map((d) => d.id).join() === 'lifecycle');
const all = FILES.map((f) => raw[f]).join('\n');
check('nothing sensitive: no email, token, key, URL or local path', !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:ghp|gho|xox[bpa]|AKIA|AIza|ya29|sk-)[-_A-Za-z0-9]{12,}|https?:\/\/|[A-Za-z]:\\\\|\/Users\/|(?:secret|token|password|api[_-]?key)\s*[:=]/i.test(all));
check('Starlink and Guinea are left out', !/starlink|guinea/i.test(all));
check('"free trial" appears only in the one decision that forbids it', (all.match(/free trial/gi) || []).length === 2 && D.filter((r) => /free trial/i.test(r.title + r.source)).length === 1 && D.find((r) => /free trial/i.test(r.title)).title === 'No free trial anywhere');

// ================= 2. loaders keep the data untouched =================
const data = osData.buildOsData({ store: null, health: null }, { env: {} });
const trim = (v) => String(v).trim();
check('decisions: all 52 load, none truncated or altered (edge whitespace trimmed only)', data.decisions.length === 52 && D.every((r) => { const o = data.decisions.find((x) => x.id === r.id); return o && o.title === trim(r.title) && o.text === trim(r.text) && o.source === trim(r.source) && o.status === r.status && o.date === r.date && o.jev === r.jev && o.level === r.level; }));
check('decisions: newest first', data.decisions.every((d, i, a) => i === 0 || d.date <= a[i - 1].date));
check('Home KPI "open decisions" is 22, from the pack', data.kpis.openDecisions === 22);
check('decisions are available even when the store is down', data.storeAvailable === false && data.decisions.length === 52);
check('routines: 14 from the pack with schedule, owner and status', data.routines.length === 14 && RT.every((r) => { const o = data.routines.find((x) => x.id === r.id); return o && o.name === trim(r.name) && o.schedule === trim(r.schedule) && o.owner === r.owner && o.status === r.status; }));
check("routines: the pack's stale last-run fields are ignored", data.routines.every((r) => r.lastRunAt === 0 && r.lastRunLabel === '' && r.lastRunStatus === ''));
const health = { ok: true, empty: false, checkedLabel: 'now', routines: [{ slug: 'friday-decide-or-kill', status: 'OK', tone: 'ok', reason: 'ran', lastRunAt: '2026-10-16T14:23:00Z', lastRunLabel: 'Oct 16, 9:23 AM CT' }] };
const live = osData.buildOsData({ store: null, health }, { env: {} });
check('routines: live health is merged by the pack id', live.routines.find((r) => r.id === 'friday-decide-or-kill').health.status === 'OK' && live.routines.find((r) => r.id === 'friday-decide-or-kill').lastRunLabel === 'Oct 16, 9:23 AM CT' && live.routines.filter((r) => r.health).length === 1);
check('desks: seven, the registry six in order and Scout last', data.desks.length === 7 && data.desks.map((d) => d.id).join() === 'lavaall-ceo,sales,technical,growth,lifecycle,researchy,scout');
check('desks: rules and skills are merged by id, unchanged', K.desks.every((d) => { const o = data.desks.find((x) => x.id === d.id); return o.skills.join() === d.skills.join() && o.rules.join() === d.rules.map(trim).join() && o.now === d.now; }));
check('desks: Scout is outside the registry, has its rules and no skills, and no Talk link', (() => { const s = data.desks.find((d) => d.id === 'scout'); return Boolean(s) && s.inRegistry === false && s.name === 'Scout' && s.talk === '' && s.skills.length === 0 && s.rules.length === 4; })());
check('desks: registry desks keep their /ops Talk link', data.desks.filter((d) => d.inRegistry).every((d) => /^\/ops\/chat\//.test(d.talk)));
check('skills: 54 with their purpose; rules: 30 with title and text', data.skills.length === 54 && data.rules.length === 30 && data.skills.every((s, i) => s.whenToUse === trim(S[i].whenToUse)) && data.rules.every((r, i) => r.rule === trim(R[i].rule) && r.title === trim(R[i].title)));
check('sources: decisions, Jev, routines, desks, skills and rules are live; the rest stay empty', ['decisions', 'jev', 'routines', 'desks', 'skills', 'rules'].every((k) => data.sources[k].live) && ['approvals', 'notes', 'council', 'spend', 'outreach', 'brief', 'hotelBounceRate'].every((k) => !data.sources[k].live));
check('source labels say where each comes from, with no SOUL deferral left', Object.values(data.sources).every((s) => s.from && s.label) && /data pack/.test(data.sources.decisions.from) && /routines\.json/.test(data.sources.routines.from) && /desks\.json/.test(data.sources.desks.from) && !/SOUL|deferred/i.test(JSON.stringify(data.sources)));
check('a store decisions copy wins over the pack', (() => { const d = osData.buildOsData({ store: { decisions: [{ id: 'S1', title: 'From the store', status: 'Open', date: 5 }] }, health: null }, { env: {} }); return d.decisions.length === 1 && d.decisions[0].id === 'S1' && d.kpis.openDecisions === 1; })());
check('an explicit empty store copy also wins (the store is the source of truth once it has the key)', osData.buildOsData({ store: { decisions: [] }, health: null }, { env: {} }).decisions.length === 0);
check('no pack means no decisions, routines, skills or rules, and an unmerged registry', (() => { const d = osData.buildOsData({ store: {}, health: null }, { env: {}, pack: null }); return d.decisions === null && d.routines === null && d.skills === null && d.rules === null && d.desks.length === 6 && d.desks.every((x) => x.skills === null && x.rules === null && x.now === null); })());
check('the embedded page data stays small', JSON.stringify(data).length < 120000);

// ================= 3. Brain from the real pack =================
function loadOS() {
  const sandbox = {
    window: {}, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } },
    location: { hash: '' }, setTimeout: () => 0, setInterval: () => 0, Intl,
  };
  vm.createContext(sandbox);
  ['core.js', 'home.js', 'desks.js', 'decisions.js', 'routines.js', 'brain-graph.js', 'brain.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  return sandbox.window.OS;
}
const OS = loadOS();
OS.data = data;
const g = OS.brain.build(data);
const links = (a, b) => g.links.filter((l) => (l.s.t === a && l.t.t === b) || (l.s.t === b && l.t.t === a));
const deskSkillPairs = K.desks.reduce((n, d) => n + d.skills.length, 0);
check('Brain nodes: 7 desks, 14 routines, 52 decisions, 54 skills, 30 rules (157)', g.counts.desk === 7 && g.counts.routine === 14 && g.counts.decision === 52 && g.counts.skill === 54 && g.counts.rule === 30 && g.counts.lead === 0 && g.counts.note === 0 && g.nodes.length === 157);
check('Brain node ids are unique', new Set(g.nodes.map((n) => n.id)).size === g.nodes.length);
check('Brain links: every routine links to its owner desk (14), including Scout', links('routine', 'desk').length === 14 && RT.every((r) => g.links.some((l) => l.why === 'runs' && l.s.id === 'rt:' + r.id && l.t.id === 'd:' + r.owner)) && g.links.filter((l) => l.why === 'runs' && l.t.id === 'd:scout').length === 3);
check('Brain links: desk to skill exactly follows each desk skill list', links('desk', 'skill').length === deskSkillPairs && K.desks.every((d) => d.skills.every((id) => g.links.some((l) => l.why === 'uses skill' && l.s.id === 'd:' + d.id && l.t.id === 's:' + id))));
check('Brain: 24 distinct skills are linked, 30 are not, and none is guessed a link', (() => { const linked = new Set(g.links.filter((l) => l.why === 'uses skill').map((l) => l.t.id)); return linked.size === 24 && g.nodes.filter((n) => n.t === 'skill' && n.deg === 0).length === 30; })());
check('Brain: 25 decisions link to their desk (technical 16, lavaall-ceo 5, growth 2, sales 2), the other 27 stay unlinked', g.links.filter((l) => l.why === 'decided').length === 25 && g.nodes.filter((n) => n.t === 'decision' && n.deg > 0).length === 25 && g.nodes.filter((n) => n.t === 'decision' && n.deg === 0).length === 27 && ['technical', 'lavaall-ceo', 'growth', 'sales'].map((d) => g.links.filter((l) => l.why === 'decided' && l.t.id === 'd:' + d).length).join() === '16,5,2,2');
check('Brain: desk rules ending in an FR id link to that rule (14 links, 9 rules), the other 21 rules stay unlinked', g.links.filter((l) => l.why === 'follows rule').length === 14 && new Set(g.links.filter((l) => l.why === 'follows rule').map((l) => l.t.id)).size === 9 && g.nodes.filter((n) => n.t === 'rule' && n.deg === 0).length === 21 && ['FR-001', 'FR-002', 'FR-004', 'FR-005', 'FR-015', 'FR-017', 'FR-027', 'FR-032', 'FR-033'].every((fr) => g.links.some((l) => l.why === 'follows rule' && l.t.id === 'r:' + fr)));
check('Brain: every desk rule that cites an FR id cites one that exists in rules.json (no extra rule nodes)', g.counts.rule === 30 && K.desks.concat(K.extraDesks).every((d) => d.rules.every((r) => (r.match(/FR-\d+/g) || []).every((fr) => R.some((x) => x.id === fr)))));
check('Brain: 100 links in all (14 runs, 47 uses skill, 25 decided, 14 follows rule) and no other relation', g.links.length === 100 && g.links.length === 14 + deskSkillPairs + 25 + 14 && g.links.every((l) => ['runs', 'uses skill', 'decided', 'follows rule'].includes(l.why)));
check('Brain: a note citing an FR id now links to that rule', (() => { const d2 = osData.buildOsData({ store: { notes: [{ id: 'n1', title: 'About rules', body: 'We follow FR-015 and FR-002 here.' }] }, health: null }, { env: {} }); const g2 = OS.brain.build(d2); return g2.links.filter((l) => l.s.id === 'n:n1' && l.why === 'mentions').map((l) => l.t.id).sort().join() === 'r:FR-002,r:FR-015'; })());
check('Brain: skill and rule nodes carry their text for the side panel', g.ix['s:ceo-router'].info.whenToUse.length > 20 && g.ix['r:FR-001'].info.text.length > 20 && g.ix['r:FR-001'].info.title.length > 5);
check('Brain legend source names the data pack', g.source === 'desk registry, routines, decision log, data pack 2026-10-22');
check('Brain chips: Skills (FR-030 override) shows 54', /Skills \(FR-030 override\) <b>54<\/b>/.test(OS.views.brain.render({ id: 'brain', sub: '', data })) && /Rules <b>30<\/b>/.test(OS.views.brain.render({ id: 'brain', sub: '', data })));
check('Brain: layout settles to finite coordinates for all 157 nodes', (() => { OS.brain.layout(g, 7); return g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)); })());

// ================= 4. views from the real pack =================
const html = (id, sub) => OS.views[id].render({ id, sub: sub || '', data });
const dec = html('decisions');
check('Decisions view: 52 rows, chips All 52 / Open 22 / Closed 30', (dec.match(/<article class="dcard/g) || []).length === 52 && /All <span class="num">52<\/span>/.test(dec) && /Open <span class="num">22<\/span>/.test(dec) && /Closed <span class="num">30<\/span>/.test(dec));
check('Decisions view: 6 scored (PASS or FLAG), 46 "Jev: not run"', (dec.match(/pill (pass|flag) num/g) || []).length === 6 && (dec.match(/Jev: not run/g) || []).length === 46);
check('Decisions view: 10 cards have no level; 25 show their desk short name and 27 a dash', (dec.match(/class="lv num">—</g) || []).length === 10 && (dec.match(/<span class="dim">—<\/span><\/span>|<span class="dim">—<\/span><span class="pill/g) || []).length === 27 && ['Technical', 'CEO', 'Growth', 'Sales'].map((d) => (dec.match(new RegExp(`</i>${d}</span>`, 'g')) || []).length).join() === '16,5,2,2');
check('Decisions view: a decision opens from its id', /data-go="decisions\/D-2026-09-25-38"/.test(dec));
const rtv = html('routines');
check('Routines view: 14 rows, 13 active and 1 paused', (rtv.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr class="row"/g) || []).length === 14 && (rtv.match(/pill pass">active/g) || []).length === 13 && (rtv.match(/pill flag">paused/g) || []).length === 1);
check('Routines view: schedules and desks are shown', /Weekdays 8:07 AM CT/.test(rtv) && /Tue-Sat 12:00 AM CT/.test(rtv) && (rtv.match(/data-go="desks\/lavaall-ceo">CEO</g) || []).length === 10 && (rtv.match(/data-go="desks\/scout">Scout</g) || []).length === 3);
check('Routines view: last run and health are dashes without a health record', /there is none yet\./.test(rtv) && !/helper failed|skipped/.test(rtv));
const dkv = html('desks');
check('Desks view: seven cards, Lifecycle shows its now line, the other six say not recorded', (dkv.match(/class="card deskcard"/g) || []).length === 7 && /Parked as routing priority; Talk still works\./.test(dkv) && (dkv.match(/Status not recorded yet/g) || []).length === 6);
check('Desks view: cards show real skill and routine counts', /16 skills · 10 routines/.test(dkv.replace(/·/g, '·')) && /0 skills · 3 routines/.test(dkv.replace(/·/g, '·')));
check('Desks view: Scout is there and links to its drawer', /data-go="desks\/scout"/.test(dkv));
const home = html('home');
check('Home: open decisions 22, five recent decisions, seven desks', /Open decisions<\/span><b class="num">22<\/b>/.test(home) && (home.split('<h3>Recent decisions</h3>')[1].match(/data-go="decisions\/D-/g) || []).length === 5 && (home.match(/data-go="desks\/[a-z-]+"><span class="dot">/g) || []).length === 7);

// ================= 5. bundling and read-only =================
const adapter = fs.readFileSync(path.join(root, 'api/ops/_os_data.js'), 'utf8');
const index = fs.readFileSync(path.join(dataDir, 'index.js'), 'utf8');
check('the pack is bundled by literal require() calls', /require\('\.\.\/os\/_data\/index\.js'\)/.test(adapter) && FILES.every((f) => index.includes(`require('./${f}')`)));
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
check('no vercel.json functions entry for api/os is needed or added', !Object.keys(cfg.functions || {}).some((k) => k.startsWith('api/os')));
check('the pack is never written: no KV or file writes in the adapter or the pack loader', !/writeFile|appendFile|kvSet|writeStore|'SET'|"SET"/.test(adapter + index));
check('the adapter makes no network or model calls', !/anthropic|openai|xai|\bfetch\(/i.test(adapter.replace(/\/\/.*$/gm, '').replace(/function kvGet[\s\S]*?\n}\n/, '')));

const failedChecks = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failedChecks.length}/${results.length} passed`);
process.exit(failedChecks.length ? 1 : 0);
