'use strict';
// Country step of the talk-to-someone handoff, end to end through the real chat service:
// numeric answers resolve from the static dialling-code table, shared codes get chips, unknown codes a
// polite re-ask, and country names keep working. Stub model and transport throw if ever called.
const assert = require('node:assert/strict');
const { createService } = require('../api/_chat/service');
const { memoryStore } = require('../api/_chat/store');
const { respond } = require('../api/_chat/responder');
const { handoffChips, handoffPrompt } = require('../api/_chat/conversation');

const LOCATION = 'Which country and city are you in? You can skip this.';
const ORGANISATION = 'What organisation are you with? You can skip this.';
const UNKNOWN = "I couldn't match that number to a country. Could you type your country name, or the country code (for example +232)? You can also skip this.";
const NAME_ASK = 'Which country are you in? Please type its name.';
const CLOSE = "Thanks, we've got your message. Someone from our team will reply by WhatsApp or email within 1 business day (Monday to Friday).";
const REFUSAL = /we (?:do not|don't) (?:have|serve|cover)|not available|not supported|no such country/i;
const NOW = Date.UTC(2026, 10, 19, 18);
let modelCalls = 0, transportCalls = 0, cases = 0;
const chat = async () => { modelCalls++; throw Error('Model must never be called'); };
const transport = async () => { transportCalls++; throw Error('Transport must never be called'); };

async function fixture() {
  const store = memoryStore();
  const service = createService({ store, now: () => NOW, salt: 'TEST ONLY salt', chat, transport, previewDebug: true, previewLimits: true });
  const session = await service.start('TEST ONLY visitor');
  let event = 0;
  const turn = text => service.turn(session.sessionId, session.proof, 'country_' + ++event, undefined, session.csrf, text, { privacyConsent: text === 'Confirm' });
  const context = () => store.transaction(rows => rows.get('s:' + session.sessionId).context);
  const records = () => store.transaction(rows => [...rows].filter(([key]) => key.startsWith('test-handoff:')));
  return { turn, context, records };
}
async function toLocation(f) {
  await f.turn('I want to speak to someone on your team');
  await f.turn('WhatsApp');
  await f.turn('+232 76 000 000');
  await f.turn('Ada Test');
  const location = await f.turn('a laptop order for our office');
  assert.equal(location.text, LOCATION);
  return location;
}
async function finish(f) {
  const organisation = await f.turn('Skip');
  assert.match(organisation.text, /^Please confirm your details:/);
  const close = await f.turn('Confirm');
  assert.equal(close.text, CLOSE);
  const saved = await f.records();
  assert.equal(saved.length, 1);
  return saved[0][1].payload;
}

async function main() {
  // 232 → "+232 is Sierra Leone. Is that right?" → Yes → organisation; payload carries the name.
  {
    const f = await fixture();
    await toLocation(f);
    const confirm = await f.turn('232');
    assert.equal(confirm.text, '+232 is Sierra Leone. Is that right?');
    assert.deepEqual(confirm.chips, ['Yes', 'Another country', 'Skip', 'Cancel request']);
    assert.equal((await f.context()).awaiting, 'handoff-location-confirm');
    const next = await f.turn('Yes');
    assert.equal(next.text, ORGANISATION);
    assert.equal((await f.context()).handoffDraft.country, 'Sierra Leone');
    assert.equal((await f.context()).handoffDraft.countryChoices, undefined);
    const payload = await finish(f);
    assert.equal(payload.country, 'Sierra Leone');
    cases++;
  }
  // Every format of the Sierra Leone code, with a city after the comma, and tapping the country name.
  for (const input of ['+232', '00232', '+23276123456', '0023276123456', '+232 76 123456', '232, Freetown', '0023276123456, Bo']) {
    const f = await fixture();
    await toLocation(f);
    const confirm = await f.turn(input);
    assert.equal(confirm.text, '+232 is Sierra Leone. Is that right?', input);
    assert.ok(!(confirm.events || []).some(event => String(event).startsWith('blocked-sensitive')), input);
    await f.turn('Sierra Leone');
    const draft = (await f.context()).handoffDraft;
    assert.equal(draft.country, 'Sierra Leone', input);
    assert.equal(draft.city, input.includes(',') ? input.split(',')[1].trim() : '', input);
    cases++;
  }
  // +1 → chips; tapping Canada sets Canada. Typed name of a +1 country not shown as a chip also works.
  for (const [pick, expected] of [['Canada', 'Canada'], ['United States', 'United States'], ['barbados', 'Barbados']]) {
    const f = await fixture();
    await toLocation(f);
    const chips = await f.turn('+1');
    assert.equal(chips.text, '+1 is used by more than one country. Which one are you in?');
    assert.deepEqual(chips.chips, ['United States', 'Canada', 'Jamaica', 'Trinidad & Tobago', 'Other', 'Cancel request']);
    assert.equal((await f.context()).awaiting, 'handoff-location-confirm');
    assert.equal((await f.turn(pick)).text, ORGANISATION);
    assert.equal((await f.context()).handoffDraft.country, expected);
    cases++;
  }
  // +7 and +44 chips list their countries.
  for (const [input, chips] of [['+7', ['Russia', 'Kazakhstan', 'Other', 'Skip']], ['+44', ['United Kingdom', 'Guernsey', 'Isle of Man', 'Jersey', 'Other']]]) {
    const f = await fixture();
    await toLocation(f);
    const reply = await f.turn(input);
    assert.deepEqual(reply.chips, chips.concat('Cancel request'));
    assert.ok(reply.chips.length <= 6);
    cases++;
  }
  // A full number that the metadata decides goes straight to a single-country confirm.
  {
    const f = await fixture();
    await toLocation(f);
    assert.equal((await f.turn('+1 416 555 0123')).text, '+1 is Canada. Is that right?');
    cases++;
  }
  // Other → type a name; "No" at the confirm means another country, not cancel; Skip skips.
  {
    const f = await fixture();
    await toLocation(f);
    await f.turn('+1');
    const other = await f.turn('Other');
    assert.equal(other.text, NAME_ASK);
    assert.deepEqual(other.chips, ['Skip', 'Cancel request']);
    assert.equal((await f.turn('Ghana')).text, ORGANISATION);
    assert.equal((await f.context()).handoffDraft.country, 'Ghana');
    cases++;
  }
  {
    const f = await fixture();
    await toLocation(f);
    await f.turn('232');
    const no = await f.turn('No');
    assert.equal(no.text, NAME_ASK);
    assert.equal((await f.context()).awaiting, 'handoff-location');
    assert.equal((await f.turn('+233')).text, '+233 is Ghana. Is that right?');
    cases++;
  }
  {
    const f = await fixture();
    await toLocation(f);
    await f.turn('+44');
    assert.equal((await f.turn('skip')).text, ORGANISATION);
    const payload = await finish(f);
    assert.equal(payload.country, '');
    cases++;
  }
  {
    const f = await fixture();
    await toLocation(f);
    await f.turn('+7');
    const cancel = await f.turn('Cancel request');
    assert.equal(cancel.text, 'Request cancelled. What else can I help with?');
    assert.equal((await f.context()).awaiting, null);
    cases++;
  }
  // A different number or a typed name at the confirm step is a fresh answer.
  {
    const f = await fixture();
    await toLocation(f);
    await f.turn('+1');
    assert.equal((await f.turn('224')).text, '+224 is Guinea. Is that right?');
    assert.equal((await f.turn('Liberia, Monrovia')).text, ORGANISATION);
    const draft = (await f.context()).handoffDraft;
    assert.deepEqual([draft.country, draft.city], ['Liberia', 'Monrovia']);
    cases++;
  }
  // Unknown codes and junk: polite re-ask, stays on the country question, nothing stored.
  for (const input of ['999', '+999', '+800', '076 123456', '++232', '0']) {
    const f = await fixture();
    await toLocation(f);
    const reply = await f.turn(input);
    assert.equal(reply.text, UNKNOWN, input);
    assert.doesNotMatch(reply.text, REFUSAL);
    assert.deepEqual(reply.chips, ['Skip', 'Cancel request']);
    const context = await f.context();
    assert.equal(context.awaiting, 'handoff-location');
    assert.equal(context.handoffDraft.country, '');
    assert.equal((await f.turn(input)).text, UNKNOWN, input + ' twice');
    assert.equal((await f.turn('232')).text, '+232 is Sierra Leone. Is that right?');
    cases++;
  }
  // Country names keep the existing behaviour exactly.
  for (const [input, country, city] of [['Ghana', 'Ghana', ''], ['Sierra Leone, Freetown', 'Sierra Leone', 'Freetown'], ['Mongolia', 'Mongolia', '']]) {
    const f = await fixture();
    await toLocation(f);
    assert.equal((await f.turn(input)).text, ORGANISATION);
    const draft = (await f.context()).handoffDraft;
    assert.deepEqual([draft.country, draft.city], [country, city]);
    cases++;
  }
  // A real card number is still screened at the country step.
  {
    const f = await fixture();
    await toLocation(f);
    const card = await f.turn('+232, 4111 1111 1111 1111');
    assert.ok(card.events === undefined || !card.text.includes('Sierra Leone'));
    assert.match(card.text, /Please don't share payment cards/);
    cases++;
  }

  // Resumed session: chips and prompt for the new state come from the server-side draft.
  const pickDraft = { language: 'en', countryCode: '1', countryChoices: [{ region: 'US', name: 'United States' }, { region: 'CA', name: 'Canada' }] };
  assert.deepEqual(handoffChips({ awaiting: 'handoff-location-confirm', handoffDraft: pickDraft }), ['United States', 'Canada', 'Other', 'Skip', 'Cancel request']);
  assert.equal(handoffPrompt({ awaiting: 'handoff-location-confirm', handoffDraft: pickDraft }), '+1 is used by more than one country. Which one are you in?');
  const oneDraft = { language: 'en', countryCode: '232', countryChoices: [{ region: 'SL', name: 'Sierra Leone' }] };
  assert.equal(handoffPrompt({ awaiting: 'handoff-location-confirm', handoffDraft: oneDraft }), '+232 is Sierra Leone. Is that right?');
  assert.deepEqual(handoffChips({ awaiting: 'handoff-location', handoffDraft: {} }), ['Skip', 'Cancel request']);
  // A chip label that was not offered is not accepted as a choice.
  const forged = respond('Atlantis', { awaiting: 'handoff-location-confirm', lastTopic: 'handoff-intake', handoffDraft: { ...oneDraft, kind: 'person', name: 'Ada Test', contact: '+23276000000', topic: 'x' } });
  assert.equal(forged.handoffDraft.country, 'Atlantis'); // typed text keeps the text path, never a code lookup result
  cases++;

  // French copy.
  const fr = respond('232', { awaiting: 'handoff-location', lastTopic: 'handoff-intake', lastLanguage: 'fr', handoffDraft: { language: 'fr', kind: 'person', name: 'Ada Test', contact: '+23276000000', topic: 'x' } });
  assert.equal(fr.text, 'L’indicatif +232 correspond à : Sierra Leone. Est-ce exact ?');
  cases++;

  // Second prompt: "Which country are you in?" after the coverage answer.
  {
    const f = await fixture();
    const coverage = await f.turn('Where do you operate?');
    assert.match(coverage.text, /Which country are you in\?$/);
    const sl = await f.turn('232');
    assert.match(sl.text, /^\+232 is Sierra Leone\. Yes, we work in \*\*Sierra Leone\*\*\./);
    cases++;
  }
  {
    const f = await fixture();
    await f.turn('Where do you operate?');
    const pick = await f.turn('+1');
    assert.equal(pick.text, '+1 is used by more than one country. Which one are you in?');
    assert.deepEqual(pick.chips, ['United States', 'Canada', 'Jamaica', 'Trinidad & Tobago', 'Talk to someone']);
    const canada = await f.turn('Canada');
    assert.match(canada.text, /^You chose Canada\. We operate in \*\*Sierra Leone\*\*/);
    cases++;
  }
  {
    const f = await fixture();
    await f.turn('Where do you operate?');
    const bad = await f.turn('999');
    assert.equal(bad.text, "I couldn't match that number to a country. Could you type your country name, or the country code (for example +232)?");
    assert.doesNotMatch(bad.text, REFUSAL);
    const gw = await f.turn('245');
    assert.match(gw.text, /^\+245 is Guinea-Bissau\./);
    cases++;
  }
  // Without the coverage question, a bare number keeps its old meaning (quantity etc.).
  assert.doesNotMatch(respond('232', {}).text, /Sierra Leone/);
  cases++;

  assert.equal(modelCalls, 0, 'no model call on the country step');
  assert.equal(transportCalls, 0, 'no transport call');
  console.log('test-chat-country-step: ' + cases + ' flow cases passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
