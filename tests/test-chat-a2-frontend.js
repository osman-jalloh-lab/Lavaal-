'use strict';
const assert = require('node:assert/strict');
const ui = require('../assets/js/customer-assistant');

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.value = ''; this.events = {}; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.events[name] = listener; }
  focus() {}
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || ''; }
}
function browser(fetcher) {
  return {
    document: {head:new Element('head'), body:new Element('body'), createElement:tag=>new Element(tag)},
    location:{hostname:'a2-preview.vercel.app', pathname:'/'}, fetch:fetcher,
    crypto:{getRandomValues(bytes) { return bytes.fill(9); }}
  };
}
async function main() {
  const preview = {CHAT_ENABLED:true, environment:'preview', transport:async()=>({text:'Reply'})};
  assert.equal(ui.eligible(preview, {hostname:'a2-preview.vercel.app', pathname:'/'}), true);
  for (const pathname of ['/index.html', '/web', '/ops', '/os', '/schedule']) {
    assert.equal(ui.eligible(preview, {hostname:'a2-preview.vercel.app', pathname}), false);
  }
  for (const environment of ['preview', 'production']) {
    assert.equal(ui.eligible({...preview, environment, localTestStub:true}, {hostname:'localhost', pathname:'/'}), false);
  }
  assert.equal(ui.eligible({...preview, CHAT_ENABLED:false}, {hostname:'a2-preview.vercel.app', pathname:'/'}), false);
  assert.equal(ui.eligible({...preview, environment:'production'}, {hostname:'a2-preview.vercel.app', pathname:'/'}), false);
  assert.equal(ui.browserVoiceEnabled({...preview, CHAT_BROWSER_VOICE_ENABLED:true}, {hostname:'a2-preview.vercel.app', pathname:'/'}), false);

  const calls = [];
  const instance = browser(async (url, options) => {
    calls.push({url, options});
    return {ok:true, json:async()=>({CHAT_ENABLED:true, environment:'preview', CHAT_BROWSER_VOICE_ENABLED:true})};
  });
  const panel = await ui.boot(instance);
  assert.ok(panel);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/chat-inquiry?action=config');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.method, 'GET');
  const log = panel.children.find(child=>child.className === 'customer-assistant-log');
  assert.match(log.children[0].textContent, /I'm LAVAALL Assistant/);
  assert.doesNotMatch(log.children[0].textContent, /TEST ONLY/);
  const composer = panel.children.find(child=>child.className === 'customer-assistant-composer');
  assert.equal(composer.children.some(child=>child.className === 'customer-assistant-mic'), false);

  for (const config of [{CHAT_ENABLED:false, environment:'preview'}, {CHAT_ENABLED:true, environment:'production'}]) {
    const disabled = browser(async()=>({ok:true, json:async()=>config}));
    assert.equal(await ui.boot(disabled), null);
    assert.equal(disabled.document.body.children.length, 0);
  }
  const excluded = browser(async()=>{throw Error('must not fetch outside homepage');});
  excluded.location.pathname = '/web';
  assert.equal(await ui.boot(excluded), null);

  const requests = [];
  let random = 0;
  const transport = ui.createPreviewTransport(async(url, options)=>{
    requests.push({url, options, body:JSON.parse(options.body)});
    return {ok:true, json:async()=>url.endsWith('session') ? {sessionId:'session', csrf:'csrf'} : {text:'reply'}};
  }, {getRandomValues(bytes) { return bytes.fill(++random); }});
  assert.deepEqual(await transport('turn', {text:'first', fields:{phone:'ignored'}}), {text:'reply'});
  await transport('turn', {text:'second'});
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, '/api/chat-inquiry?action=session');
  assert.deepEqual(requests[0].body, {});
  for (const request of requests) {
    assert.equal(request.options.credentials, 'include');
    assert.equal(request.options.method, 'POST');
  }
  assert.equal(requests[1].url, '/api/chat-inquiry?action=turn');
  assert.deepEqual(Object.keys(requests[1].body), ['sessionId', 'csrf', 'eventId', 'text']);
  assert.equal(requests[1].body.sessionId, 'session');
  assert.equal(requests[1].body.csrf, 'csrf');
  assert.equal(requests[1].body.text, 'first');
  assert.match(requests[1].body.eventId, /^[a-f0-9]{64}$/);
  assert.notEqual(requests[1].body.eventId, requests[2].body.eventId);
  await assert.rejects(transport('confirm', {}), /text_only/);
  console.log('PASS A2 frontend: Preview gates, public config boot, text-only identity and session-once credentials transport');
}
main().catch(error=>{console.error(error); process.exitCode = 1;});
