'use strict';
const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');
const { shouldSkipModel, respondWithLlm, requiredSentences, buildMessages, postEnforce } = require('../api/_chat/llm-responder');
const variants = ['what makes you different?', 'what makes LAVAALL different?', 'why choose LAVAALL?', 'what do you do?', 'who are you?', 'who is LAVAALL?', 'tell me about LAVAALL', 'Pourquoi choisir LAVAALL ?', 'Wetin una de du?', 'Wetin una de do?'];
(async () => {
  let calls = 0;
  for (const input of variants) {
    const rule = respond(input);
    assert.equal(shouldSkipModel(rule), 'company-pitch', input);
    const reply = await respondWithLlm(input, { chat: async () => { calls++; throw Error('Unexpected model call'); } });
    assert.equal(reply.text, rule.text);
    assert.doesNotMatch(reply.text, /Fiber Optic|Cat6|Structured Cabling|stock|price confirmation|WhatsApp|support@|email/i);
    assert.match(reply.text, /Sierra Leone/);
    assert.match(reply.text, /Guinea|Guinée/);
    assert.match(reply.text, /Liberia|Lib[eé]ria/);
    assert.match(reply.text, /Guinea-Bissau|Guinée-Bissau/);
    assert.match(reply.text, /quote-first|sur devis/);
    assert.match(reply.text, /sourcing.*delivery|approvisionnement.*livraison/);
    assert.match(reply.text, /LAVAALL Web.*(?:websites|sites web).*apps|LAVAALL Web.*applications/);
    assert.match(reply.text, /online ordering|commande en ligne/);
    assert.match(reply.text, /bots/);
    assert.match(reply.text, /free preview|aperçu gratuit/);
    assert.equal((reply.text.match(/\?/g) || []).length, 1);
    assert.ok(reply.text.split(/(?<=[.!?])\s+/).length <= 3);
  }
  assert.equal(calls, 0);
  assert.equal(respond('Pourquoi choisir LAVAALL ?').language, 'fr');
  for (const input of ['what do you do for routers', 'what do you do for iPhones', 'what makes LAVAALL different for routers?']) {
    const rule = respond(input);
    assert.ok(!rule.events.includes('company-pitch'));
    assert.ok(rule.matchCount > 0 || rule.narrow);
  }
  assert.match(respond('are you human').text, /AI assistant/);
  assert.ok(!respond('are you human').events.includes('company-pitch'));
  for (const input of ['Can your team create apps for a bakery?', 'Could you automate WhatsApp replies for a florist?']) {
    const web = respond(input);
    assert.equal(shouldSkipModel(web), 'faq-website');
    assert.match(web.text, /LAVAALL Web/);
  }
  const general = { language: 'en', events: [], fields: {}, matchCount: 2, text: 'How can I help?' };
  assert.deepEqual(requiredSentences(general), ['Would you like a quick form?']);
  assert.doesNotMatch(postEnforce('LAVAALL helps with technology and web projects. How can I help?', general).text, /stock or price|WhatsApp|support@/);
  const messages = buildMessages('Tell me about your business', general, {});
  assert.doesNotMatch(messages[1].content, /MUST mention each/);
  assert.match(messages[1].content, /Do not name catalogue items/);
  console.log('Company pitch: 10 variants, zero model calls, product/identity and prompt guards passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
