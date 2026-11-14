'use strict';
// Homepage mascot mount: only on '/', only when the public config says Preview
// chat is enabled; the legacy inline assistant is then hidden. No network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

globalThis.__MASCOT_BOOT_TEST__ = true;

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

(async () => {
  const boot = await import(pathToFileURL(path.join(root, 'mascot/src/boot.js')).href);

  const index = read('index.html');
  const ignore = read('.vercelignore');

  assert.match(index, /<script type="module" src="\/mascot\/src\/boot\.js"><\/script>\s*<\/body>/);
  assert.equal((index.match(/mascot\/src\/boot\.js/g) || []).length, 1);
  assert.match(index, /<script src="assets\/js\/customer-assistant\.js" defer><\/script>/);
  // Mascot CSS is loaded by the boot script only after Preview chat is confirmed,
  // so the site's stylesheets are unchanged when the widget is off.
  assert.doesNotMatch(index, /mascot\/src\/tokens\.css/);
  assert.doesNotMatch(index, /mascot-animations\.css/);
  assert.doesNotMatch(index, /chat-panel\.css/);

  assert.match(ignore, /mascot\/demo\//);
  assert.match(ignore, /mascot\/tests\//);
  assert.match(ignore, /preview-shots\//);

  assert.equal(boot.isHomepage({ pathname: '/' }), true);
  assert.equal(boot.isHomepage({ pathname: '/schedule' }), false);
  assert.equal(boot.isHomepage({ pathname: '/index.html' }), false);
  assert.equal(boot.isHomepage({ pathname: '/web' }), false);

  assert.equal(boot.shouldEnableMascot({ CHAT_ENABLED: true, environment: 'preview' }), true);
  assert.equal(boot.shouldEnableMascot({ CHAT_ENABLED: false, environment: 'preview' }), false);
  assert.equal(boot.shouldEnableMascot({ CHAT_ENABLED: true, environment: 'production' }), false);
  assert.equal(boot.shouldEnableMascot({ CHAT_ENABLED: true, environment: 'disabled' }), false);
  assert.equal(boot.shouldEnableMascot(null), false);

  function el(tag, attrs = {}) {
    return {
      tagName: String(tag).toUpperCase(),
      children: [],
      style: {},
      hidden: false,
      className: attrs.className || '',
      id: attrs.id || '',
      rel: attrs.rel || '',
      href: attrs.href || '',
      attrs: { ...attrs },
      setAttribute(k, v) {
        this.attrs[k] = String(v);
        if (k === 'href') this.href = v;
        if (k === 'rel') this.rel = v;
        if (k === 'id') this.id = v;
        if (k === 'class' || k === 'className') this.className = v;
      },
      getAttribute(k) { return this.attrs[k]; },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    };
  }
  function match(node, sel) {
    if (sel.startsWith('.')) return String(node.className || '').split(/\s+/).includes(sel.slice(1));
    if (sel.startsWith('#')) return node.id === sel.slice(1);
    const link = sel.match(/^link\[rel="stylesheet"\]\[href="([^"]+)"\]$/);
    if (link) return node.tagName === 'LINK' && node.rel === 'stylesheet' && node.href === link[1];
    return false;
  }
  function walkSelect(node, sel, out) {
    if (match(node, sel)) out.push(node);
    for (const child of node.children || []) walkSelect(child, sel, out);
    return out;
  }
  function fakeDoc() {
    const head = el('head');
    const body = el('body');
    const assistant = el('div', { className: 'customer-assistant' });
    body.appendChild(assistant);
    const doc = {
      head, body,
      createElement: (tag) => el(tag),
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) { return walkSelect(head, sel, walkSelect(body, sel, [])); },
    };
    return { doc, assistant };
  }

  const { doc: hideDoc, assistant } = fakeDoc();
  boot.hideLegacyAssistant(hideDoc);
  assert.equal(assistant.hidden, true);
  assert.equal(assistant.style.display, 'none');
  assert.equal(assistant.attrs['aria-hidden'], 'true');

  const styleDoc = fakeDoc().doc;
  const added = boot.loadMascotStyles(styleDoc);
  assert.equal(added.length, boot.MASCOT_STYLES.length);
  assert.deepEqual(styleDoc.head.children.map(n => n.href), boot.MASCOT_STYLES.slice());
  assert.equal(boot.loadMascotStyles(styleDoc).length, 0, 'styles are not duplicated');

  function configFetch(body, { ok = true } = {}) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (body instanceof Error) throw body;
      return { ok, status: ok ? 200 : 503, json: async () => body };
    };
    fetchImpl.calls = calls;
    return fetchImpl;
  }
  class FakeController {
    constructor(opts) { this.opts = opts; this.state = null; this.message = null; }
    setState(s) { this.state = s; }
    setMessage(m) { this.message = m; }
  }
  class FakePanel { constructor(opts) { this.opts = opts; } }

  const previewFetch = configFetch({ CHAT_ENABLED: true, environment: 'preview' });
  const adapter = { isReal: true };
  const mounted = await boot.mountMascot({
    document: fakeDoc().doc,
    location: { pathname: '/' },
    fetch: previewFetch,
    crypto: {},
    select: async ({ flags, location }) => {
      assert.equal(flags.MASCOT_REAL_ADAPTER, true);
      assert.equal(location.pathname, '/');
      return { adapter, mode: 'real', reason: 'enabled' };
    },
    Controller: FakeController,
    Panel: FakePanel,
    svgSource: { technology: '<svg></svg>' },
  });
  assert.equal(mounted.mounted, true);
  assert.equal(mounted.mode, 'real');
  assert.equal(mounted.mascot.state, 'idle');
  assert.equal(mounted.mascot.message, 'Need a hand?');
  assert.equal(mounted.container.id, 'lavaall-mascot');
  assert.equal(mounted.chatPanel.opts.adapter, adapter);
  const hidden = mounted.container.parentNode.children.find(c => c.className === 'customer-assistant');
  assert.equal(hidden.hidden, true);
  assert.ok(previewFetch.calls.some(c => c.url === boot.CONFIG_URL && c.init.method === 'GET'));

  const offCases = [
    { name: 'schedule', location: { pathname: '/schedule' }, fetch: previewFetch, want: 'route' },
    { name: 'production', location: { pathname: '/' }, fetch: configFetch({ CHAT_ENABLED: true, environment: 'production' }), want: 'not-preview' },
    { name: 'chat off', location: { pathname: '/' }, fetch: configFetch({ CHAT_ENABLED: false, environment: 'preview' }), want: 'not-preview' },
    { name: 'config fail', location: { pathname: '/' }, fetch: configFetch({ error: 'chat_disabled' }, { ok: false }), want: 'config-failed' },
  ];
  for (const item of offCases) {
    const { doc, assistant: legacy } = fakeDoc();
    const result = await boot.mountMascot({
      document: doc,
      location: item.location,
      fetch: item.fetch,
      Controller: FakeController,
      Panel: FakePanel,
      select: async () => { throw new Error('select must not run when the mascot stays off'); },
    });
    assert.equal(result.mounted, false, item.name);
    assert.equal(result.mode, 'off', item.name);
    assert.equal(result.reason, item.want, item.name);
    assert.equal(legacy.hidden, false, item.name + ' must leave the existing assistant visible');
    assert.equal(doc.head.children.length, 0, item.name + ' must not load mascot CSS');
  }

  const mockFallback = await boot.mountMascot({
    document: fakeDoc().doc,
    location: { pathname: '/' },
    fetch: previewFetch,
    select: async () => ({ adapter: {}, mode: 'mock', reason: 'server-disabled' }),
    Controller: FakeController,
    Panel: FakePanel,
  });
  assert.equal(mockFallback.mounted, false);
  assert.equal(mockFallback.reason, 'server-disabled');

  console.log('ok - mascot boot mounts on Preview homepage only and hides the legacy assistant');
})().catch(error => { console.error(error); process.exitCode = 1; });
