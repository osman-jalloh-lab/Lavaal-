// Regression test for contact-router.gs's shared-secret check (SECURITY-AUDIT.md
// finding M3): a Script Property that is unset must REJECT requests, not
// silently accept them. Stubs only the Google services doPost touches before
// the auth gate, so a proceeding request fails loudly (never silently sends
// real mail) instead of needing full GmailApp/ContentService behavior.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'contact-router.gs'), 'utf8');

const results = [];
function check(name, cond, detail) { results.push({ name, pass: !!cond, detail }); }

function run(secretPropertyValue, payload) {
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (name) => (name === 'CONTACT_WEBHOOK_SECRET' ? secretPropertyValue : null),
    }),
  };
  global.ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (text) => ({ _text: text, setMimeType() { return this; } }),
  };
  global.GmailApp = { sendEmail: () => { throw new Error('GmailApp.sendEmail should not be reachable in this test'); } };
  eval(src);
  const e = { postData: { contents: JSON.stringify(payload) } };
  const out = doPost(e);
  return JSON.parse(out._text);
}

// 1. Secret Script Property unset (null) + attacker sends NO secret at all.
//    Old buggy code: `secret && payload.secret !== secret` short-circuits to
//    false when secret is falsy, so the check was skipped and this would have
//    gone on to call GmailApp.sendEmail (real mail sent, no auth at all).
{
  const res = run(null, { routeTo: 'support@lavaall.com', subject: 'x', message: 'x' });
  check('unset secret + no payload.secret -> rejected (forbidden), not sent', res.error === 'forbidden', JSON.stringify(res));
}

// 2. Secret Script Property unset (empty string) + attacker guesses a secret.
{
  const res = run('', { routeTo: 'support@lavaall.com', secret: 'guessed', subject: 'x', message: 'x' });
  check('empty-string secret + any payload.secret -> rejected (forbidden)', res.error === 'forbidden', JSON.stringify(res));
}

// 3. Secret configured, wrong secret supplied -> rejected.
{
  const res = run('real-secret-value', { routeTo: 'support@lavaall.com', secret: 'wrong', subject: 'x', message: 'x' });
  check('configured secret + wrong payload.secret -> rejected (forbidden)', res.error === 'forbidden', JSON.stringify(res));
}

// 4. Secret configured, correct secret supplied -> gate passes (proven by
//    reaching the routeTo validation past the gate, not by the generic
//    "not forbidden" absence check).
{
  const res = run('real-secret-value', { routeTo: 'not-a-real-alias@lavaall.com', secret: 'real-secret-value', subject: 'x', message: 'x' });
  check('configured secret + correct payload.secret -> passes gate (reaches routeTo validation)', res.error === 'invalid_route', JSON.stringify(res));
}

let failed = 0;
for (const r of results) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name + (r.pass ? '' : ` (${r.detail})`));
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
