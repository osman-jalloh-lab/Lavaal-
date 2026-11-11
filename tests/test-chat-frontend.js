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
  assert.equal(ui.copy[language].questions.length, 10);
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
    this.tag = tag;
    this.children = [];
    this.events = {};
    this.value = '';
    this.disabled = false;
  }
  set textContent(v) {
    this.text = v;
    this.children = [];
  }
  get textContent() {
    return this.text || '';
  }
  appendChild(n) {
    this.children.push(n);
    return n;
  }
  setAttribute() {}
  addEventListener(k, f) {
    this.events[k] = f;
  }
  focus() {
    this.focused = true;
  }
}
(async()=>{
  const doc = {
    createElement:tag=>new Element(tag), body:new Element('body')
  };
  let sends = 0, calls = [], turnTexts = [], invalidTurn = false;
  const panel = ui.mount(doc, local, {
    ...enabled, transport:async(action, payload)=>{
      calls.push(action);
      if (action === 'turn') turnTexts.push(payload.text);
      if (action === 'review')return {
        token:'a'.repeat(64), draftId:'b'.repeat(64), csrf:'c'.repeat(64), sessionId:'d'.repeat(64), idempotencyKey:'e'.repeat(64), summary:{
          ...payload.fields, name:'<script>TEST ONLY</script>'
        }
      };
      if (action === 'turn') return {
        text:'TEST ONLY mock answer', fields:invalidTurn ? {
          name:'MUST NOT APPLY', country:'invented'
        }
        : {
          name:'TEST ONLY corrected', phone:'+12025550100'
        }
      };
      sends++;
      assert.equal(payload.sessionId,'d'.repeat(64));
      assert.equal(payload.idempotencyKey,'e'.repeat(64));
      return {
        status:'uncertain'
      };
    }
  });
  const forms = panel.children.filter(x=>x.tag === 'form');
  const composer = forms[0], form = forms[1];
  const buttons = panel.children.filter(x=>x.tag === 'button');
  const edit = buttons[0], send = buttons[1];
  assert.equal(send.disabled, true);
  const chip = panel.children.find(x=>x.tag === 'ul').children[0].children[0];
  await chip.events.click();
  assert.equal(turnTexts[0], chip.textContent);
  const correction = form.children.find(x=>x.tag === 'details');
  assert.equal(correction.children.length, 20);
  assert.equal(correction.children[2].children[1].value,'TEST ONLY corrected');
  assert.equal(correction.children.some(x=>x.name === 'routeTo'), false);
  const log = panel.children.find(x=>x.tag === 'div');
  assert.match(log.children[0].textContent, /AI/);
  assert.equal(log.children[2].textContent,'TEST ONLY mock answer');
  const composerInput = composer.children[0].children[1];
  composerInput.value = 'TEST ONLY typed message';
  await composer.events.submit({
    preventDefault() {}
  });
  assert.deepEqual(calls, ['turn','turn']);
  assert.equal(turnTexts[1], 'TEST ONLY typed message');
  composerInput.value = 'TEST ONLY Enter';
  await composerInput.events.keydown({
    key:'Enter', preventDefault() {}
  });
  assert.deepEqual(calls, ['turn','turn','turn']);
  assert.equal(composerInput.focused, true);
  invalidTurn = true;
  composerInput.value = 'TEST ONLY invalid draft';
  await composer.events.submit({
    preventDefault() {}
  });
  assert.equal(correction.children[2].children[1].value,'TEST ONLY corrected');
  assert.equal(send.disabled, true);
  invalidTurn = false;
  calls = [];
  await form.events.submit({
    preventDefault() {}
  });
  assert.deepEqual(calls, ['review']);
  assert.equal(sends, 0);
  const details = panel.children.find(x=>x.tag === 'dl');
  assert.equal(details.hidden, false);
  assert.equal(send.disabled, false);
  assert.equal(details.children.length, 38);
  assert.equal(details.children[3].textContent,'<script>TEST ONLY</script>');
  form.events.input();
  assert.equal(send.disabled, true);
  await send.events.click();
  assert.equal(sends, 0);
  await form.events.submit({
    preventDefault() {}
  });
  await Promise.all([send.events.click(), send.events.click()]);
  assert.equal(sends, 1);
  await send.events.click();
  assert.equal(sends, 1);
  const status = panel.children.find(x=>x.tag === 'p' && /uncertain/.test(x.textContent));
  assert.ok(status);
  edit.events.click();
  assert.equal(send.disabled, true);
  assert.equal(correction.open, true);
  correction.open = false;
  form.events.invalid({
    target:composerInput
  });
  assert.equal(correction.open, true);
  const css = fs.readFileSync(require.resolve('../assets/css/customer-assistant.css'),'utf8');
  assert.match(css, /min-height: 44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /#00C2FF/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /min\(100% - 24px, 640px\)/);
  assert.equal(doc.body.children[0].href,'/assets/css/customer-assistant.css');
  assert.equal(panel.children.filter(x=>x.tag === 'a').some(x=>x.href === '/privacy.html'), true);
  console.log(`PASS chat frontend: ${assertions} assertions; local mock conversation, draft validation, consent, default-off and CSS structural checks`);
})().catch (e=>{
  console.error(e);
  process.exitCode = 1;
});
