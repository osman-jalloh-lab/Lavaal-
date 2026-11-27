// LAVAALL OS business switch: All, LAVAALL, SaloneWorks, SaloneHire, plus any other project group from the
// harness pack (named by the server data). Filters Build, Progress and saved Memory.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function loadOS(stored) {
  const win = {};
  const data = JSON.stringify({ kpis: {}, sources: {}, harness: { groups: [{ id: 'lavaall', label: 'LAVAALL' }, { id: 'saloneworks', label: 'SaloneWorks' }, { id: 'fourth-line', label: 'Fourth line' }, { id: 'salonehire', label: 'SaloneHire' }], status: [] } });
  const storage = { v: stored || null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
  const sandbox = {
    window: win, localStorage: storage,
    document: { querySelector: (sel) => (sel === '#os-data' ? { textContent: data } : null), querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } },
    location: { hash: '' }, navigator: {}, setTimeout: () => 0, setInterval: () => 0, Intl,
  };
  vm.createContext(sandbox);
  ['core.js', 'build.js', 'saved.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  return { OS: win.OS, storage };
}

{
  const { OS } = loadOS();
  check('the switch lists All, the three named businesses, and other groups from the server data', OS.businesses.map((b) => b.id).join() === 'all,lavaall,saloneworks,salonehire,fourth-line' && OS.businessLabel('fourth-line') === 'Fourth line');
  check('starts on All businesses', OS.business() === 'all' && OS.inBusiness('salonehire') && OS.inBusiness('lavaall-os'));
  check('LAVAALL owns the OS, website and agents items', ['lavaall-os', 'website', 'agents', 'lavaall'].every((p) => OS.businessOf(p) === 'lavaall') && OS.businessOf('fourth-line') === 'fourth-line');
}

{
  const { OS, storage } = loadOS();
  OS.setBusiness = ((orig) => (id) => { try { orig(id); } catch (e) { /* render needs a DOM */ } })(OS.setBusiness);
  OS.setBusiness('salonehire');
  check('picking a business is remembered in this browser only', OS.business() === 'salonehire' && storage.v === 'salonehire');
  OS.setBusiness('not-a-business');
  check('an unknown business is ignored', OS.business() === 'salonehire');
  const build = OS.views.build.render({ id: 'build', sub: '', data: { build: { receivedAt: 1, items: [
    { id: 'a', project: 'salonehire', status: 'done', title: 'Hire thing', detail: '', url: '', updatedAt: 1 },
    { id: 'b', project: 'lavaall-os', status: 'done', title: 'OS thing', detail: '', url: '', updatedAt: 1 },
  ] } } });
  check('Build shows only that business, and says so', /Hire thing/.test(build) && !/OS thing/.test(build) && /for SaloneHire/.test(build));
  OS.setSavedState({ goals: [
    { id: 'g-000000000001', horizon: 'week', title: 'Hire goal', project: 'salonehire', progress: 10, done: false },
    { id: 'g-000000000002', horizon: 'week', title: 'Personal goal', project: 'personal', progress: 10, done: false },
  ], memories: [
    { id: 'm-000000000001', text: 'Hire memory', tags: ['salonehire'], createdAt: 1 },
    { id: 'm-000000000002', text: 'Untagged memory', tags: [], createdAt: 1 },
  ], persist: true });
  check('Progress shows only that business; personal goals wait under All', /Hire goal/.test(OS.progressBody()) && !/Personal goal/.test(OS.progressBody()));
  check('Memory shows only memories tagged with that business', /Hire memory/.test(OS.memoryBody()) && !/Untagged memory/.test(OS.memoryBody()));
  const form = OS.views.progress.render({ id: 'progress', sub: '', data: {} });
  check('new goals default to the selected business', /<option value="salonehire" selected>/.test(form) && /<option value="fourth-line">Fourth line<\/option>/.test(form));
}

{
  const { OS } = loadOS('saloneworks');
  check('the remembered business comes back on the next visit', OS.business() === 'saloneworks');
}

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
