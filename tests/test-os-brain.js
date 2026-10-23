// LAVAALL OS Brain: the graph model, its real-relations-only rule, layout and the view shell.
// Loads the real brain-graph.js and brain.js in a sandbox. No DOM library, no network.

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
    location: { hash: '' },
    setTimeout: () => 0,
    setInterval: () => 0,
    Intl,
  };
  vm.createContext(sandbox);
  ['core.js', 'brain-graph.js', 'brain.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  return sandbox.window.OS;
}

const OS = loadOS();
const B = OS.brain;
const baseDesks = osData.buildOsData({ store: {} }, { env: {}, pack: null }).desks;
const DESK_IDS = baseDesks.map((d) => d.id);

function graph(extra) {
  return B.build(Object.assign({ desks: baseDesks.map((d) => Object.assign({}, d)) }, extra || {}));
}
const hasLink = (g, a, b, why) => g.links.some((l) => ((l.s.id === a && l.t.id === b) || (l.s.id === b && l.t.id === a)) && (!why || l.why === why));

// ---- today's real data: only the registry, plus whatever the store holds --------
const bare = graph();
check('registry only: six desk nodes and nothing else', bare.nodes.length === 6 && bare.counts.desk === 6 && bare.links.length === 0);
check('desk ids are d:<registry id>', DESK_IDS.every((id) => bare.ix['d:' + id]) && bare.ix['d:sales'].t === 'desk');
check('routines and notes become nodes without inventing links', (() => {
  const g = graph({ routines: [{ id: 'r1', name: 'Routine', owner: null }], notes: [{ id: 'n1', title: 'A note', body: 'nothing relevant' }] });
  return g.nodes.length === 8 && g.links.length === 0 && g.counts.routine === 1 && g.counts.note === 1;
})());
check('no data at all -> no nodes', B.build({}).nodes.length === 0 && B.build(undefined).nodes.length === 0);

// ---- relations: only where the data really relates two things -------------------
const decs = [
  { id: 'a', title: 'Decision on Sales thing', desk: 'sales', text: '', date: 3 },
  { id: 'b', title: 'Decision by Short Name', desk: 'Technical', text: '', date: 2 },
  { id: 'c', title: 'Decision by full name', desk: baseDesks[0].name.toLowerCase(), text: '', date: 1 },
  { id: 'd', title: 'Decision for nobody', desk: 'does-not-exist', text: '', date: 0 },
];
const gd = graph({ decisions: decs });
check('decision -> desk by id', hasLink(gd, 'dc:a', 'd:sales', 'decided'));
check('decision -> desk by short name, any case', hasLink(gd, 'dc:b', 'd:technical', 'decided'));
check('decision -> desk by full name, any case', hasLink(gd, 'dc:c', 'd:' + baseDesks[0].id, 'decided'));
check('decision with an unknown desk has no link', gd.links.filter((l) => l.s.id === 'dc:d' || l.t.id === 'dc:d').length === 0);
check('decision nodes carry their raw id for deep links', gd.ix['dc:a'].info.rawId === 'a');

const leads = [{ id: 'l1', name: 'Hillside Hotel' }, { id: 'l2', name: 'Bo' }, { id: 'l3', name: 'Chapter One' }];
const gl = graph({
  decisions: [{ id: 'x', title: 'Pause outreach', desk: 'sales', text: 'Hillside Hotel bounced twice', date: 2 }, { id: 'y', title: 'Another', desk: 'sales', text: 'The Hillside area is quiet; Bo is mentioned too', date: 1 }],
  outreach: leads,
});
check('lead -> sales desk', leads.every((l) => hasLink(gl, 'l:' + l.id, 'd:sales', 'works lead')));
check('lead -> decision only on the full name', hasLink(gl, 'l:l1', 'dc:x', 'named in') && !hasLink(gl, 'l:l1', 'dc:y'));
check('no first-word guessing (the prototype heuristic)', !hasLink(gl, 'l:l1', 'dc:y') && !hasLink(gl, 'l:l3', 'dc:x'));
check('names under four characters never link', !hasLink(gl, 'l:l2', 'dc:y'));
check('no sales desk -> no works-lead links', graph({ desks: [{ id: 'growth', name: 'Growth', short: 'Growth' }], outreach: leads }).links.length === 0);

