'use strict';
// TEST ONLY: browser speech is mocked; no browser, microphone or vendor requests.
let assertions = 0;
const assert = new Proxy(require('node:assert/strict'), {
  get(target, key) {
    if (typeof target[key] !== 'function') return target[key];
    return (...args) => { assertions++; return target[key](...args); };
  }
});
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/js/customer-assistant'), 'utf8');
const local = { pathname: '/', hostname: 'localhost' };
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.events = {};
    this.attributes = {};
    this.value = '';
    this.disabled = false;
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || ''; }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(name, handler) { this.events[name] = handler; }
  focus() { this.focused = true; }
}
function harness(options = {}) {
  const recognition = [], spoken = [], calls = [];
  let starts = 0, aborts = 0, cancels = 0;
  class Recognition {
    constructor() { recognition.push(this); }
    start() { starts++; if (options.startFails) throw Error('TEST ONLY start failure'); }
    stop() { if (this.onend) this.onend(); }
    abort() { aborts++; if (this.onend) this.onend(); }
  }
  const voices = options.voices || [{ lang: 'en-US' }, { lang: 'fr-FR' }, { lang: 'pt-PT' }, { lang: 'pt-BR' }];
  const root = {
    location: local,
    speechSynthesis: {
      getVoices: () => voices,
      speak: utterance => spoken.push(utterance),
      cancel: () => { cancels++; }
    },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }
  };
  if (options.recognition !== false) root[options.webkit ? 'webkitSpeechRecognition' : 'SpeechRecognition'] = Recognition;
  if (options.synthesis === false) delete root.speechSynthesis;
  if (options.utterance === false) delete root.SpeechSynthesisUtterance;
  const context = { window: root, module: { exports: {} } };
  vm.runInNewContext(source, context);
  const api = context.module.exports;
  const doc = { body: new Element('body'), createElement: tag => new Element(tag) };
  const config = {
    CHAT_ENABLED: true, CHAT_BROWSER_VOICE_ENABLED: true,
    localTestStub: true, environment: 'test',
    transport: async (action, payload) => {
      calls.push({ action, payload });
      if (action === 'review') return {
        token: 'a'.repeat(64), draftId: 'b'.repeat(64), csrf: 'c'.repeat(64),
        sessionId: 'd'.repeat(64), idempotencyKey: 'e'.repeat(64), summary: payload.fields
      };
      if (action === 'confirm') return { status: 'accepted' };
      return { text: 'TEST ONLY assistant reply' };
    },
    ...options.config
  };
  const panel = api.mount(doc, options.location || local, config);
  const composer = panel && panel.children.find(node => node.className === 'customer-assistant-composer');
  const child = className => composer && composer.children.find(node => node.className === className);
  return {
    api, root, config, doc, panel, composer, recognition, spoken, calls,
    mic: child('customer-assistant-mic'), speaker: child('customer-assistant-speaker'),
    hint: child('customer-assistant-voice-hint'), status: child('customer-assistant-voice-status'),
    input: composer && composer.children[0].children[1],
    send: null,
    review: null,
    languages: panel && panel.children.find(node => node.tag === 'label').children[0],
    counts: () => ({ starts, aborts, cancels })
  };
}
function result(instance, text, final = true) {
  const alternative = [{ transcript: text }];
  alternative.isFinal = final;
  instance.onresult({ resultIndex: 0, results: [alternative] });
}
const submit = { preventDefault() {} };
(async () => {
  const h = harness();
  for (const [lang, locale] of [['en', 'en-US'], ['en-US', 'en-US'], ['fr', 'fr-FR'], ['fr-FR', 'fr-FR'], ['pt', 'pt-PT'], ['pt-PT', 'pt-PT'], ['pt-BR', 'pt-BR']]) {
    assert.equal(h.api.speechLocale(lang), locale);
  }
  for (const lang of ['kri', 'krio', 'ht', 'unknown']) assert.equal(h.api.speechLocale(lang), null);
  for (const options of [{}, { webkit: true }, { recognition: false }, { synthesis: false }, { utterance: false }, { recognition: false, synthesis: false }]) {
    const item = harness(options);
    const support = item.api.browserVoiceSupported(item.root);
    assert.equal(support.recognition, options.recognition !== false);
    assert.equal(support.synthesis, options.synthesis !== false && options.utterance !== false);
    assert.equal(item.recognition.length, 0);
    assert.equal(item.counts().starts, 0);
    assert.equal(item.spoken.length, 0);
  }
  assert.equal(h.api.browserVoiceSupported({}).recognition, false);
  assert.equal(h.api.browserVoiceSupported({}).synthesis, false);
  const br = { lang: 'pt-BR', name: 'TEST ONLY Brazilian' }, pt = { lang: 'pt-PT', name: 'TEST ONLY Portuguese' };
  assert.equal(h.api.speechVoice([pt, br], 'pt'), pt);
  assert.equal(h.api.speechVoice([br], 'pt'), br);
  assert.equal(h.api.speechVoice([pt], 'pt'), pt);
  assert.equal(h.api.speechVoice([pt], 'pt-BR'), pt);
  assert.equal(h.api.speechVoice([{ lang: 'ht-HT' }], 'pt'), null);
  assert.equal(h.api.speechVoice([], 'en'), null);
  const fr = { lang: 'fr-FR' };
  assert.equal(h.api.speechVoice([br, fr], 'fr'), fr);
  assert.equal(h.api.speechVoice([br], 'kri'), null);
  assert.equal(h.api.browserVoiceEnabled(h.config, local), true);
  for (const config of [
    { CHAT_BROWSER_VOICE_ENABLED: false }, { CHAT_BROWSER_VOICE_ENABLED: undefined },
    { CHAT_BROWSER_VOICE_ENABLED: 'true' },
    { CHAT_BROWSER_VOICE_ENABLED: false, CHAT_VOICE_ENABLED: true },
    { CHAT_ENABLED: false }, { localTestStub: false }, { environment: 'preview' },
    { environment: 'production' }, { transport: undefined }
  ]) {
    const item = harness({ config });
    assert.equal(item.api.browserVoiceEnabled(item.config, local), false);
    assert.ok(!item.mic);
    assert.ok(!item.speaker);
    assert.equal(item.recognition.length, 0);
    assert.equal(item.counts().starts, 0);
    assert.equal(item.spoken.length, 0);
  }
  for (const location of [
    { pathname: '/', hostname: 'lavaall.com' },
    ...['/schedule', '/index.html', '/web', '/ops', '/os'].map(pathname => ({ ...local, pathname }))
  ]) {
    const item = harness({ location });
    assert.equal(item.panel, null);
    assert.equal(item.api.browserVoiceEnabled(item.config, location), false);
    assert.equal(item.recognition.length, 0);
  }
  assert.equal(h.panel.children.filter(node => node.tag === 'button').length, 0);
  assert.equal(h.input.tag, 'textarea');
  assert.equal(h.input.maxLength, 2000);
  assert.equal(h.mic.type, 'button');
  assert.equal(h.speaker.type, 'button');
  assert.equal(h.speaker.getAttribute('aria-pressed'), 'false');
  assert.ok(h.mic.getAttribute('aria-label') || h.mic.textContent);
  assert.ok(h.speaker.getAttribute('aria-label') || h.speaker.textContent);
  assert.match(h.hint.textContent, /Google/);
  assert.match(h.hint.textContent, /browser|vendor/i);
  assert.equal(h.panel.children.filter(node => node.tag === 'form').length, 1);
  h.input.value = 'TEST ONLY typed';
  await h.mic.events.click();
  assert.equal(h.recognition.length, 1);
  assert.equal(h.counts().starts, 1);
  assert.equal(h.recognition[0].lang, 'en-US');
  result(h.recognition[0], 'TEST ONLY interim', false);
  assert.equal(h.input.value, 'TEST ONLY typed');
  result(h.recognition[0], 'TEST ONLY dictated');
  assert.equal(h.input.value, 'TEST ONLY typed TEST ONLY dictated');
  assert.equal(h.calls.length, 0);
  h.recognition[0].onend();
  await h.mic.events.click();
  h.input.value = 'x'.repeat(1990);
  result(h.recognition[h.recognition.length - 1], ' TEST ONLY maximum length');
  assert.equal(h.input.value.length, 2000);
  assert.equal(h.calls.length, 0);
  h.recognition[h.recognition.length - 1].onend();
  await h.composer.events.submit(submit);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].action, 'turn');
  assert.equal(h.spoken.length, 0);
  assert.deepEqual(h.calls.map(call => call.action), ['turn']);
  assert.equal(h.panel.children.filter(node => node.tag === 'form').length, 1);

  for (const failure of [{ recognition: false }, { startFails: true }, { error: 'not-allowed' }, { error: 'service-not-allowed' }]) {
    const item = harness(failure);
    if (failure.recognition === false) {
      assert.equal(item.mic.disabled, true);
      assert.equal(item.recognition.length, 0);
    } else {
      await item.mic.events.click();
      if (failure.error) item.recognition[0].onerror({ error: failure.error });
    }
    assert.ok(item.status.textContent);
    assert.match(item.status.textContent, /text|typ|permission|microphone/i);
    assert.equal(item.input.disabled, false);
    assert.equal(item.calls.length, 0);
    item.input.value = 'TEST ONLY fallback text';
    await item.composer.events.submit(submit);
    assert.equal(item.calls.length, 1);
    assert.equal(item.calls[0].action, 'turn');
    assert.equal(item.calls[0].payload.text, 'TEST ONLY fallback text');
  }

  for (const [language, locale] of [['en', 'en-US'], ['fr', 'fr-FR'], ['pt', 'pt-PT']]) {
    const item = harness({ webkit: true, config: { language } });
    assert.ok(item.mic.getAttribute('aria-label') || item.mic.textContent);
    assert.ok(item.speaker.getAttribute('aria-label') || item.speaker.textContent);
    assert.equal(item.spoken.length, 0);
    await item.speaker.events.click();
    assert.equal(item.speaker.getAttribute('aria-pressed'), 'true');
    assert.equal(item.calls.length, 0);
    assert.equal(item.spoken.length, 0);
    await item.mic.events.click();
    assert.equal(item.recognition[0].lang, locale);
    result(item.recognition[0], 'TEST ONLY explicit ask');
    assert.equal(item.calls.length, 0);
    await item.composer.events.submit(submit);
    assert.equal(item.calls.length, 1);
    assert.equal(item.spoken.length, 1);
    assert.equal(item.spoken[0].text, 'TEST ONLY assistant reply');
    assert.equal(item.spoken[0].lang, locale);
    const before = item.counts().cancels;
    await item.speaker.events.click();
    assert.equal(item.speaker.getAttribute('aria-pressed'), 'false');
    assert.ok(item.counts().cancels > before);
    assert.equal(item.calls.length, 1);
    item.input.value = 'TEST ONLY silent reply';
    await item.composer.events.submit(submit);
    assert.equal(item.spoken.length, 1);
  }
  const fallback = harness({ config: { language: 'pt' }, voices: [pt] });
  await fallback.speaker.events.click();
  fallback.input.value = 'TEST ONLY Portuguese fallback';
  await fallback.composer.events.submit(submit);
  assert.equal(fallback.spoken[0].voice, pt);
  assert.equal(fallback.spoken[0].lang, 'pt-PT');
  const changing = harness();
  await changing.mic.events.click();
  await changing.speaker.events.click();
  const previousCancels = changing.counts().cancels;
  changing.languages.value = 'fr';
  changing.languages.events.change();
  assert.ok(changing.counts().aborts > 0);
  assert.ok(changing.counts().cancels > previousCancels);
  assert.equal(changing.counts().starts, 1);
  assert.equal(changing.calls.length, 0);
  assert.equal(changing.spoken.length, 0);
  await changing.mic.events.click();
  assert.equal(changing.recognition[changing.recognition.length - 1].lang, 'fr-FR');

  const vercel = JSON.parse(fs.readFileSync(require.resolve('../vercel.json'), 'utf8'));
  const policy = source => {
    const rule = vercel.headers.find(entry => entry.source === source);
    const header = rule && rule.headers.find(item => item.key === 'Permissions-Policy');
    return header && header.value;
  };
  assert.equal(policy('/(.*)'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(policy('/'), 'camera=(), microphone=(self), geolocation=()');
  assert.equal(policy('/ops(.*)'), 'camera=(), microphone=(self), geolocation=()');
  assert.equal(policy('/web/(.*)'), undefined);
  assert.equal(policy('/os/:path*') || policy('/os/') || policy('/os(.*)'), undefined);
  let network = 0;
  const isolated = {
    speechSynthesis: {
      getVoices: () => [{ lang: 'en-US' }],
      speak(utterance) { this.spoken = utterance; },
      cancel() { this.cancelled = true; }
    },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    fetch() { network++; throw Error('network'); }
  };
  const adapter = h.api.createBrowserTtsAdapter(isolated);
  assert.equal(adapter.supported, true);
  const spoken = adapter.speak('TEST ONLY adapter reply', { lang: 'en-US' });
  assert.equal(spoken.text, 'TEST ONLY adapter reply');
  assert.equal(spoken.lang, 'en-US');
  assert.equal(isolated.speechSynthesis.spoken, spoken);
  adapter.cancel();
  assert.equal(isolated.speechSynthesis.cancelled, true);
  assert.equal(network, 0);
  assert.equal(h.api.createBrowserTtsAdapter({}).supported, false);
  assert.equal(h.api.createBrowserTtsAdapter({}).speak('TEST ONLY'), null);
  const netlify = fs.readFileSync(require.resolve('../netlify.toml'), 'utf8');
  const globalPolicy = /for = "\/\*"[\s\S]*?Permissions-Policy = "([^"]+)"/.exec(netlify);
  const homePolicy = /for = "\/"[\s\S]*?Permissions-Policy = "([^"]+)"/.exec(netlify);
  assert.ok(globalPolicy && /microphone=\(\)/.test(globalPolicy[1]));
  assert.ok(homePolicy && /microphone=\(self\)/.test(homePolicy[1]));
  assert.doesNotMatch(netlify, /for = "\/(web|ops|os)/);
  const css = fs.readFileSync(require.resolve('../assets/css/customer-assistant.css'), 'utf8');
  assert.match(css, /customer-assistant-mic/);
  assert.match(css, /min-width: 44px/);
  const privacy = fs.readFileSync(require.resolve('../privacy.html'), 'utf8');
  assert.match(privacy, /Chrome,[^<]*audio is sent to Google/);
  assert.match(privacy, /not a paid ElevenLabs voice plan/);
  assert.match(privacy, /effective|Effective/i);
  console.log(`PASS chat browser voice: ${assertions} assertions; mocked feature/flag gates, locales, dictation, consent, fallbacks, TTS adapter and homepage-only mic policy; no real device or network`);
})().catch(error => { console.error(error); process.exitCode = 1; });
