'use strict';
const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');
const { buildMessages } = require('../api/_chat/llm-responder');
for (const query of ['Could you make a booking app for a barber?', 'Our cafe needs digital ordering', 'Can you build an automated customer chat helper?']) {
  const prompt = buildMessages(query, respond(query), {}).map(m => m.content).join('\n');
  assert.match(prompt, /LAVAALL Web builds websites, apps, online ordering and bots/);
  assert.match(prompt, /free preview/);
  assert.doesNotMatch(prompt, /Haitian Creole[^.]*write Haitian/i);
}
console.log('LAVAALL Web prompt capabilities passed');
