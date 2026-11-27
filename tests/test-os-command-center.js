// LAVAALL OS command center: the AI bar in the header and Home's "Ask anything" routing.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function loadOS(status) {
  const win = {};
  const data = JSON.stringify({ harness: { status }, kpis: {}, sources: {} });
  const sandbox = {
    window: win,
    document: { querySelector: (sel) => (sel === '#os-data' ? { textContent: data } : null), querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } },
    location: { hash: '' },
    navigator: {},
    setTimeout: () => 0,
    setInterval: () => 0,
    Intl,
  };
  vm.createContext(sandbox);
  ['core.js', 'home.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  return { OS: win.OS, sandbox };
}

const ALL = [
  { id: 'codex', label: 'Codex', detail: 'OpenAI API key present', state: 'ready' },
  { id: 'claude', label: 'Claude', detail: 'API key present', state: 'ready' },
  { id: 'deepseek', label: 'DeepSeek', detail: 'key present', state: 'ready' },
  { id: 'grok', label: 'Grok (xAI)', detail: 'xAI API key present', state: 'ready' },
];

{
  const { OS } = loadOS(ALL);
  check('code work goes to Codex', OS.routeAsk('fix the bug in the apply form') === 'codex' && OS.routeAsk('open a PR for the receipt hold') === 'codex');
  check('quick text jobs go to DeepSeek', OS.routeAsk('summarize this email thread') === 'deepseek' && OS.routeAsk('translate this into Krio') === 'deepseek');
  check('news and trends go to Grok', OS.routeAsk('what is trending on X about Starlink in Freetown') === 'grok');
  check('everything else goes to Claude', OS.routeAsk('how should I price the hiring pass?') === 'claude');

  const bar = OS.aiBar();
  check('AI bar shows one chip per model, linking to AI models', (bar.match(/class="aichip/g) || []).length === 4 && (bar.match(/href="#harness"/g) || []).length === 4);
  check('AI bar marks connected models and says so for screen readers', (bar.match(/aichip ok/g) || []).length === 4 && /connected/.test(bar));

  const base = require(path.join(root, 'api/ops/_os_data.js')).buildOsData({ store: {}, feeds: {} }, { env: {} });
  const html = OS.views.home.render({ id: 'home', sub: '', data: Object.assign({}, base, { harness: { status: ALL } }) });
  check('Home has the Ask anything box above the KPIs', /id="home-ask"/.test(html) && /id="home-ask-input"/.test(html) && html.indexOf('id="home-ask"') < html.indexOf('class="grid g4"'));
  check('the Ask box has a label for assistive tech', /<label class="sr" for="home-ask-input">Ask anything<\/label>/.test(html));

  let went = null;
  OS.go = (id) => { went = id; };
  OS.ask('  refactor the kits table  ');
  const pending = OS.takeAsk();
  check('asking opens AI models with the routed model and trimmed text', went === 'harness' && pending && pending.harness === 'codex' && pending.text === 'refactor the kits table');
  check('a pending question is used once', OS.takeAsk() === null);
  went = null; OS.ask('   ');
  check('an empty question does nothing', went === null && OS.takeAsk() === null);
}

{
  const { OS } = loadOS([
    { id: 'codex', label: 'Codex', state: 'missing' },
    { id: 'claude', label: 'Claude', state: 'ready' },
    { id: 'deepseek', label: 'DeepSeek', state: 'missing' },
    { id: 'grok', label: 'Grok (xAI)', state: 'missing' },
  ]);
  check('a model with no key is skipped for the first ready one', OS.routeAsk('fix the bug') === 'claude');
  const bar = OS.aiBar();
  check('disconnected models show without the connected dot', (bar.match(/aichip ok/g) || []).length === 1 && /not connected/.test(bar));
}

{
  const { OS } = loadOS([{ id: 'claude', label: '<img src=x onerror=alert(1)>', detail: '"><script>', state: 'ready' }]);
  check('AI bar escapes labels and details', !/<img src=x/.test(OS.aiBar()) && !/<script>/.test(OS.aiBar()));
}

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
