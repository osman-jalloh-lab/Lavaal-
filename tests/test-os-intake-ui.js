'use strict';
// /os "Approve intake" card (PR #105): decode a pending intake link, show only documented fields
// (escaped), and approve through the founder-session route. No network.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const osData = require(path.join(root, 'api/ops/_os_data.js'));
const win = { atob: s => Buffer.from(s, 'base64').toString('binary') };
const sandbox = { window: win, TextDecoder, Uint8Array, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } }, location: { hash: '' }, navigator: {}, setTimeout: () => 0, setInterval: () => 0, Intl };
vm.createContext(sandbox);
for (const f of ['core.js', 'harness.js']) vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f });
const OS = win.OS; const ui = OS.intakeReview;
const link = obj => '?intake=' + Buffer.from(JSON.stringify(obj)).toString('base64url');
const intake = { schema_version: 2, idempotency_key: 'intake-smoke-2211-ui1', source: 'business_assistant', project: { name: 'intake-smoke-test-2211', description: 'Synthetic <script>alert(1)</script>', business_objective: 'Verify', required_functionality: ['One'], acceptance_criteria: ['Two'], proposed_next_task: 'Nothing' } };
// Decode
assert.deepEqual(JSON.parse(JSON.stringify(ui.decode(link(intake)))), intake);
assert.equal(ui.decode('?other=1'), null);
assert.equal(ui.decode('?intake=@@@'), null);
assert.equal(ui.decode('?intake=bm90LWpzb24').invalid, true);
// Review + render: escaped, Approve button present
const ok = ui.review(intake); assert.equal(ok.ok, true);
const html = ui.html(ok);
assert(html.includes('&lt;script&gt;') && !html.includes('<script>'), 'intake text must be escaped');
assert(/id="harness-intake-approve"/.test(html)); assert(/Project/.test(html) && /intake-smoke-test-2211/.test(html));
// Unknown fields or an approval_id inside the link: shown as not approvable, no button
for (const bad of [{ ...intake, extra: 1 }, { ...intake, approval_id: 'appr-x' }, { ...intake, project: { ...intake.project, client_email: 'x' } }, { invalid: true }, {}]) {
  const r = ui.review(bad); assert.equal(r.ok, false); assert(!/harness-intake-approve/.test(ui.html(r)));
}
// The card is in the view markup, hidden by default; existing sections unchanged
const data = osData.buildOsData({ store: {} }, { env: {} });
OS.data = data;
const view = OS.views.harness.render({ id: 'harness', sub: '', data });
assert(/<section class="harness-execution hidden" id="harness-intake">/.test(view));
assert(/id="harness-goals"/.test(view) && /id="harness-execution"/.test(view));
// The Approve click goes to the same-origin founder route with the exact payload; never to the intake endpoint.
const src = fs.readFileSync(path.join(root, 'api/os/_client/harness.js'), 'utf8');
assert(/api\('approvals', \{ method: 'POST', body: JSON\.stringify\(\{ action: 'intake_create', payload: intakePayload \}\) \}\)/.test(src));
assert(!/ingest\/project-intake/.test(src));
console.log('test-os-intake-ui: PASS');
