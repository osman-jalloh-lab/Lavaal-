'use strict';
const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');
const { SERVICE_SLA } = require('../api/_chat/conversation');
const { buildMessages, postEnforce } = require('../api/_chat/llm-responder');
for (const query of ['Do you carry an industrial laminator?', 'Galaxy S21', 'iPhone 16 in scarlet']) {
  const reply = respond(query);
  assert.ok(reply.text.includes(SERVICE_SLA), query + ': route to team');
  assert.match(reply.text, /quick form/i);
  assert.doesNotMatch(reply.text, /we (?:do not|don't) (?:have|carry|list)|couldn't find|in stock/i);
}
const rule = respond('Do you sell a pneumatic stapler?');
const prompt = buildMessages('Can the team source this?', rule, {}).map(m => m.content).join('\n');
assert.match(prompt, /Never deny carrying or having an item or variant/);
assert.ok(prompt.includes(SERVICE_SLA));
assert.ok(postEnforce(SERVICE_SLA, rule).text.includes(SERVICE_SLA));
console.log('Routing SLA replies and prompt passed');
