// LAVAALL OS Harness view: project dropdown, harness buttons, last 10 log lines,
// copy-command, no model calls, no secret values. Read only.

'use strict';
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
    navigator: {},
    setTimeout: () => 0,
    setInterval: () => 0,
    Intl,
  };
  vm.createContext(sandbox);
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f });
  run('core.js');
  run('harness.js');
  return { OS: win.OS, sandbox };
}

const { OS } = loadOS();
check('harness is a registered view', Boolean(OS.views.harness && OS.views.harness.render));
check('harness is in the nav and in More, not in the primary tabs', OS.nav.some((n) => n.id === 'harness') && OS.mobile.MORE.includes('harness') && !OS.mobile.TABS.includes('harness'));
check('harness shortcut is G A', OS.nav.find((n) => n.id === 'harness').hint === 'G A' && OS.nav.find((n) => n.id === 'harness').key === 'a');

const SECRET = 'harness-secret-value-should-never-render-12345';
const data = osData.buildOsData({ store: {} }, { env: { GEMINI_API_KEY: SECRET, DEEPSEEK_API_KEY: '' } });
OS.data = data;

check('os data includes the seeded salonehire project', data.harness && data.harness.projects.some((p) => p.name === 'salonehire'));
check('harness source is live when a project is bundled', data.sources.harness && data.sources.harness.live === true && /projects\.json/.test(data.sources.harness.from));
check('gemini key missing vs present is name-only', data.harness.status.find((s) => s.id === 'gemini').detail === 'key present' && data.harness.status.find((s) => s.id === 'deepseek').detail === 'key missing');
check('page data never includes the API key value', !JSON.stringify(data.harness).includes(SECRET));

const html = OS.views.harness.render({ id: 'harness', sub: '', data });
check('page heading is Harness', /<h1>Harness<\/h1>/.test(html));
check('says the page does not call models', /does not call models/.test(html));
check('project dropdown includes SaloneHire', /<select class="harness-sel"/.test(html) && /value="salonehire"/.test(html) && /SaloneHire/.test(html));
check('four harness buttons are present', /data-harness="codex"/.test(html) && /data-harness="claude"/.test(html) && /data-harness="deepseek"/.test(html) && /data-harness="gemini"/.test(html));
check('copy command button is present', /id="harness-copy"/.test(html) && /Copy command/.test(html));
check('copied command uses lavaall-ai', /lavaall-ai codex salonehire/.test(html));
check('Claude is labeled Sonnet only', /Sonnet only/.test(html));
check('latest handoff card lists bundled log lines', /Latest handoff/.test(html) && /pipeline created/.test(html));
check('at most ten log lines are shown', (html.match(/<ol class="harness-log">[\s\S]*?<\/ol>/) || [''])[0].split('<li>').length - 1 <= 10);
check('rendered HTML does not contain the API key', !html.includes(SECRET));
check('no inline handlers and no fetch in the harness view', !/\son[a-z]+\s*=/i.test(html) && !/fetch\(/.test(fs.readFileSync(path.join(root, 'api/os/_client/harness.js'), 'utf8')));

const many = Array.from({ length: 12 }, (_, i) => `- line ${i + 1} of a long log`);
const custom = osData.buildOsData({ store: {} }, {
  env: {},
  harnessPack: {
    projects: [{
      name: 'demo',
      label: 'Demo <script>alert(1)</script>',
      category: 'Test',
      repo: '/tmp/demo',
      branch: 'feature/x',
      handoff_snapshot: '',
    }],
  },
});
// Inject log lines after build (snapshot switch only knows bundled files).
custom.harness.projects[0].logLines = many;
const escaped = OS.views.harness.render({ id: 'harness', sub: '', data: custom });
check('hostile project labels are escaped', /Demo &lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(escaped) && !/Demo <script>/.test(escaped));
check('only the last ten log lines render', (escaped.match(/<li>/g) || []).length === 10 && !/line 1 of a long log/.test(escaped) && !/line 2 of a long log/.test(escaped) && /line 3 of a long log/.test(escaped) && /line 12 of a long log/.test(escaped));

const empty = OS.views.harness.render({ id: 'harness', sub: '', data: { harness: { projects: [], status: [], note: '' }, sources: { harness: { from: 'tools/lavaall-ai/projects.json', label: 'Harness switcher' } } } });
check('empty project list shows an empty state with the source', /No projects are listed/.test(empty) && /Source: /.test(empty));

const logLines = osData.harnessLogLines('# Title\n\n## Log\n\nintro\n- one\n- two\n## Other\n- not a log\n', 10);
check('log parser keeps dash lines under Log and stops at the next heading', logLines.join('|') === '- one|- two');

const shipped = fs.readFileSync(path.join(root, 'api/os/index.js'), 'utf8');
check('app.js bundles harness.js after settings.js', /_client\/settings\.js[\s\S]*_client\/harness\.js[\s\S]*_client\/brain-graph\.js/.test(shipped));

const failed = results.filter((r) => !r.pass);
for (const r of results) process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}\n`);
process.stdout.write(`${results.length - failed.length}/${results.length} passed\n`);
if (failed.length) process.exit(1);
