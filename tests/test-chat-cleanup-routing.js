'use strict';
const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');
const { postEnforce, shouldSkipModel } = require('../api/_chat/llm-responder');
const { SERVICE_SLA } = require('../api/_chat/conversation');

const computers = respond('Do u sale kompyuta please?');
assert.match(computers.text, /quote-first/i);
assert.match(computers.text, /laptops or desktops/i);
assert.equal(computers.narrow.scope.categoryId, 'computers');
assert.ok(!computers.text.includes(SERVICE_SLA));

const risk = respond('Does a used iPad arrive without an iCloud or MDM lock?');
assert.match(risk.text, /must verify/i);
assert.match(risk.text, /cannot promise.*lock-free/i);
assert.match(risk.text, /Activation Lock/);
assert.ok(!risk.text.includes(SERVICE_SLA));
assert.equal(shouldSkipModel(risk), 'apple-lock-requirement');

const send = respond('Please forward my inquiry immediately');
assert.match(send.text, /Nothing is sent until.*review.*Confirm/i);
assert.ok(!send.text.includes(SERVICE_SLA));
assert.equal(shouldSkipModel(send), 'quote-review-process');
assert.equal(send.handoff, undefined);
assert.ok(!respond('Submit my request today', respond('Show me laptops')).text.includes(SERVICE_SLA));

const repaired = postEnforce("We don't carry computers. Would you like help?", computers);
assert.match(repaired.text, /quote-first/i);
assert.ok(!repaired.text.includes(SERVICE_SLA));
assert.doesNotMatch(repaired.text, /we (?:do not|don't) (?:carry|have)/i);
const unknown = respond('Do you carry a hydraulic lifting jack?');
assert.ok(unknown.text.includes(SERVICE_SLA));
assert.ok(postEnforce("We don't carry that item.", unknown).text.includes(SERVICE_SLA));
console.log('Cleanup answerable routing and model-denial tests passed.');
