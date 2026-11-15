'use strict';

const assert = require('node:assert/strict');
const { respond } = require('../api/_chat/responder');
const { slotReply } = require('../api/_chat/conversation');
const { knowledgeReply } = require('../api/_chat/knowledge-answers');
const knowledge = require('../api/_chat/knowledge');
const { buildMessages, intentFrom, shouldSkipModel, postEnforce } = require('../api/_chat/llm-responder');
const { createService } = require('../api/_chat/service');
const { memoryStore } = require('../api/_chat/store');

let checks = 0;
let sessions = 0;
async function check(name, operation) {
  await operation();
  checks++;
  console.log('PASS ' + name);
}
const visible = reply => reply.text + '\n' + (reply.chips || []).map(chip => typeof chip === 'string' ? chip : chip.label).join(' | ');
const branchList = /Bojon Street|Rogbaneh Road|Main Motor Road|Old Railway Line|Post Office Road/i;
const phonePath = /Galaxy\s+A\d+|samsung-confirm/i;

// Exercise persisted service context as well as the rule classifier. The mock deliberately
// returns bad content: all new routing regressions must be decidable before a model call.
async function canned(input) {
  const store = memoryStore();
  let modelCalls = 0;
  const service = createService({ store, salt: 'golive-d-routing-test-only', previewLimits: true,
    now: () => Date.UTC(2026, 10, 15),
    transport: async () => { throw Error('Unexpected transport in routing regression'); },
    chat: async () => { modelCalls++; return { content: 'UNEXPECTED MODEL', costUsd: 0 }; },
  });
  const session = await service.start('golive-d-unit-' + sessions++);
  const reply = await service.turn(session.sessionId, session.proof, 'routing-turn', undefined, session.csrf, input);
  assert.equal(modelCalls, 0, 'Routing must be deterministic: ' + input);
  const context = await store.transaction(records => records.get('s:' + session.sessionId).context);
  assert.ok(reply.text, input);
  assert.doesNotMatch(reply.text, /\bin stock\b|ready to ship|[$£€]\s*\d/i);
  assert.ok(reply.text.split(/[.!?]+(?:\s|$)/).filter(part => part.trim()).length <= 3, reply.text);
  return { reply, context, rule: respond(input, {}) };
}

