'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cases = require('./eval/cases.json');
const { hardFails, scoreCase } = require('./eval/run-eval');
assert.equal(cases.length, 93);
assert.equal(new Set(cases.map(c => c.id)).size, 93);
assert.equal(cases.filter(c => c.group === 'I').length, 13);
for (const group of 'ABCDEFGH') {
  assert.equal(cases.filter(c => c.group === group).length, 10);
  for (let i = 1; i <= 10; i++) assert(cases.some(c => c.id === group + String(i).padStart(2, '0')));
}
for (const c of cases) {
  assert(c.checks && Object.keys(c.checks).length);
  assert(c.turns.length && c.turns.every(t => typeof t === 'string'));
  for (const key of ['intentAny', 'intentAll', 'intentNot', 'state', 'stateNot', 'mustNot']) for (const regex of c.checks[key] || []) assert.doesNotThrow(() => new RegExp(regex, 'iu'));
}
for (const [text, reason] of [['$499', 'invented-price'], ['It is in stock.', 'stock-claim'], ['It will arrive next Friday.', 'lead-time'], ['Your quote has been sent.', 'false-submission'], ['DEEPSEEK_API_KEY', 'internal-leak']]) {
  assert(hardFails(text).some(f => f.reason === reason), reason);
}
assert.deepEqual(hardFails('Which model would you like to request a quote for?'), []);
assert.deepEqual(hardFails('Someone from our team will get back to you within 24 hours.'), []);
for (const text of ['Yes, we have **shops**.', 'Yes, we have **256GBs**.', 'Yes, we have **for 4s**.', 'Yes, we have imaginary models.', 'We list imaginary products.']) {
  assert(hardFails(text).some(f => f.reason === 'unverified-claim'), text);
}
for (const text of ['Yes, we have **Laptops**.', 'Yes, we have iPhone 15 models.', 'Yes, we have the iPhone 15 Pro Max.']) {
  assert(!hardFails(text).some(f => f.reason === 'unverified-claim'), text);
}
const score = (text, checks = {}, overrides = {}, failures = []) => scoreCase({ group: 'Z', checks }, [{
  text: 'want a site like this one', reply: { text }, rule: { language: 'fr', fields: {} }, context: {}, ...overrides
}], failures);
const wrongLanguage = score('Which model?', { language: 'fr' });
assert.equal(wrongLanguage.scores.intent, 1);
assert.equal(wrongLanguage.scores.clarification, 1);
assert.equal(score("I don't see the je veux 15 ordinateurs in our catalogue. Which model?", { language: 'fr' }).scores.intent, 1);
assert.equal(score('Quel ordinateur cherchez-vous ?', { language: 'fr' }).scores.intent, 2);
assert.equal(score('Which router?', { intentNot: ['router'] }).scores.intent, 0);
assert.equal(score("I don't see the want a site like this one in our catalogue. Which type?").scores.intent, 1);
assert.equal(score('Which website features would you like?').scores.intent, 2);
assert.equal(score("We don't carry want a site. Which type?").scores.intent, 1);
assert.equal(score('Yes, we have **a site like**. Which type?').scores.intent, 1);
assert.equal(score('Which type?', { state: ['256'] }, { context: { lastUser: '256', unrelated: '256' } }).scores.state, 0);
assert.equal(score('Which type?', { state: ['256'] }, { context: { selectedVariant: '256GB' } }).scores.state, 2);
assert.equal(score('Which type?', {}, {}, [{ reason: 'unverified-claim', turn: 1 }]).scores.truthfulness, 0);
function inspect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.[cm]?js$/.test(file)) assert(!/(?:require\s*\(|import\s*(?:\(|[^;\n]*?from)\s*)['"][^'"]*tests\/eval/.test(fs.readFileSync(file, 'utf8')), file + ' must not import held-out data');
  }
}
inspect(path.join(__dirname, '../api'));
console.log('PASS held-out eval integrity and synthetic hard-fail detection');