const gn = graph({
  decisions: [{ id: 'dd', title: 'Move the inbox feed', desk: 'technical', text: '', date: 1 }],
  outreach: [{ id: 'l1', name: 'Chapter One' }],
  notes: [
    { id: 'n1', title: 'Meeting', body: 'We agreed to Move the inbox feed with Chapter One, and the ' + baseDesks.find((d) => d.id === 'growth').name + '.' },
    { id: 'n2', title: 'Generic', body: 'sales and growth and technical are common words' },
    { id: 'n3', title: 'Rule note', body: 'FR-015 applies; FR-999 is unknown' },
  ],
  desks: baseDesks.map((d) => (d.id === 'sales' ? Object.assign({}, d, { rules: ['No invented data (FR-015)'] }) : d)),
});
check('note -> decision by title', hasLink(gn, 'n:n1', 'dc:dd', 'mentions'));
check('a note that only paraphrases a title does not link', !hasLink(graph({ decisions: [{ id: 'q', title: 'Move the inbox feed', desk: 'technical', text: '', date: 1 }], notes: [{ id: 'p', title: 'p', body: 'we talked about the inbox feed' }] }), 'n:p', 'dc:q'));
check('note -> lead by full name', hasLink(gn, 'n:n1', 'l:l1', 'mentions'));
check('note -> desk by full registry name', hasLink(gn, 'n:n1', 'd:growth', 'mentions'));
check('note -> rule only when that rule node exists', hasLink(gn, 'n:n3', 'r:FR-015', 'mentions') && !gn.ix['r:FR-999']);
check('common words do not link a note to a desk', gn.links.filter((l) => l.s.id === 'n:n2' || l.t.id === 'n:n2').length === 0);

const gs = graph({
  desks: baseDesks.map((d) => (d.id === 'sales' ? Object.assign({}, d, { skills: ['quote-pack', 'plain-rephrase'], rules: ['Outbound = drafts only (FR-002)', 'A rule with no id'] }) : d)),
  routines: [{ id: 'rt1', name: 'Owned', owner: 'sales' }, { id: 'rt2', name: 'Orphan', owner: null }, { id: 'rt3', name: 'Ghost owner', owner: 'nobody' }],
});
check('desk -> skill (uses skill)', hasLink(gs, 'd:sales', 's:quote-pack', 'uses skill') && gs.counts.skill === 2);
check('desk -> rule only for real FR ids', hasLink(gs, 'd:sales', 'r:FR-002', 'follows rule') && gs.counts.rule === 1);
check('routine -> desk only with a matching owner', hasLink(gs, 'rt:rt1', 'd:sales', 'runs') && gs.links.filter((l) => l.s.id === 'rt:rt2' || l.t.id === 'rt:rt2' || l.s.id === 'rt:rt3' || l.t.id === 'rt:rt3').length === 0);

// ---- structural invariants ------------------------------------------------------
const RELATIONS = ['uses skill', 'follows rule', 'runs', 'decided', 'works lead', 'named in', 'mentions', 'links to', 'owned by'];
[gd, gl, gn, gs].forEach((g, i) => {
  check(`graph ${i}: every link joins two real nodes`, g.links.every((l) => g.ix[l.s.id] === l.s && g.ix[l.t.id] === l.t));
  check(`graph ${i}: every link has a known relation label`, g.links.every((l) => RELATIONS.includes(l.why)));
  check(`graph ${i}: no self-links or duplicate pairs`, g.links.every((l) => l.s !== l.t) && new Set(g.links.map((l) => [l.s.id, l.t.id].sort().join('|'))).size === g.links.length);
  check(`graph ${i}: degree matches the links`, g.nodes.every((n) => n.deg === g.links.filter((l) => l.s === n || l.t === n).length));
  check(`graph ${i}: type counts add up`, Object.values(g.counts).reduce((a, b) => a + b, 0) === g.nodes.length);
});
check('source line lists only live sources', graph().source === 'desk registry' && gd.source.includes('decision log') && !gd.source.includes('outreach board') && gl.source.includes('outreach board'));
check('source line names desk skills and rules only when they exist, and the data pack when there is one', gs.source.includes('desk skills and rules') && !gd.source.includes('skills and rules') && graph({ packBuiltAt: '2026-10-22' }).source === 'desk registry, data pack 2026-10-22' && !/SOUL/.test(gs.source));

// ---- types and colours ----------------------------------------------------------
check('seven node types', B.ORDER.length === 7 && B.ORDER.join() === 'desk,rule,skill,routine,decision,lead,note');
const css = { desk: '--accent', rule: '--warn', skill: '--c-skill', routine: '--c-amber', decision: '--bad', lead: '--ok', note: '--c-note' };
check('type colours follow the brief tokens', B.ORDER.every((t) => B.TYPES[t].css === css[t]));
check('skills chip is labelled as the FR-030 override', B.TYPES.skill.label === 'Skills (FR-030 override)');
check('desk nodes are larger than any other type', B.radius({ t: 'desk', deg: 0 }) > B.radius({ t: 'note', deg: 6 }));

