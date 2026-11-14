'use strict';
const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');
const { shouldSkipModel, postEnforce } = require('../api/_chat/llm-responder');
const { createService } = require('../api/_chat/service');
const { memoryStore } = require('../api/_chat/store');
const { SERVICE_SLA } = require('../api/_chat/conversation');

function noPrices(text) {
  assert.doesNotMatch(text, /\$|USD\s*\d|priced at|costs?\s+\d/i);
}

function noBleed(text) {
  assert.doesNotMatch(text, /iPhone 17|Cases & Screen Protectors|epson|printer|Inquiry type|Your budget/i);
}

const sla = 'Someone from our team will get back to you within 24 hours.';
assert.equal(SERVICE_SLA, sla);

const order = respond('How do I get help with an existing order?');
assert.equal(shouldSkipModel(order), 'service-help');
assert.match(order.text, /existing order/i);
assert.match(order.text, /\*\*existing order\*\*/);
assert.match(order.text, /support@lavaall\.com/);
assert.match(order.text, /\+1 \(737\) 704-4182/);
assert.match(order.text, /I can help you fill out a quick form/);
assert.match(order.text, /\[request form\]\(#signup\)/);
assert.match(order.text, new RegExp(sla.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.deepEqual(order.chips, ['Fill out a form', 'Talk to someone']);
assert.equal(order.awaiting, 'form-offer');
assert.doesNotMatch(order.text, /iPhone|Camon|Cases & Screen/i);
noPrices(order.text);
noBleed(order.text);
assert.ok((order.text.match(/[.!?]/g) || []).length <= 8);

const wholesale = respond('How do you handle wholesale requests?');
assert.equal(shouldSkipModel(wholesale), 'service-help');
assert.match(wholesale.text, /\*\*wholesale\*\*/);
assert.match(wholesale.text, /support@lavaall\.com/);
assert.match(wholesale.text, /I can help you fill out a quick form/);
assert.match(wholesale.text, /Someone from our team will get back to you within 24 hours\./);
assert.doesNotMatch(wholesale.text, /iPhone|Camon|50 |volume requests; I cannot promise stock/i);
noPrices(wholesale.text);

const availability = respond('Can the team confirm product availability?', wholesale);
assert.equal(availability.reset, true);
assert.equal(availability.lastTopic, 'service-availability');
assert.match(availability.text, /confirm product availability/i);
assert.match(availability.text, /I cannot confirm stock here/);
assert.match(availability.text, /Someone from our team will get back to you within 24 hours\./);
assert.doesNotMatch(availability.text, /wholesale/i);
assert.doesNotMatch(availability.text, /iPhone|Camon/i);
noPrices(availability.text);

const start = respond('Fill out a form', order);
assert.equal(shouldSkipModel(start), 'handoff-intake');
assert.equal(start.text, 'WhatsApp or email?');
assert.deepEqual(start.chips, ['WhatsApp', 'Email']);
const channel = respond('Email', start);
assert.equal(channel.text, 'What is your email address?');
const reached = respond('ada@example.com', channel);
assert.equal(reached.text, 'Can I get your first and last name?');
const named = respond('Ada Test', reached);
assert.deepEqual(named.chips, ['Confirm', 'Cancel']);
const done = respond('Confirm', named);
assert.equal(done.text, 'Thank you, someone from our team will reach out to you shortly.');
assert.doesNotMatch(done.text, /Preview inquiry delivery is off/i);
noPrices(done.text);

const phone = respond('want phone');
assert.equal(shouldSkipModel(phone), 'category-guide');
// Category display names retain the catalogue casing (FIXES2).
assert.match(phone.text, /Yes, we have \*\*Phones\*\*\. Which brand\?/);
assert.ok(phone.chips.includes('Samsung'));
assert.ok(phone.chips.includes('iPhone'));
assert.doesNotMatch(phone.chips.join(' | '), /Cases & Screen Protectors/i);
assert.doesNotMatch(phone.text, /Cases & Screen Protectors|Camon 20/i);
noPrices(phone.text);

const bare = respond('phone');
assert.match(bare.text, /Yes, we have \*\*Phones\*\*/);
assert.ok(bare.chips.includes('Samsung') && bare.chips.includes('iPhone'));

const samsung = respond('Samsung', phone);
assert.match(samsung.text, /\*\*Samsung\*\*/);
assert.ok(samsung.chips.some(name => /Galaxy/.test(name)));
assert.doesNotMatch(samsung.text, /iPhone 16|Cases & Screen/i);
noPrices(samsung.text);

const model = respond('Galaxy S23', samsung);
assert.match(model.text, /What color are you looking for\?/);
assert.ok(model.chips.includes('Cream') || model.chips.includes('Phantom Black'));
const color = respond('Cream', model);
assert.match(color.text, /Galaxy S23 in Cream\. We list it; our team confirms stock with your quote/);
const missingColor = respond('hot pink', model);
assert.match(missingColor.text, /Someone from our team will get back to you within 24 hours/);
assert.doesNotMatch(missingColor.text, /source it, let us check/i);
noPrices(missingColor.text);

const charger = respond('charger');
assert.match(charger.text, /We list it; our team confirms stock with your quote/);
assert.match(charger.text, /Chargers & Charging Cables/);
assert.deepEqual(charger.chips, ['Chargers & Charging Cables']);
noPrices(charger.text);

const missing = respond('want hoverboard');
assert.match(missing.text, /Someone from our team will get back to you within 24 hours/);
assert.match(missing.text, /quick form/i);
assert.match(missing.text, /within 24 hours/);
assert.ok(missing.chips.includes('Fill out a form'));
noPrices(missing.text);

const iphone = respond('I want an iPhone');
assert.equal(shouldSkipModel(iphone), 'product-guide');
assert.match(iphone.text, /Yes, we have Phones in our catalogue:/);
assert.match(iphone.text, /Which model are you looking for\?/);

const contact = respond('how can I contact this person?');
assert.equal(shouldSkipModel(contact), 'contact-info');
assert.match(contact.text, /support@lavaall\.com/);

const timeline = respond('How long will delivery take?');
assert.doesNotMatch(timeline.text, /tomorrow|24 hours|in stock/i);

const starlink = respond('Do you have Starlink?');
assert.notEqual(starlink.events && starlink.events[0], 'product-guide');
assert.match(starlink.text, /Starlink/i);

const kept = postEnforce(
  'Delivery arrives within 24 hours. Someone from our team will get back to you within 24 hours.',
  { language: 'en', events: ['service-help'], fields: {}, text: sla }
);
assert.match(kept.text, /Someone from our team will get back to you within 24 hours\./);
assert.doesNotMatch(kept.text, /Delivery arrives within 24 hours/);

(async () => {
  const store = memoryStore();
  const service = createService({
    store, now: () => Date.UTC(2026, 10, 12), salt: 'TEST ONLY salt',
    chat: async () => { throw new Error('must skip model for service and category turns'); },
  });
  const session = await service.start('203.0.113.10');
  const first = await service.turn(session.sessionId, session.proof, 'svc1', undefined, session.csrf, 'How do you handle wholesale requests?');
  assert.match(first.text, /wholesale/i);
  assert.equal(first.reset, undefined);
  const second = await service.turn(session.sessionId, session.proof, 'svc2', undefined, session.csrf, 'Can the team confirm product availability?');
  assert.equal(second.reset, true);
  assert.match(second.text, /confirm product availability/i);
  assert.doesNotMatch(second.text, /wholesale/i);
  const category = await service.turn(session.sessionId, session.proof, 'svc3', undefined, session.csrf, 'want phone');
  assert.match(category.text, /\*\*Phones\*\*/);
  assert.ok(Array.isArray(category.chips) && category.chips.includes('Samsung'));
  console.log('PASS service help, topic reset, form intake, category chips and source-offer');
})().catch(error => { console.error(error); process.exitCode = 1; });
