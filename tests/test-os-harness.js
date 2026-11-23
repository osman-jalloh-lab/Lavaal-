// LAVAALL OS Harness view: grouped project picker, type-and-send chat,
// usage Home, no Gemini, no copy-command. Secrets never render.
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
check('nav about is type-and-send, Gemini off', /Type a request/.test(OS.nav.find((n) => n.id === 'harness').about) && !/Gemini/.test(OS.nav.find((n) => n.id === 'harness').about.replace('Gemini is off.', '')));

const SECRET = 'harness-secret-value-should-never-render-12345';
const data = osData.buildOsData({ store: {} }, { env: { GEMINI_API_KEY: SECRET, DEEPSEEK_API_KEY: '', OPENAI_API_KEY: SECRET, ANTHROPIC_API_KEY: '' } });
OS.data = data;

check('os data includes salonehire and the lavaall umbrella project', data.harness && data.harness.projects.some((p) => p.name === 'salonehire') && data.harness.projects.some((p) => p.name === 'lavaall'));
check('projects are grouped as LAVAALL, SaloneWorks, Starlink, and SaloneHire', Boolean(data.harness.groups) && data.harness.groups.map((g) => g.id).join(',') === 'lavaall,saloneworks,starlink,salonehire');
check('LAVAALL group lists the vault sub-projects plus the umbrella', (data.harness.groups.find((g) => g.id === 'lavaall') || { projects: [] }).projects.length >= 15);
check('harness source is live when a project is bundled', data.sources.harness && data.sources.harness.live === true && /projects\.json/.test(data.sources.harness.from));
check('gemini is not a visible status row', !(data.harness.status || []).some((s) => s.id === 'gemini'));
check('codex shows key present without the secret, claude and deepseek show key missing', data.harness.status.find((s) => s.id === 'codex').detail === 'OpenAI API key present' && data.harness.status.find((s) => s.id === 'claude').state === 'missing' && data.harness.status.find((s) => s.id === 'deepseek').state === 'missing');
check('page data never includes the API key value', !JSON.stringify(data.harness).includes(SECRET));

const html = OS.views.harness.render({ id: 'harness', sub: '', data });
check('page heading is Harness', /<h1>Harness<\/h1>/.test(html));
check('explains real capabilities and that Gemini is off', /Connected provider APIs can answer here/.test(html) && /Gemini is off/.test(html));
check('Home and Chat tabs are present', /data-harness-tab="home"/.test(html) && /data-harness-tab="chat"/.test(html));
check('group picker lists the four groups', /id="harness-group"/.test(html) && /value="lavaall"/.test(html) && /LAVAALL/.test(html) && /SaloneWorks/.test(html) && /Starlink/.test(html) && /SaloneHire/.test(html));
check('project dropdown includes SaloneHire', /id="harness-project"/.test(html) && /value="salonehire"/.test(html) && /SaloneHire/.test(html));
check('four visible harness buttons, Gemini off', /data-harness="codex"/.test(html) && /data-harness="claude"/.test(html) && /data-harness="deepseek"/.test(html) && /data-harness="grok"/.test(html) && !/data-harness="gemini"/.test(html));
check('no copy-command UI', !/id="harness-copy"/.test(html) && !/Copy command/.test(html) && !/lavaall-ai codex/.test(html));
check('Claude model picker defaults to Sonnet and offers Haiku and Opus', /id="harness-model"/.test(html) && /value="sonnet" selected/.test(html) && /value="haiku"/.test(html) && /value="opus"/.test(html));
check('composer lets the founder type a request and send it', /id="harness-form"/.test(html) && /id="harness-input"/.test(html) && /id="harness-send">Send</.test(html));
check('usage home is present', /id="harness-usage"/.test(html) && /Usage and credit/.test(html));
check('Codex setup mentions OPENAI_API_KEY and local codex login', /OPENAI_API_KEY/.test(html) && /codex login/.test(html));
check('rendered HTML does not contain the API key', !html.includes(SECRET));
const harnessSrc = fs.readFileSync(path.join(root, 'api/os/_client/harness.js'), 'utf8');
check('no inline handlers; harness fetch is same-origin /ops/harness/ only', !/\son[a-z]+\s*=/i.test(html) && /window\.fetch\(/.test(harnessSrc) && /\/ops\/harness\//.test(harnessSrc) && /credentials(?:\s*:\s*|\s*=\s*)'same-origin'/.test(harnessSrc) && !/https?:\/\//.test(harnessSrc.replace(/\/\*[\s\S]*?\*\//, '')));

const custom = osData.buildOsData({ store: {} }, {
  env: {},
  harnessPack: {
    groups: [{ id: 'demo', label: 'Demo <script>alert(1)</script>' }],
    projects: [{
      name: 'demo',
      label: 'Demo <script>alert(1)</script>',
      group: 'demo',
      category: 'Test',
      repo: '/tmp/demo',
      branch: 'feature/x',
      handoff_snapshot: '',
    }],
  },
});
const escaped = OS.views.harness.render({ id: 'harness', sub: '', data: custom });
check('hostile project and group labels are escaped', /Demo &lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(escaped) && !/Demo <script>/.test(escaped));

const empty = OS.views.harness.render({ id: 'harness', sub: '', data: { harness: { projects: [], groups: [], status: [], note: '' }, sources: { harness: { from: 'tools/lavaall-ai/projects.json', label: 'Harness chat' } } } });
check('empty project list shows an empty state with the source', /No projects are listed/.test(empty) && /Source: /.test(empty));

const logLines = osData.harnessLogLines('# Title\n\n## Log\n\nintro\n- one\n- two\n## Other\n- not a log\n', 10);
check('log parser keeps dash lines under Log and stops at the next heading', logLines.join('|') === '- one|- two');

const shipped = fs.readFileSync(path.join(root, 'api/os/index.js'), 'utf8');
check('app.js bundles harness.js after settings.js', /_client\/settings\.js[\s\S]*_client\/harness\.js[\s\S]*_client\/brain-graph\.js/.test(shipped));
check('ops dispatches /ops/harness through handleHarnessChat', /handleHarnessChat/.test(fs.readFileSync(path.join(root, 'api/ops/index.js'), 'utf8')));

const failed = results.filter((r) => !r.pass);
for (const r of results) process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}\n`);
process.stdout.write(`${results.length - failed.length}/${results.length} passed\n`);
if (failed.length) process.exit(1);
