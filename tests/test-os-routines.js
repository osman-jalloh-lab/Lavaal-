// LAVAALL OS routines as workflows: every routine has a steps array or null, the detail view draws the right
// number of nodes (trigger, steps, outputs) in SVG with a pulse, Replay restarts it, reduced motion turns it off,
// and a routine without steps says so. Loads the real core.js and routines.js in a sandbox. No network.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const osData = require(path.join(root, 'api/ops/_os_data.js'));
const RT = JSON.parse(fs.readFileSync(path.join(root, 'api/os/_data/routines.json'), 'utf8'));
const PACK = require(path.join(root, 'api/os/_data/index.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function load(width) {
  const win = { innerWidth: width, addEventListener() {}, removeEventListener() {} };
  const sandbox = { window: win, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } }, location: { hash: '' }, setTimeout: () => 0, setInterval: () => 0, Intl };
  vm.createContext(sandbox);
  ['core.js', 'routines.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  return win.OS;
}
const data = osData.buildOsData({ store: {}, health: null }, { env: {}, pack: PACK });
const OS = load(1440);
OS.data = data;
const draw = (sub, os) => (os || OS).views.routines.render({ id: 'routines', sub: sub || '', data });
const text = (h) => h.replace(/<[^>]*>/g, ' ');

// 1. The pack: every routine has a steps array or null, written from the documented procedures.
check('every routine has a steps array or null', RT.length === 14 && RT.every((r) => Object.prototype.hasOwnProperty.call(r, 'steps') && (r.steps === null || Array.isArray(r.steps))));
check('13 routines have steps; the Slack task bridge is null (no written procedure)', RT.filter((r) => r.steps).length === 13 && RT.find((r) => r.id === 'lavaall-slack-task-bridge').steps === null);
check('every step is {kind, label, tool?} with a known kind and a short label', RT.every((r) => !r.steps || r.steps.every((s) => ['trigger', 'step', 'output'].includes(s.kind) && typeof s.label === 'string' && s.label.length > 0 && s.label.length <= 120 && Object.keys(s).every((k) => ['kind', 'label', 'tool'].includes(k)))));
check('every routine with steps starts with exactly one trigger and ends with an output', RT.every((r) => !r.steps || (r.steps[0].kind === 'trigger' && r.steps.filter((s) => s.kind === 'trigger').length === 1 && r.steps[r.steps.length - 1].kind === 'output')));
check('steps in the pack are already ordered trigger, steps, outputs', RT.every((r) => !r.steps || r.steps.map((s) => ['trigger', 'step', 'output'].indexOf(s.kind)).every((v, i, a) => i === 0 || v >= a[i - 1])));
check('the pack file is pure ASCII JSON', !/[^\x00-\x7F]/.test(fs.readFileSync(path.join(root, 'api/os/_data/routines.json'), 'utf8')));
const packText = JSON.stringify(RT);
check('no banned word, email or phone number in the steps', !new RegExp(['star' + 'link', 'gui' + 'nea'].join('|'), 'i').test(packText) && !/[\w.+-]+@[\w-]+\.\w+/.test(packText) && !/\d{3}[\s.-]\d{3}[\s.-]\d{4}/.test(packText));

// 2. The adapter keeps steps, and drops anything unreadable to null.
check('data: each routine carries its steps (array) or null', data.routines.length === 14 && data.routines.every((r) => r.steps === null || (Array.isArray(r.steps) && r.steps.length > 0)));
const odd = osData.routinesFrom({ routines: [
  { id: 'a', name: 'A', steps: 'nope' },
  { id: 'b', name: 'B', steps: [] },
  { id: 'c', name: 'C', steps: [{ kind: 'output', label: 'O' }, { kind: 'wat', label: 'X' }, { kind: 'step', label: 'S' }, { kind: 'trigger', label: 'T', tool: 'Tool' }, { kind: 'step', label: '' }] },
  { id: 'd', name: 'D' },
] }, null);
check('unreadable steps become null; unknown kinds and empty labels are dropped; order is trigger, step, output', odd[0].steps === null && odd[1].steps === null && odd[3].steps === null && odd[2].steps.map((s) => s.kind).join() === 'trigger,step,output' && odd[2].steps[0].tool === 'Tool');

