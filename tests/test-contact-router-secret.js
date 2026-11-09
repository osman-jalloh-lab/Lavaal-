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

function run(scriptSecret, payload, opts = {}) {
  const sent = [];
  const logs = [];
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'CONTACT_WEBHOOK_SECRET' ? scriptSecret : null) }) },
    GmailApp: {
      createDraft: (to, subject, body, o) => { if (opts.sendError) throw new Error(opts.sendError); return { send: () => { sent.push({ to, subject, body, opts: o }); return { getThread: () => ({ moveToInbox() {}, addLabel() {} }) }; } }; },
      getUserLabelByName: () => ({}),
      createLabel: () => ({}),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() {} }) },
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) },
    Logger: { log: (...a) => logs.push(a.join(' ')) },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const contents = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const out = sandbox.doPost({ postData: { contents } });
  return { text: out.text, body: JSON.parse(out.text), sent, logs };
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
// L1: a blank, whitespace-only or short Script Property counts as unset (fail closed, no send).
const S15 = 'abcdefghijklmno';
[['whitespace-only', '                    '], ['15 chars', S15], ['15 chars plus padding', '   ' + S15 + '   \t\n']].forEach(([label, prop]) => {
  r = run(prop, Object.assign({ secret: prop }, GOOD));
  check(`Script Property ${label} -> not_configured even with a matching payload secret, no mail sent`, r.body.ok === false && r.body.error === 'not_configured' && r.sent.length === 0);
});
const S16 = 'abcdefghijklmnop';
r = run(S16, Object.assign({ secret: S16 }, GOOD));
check('16-char Script Property + matching payload secret -> ok:true, one mail', r.body.ok === true && r.sent.length === 1);
r = run(S16, Object.assign({ secret: S16 + ' ' }, GOOD));
check('16-char Script Property + payload secret with extra space -> forbidden (no trimming of the payload)', r.body.ok === false && r.body.error === 'forbidden' && r.sent.length === 0);

// Internal errors: generic response, scrubbed server-side log.
const PII = { name: 'Zed Quimby', email: 'zed.quimby@example.net', phone: '+232 76 555 0199', message: 'Need 40 units of model QX-77 by Friday', company: 'Quimby Imports' };
const leakMsg = 'Invalid argument: ' + PII.email + ' for ' + PII.name + ' tel ' + PII.phone + ' re "' + PII.message + '"';
r = run(S, Object.assign({ secret: S }, GOOD, PII), { sendError: leakMsg });
const logText = r.logs.join('\n');
const piiVals = Object.values(PII).concat([S]);
check('send failure -> {ok:false, error:internal_error}, no mail sent', r.body.ok === false && r.body.error === 'internal_error' && r.sent.length === 0);
check('send failure -> response carries no raw error text or request value', !/Invalid argument|Error:|stack|\bat \w/.test(r.text) && piiVals.every((v) => !r.text.includes(v)) && Object.keys(r.body).sort().join() === 'error,ok');
check('send failure -> one server-side log line with the error name/message/stack', r.logs.length === 1 && /contact_router_error/.test(logText) && /Invalid argument/.test(logText) && /"name":"Error"/.test(logText) && /"stack":/.test(logText));
check('send failure -> the log carries no name, email, phone, message, company or secret', piiVals.every((v) => !logText.includes(v)) && !/zed\.quimby|Quimby|0199|QX-77/.test(logText));
r = run(S, '{"secret":"' + S + '","email":"' + PII.email + '", broken');
check('malformed JSON -> internal_error, no raw text back, and no body fragment or email in the log', r.body.error === 'internal_error' && r.body.ok === false && !r.text.includes('JSON') && !logText.includes(S) && !r.logs.join('\n').includes(PII.email) && !r.logs.join('\n').includes(S));
check('api/contact.js logs the router\'s internal_error / not_configured keys by name (still a failed delivery)', /\['forbidden', 'invalid_route', 'server_error', 'internal_error', 'not_configured'\]\.includes\(j\.error\)/.test(fs.readFileSync(path.join(root, 'api/contact.js'), 'utf8')));
check('the router no longer returns String(err) to the caller', !/message:\s*String\(err\)/.test(src));

const doc = fs.readFileSync(path.join(root, 'scripts/email-router/APPS-SCRIPT-UPDATE.md'), 'utf8');
check('APPS-SCRIPT-UPDATE.md tells Osman to confirm the Script Property first and carries the same block', /every form submission will fail/.test(doc) && doc.includes("return jsonOut({ ok: false, error: 'not_configured' }, 503);"));
check('APPS-SCRIPT-UPDATE.md says the secret must be at least 16 characters and carries the same checks as the router', /at least 16 characters/.test(doc) && doc.includes("if (!secret || String(secret).trim().length < 16) {") && src.includes("if (!secret || String(secret).trim().length < 16) {"));
check('APPS-SCRIPT-UPDATE.md carries the generic-error catch and the log scrubber', doc.includes("return jsonOut({ ok: false, error: 'internal_error' }, 500);") && doc.includes('function logRouterError_(err, e, payload, secret) {'));

const failed = results.filter((x) => !x.pass);
results.forEach((x) => console.log(`${x.pass ? 'ok  ' : 'FAIL'} ${x.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
