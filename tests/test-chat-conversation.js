'use strict';
const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');
const { shouldSkipModel, postEnforce, PHRASES } = require('../api/_chat/llm-responder');

function noCatalogDump(text) {
  assert.doesNotMatch(text, /epson|printer|inquiry type|your budget|skipped/i);
}

const contact = respond('how can I contact this person?');
assert.equal(shouldSkipModel(contact), 'contact-info');
assert.match(contact.text, /support@lavaall\.com/);
assert.match(contact.text, /\+1 \(737\) 704-4182/);
assert.match(contact.text, /connect you with someone/i);
assert.doesNotMatch(contact.text, /epson|printer|iPhone|Which model/i);
noCatalogDump(contact.text);
assert.ok((contact.chips || []).includes('Talk to someone'));

const ip15 = respond('do you have iPhone 15?');
assert.equal(shouldSkipModel(ip15), 'product-guide');
assert.match(ip15.text, /Yes, we have the iPhone 15 in our catalogue/);
assert.match(ip15.text, /Our team will confirm stock with your quote/);
assert.match(ip15.text, /Which model are you looking for\?/);
assert.doesNotMatch(ip15.text, /A catalogue listing is not a stock or price confirmation/);
assert.deepEqual(ip15.chips, ['iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max']);
const picked = respond('15', ip15);
assert.match(picked.text, /Yes, we have that\. What color are you looking for\?/);
assert.ok(picked.chips.includes('Blue'));
const blue = respond('blue', picked);
assert.match(blue.text, /Yes, we have the iPhone 15 in Blue/);
assert.doesNotMatch(blue.text, /Ultramarine|Desert Titanium/);

const ip16 = respond('do you have iPhone 16?');
const picked16 = respond('16', ip16);
const blue16 = respond('blue', picked16);
assert.match(blue16.text, /We don't have the iPhone 16 in blue, but we have it in Black, White, Pink, Teal, and Ultramarine/);
assert.doesNotMatch(blue16.text, /Blue Titanium|we have it in blue/i);

const missing = respond('do you have iPhone 17?');
assert.match(missing.text, /I don't see the iPhone 17 in our catalogue/);
assert.match(missing.text, /closest/i);
assert.doesNotMatch(missing.text, /iPhone 17 Pro/);

const help = respond('Ask assistant');
assert.equal(help.text, 'Sure, what can I help with?');

const price = respond('How much does the iPhone 16 Pro cost?');
assert.match(price.text, /quoted per order/i);
assert.doesNotMatch(price.text, /\$|USD\s*\d|A catalogue listing is not a stock or price confirmation/);

const delivery = respond('Do you deliver to Sierra Leone?');
assert.match(delivery.text, /Sierra Leone, Guinea, Liberia, and Guinea-Bissau/);
assert.match(delivery.text, /Which city/);

const timeline = respond('How long will delivery take?');
assert.match(timeline.text, /timeline comes with your quote/i);
assert.doesNotMatch(timeline.text, /tomorrow|24 hours|in stock/i);

const pay = respond('How do I pay?');
assert.match(pay.text, /never pay before you have a full written quote/i);

const school = respond('Can you help a school or NGO?');
assert.match(school.text, /schools and NGOs/i);
assert.match(school.text, /users or classrooms/i);

const trust = respond('Are you a real company? Is this safe?');
assert.match(trust.text, /support@lavaall\.com/);
assert.match(trust.text, /written quote is agreed/);

const website = respond('Can you build a website for us?');
assert.match(website.text, /free preview/i);

const starlink = respond('Do you have Starlink?');
assert.notEqual(starlink.events && starlink.events[0], 'product-guide');
assert.match(starlink.text, /Starlink/i);

const handoff = respond('I want to speak to a person on your team, please.');
assert.equal(handoff.handoff.tagOsman, true);
assert.ok(handoff.text.startsWith('Thanks, someone from our team will reach out to you shortly.'));
assert.equal(PHRASES.shortly.en, 'Thanks, someone from our team will reach out to you shortly.');
assert.ok(postEnforce('I can help.', handoff).text.includes('Thanks, someone from our team will reach out to you shortly.'));
assert.doesNotMatch(handoff.text, /epson|printer/i);

console.log('A2 conversation and FAQ flows passed');
