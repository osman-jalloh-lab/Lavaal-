'use strict';
const assert = require('node:assert/strict');
const { guidedHandoff, handoffPrompt, handoffSla } = require('../api/_chat/conversation');

for (const [language, channel, contact, topic, namePattern, receipt] of [
  ['fr', 'Email', 'visitor@example.org', 'Une installation pour notre atelier', /prénom/, "Merci, quelqu'un de l'équipe vous recontactera sous peu."],
  ['kr', 'WhatsApp', '077 123 456', 'Wi nid ɛp wit wi ofis nɛtwɔk', /fɔs ném/, 'Tɛnki. Sɔmbɔdi frɔm wi tim go rich yu sɔn.'],
]) {
  let session = { lastLanguage: language };
  const turn = (text, start) => {
    const reply = guidedHandoff(text, session, start);
    assert.equal(reply.language, language);
    assert.ok((reply.text.match(/\?/g) || []).length <= 1);
    session = { ...session, awaiting: reply.awaiting, handoffDraft: reply.handoffDraft };
    return reply;
  };
  const initial = turn('begin', true);
  assert.deepEqual(initial.chips, ['WhatsApp', 'Email']);
  assert.ok(initial.text.includes(handoffSla(language)));
  assert.equal(handoffPrompt(session), language === 'fr' ? 'WhatsApp ou e-mail ?' : 'Yu WhatsApp ɔ ɛmail?');
  assert.equal(turn(channel).awaiting, 'handoff-contact');
  assert.equal(turn('invalid').awaiting, 'handoff-contact');
  assert.match(turn(contact).text, namePattern);
  assert.equal(turn('Mariam Conteh').awaiting, 'handoff-topic');
  const summary = turn(topic);
  assert.deepEqual(summary.chips, ['Confirm', 'Cancel']);
  assert.equal(handoffPrompt(session), summary.text);
  const confirmed = turn('Confirm');
  assert.equal(confirmed.text, receipt);
  assert.equal(confirmed.awaiting, null);
  assert.equal(confirmed.handoff, undefined);
  assert.equal(confirmed.handoffPayload.test, true);
  assert.equal(confirmed.handoffPayload.fields.productOrService, topic);
  assert.equal(confirmed.handoffPayload.fields.email, language === 'fr' ? contact : '');
  if (language === 'kr') assert.equal(confirmed.handoffPayload.fields.phone, '+23277123456');
}
assert.equal(handoffPrompt({ awaiting: 'unknown' }), null);
console.log('PASS French and Sierra Leone Krio channel-first handoff flows');
