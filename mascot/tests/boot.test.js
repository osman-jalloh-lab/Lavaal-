import { test, assert, assertEqual, registerAsync } from './run-all.js';
import {
  isHomepage, shouldEnableMascot, hideLegacyAssistant, loadMascotStyles,
  mountMascot, MASCOT_STYLES, CONFIG_URL,
} from '../src/boot.js';

globalThis.__MASCOT_BOOT_TEST__ = true;

test('boot: homepage is only pathname /', () => {
  assertEqual(isHomepage({ pathname: '/' }), true);
  assertEqual(isHomepage({ pathname: '/schedule' }), false);
  assertEqual(isHomepage({ pathname: '/web' }), false);
});

test('boot: enabled only when chat is on in preview', () => {
  assertEqual(shouldEnableMascot({ CHAT_ENABLED: true, environment: 'preview' }), true);
  assertEqual(shouldEnableMascot({ CHAT_ENABLED: true, environment: 'production' }), false);
  assertEqual(shouldEnableMascot({ CHAT_ENABLED: false, environment: 'preview' }), false);
});

function el(tag, attrs = {}) {
  return {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: {},
    hidden: false,
    className: attrs.className || '',
    id: attrs.id || '',
    rel: '',
    href: '',
    attrs: { ...attrs },
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'href') this.href = v;
      if (k === 'rel') this.rel = v;
      if (k === 'id') this.id = v;
    },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
  };
}
function match(node, sel) {
  if (sel.startsWith('.')) return String(node.className || '').split(/\s+/).includes(sel.slice(1));
  const link = sel.match(/^link\[rel="stylesheet"\]\[href="([^"]+)"\]$/);
  if (link) return node.tagName === 'LINK' && node.rel === 'stylesheet' && node.href === link[1];
  return false;
}
function walk(node, sel, out) {
  if (match(node, sel)) out.push(node);
  for (const child of node.children || []) walk(child, sel, out);
  return out;
}
function fakeDoc() {
  const head = el('head');
  const body = el('body');
  const assistant = el('div', { className: 'customer-assistant' });
  body.appendChild(assistant);
  const doc = {
    head, body,
    createElement: tag => el(tag),
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return walk(head, sel, walk(body, sel, [])); },
  };
  return { doc, assistant };
}

test('boot: hideLegacyAssistant hides .customer-assistant', () => {
  const { doc, assistant } = fakeDoc();
  hideLegacyAssistant(doc);
  assertEqual(assistant.hidden, true);
  assertEqual(assistant.style.display, 'none');
});

test('boot: styles are added once', () => {
  const { doc } = fakeDoc();
  assertEqual(loadMascotStyles(doc).length, MASCOT_STYLES.length);
  assertEqual(loadMascotStyles(doc).length, 0);
});

class FakeController {
  constructor(opts) { this.opts = opts; this.state = null; this.message = null; }
  setState(s) { this.state = s; }
  setMessage(m) { this.message = m; }
}
class FakePanel { constructor(opts) { this.opts = opts; } }
function configFetch(body, { ok = true } = {}) {
  return async () => {
    if (body instanceof Error) throw body;
    return { ok, status: ok ? 200 : 503, json: async () => body };
  };
}

registerAsync(test('boot: mounts on Preview / with the real adapter and hides the legacy assistant', async () => {
  const { doc, assistant } = fakeDoc();
  const result = await mountMascot({
    document: doc,
    location: { pathname: '/' },
    fetch: configFetch({ CHAT_ENABLED: true, environment: 'preview' }),
    select: async ({ flags }) => {
      assertEqual(flags.MASCOT_REAL_ADAPTER, true);
      return { adapter: { isReal: true }, mode: 'real', reason: 'enabled' };
    },
    Controller: FakeController,
    Panel: FakePanel,
    svgSource: { technology: '<svg></svg>' },
  });
  assertEqual(result.mounted, true);
  assertEqual(result.mode, 'real');
  assertEqual(result.mascot.state, 'idle');
  assertEqual(result.container.id, 'lavaall-mascot');
  assertEqual(assistant.hidden, true);
  assert(MASCOT_STYLES.includes('/mascot/src/tokens.css'));
  assertEqual(CONFIG_URL, '/api/chat-inquiry?action=config');
}));

registerAsync(test('boot: production or a non-home path is a no-op', async () => {
  const { doc, assistant } = fakeDoc();
  const prod = await mountMascot({
    document: doc,
    location: { pathname: '/' },
    fetch: configFetch({ CHAT_ENABLED: true, environment: 'production' }),
    select: async () => { throw new Error('select should not run'); },
    Controller: FakeController,
    Panel: FakePanel,
  });
  assertEqual(prod.mounted, false);
  assertEqual(prod.reason, 'not-preview');
  assertEqual(assistant.hidden, false);
  const other = await mountMascot({
    document: fakeDoc().doc,
    location: { pathname: '/schedule' },
    fetch: configFetch({ CHAT_ENABLED: true, environment: 'preview' }),
    select: async () => { throw new Error('select should not run'); },
  });
  assertEqual(other.reason, 'route');
}));
