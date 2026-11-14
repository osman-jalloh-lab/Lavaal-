'use strict';
const assert = require('node:assert/strict');
const { buildMessages, postEnforce, requiredSentences } = require('../api/_chat/llm-responder');
const { respond } = require('../api/_chat/responder');
const { SERVICE_SLA } = require('../api/_chat/conversation');
const sentences = text => text.split(/(?<=[.!?])\s+/).filter(Boolean);
const rule = { text: 'I can help with your request.', language: 'en', events: [], fields: {} };
const prompt = buildMessages('Tell me about business equipment.', rule, {})[0].content;
assert.match(prompt, /1–3 sentences total and at most one follow-up question/);
for (const input of [
  'we can discuss your requirements. We can discuss your requirements. Tell me more. What do you need? Where will it go?',
  'Here is a helpful answer. Another useful detail. A further explanation. More information. What is your budget?',
]) {
  const reply = postEnforce(input, rule).text;
  assert.ok(sentences(reply).length <= 3, reply);
  assert.ok((reply.match(/\?/g) || []).length <= 1, reply);
  assert.match(reply, /^[A-Z]/);
  assert.equal((reply.match(/we can discuss your requirements/gi) || []).length, input.startsWith('we can') ? 1 : 0);
  for (const line of requiredSentences(rule)) assert.ok(reply.includes(line));
}
const missing = respond('Could you source an electric label engraver?');
assert.ok(postEnforce('We cannot carry that item. Is there another choice?', missing).text.includes(SERVICE_SLA));
let receipt = respond('Request a quote');
for (const t of ['Email', 'saliu@example.net', 'Saliu Bangura', 'a new office router', 'Confirm']) receipt = respond(t, receipt);
assert.equal(postEnforce('Extra information. Anything else?', receipt).text, 'Thank you, someone from our team will reach out to you shortly.');
console.log('Short replies, one question, deduplication and exact receipts passed');
