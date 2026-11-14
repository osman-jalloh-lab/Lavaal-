'use strict';
const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');
const { shouldSkipModel } = require('../api/_chat/llm-responder');
for (const input of [
  'Can you supply human resources management tools?', 'agent',
  'Equipment for humanitarian relief', 'An agent of change for our office',
  'We need human resources software for payroll', 'I need an agent of change',
]) {
  const reply = respond(input);
  assert.ok(!String(reply.awaiting).startsWith('handoff-'), input);
  assert.ok(!reply.handoff, input);
}
for (const input of [
  'May I speak with a human please?', 'Please talk to someone about my order',
  'I want a person', 'Connect me with an agent', 'Could I chat with a representative?',
  'Je souhaite parler avec une personne', 'Je veux parler à un agent',
  'A wan tɔk to wan pɔsin', 'A wan tɔk to di tim',
  'Quero falar com alguém', 'Quero falar com uma pessoa',
]) {
  const reply = respond(input);
  assert.equal(reply.awaiting, 'handoff-channel', input);
  assert.deepEqual(reply.chips, ['WhatsApp', 'Email']);
  assert.equal(shouldSkipModel(reply), 'handoff-intake');
}
for (const input of ['Am I talking to a human right now?', 'Is this a real person?', 'Are you a robot?', 'Est-ce que vous êtes un humain ?']) {
  const reply = respond(input);
  assert.match(reply.text, /AI|IA|assistant/i);
  assert.ok(!String(reply.awaiting).startsWith('handoff-'), input);
  assert.deepEqual(reply.chips, ['Talk to someone']);
}
console.log('PASS explicit multilingual human handoffs and identity/false-positive guards');
