'use strict';
const assert = require('node:assert/strict');
const { guidedHandoff, handoffPrompt, handoffSla } = require('../api/_chat/conversation');

for (const [language, channel, contact, topic, namePattern, receipt] of [
  ['fr', 'Email', 'visitor@example.org', 'Une installation pour notre atelier', /prénom/, "Merci, quelqu'un de l'équipe vous recontactera sous peu."],
  ['kr', 'WhatsApp', '077 123 456', 'Wi nid ɛp wit wi ofis nɛtwɔk', /fɔs ném/, 'Tɛnki. Sɔmbɔdi frɔm wi tim go rich yu sɔn.'],
]) {
  let session = { lastLanguage: language };
  const turn = (text, start) => {
    const reply = guidedHandoff(text, session, start, undefined, text === 'Confirm');
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
  const location = turn(topic);
  assert.equal(location.awaiting, 'handoff-location');
  assert.match(location.text, language === 'fr' ? /pays.*ville.*passer/i : /kɔntri.*siti.*skip/i);
  assert.equal(handoffPrompt(session), location.text);
  const organisation = turn(language === 'fr' ? '' : 'skip');
  assert.equal(organisation.awaiting, 'handoff-organisation');
  assert.match(organisation.text, language === 'fr' ? /organisation.*passer/i : /ɔganayzeshɔn.*skip/i);
  assert.deepEqual(organisation.chips, ['Skip', 'Cancel request']);
  const summary = turn('skip');
  assert.deepEqual(summary.chips, ['Confirm', 'Cancel']);
  assert.equal(handoffPrompt(session), summary.text);
  const confirmed = turn('Confirm');
  assert.equal(confirmed.text, receipt);
  assert.equal(confirmed.awaiting, null);
  assert.equal(confirmed.handoff, undefined);
  assert.equal(confirmed.handoffPayload.test, true);
  assert.equal(confirmed.handoffPayload.consent, true);
  assert.equal(confirmed.handoffPayload.fields.productOrService, topic);
  assert.equal(confirmed.handoffPayload.fields.email, language === 'fr' ? contact : '');
  if (language === 'kr') assert.equal(confirmed.handoffPayload.fields.phone, '+23277123456');
}
// Known location or organisation values bypass their optional questions.
for (const [slots, company, expected] of [
  [{ deliveryCountry: 'Liberia' }, 'Example school', 'handoff-confirm'],
  [{ deliveryCity: 'Freetown' }, 'Example school', 'handoff-confirm'],
  [{ deliveryCountry: 'Sierra Leone', deliveryCity: 'Bo' }, '', 'handoff-organisation'],
  [{}, 'Example school', 'handoff-location'],
]) {
  let session = { lastLanguage: 'en', slots, formDraft: { company } };
  const turn = (text, start) => {
    const reply = guidedHandoff(text, session, start, undefined, text === 'Confirm');
    session = { ...session, awaiting: reply.awaiting, handoffDraft: reply.handoffDraft };
    return reply;
  };
  turn('begin', true); turn('Email'); turn('visitor@example.org'); turn('Mariam Conteh');
  let reply = turn('Help with our office');
  assert.equal(reply.awaiting, expected);
  if (expected !== 'handoff-confirm') {
    reply = turn('');
    assert.equal(reply.awaiting, 'handoff-confirm', 'blank answer skips the remaining optional question');
  }
  const payload = turn('Confirm').handoffPayload;
  assert.equal(payload.country, slots.deliveryCountry || '');
  assert.equal(payload.city, slots.deliveryCity || '');
  assert.equal(payload.organisation, company);
}
assert.equal(handoffPrompt({ awaiting: 'unknown' }), null);
console.log('PASS French and Sierra Leone Krio channel-first handoff flows');
