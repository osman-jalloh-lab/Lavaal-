'use strict';
let assertions = 0;
const assert = new Proxy(require('node:assert/strict'), {
  get(target, key) {
    if (typeof target[key] !== 'function') return target[key];
    return (...args) => {
      assertions++;
      return target[key](...args);
    };
  }
});
const fs = require('node:fs');
const vm = require('node:vm');
const ui = require('../assets/js/customer-assistant');
for (const value of [{
  routeTo:'evil'
}, {
  country:'invented'
}, {
  name:1
}, {
  phone:'x'.repeat(301)
}, [], Object.create({
  name:'TEST ONLY'
})]) assert.throws(()=>ui.validatePartialDraft(value));
assert.deepEqual(ui.validatePartialDraft({
  name:'TEST ONLY'
}), {
  name:'TEST ONLY'
});
const local = {
  pathname:'/', hostname:'localhost'
};
const enabled = {
  CHAT_ENABLED:true, localTestStub:true, environment:'test', transport:async()=>{}
};
assert.equal(ui.eligible({}, local), false);
assert.equal(ui.eligible(enabled, local), true);
for (const path of ['/index.html','/web','/ops','/os']) assert.equal(ui.eligible(enabled, {
  ...local, pathname:path
}), false);
for (const environment of ['production','preview', undefined]) assert.equal(ui.eligible({
  ...enabled, environment
}, local), false);
assert.equal(ui.eligible(enabled, {
  ...local, hostname:'lavaall.com'
}), false);
assert.equal(ui.eligible({
  ...enabled, CHAT_VOICE_ENABLED:true, CHAT_ENABLED:false
}, local), false);
for (const language of ['en','fr','pt']) {
  assert.equal(ui.copy[language].questions.length, 5);
  assert.match(ui.copy[language].first, /AI|IA/);
  assert.doesNotMatch(JSON.stringify(ui.copy[language]), /\$|free|shortly|24 hours|200\+|500\+/i);
}
assert.equal(ui.scaffold.enabled, false);
assert.equal(ui.scaffold.textOnly, true);
assert.equal(ui.summary({
  name:'TEST ONLY'
},'en').length, 19);
assert.equal(ui.summary({
  name:'TEST ONLY'
},'en').find(x=>x.field === 'email').value,'Skipped');
// Default-off source evaluation must not even access DOM or network.
let touches = 0;
vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/customer-assistant'),'utf8'), {
  window:{
    document:{
      get body() {
        touches++;
        throw Error('DOM accessed');
      }
    }, location:local, fetch() {
      throw Error('network');
    }
  }
});
assert.equal(touches, 0);
class Element {
  constructor(tag) {
    this.tag = tag; this.children = []; this.events = {}; this.value = '';
    this.disabled = false; this.hidden = false; this.style = {};
    this.classList = {add: (...names)=>{this.className = [...new Set((this.className || '').split(' ').concat(names))].join(' ');}, remove: (...names)=>{this.className = (this.className || '').split(' ').filter(name=>!names.includes(name)).join(' ');}, contains: name=>(this.className || '').split(' ').includes(name)};
  }
  set textContent(value) { this.text = value; this._innerHTML = undefined; this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(child=>child.textContent).join(''); }
  set innerHTML(value) { this._innerHTML = String(value); this.text = String(value).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''); this.children = []; }
  get innerHTML() { return this._innerHTML || this.text || ''; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(node => node !== child); return child; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.events[name] = listener; }
  focus() { this.focused = true; }
  querySelector(selector) { return descendants(this).find(child=>selector[0] === '.' ? (child.className || '').split(' ').includes(selector.slice(1)) : child.tag === selector) || null; }
}
function descendants(node) { return node.children.flatMap(child=>[child, ...descendants(child)]); }
function byClass(node, name) { const result = node.querySelector('.' + name); assert.ok(result, name); return result; }
(async()=>{
  const doc = {createElement:tag=>new Element(tag), body:new Element('body')};
  const calls = [];
  let resolveTurn;
  const panel = ui.mount(doc, local, {
    ...enabled,
    catalog: [{name:'Phones', brands:[{name:'Apple', families:[{name:'iPhone', models:[{name:'iPhone 16'}, {name:'iPhone 16 Pro'}]}]}]}],
    transport: async(action, payload)=>{
      calls.push({action, payload});
      return await new Promise(resolve=>{ resolveTurn = resolve; });
    }
  });
  assert.equal(doc.body.children.includes(panel), true);
  const log = byClass(panel, 'customer-assistant-log');
  const composer = byClass(panel, 'customer-assistant-composer');
  const input = descendants(composer).find(child=>child.tag === 'textarea');
  const ask = descendants(composer).find(child=>child.tag === 'button');
  const starters = byClass(panel, 'customer-assistant-starters');
  const starterButtons = descendants(starters).filter(child=>child.tag === 'button');
  assert.deepEqual(starterButtons.map(child=>child.textContent), ['Phones & laptops', 'Starlink & internet', 'Installation', 'Request a quote', 'Talk to someone']);
  assert.equal(descendants(panel).some(child=>child.className === 'customer-assistant-fields' && !child.hidden), false);
  assert.equal(panel.children.filter(child=>child.tag === 'dl').length, 0);
  const suggestions = byClass(panel, 'customer-assistant-suggestions');
  input.value = 'do';
  input.events.input();
  assert.equal(suggestions.hidden, true, 'typeahead waits for 3+ characters');
  for (const query of ['phone', 'iphone']) {
    input.value = query;
    input.events.input();
    assert.equal(suggestions.hidden, false);
    assert.match(suggestions.textContent, /iPhone 16/);
    for (const intent of ['See options', 'Request a quote', 'Contact support']) assert.ok(suggestions.textContent.includes(intent));
    assert.equal(calls.length, 0, 'typeahead does not send a request');
    assert.doesNotMatch(suggestions.textContent, /iPhone 17|iPhone 18|Nintendo|transformer|DOL/i);
  }
  await input.events.keydown({key:'Escape', preventDefault(){}});
  assert.equal(suggestions.hidden, true);
  input.value = '';
  input.events.input();
  assert.equal(suggestions.hidden, true);
  const pending = starterButtons[0].events.click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'turn');
  assert.match(calls[0].payload.text, /phones|laptops/i);
  assert.notEqual(calls[0].payload.text, starterButtons[0].textContent);
  assert.equal(ask.disabled, true);
  const status = byClass(panel, 'customer-assistant-status');
  assert.equal(status['aria-live'], 'polite');
  assert.match(status.textContent, /typing|thinking|loading/i);
  await composer.events.submit({preventDefault(){}});
  assert.equal(calls.length, 1, 'busy composer does not send another turn');
  resolveTurn({text:'Here are catalogue options.', chips:['Request a quote', 'Talk to someone']});
  await pending;
  assert.equal(ask.disabled, false);
  assert.match(log.textContent, /Here are catalogue options/);
  assert.equal(starters.children.length, 0, 'starter chips hide after the first message');
  const followups = byClass(panel, 'customer-assistant-followups');
  assert.ok(followups.children.length >= 2 && followups.children.length <= 3);
  const beforeHelp = calls.length;
  input.value = 'Ask assistant';
  await composer.events.submit({preventDefault(){}});
  assert.equal(calls.length, beforeHelp, 'Ask assistant does not start a product search');
  assert.match(log.textContent, /Sure, what can I help with/);
  const quotePending = starterButtons[3].events.click();
  assert.equal(calls.at(-1).payload.text, 'I want to request a quote.');
  resolveTurn({text:'Yes sure, can I get your first and last name?', awaiting:'handoff-name', chips:['Cancel request']});
  await quotePending;
  assert.equal(log.children.at(-1).textContent, 'Yes sure, can I get your first and last name?');
  assert.deepEqual(descendants(followups).filter(child=>child.tag === 'button').map(child=>child.textContent), ['Cancel request']);
  const count = calls.length;
  input.value = 'Ada Test';
  const quoteNamePending = composer.events.submit({preventDefault(){}});
  assert.equal(calls.length, count + 1, 'quote name is sent to the server');
  resolveTurn({text:"What's the best phone/WhatsApp number or email to reach you?", awaiting:'handoff-contact', chips:[]});
  await quoteNamePending;
  assert.equal(followups.children.length, 0, 'an empty server chips array remains empty during intake');
  assert.ok(calls.every(call=>call.action === 'turn'));
  assert.doesNotMatch(log.textContent, /Inquiry type|Your budget|Skipped/);
  const beforeHandoff = log.children.length;
  const handoffPending = starterButtons[4].events.click();
  assert.match(calls.at(-1).payload.text, /speak to a person/i);
  resolveTurn({text:'Yes sure, can I get your first and last name?', awaiting:'handoff-name', chips:[]});
  await handoffPending;
  const handoffBubbles = log.children.slice(beforeHandoff);
  assert.equal(handoffBubbles.length, 2, 'person handoff adds one user bubble and exactly one server assistant bubble');
  assert.equal(handoffBubbles[1].textContent, 'Yes sure, can I get your first and last name?');
  assert.equal(handoffBubbles.filter(bubble=>bubble.textContent === 'What is your name?').length, 0, 'person handoff has no local name question');
  const handoffCallCount = calls.length;
  input.value = 'Ada Test';
  const namePending = composer.events.submit({preventDefault(){}});
  assert.equal(calls.length, handoffCallCount + 1, 'handoff name is sent to the server');
  assert.equal(calls.at(-1).payload.text, 'Ada Test');
  resolveTurn({text:"What's the best phone/WhatsApp number or email to reach you?", awaiting:'handoff-contact', chips:[]});
  await namePending;
  assert.equal(log.children.at(-1).textContent, "What's the best phone/WhatsApp number or email to reach you?");
  const failDoc = {createElement:tag=>new Element(tag), body:new Element('body')};
  const failPanel = ui.mount(failDoc, local, {
    ...enabled,
    transport: async()=>{ const error = new Error('quota'); error.code = 'quota'; throw error; }
  });
  const failLog = byClass(failPanel, 'customer-assistant-log');
  const failComposer = byClass(failPanel, 'customer-assistant-composer');
  const failInput = descendants(failComposer).find(child=>child.tag === 'textarea');
  failInput.value = 'I want an iPhone';
  await failComposer.events.submit({preventDefault(){}});
  assert.match(failLog.textContent, /I want an iPhone/);
  assert.match(failLog.textContent, /support@lavaall\.com/);
  assert.match(failLog.textContent, /\+1 \(737\) 704-4182/);
  assert.doesNotMatch(failLog.textContent, /Submission unavailable/);
  const failStatus = byClass(failPanel, 'customer-assistant-status');
  assert.doesNotMatch(failStatus.textContent, /Submission unavailable/);

  assert.equal(ui.formatAssistantHtml('Yes, we have **phones**. <script>x</script>'), 'Yes, we have <strong>phones</strong>. &lt;script&gt;x&lt;/script&gt;');
  assert.equal(ui.formatAssistantHtml('Use the [request form](#signup).'), 'Use the <a href="#signup">request form</a>.');
  assert.equal(ui.plainReplyText('Yes, we have **phones**.\n\nUse the [request form](#signup).'), 'Yes, we have phones. Use the request form.');

  const resetDoc = {createElement:tag=>new Element(tag), body:new Element('body')};
  const resetTurns = [];
  const resetPanel = ui.mount(resetDoc, local, {
    ...enabled,
    transport: async(action, payload)=>{
      resetTurns.push(payload.text);
      if (payload.text.includes('wholesale')) return {text:'We handle **wholesale** requests. Email **support@lavaall.com**.'};
      return {text:'Yes, our team can **confirm product availability**.', reset:true};
    }
  });
  const resetLog = byClass(resetPanel, 'customer-assistant-log');
  const resetComposer = byClass(resetPanel, 'customer-assistant-composer');
  const resetInput = descendants(resetComposer).find(child=>child.tag === 'textarea');
  const greeting = resetLog.children[0];
  resetInput.value = 'How do you handle wholesale requests?';
  await resetComposer.events.submit({preventDefault(){}});
  assert.match(resetLog.textContent, /wholesale/);
  assert.match(resetLog.children.at(-1).innerHTML, /<strong>wholesale<\/strong>/);
  const before = resetLog.children.length;
  resetInput.value = 'Can the team confirm product availability?';
  await resetComposer.events.submit({preventDefault(){}});
  assert.equal(resetLog.children[0], greeting, 'topic reset keeps the greeting');
  assert.ok(resetLog.children.length < before + 1, 'topic reset clears earlier turns');
  assert.doesNotMatch(resetLog.textContent, /wholesale/);
  assert.match(resetLog.textContent, /confirm product availability/);
  assert.match(resetLog.children.at(-1).innerHTML, /<strong>confirm product availability<\/strong>/);

  const css = fs.readFileSync(require.resolve('../assets/css/customer-assistant.css'),'utf8');
  assert.match(css, /min-height: 44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /#00C2FF/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /min\(100% - 24px, 640px\)/);
  assert.equal(doc.body.children[0].href,'/assets/css/customer-assistant.css');
  assert.ok(descendants(panel).some(child=>child.tag === 'a' && child.href === '/privacy.html'));
  assert.match(panel.textContent, /We're reachable 24\/7 on WhatsApp and email/);
  console.log(`PASS chat frontend: ${assertions} assertions; greeting, chips, typeahead, follow-ups, conversational intake, loading, safety and brand checks`);
})().catch(error=>{ console.error(error); process.exitCode = 1; });