// ---- layout and physics ---------------------------------------------------------
const lay1 = graph({ decisions: decs, notes: [{ id: 'n1', title: 'x', body: '' }] });
const lay2 = graph({ decisions: decs, notes: [{ id: 'n1', title: 'x', body: '' }] });
B.layout(lay1, 7); B.layout(lay2, 7);
check('layout is seeded: same data gives the same picture', lay1.nodes.every((n, i) => n.x === lay2.nodes[i].x && n.y === lay2.nodes[i].y));
check('layout settles to finite coordinates', lay1.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
check('layout marks itself done and does not run twice', lay1.laid === true && (() => { const before = lay1.nodes.map((n) => n.x).join(); B.layout(lay1, 99); return before === lay1.nodes.map((n) => n.x).join(); })());
check('desks start spread apart', (() => { const d = lay1.nodes.filter((n) => n.t === 'desk'); let min = 1e9; for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) min = Math.min(min, Math.hypot(d[i].x - d[j].x, d[i].y - d[j].y)); return min > 40; })());
check('a decision settles nearer its desk than the far side of the graph', (() => { const a = lay1.ix['dc:a'], s = lay1.ix['d:sales'], far = lay1.ix['d:researchy']; return Math.hypot(a.x - s.x, a.y - s.y) < Math.hypot(a.x - far.x, a.y - far.y); })());
check('drifting for 2000 frames stays bounded and finite', (() => {
  for (let i = 0; i < 2000; i++) {
    lay1.nodes.forEach((n, k) => { n.vx += Math.sin(i * 0.004 + k * 1.7) * 0.01; n.vy += Math.cos(i * 0.0035 + k * 1.3) * 0.01; });
    B.step(lay1, 0.22, {}, null);
  }
  return lay1.nodes.every((n) => Number.isFinite(n.x) && Math.abs(n.x) < 2000 && Math.abs(n.y) < 2000);
})());
check('a dragged node is not moved by physics', (() => { const n = lay1.nodes[0], x = n.x; B.step(lay1, 1, {}, n); return n.x === x; })());
check('hidden types stop repelling after layout', (() => {
  const g = graph({ decisions: decs }); B.layout(g, 7);
  const note = g.ix['dc:a']; const other = g.nodes.find((n) => n.t === 'decision' && n !== note);
  other.x = note.x + 3; other.y = note.y; other.vx = other.vy = note.vx = note.vy = 0;
  B.step(g, 1, { decision: true }, null);
  return Math.abs(note.vx) < 1; // pushed only by gravity and springs, not by the hidden neighbour
})());

// ---- the view shell -------------------------------------------------------------
OS.data = osData.buildOsData({ store: { decisions: decs, notes: [{ id: 'n1', title: 'A note', body: '' }] } }, { env: {}, pack: null });
const view = OS.views.brain.render({ id: 'brain', sub: '', data: OS.data });
check('view has a search box, Fit and a canvas', /id="bq"/.test(view) && /id="bfit"/.test(view) && /<canvas id="bc"/.test(view));
check('one toggle chip per type with its count', B.ORDER.every((t) => new RegExp(`data-t="${t}"[^>]*>[\\s\\S]*?<b>${OS.brainGraph(OS.data).counts[t]}</b>`).test(view)) && (view.match(/class="tchip"/g) || []).length === 7);
check('skills chip label shown', /Skills \(FR-030 override\)/.test(view));
check('canvas is described for screen readers', /role="img" aria-label="Graph of desks/.test(view));
check('side panel and footer slots exist', /id="bside"/.test(view) && /id="bleg"/.test(view));
check('no nodes -> empty state, no canvas', (() => { OS.data = osData.buildOsData({ store: {} }, { env: {}, pack: null }); OS.data.desks = []; const v = OS.views.brain.render({ id: 'brain', sub: '', data: OS.data }); return /The Brain has no nodes yet\./.test(v) && !/<canvas/.test(v); })());
check('Home mini card is exposed', typeof OS.brainMini === 'function');

// ---- source hygiene -------------------------------------------------------------
const src = ['brain-graph.js', 'brain.js'].map((f) => fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8')).join('\n');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('no d3, no network, no eval (comments ignored)', !/\bd3\s*[.(]|require\(|fetch\(|XMLHttpRequest|sendBeacon|\beval\s*\(|new Function\(/.test(code));
check('resize redraws in the same task', /function onResize\(\)[^}]*draw\(\)/.test(src) && /ResizeObserver/.test(src));
check('pauses when hidden and on leaving the view', /visibilitychange/.test(src) && /unmount: function \(\)[\s\S]*destroy\(\)/.test(src));
check('zoom is clamped to 0.25 and 4', (src.match(/Math\.min\(4, Math\.max\(0\.25/g) || []).length >= 2);
check('radial glow only in the dark theme', /if \(!L && !dim\)/.test(src));
check('banned copy and emoji absent', !/free[\s-]*trial|starlink|guinea|lorem ipsum/i.test(src) && !/[\u{1F300}-\u{1FAFF}\u{2728}]/u.test(src));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
