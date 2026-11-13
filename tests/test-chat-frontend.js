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
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(child=>child.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
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
  const root = byClass(doc.body, 'customer-assistant-root');
  const launcher = byClass(root, 'customer-assistant-launcher');
  assert.ok(root.children.includes(panel));
  assert.equal(panel.hidden, true);
  launcher.events.click();
  assert.equal(panel.hidden, false);
  const log = byClass(panel, 'customer-assistant-log');
  const composer = byClass(panel, 'customer-assistant-composer');
  const input = descendants(composer).find(child=>child.tag === 'textarea');
  const ask = descendants(composer).find(child=>child.tag === 'button');
  assert.equal(input.focused, true);
  const starters = byClass(panel, 'customer-assistant-starters');
  const starterButtons = descendants(starters).filter(child=>child.tag === 'button');
  assert.deepEqual(starterButtons.map(child=>child.textContent), ['Phones & laptops', 'Starlink & internet', 'Installation', 'Request a quote', 'Talk to someone']);
  assert.equal(byClass(panel, 'customer-assistant-fields').hidden, true);
  assert.equal(panel.children.filter(child=>child.tag === 'form')[1].hidden, true);
  assert.equal(panel.children.find(child=>child.tag === 'dl').hidden, true);
  const suggestions = byClass(panel, 'customer-assistant-suggestions');
  for (const query of ['phone', 'iphone']) {
    input.value = query;
    input.events.input();
    assert.equal(suggestions.hidden, false);
    assert.match(suggestions.textContent, /iPhone 16/);
    for (const intent of ['See options', 'Request a quote', 'Contact support']) assert.ok(suggestions.textContent.includes(intent));
    assert.equal(calls.length, 0, 'typeahead does not send a request');
    assert.doesNotMatch(suggestions.textContent, /iPhone 17|iPhone 18/);
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
  resolveTurn({text:'Here are catalogue options.'});
  await pending;
  assert.equal(ask.disabled, false);
  assert.match(log.textContent, /Here are catalogue options/);
  const followups = byClass(panel, 'customer-assistant-followups');
  assert.ok(followups.children.length >= 2 && followups.children.length <= 3);
  assert.equal(panel.children.find(child=>child.tag === 'dl').hidden, true);
  const transcript = log.textContent;
  const controls = descendants(panel).filter(child=>child.tag === 'button');
  const minimise = controls.find(child=>/minimi[sz]e/i.test(child['aria-label'] || child.textContent));
  const close = controls.find(child=>/close/i.test(child['aria-label'] || child.textContent));
  assert.ok(minimise); assert.ok(close);
  minimise.events.click();
  assert.equal(panel.hidden, true);
  assert.equal(launcher.hidden, false);
  launcher.events.click();
  assert.equal(log.textContent, transcript);
  close.events.click();
  assert.equal(panel.hidden, true);
  assert.equal(launcher.hidden, false);
  launcher.events.click();
  const quotePending = starterButtons[3].events.click();
  resolveTurn({text:'I can help with a quote.'});
  await quotePending;
  assert.match(log.children.at(-1).textContent, /name/i);
  assert.doesNotMatch(log.children.at(-1).textContent, /phone|email|country/i);
  const count = calls.length;
  input.value = 'TEST ONLY Visitor';
  await composer.events.submit({preventDefault(){}});
  assert.match(log.children.at(-1).textContent, /phone/i);
  assert.equal(calls.length, count, 'name is gathered locally without inquiry delivery');
  input.value = '+12025550100';
  await composer.events.submit({preventDefault(){}});
  assert.equal(calls.length, count, 'phone is gathered locally without inquiry delivery');
  assert.match(log.children.at(-1).textContent, /confirm/i);
  input.value = 'Yes, confirm';
  await composer.events.submit({preventDefault(){}});
  assert.equal(calls.length, count, 'confirmation does not enable Preview inquiry delivery');
  assert.ok(calls.every(call=>call.action === 'turn'));
  assert.equal(byClass(panel, 'customer-assistant-fields').hidden, true);
  const handoffPending = starterButtons[4].events.click();
  assert.match(calls.at(-1).payload.text, /speak to a person/i);
  resolveTurn({text:'Thanks, someone from our team will reach out to you shortly.'});
  await handoffPending;
  assert.match(log.textContent, /Thanks, someone from our team will reach out to you shortly\./);
  const css = fs.readFileSync(require.resolve('../assets/css/customer-assistant.css'),'utf8');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /#00C2FF/);
  assert.match(css, /Clash Display/);
  assert.match(css, /Bricolage Grotesque/);
  assert.match(css, /customer-assistant-launcher[^}]*position:\s*fixed/s);
  assert.match(css, /\.customer-assistant\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.equal(doc.body.children[0].href,'/assets/css/customer-assistant.css');
  assert.ok(descendants(panel).some(child=>child.tag === 'a' && child.href === '/privacy.html'));
  assert.match(panel.textContent, /We're reachable 24\/7 on WhatsApp and email/);
  console.log(`PASS chat frontend: ${assertions} assertions; launcher, typeahead, follow-ups, conversational intake, loading, safety and brand checks`);
})().catch(error=>{ console.error(error); process.exitCode = 1; });