// 3. The table opens a routine.
const table = draw('');
check('table: 14 clickable rows deep-linking to #routines/<id>', (table.match(/<tr class="row" tabindex="0" data-go="routines\//g) || []).length === 14 && /data-go="routines\/friday-decide-or-kill"/.test(table));
check('table: each row says how many nodes, or that steps are not written yet', /5 nodes in the workflow/.test(table) && (table.match(/Steps not written yet/g) || []).length === 1);
check('table: the desk is still a link to its drawer, by short name', /data-go="desks\/lavaall-ceo">CEO</.test(table));

// 4. The detail view draws the workflow.
RT.filter((r) => r.steps).forEach((r) => {
  const h = draw(r.id);
  const nodes = (h.match(/<g class="rnode /g) || []).length;
  const links = (h.match(/<g class="rlink"/g) || []).length;
  const pulses = (h.match(/class="rpulse"/g) || []).length;
  check(`${r.id}: ${r.steps.length} nodes, ${r.steps.length - 1} links and pulses`, nodes === r.steps.length && links === r.steps.length - 1 && pulses === r.steps.length - 1 && new RegExp(`data-nodes="${r.steps.length}"`).test(h));
});
const fd = draw('friday-decide-or-kill');
check('detail: drawn in SVG, one trigger and the outputs last', /<svg class="rflowsvg"/.test(fd) && (fd.match(/rnode k-trigger/g) || []).length === 1 && (fd.match(/rnode k-output/g) || []).length === 2 && fd.lastIndexOf('k-output') > fd.lastIndexOf('k-step'));
check('detail: labels are shown and a step with a tool names it', /Find the 5 oldest/.test(fd) && /Gmail/.test(draw('support-ranked-inbox-push')));
check('detail: a Replay button', /id="rt-replay"[^>]*>Replay</.test(fd));
check('detail: schedule (CT), owner desk short name, last run and health under the flow', /Schedule \(CT\)<\/dt><dd>Fri 9:23 AM CT/.test(fd) && /<\/i>CEO<\/span>/.test(fd) && /Last run<\/dt><dd>—/.test(fd) && /there is none for this routine yet/.test(fd));
check('detail: a link back to all routines', /data-go="routines">All routines</.test(fd));
check('detail: a routine without steps says "Steps not written yet" and draws no flow', (() => { const h = draw('lavaall-slack-task-bridge'); return /Steps not written yet/.test(h) && !/<svg class="rflowsvg"/.test(h) && !/id="rt-replay"/.test(h); })());
check('an unknown routine id falls back to the table', /<table>/.test(draw('nope')) && !/rflowsvg/.test(draw('nope')));

// 5. Live health shows under the flow.
const withHealth = osData.buildOsData({ store: {}, health: { ok: true, empty: false, checkedLabel: 'now', routines: [{ slug: 'friday-decide-or-kill', status: 'OK', tone: 'ok', reason: 'ran', lastRunAt: '2026-10-16T14:23:00Z', lastRunLabel: 'Oct 16, 9:23 AM CT' }] } }, { env: {}, pack: PACK });
const live = OS.views.routines.render({ id: 'routines', sub: 'friday-decide-or-kill', data: withHealth });
check('detail: last run and health come from the live record', /Last run<\/dt><dd>Oct 16, 9:23 AM CT/.test(live) && /pill pass" title="ran">OK</.test(live) && !/there is none for this routine yet/.test(live));

// 6. Layout: horizontal on desktop, vertical on a phone; every link is a straight line.
const lines = (h) => (h.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g) || []).map((l) => l.match(/"([\d.]+)"/g).map((x) => Number(x.replace(/"/g, ''))));
const desktop = draw('midnight-closeout');
const phoneOS = load(390);
phoneOS.data = data;
const phone = draw('midnight-closeout', phoneOS);
check('desktop: nodes snake across rows of four (8 nodes = 2 rows)', /viewBox="0 0 \d+ 2\d\d"/.test(desktop) && lines(desktop).filter((l) => l[1] === l[3]).length === 6 && lines(desktop).filter((l) => l[0] === l[2]).length === 1);
check('phone: one column, every link goes straight down', lines(phone).length === 7 && lines(phone).every((l) => l[0] === l[2] && l[3] > l[1]) && /viewBox="0 0 180 /.test(phone));
check('the second row runs right to left, so the turn link is vertical', (() => { const v = lines(desktop).find((l) => l[0] === l[2]); return v && v[3] > v[1]; })());

// 7. Motion: CSS animation, 600 ms per node, Replay restarts it, reduced motion turns it off.
const css = fs.readFileSync(path.join(root, 'api/os/_client/os.css'), 'utf8');
check('CSS: the pulse and the node glow run 600 ms per node with a per-node delay', /\.rflow\.play \.rpulse\{animation:rpulse 600ms linear both;animation-delay:calc\(var\(--i\)\*600ms\)\}/.test(css) && /\.rflow\.play \.rnode rect\{animation:rglow 600ms ease-out;animation-delay:calc\(var\(--i\)\*600ms\)\}/.test(css));
check('CSS: each pulse carries its own index and its travel distance', /class="rpulse"[^>]*style="--i:0;--dx:\d+px;--dy:0px"/.test(fd));
check('CSS: prefers-reduced-motion turns every animation off', /@media\(prefers-reduced-motion:reduce\)\{\.os-root \*\{animation:none!important/.test(css));
const flowEl = { classList: { _c: new Set(), add(x) { this._c.add(x); }, remove(x) { this._c.delete(x); }, has(x) { return this._c.has(x); } }, offsetWidth: 1 };
const listeners = {};
const root_ = { addEventListener: () => {}, querySelector: (s) => (s === '#rt-flow' ? flowEl : s === '#rt-replay' ? { addEventListener: (t, fn) => { listeners[t] = fn; } } : s === '#rt-svg' ? { innerHTML: '' } : null) };
OS.views.routines.mount(root_, { id: 'routines', sub: 'friday-decide-or-kill', data });
check('mount starts the animation (play class on)', flowEl.classList.has('play'));
flowEl.classList.remove('play');
listeners.click();
check('Replay restarts it', flowEl.classList.has('play'));
OS.views.routines.mount({ addEventListener: () => {}, querySelector: () => null }, { id: 'routines', sub: 'lavaall-slack-task-bridge', data });
check('mounting a routine without steps does not throw', true);

// 8. Escaping and read-only.
const evil = osData.buildOsData({ store: {}, health: null }, { env: {}, pack: { routines: [{ id: 'x', name: '<img src=x onerror=alert(1)>', schedule: '<b>s</b>', owner: 'sales', status: 'active', steps: [{ kind: 'trigger', label: '<script>alert(1)</script>', tool: '"><b>' }, { kind: 'output', label: 'ok' }] }] } });
OS.data = evil;
const eh = OS.views.routines.render({ id: 'routines', sub: 'x', data: evil });
check('routine and step text from the pack is escaped', !/<img src=x|<script>alert|<b>s<\/b>|"><b>/.test(eh) && /&lt;script&gt;/.test(eh));
const src = fs.readFileSync(path.join(root, 'api/os/_client/routines.js'), 'utf8');
check('routines.js has no forms, inputs, fetches or run buttons', !/<form|<input|fetch\(|XMLHttpRequest|Run now/.test(src));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