async function main() {
  await check('office use, office size and new-office packages stay outside branch answers', async () => {
    for (const input of [
      'Can you supply a package for a new office?',
      'Do you recommend Dell or HP computers for office use?',
      'Do you have computers for an office of 12?',
      'Which Dell laptops are suitable for a new office?',
      'Which Dell or HP computer is best for my branch office?',
      'What computers do you recommend for our new office location?',
    ]) {
      assert.equal(knowledgeReply(input, {}), null, input);
      const { reply, context, rule } = await canned(input);
      assert.notEqual(rule.lastTopic, 'knowledge:branches', input);
      assert.doesNotMatch(visible(reply), branchList, input);
      assert.notEqual(context.lastTopic, 'knowledge:branches', input);
      assert.ok(rule.events.some(event => /product|category|service/.test(event)), input);
    }
  });

  await check('genuine office location, branch and address questions retain public branch facts', async () => {
    for (const input of ['Where is your office in Freetown?', 'Where is your office?', 'Which branch?', 'What is your branch address in Bo?']) {
      const { reply, rule } = await canned(input);
      assert.equal(rule.lastTopic, 'knowledge:branches', input);
      assert.ok(rule.knowledgeIds.includes('branches'), input);
      assert.match(visible(reply), branchList, input);
    }
  });

  await check('English a 10-desk and a 10-person office never fill a Samsung slot', async () => {
    for (const input of ['UPS for a 10-desk office', 'I need backup power for a 10-person office', 'Computers for a 10-desk office']) {
      assert.equal(slotReply(input, {}), null, input);
      const { reply, context } = await canned(input);
      assert.doesNotMatch(visible(reply), phonePath, input);
      assert.doesNotMatch(JSON.stringify({ pendingSamsung: context.pendingSamsung, narrow: context.narrow, lastModel: context.lastModel }), phonePath, input);
    }
  });

  await check('tight and branded A-series requests retain source-first phone alternatives', async () => {
    for (const input of ['A10', 'Samsung A10', 'Galaxy A10', 'Samsung A 10']) {
      const { reply, context, rule } = await canned(input);
      assert.ok(rule.events.includes('product-guide'), input);
      assert.match(visible(reply), /Galaxy A\d+/i, input);
      assert.equal(context.lastModel, null, 'Unlisted A10 must not select a SKU');
    }
    const { reply, context } = await canned('Samsung A35');
    assert.match(reply.text, /nearest catalogue models|Did you mean/i);
    assert.match(visible(reply), /Galaxy A34/i);
    assert.equal(context.lastModel, null);
    const listed = await canned('Samsung A54');
    assert.equal(listed.context.pendingSamsung, 'Galaxy A54');
    assert.match(listed.reply.text, /Do you mean the Galaxy A54\?/);
  });

  await check('delivery workers remain a tablet product request', async () => {
    for (const input of ['tablets for delivery riders', 'I need tablets for delivery drivers', 'Tablets for delivery staff']) {
      const { reply, context, rule } = await canned(input);
      assert.ok(!rule.events.includes('faq-delivery'), input);
      assert.equal(context.narrow.scope.categoryId, 'tablets', input);
      assert.ok(context.lastProducts.length > 0, input);
      assert.ok(context.lastProducts.every(product => product.categoryId === 'tablets'), input);
      assert.match(visible(reply), /tablet|Samsung|Apple/i, input);
    }
    const priced = await canned('How much are tablets for delivery riders in Freetown?');
    assert.ok(!priced.rule.events.includes('faq-delivery'));
    assert.ok(priced.rule.events.some(event => /faq-price|product-guide/.test(event)));
    assert.match(priced.reply.text, /quote|tablet/i);
  });

  await check('destination and shipping-cost questions retain delivery or quote FAQs', async () => {
    for (const input of ['Do you deliver to Freetown?', 'Do you deliver to Liberia?', 'Can you ship to Kenema?']) {
      const { reply, rule } = await canned(input);
      assert.ok(rule.events.includes('faq-delivery'), input);
      assert.match(reply.text, /deliver|ship|quote/i);
      assert.ok(!rule.events.includes('redirected-offtopic'), input);
    }
    const { reply, rule } = await canned('What is the delivery cost to Freetown?');
    assert.ok(rule.events.some(event => /faq-delivery|faq-price/.test(event)));
    assert.match(reply.text, /quote/i);
    const cityless = await canned('What is the delivery cost?');
    assert.ok(cityless.rule.events.includes('faq-delivery'));
    assert.match(cityless.reply.text, /quote/i);
  });

  await check('power cuts and backup power use power catalogue evidence without wholesale or coverage grounding', async () => {
    for (const input of ['What equipment helps with power cuts?', 'I need backup power for the office', 'Voltage stabilizers for our office', 'UPS for a 10-desk office']) {
      const { reply, context, rule } = await canned(input);
      assert.equal(context.narrow.scope.categoryId, 'power', input);
      assert.ok(context.lastProducts.some(product => /stabilizer/i.test(product.name)), input);
      assert.ok(context.lastProducts.every(product => product.categoryId === 'power'), input);
      assert.match(visible(reply), /stabiliz|power regulation/i, input);
      const facts = knowledge.selectFacts(input);
      assert.ok(!facts.some(fact => /^(?:coverage-|branches$|policy-2$|faq-1$)/.test(fact.id)), input + ': ' + JSON.stringify(facts));
      assert.doesNotMatch(JSON.stringify(facts), /Retail and wholesale inquiries are welcome/i);
      const prompt = buildMessages(input, rule, {})[1].content;
      assert.doesNotMatch(prompt, /Retail and wholesale inquiries are welcome|Sierra Leone branches:|Full service in/i, input);
      assert.doesNotMatch(visible(reply), /Retail and wholesale inquiries are welcome|Bojon Street/i, input);
    }
  });

  await check('geography, astronomy, celebrities, sport and recipes decline before the model', async () => {
    for (const input of [
      'What is the capital of Mongolia?',
      'Hi team, what is the capital of Mongolia?',
      'What tourist sites should I visit in Mongolia?',
      'Tell me a fun fact about Saturn',
      'How many rings does Saturn have?',
      'How do I make jollof rice?',
      'Give me a recipe for jollof rice',
      'Who is Taylor Swift?',
      'Tell me about Taylor Swift',
      'Who won the football match yesterday?',
    ]) {
      const { reply, rule } = await canned(input);
      assert.ok(rule.events.includes('redirected-offtopic'), input);
      assert.equal(intentFrom(rule), 'off-topic', input);
      assert.ok(shouldSkipModel(rule), input);
      assert.match(reply.text, /LAVAALL/i);
      assert.match(visible(reply), /talk|person|team|need|help/i);
      assert.doesNotMatch(visible(reply), /Ulaanbaatar|Ulan Bator|gas giant|sixth planet|rings? (?:are|made)|cups? of|tomato paste/i, input);
      const prompt = buildMessages(input, rule, {})[1].content;
      assert.match(prompt, /Do not answer the off-topic request\./);
      assert.match(prompt, /Verified LAVAALL facts: none match this question\./);
      const repaired = postEnforce('Ulaanbaatar is the capital of Mongolia. Saturn is the sixth planet. Mix 2 cups of rice.', rule);
      assert.doesNotMatch(repaired.text, /Ulaanbaatar|sixth planet|cups of rice/i);
    }
  });

  await check('product, country delivery, coverage, hours, and human support keep their existing intents', async () => {
    for (const input of ['Samsung Galaxy tablets', 'I need a laptop for travel to Mongolia', 'Do you deliver to Mongolia?', 'Do you deliver to Liberia?', 'Do you work in Guinea?', 'What countries do you work in?', 'Which countries are you based in?', 'What currency do you accept?', 'What are your opening hours?', 'I want to speak to someone', 'How is my order progressing?']) {
      assert.ok(!(respond(input, {}).events || []).includes('redirected-offtopic'), input);
    }
    const product = await canned('Samsung Galaxy tablets');
    assert.ok(product.rule.events.includes('product-guide'));
    assert.equal(product.context.narrow.scope.categoryId, 'tablets');
    const coverage = await canned('Do you work in Liberia?');
    assert.equal(coverage.rule.lastTopic, 'knowledge:coverage-lr');
    assert.equal(intentFrom(respond('What are your opening hours?', {})), 'hours');
    const handoff = await canned('I want to speak to someone');
    assert.ok(handoff.rule.events.includes('handoff-intake'));
  });

  await check('active handoff fields retain countries and topics while a form offer allows a new trivia decline', async () => {
    const draft = { kind: 'person', name: 'Test Visitor', channel: 'email', contact: 'visitor@example.test', topic: 'Computers' };
    const location = respond('Mongolia', { awaiting: 'handoff-location', lastTopic: 'handoff-intake', handoffDraft: draft });
    assert.ok(location.events.includes('handoff-intake'));
    assert.ok(!location.events.includes('redirected-offtopic'));
    assert.equal(location.handoffDraft.country, 'Mongolia');
    assert.equal(location.awaiting, 'handoff-organisation');
    const topic = respond('Jollof recipe', { awaiting: 'handoff-topic', lastTopic: 'handoff-intake', handoffDraft: { ...draft, topic: '', topicOther: true } });
    assert.ok(topic.events.includes('handoff-intake'));
    assert.equal(topic.handoffDraft.topic, 'Jollof recipe');
    assert.ok(!topic.events.includes('redirected-offtopic'));
    const offer = respond('What is the capital of Mongolia?', { awaiting: 'form-offer', lastTopic: 'service-source' });
    assert.ok(offer.events.includes('redirected-offtopic'));
    assert.ok(shouldSkipModel(offer));
    assert.doesNotMatch(offer.text, /Ulaanbaatar|Ulan Bator/i);
  });

  console.log('golive routing checks: ' + checks + '; canned service cases: ' + sessions + '; model calls: 0');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
