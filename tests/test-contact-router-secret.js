#!/usr/bin/env node
// contact-router.gs secret check fails closed (GRC review 2026-11-09, F5 router part).
// Runs the Apps Script source in a Node vm with mocked PropertiesService / GmailApp /
// ContentService. No network, no Google call, never touches the live router.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'scripts/email-router/contact-router.gs'), 'utf8');
const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });

function run(scriptSecret, payload) {
  const sent = [];
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'CONTACT_WEBHOOK_SECRET' ? scriptSecret : null) }) },
    GmailApp: {
      createDraft: (to, subject, body, opts) => ({ send: () => { sent.push({ to, subject, body, opts }); return { getThread: () => ({ moveToInbox() {}, addLabel() {} }) }; } }),
      getUserLabelByName: () => ({}),
      createLabel: () => ({}),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() {} }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const out = sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });
  return { body: JSON.parse(out.text), sent };
}

const GOOD = { routeTo: 'support@lavaall.com', subject: 'Test', name: 'Test Buyer', email: 'test.buyer@example.com', message: 'hi' };
const S = 'test-secret-not-real-0001';

let r = run(null, Object.assign({ secret: S }, GOOD));
check('Script Property unset -> ok:false not_configured, no mail sent', r.body.ok === false && r.body.error === 'not_configured' && r.sent.length === 0);
r = run('', Object.assign({ secret: '' }, GOOD));
check('Script Property empty and payload secret empty -> refused, no mail sent', r.body.ok === false && r.sent.length === 0);
r = run(null, GOOD);
check('Script Property unset and no payload secret -> refused, no mail sent (was: sent)', r.body.ok === false && r.sent.length === 0);
r = run(S, GOOD);
check('secret set, payload missing secret -> ok:false forbidden, no mail sent', r.body.ok === false && r.body.error === 'forbidden' && r.sent.length === 0);
r = run(S, Object.assign({ secret: S + 'x' }, GOOD));
check('secret set, wrong payload secret -> forbidden, no mail sent', r.body.ok === false && r.body.error === 'forbidden' && r.sent.length === 0);
r = run(S, Object.assign({ secret: [S] }, GOOD));
check('secret set, non-string payload secret -> forbidden, no mail sent', r.body.ok === false && r.sent.length === 0);
r = run(S, Object.assign({ secret: S }, GOOD));
check('secret set, matching payload secret -> ok:true and exactly one mail to support@', r.body.ok === true && r.sent.length === 1 && r.sent[0].to === 'support@lavaall.com');
r = run(S, Object.assign({ secret: S }, GOOD, { routeTo: 'attacker@example.com' }));
check('matching secret still cannot route outside the alias allowlist', r.body.error === 'invalid_route' && r.sent.length === 0);
check('the fail-open form `if (secret && ...)` is gone from the router source', !/if\s*\(\s*secret\s*&&/.test(src));
const doc = fs.readFileSync(path.join(root, 'scripts/email-router/APPS-SCRIPT-UPDATE.md'), 'utf8');
check('APPS-SCRIPT-UPDATE.md tells Osman to confirm the Script Property first and carries the same block', /every form submission will fail/.test(doc) && doc.includes("return jsonOut({ ok: false, error: 'not_configured' }, 503);"));

const failed = results.filter((x) => !x.pass);
results.forEach((x) => console.log(`${x.pass ? 'ok  ' : 'FAIL'} ${x.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
