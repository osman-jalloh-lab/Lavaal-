/**
 * Technology homepage mascot mount.
 *
 * The widget is shown only when:
 *   - this is the Technology homepage pathname '/'
 *   - GET /api/chat-inquiry?action=config reports CHAT_ENABLED and environment === 'preview'
 *
 * When those hold, the real adapter is selected (MASCOT_REAL_ADAPTER is set by this
 * page script, never by a visitor) and the existing inline .customer-assistant is hidden,
 * same as the local preview. Otherwise this file is a no-op: production and other
 * routes keep the existing assistant, and the mock adapter is never shown on the site.
 */
import { MascotController } from './mascot/mascot-controller.js';
import { ChatPanel } from './chat/chat-panel.js';
import { selectChatAdapter } from './chat/adapter-select.js';
import { MASCOT_SVGS } from './mascot/mascot-svgs.js';

export const MASCOT_STYLES = Object.freeze([
  '/mascot/src/tokens.css',
  '/mascot/src/mascot/mascot-animations.css',
  '/mascot/src/chat/chat-panel.css',
]);

export const CONFIG_URL = '/api/chat-inquiry?action=config';

export function isHomepage(location) {
  return Boolean(location && location.pathname === '/');
}

export function shouldEnableMascot(config) {
  return Boolean(config && config.CHAT_ENABLED === true && config.environment === 'preview');
}

export function hideLegacyAssistant(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  const hide = () => {
    root.querySelectorAll('.customer-assistant').forEach(el => {
      el.hidden = true;
      if (typeof el.setAttribute === 'function') el.setAttribute('aria-hidden', 'true');
      if (el.style) el.style.display = 'none';
    });
  };
  hide();
  if (typeof MutationObserver !== 'function') return { hide, observer: null };
  const target = root.body || root;
  const observer = new MutationObserver(hide);
  observer.observe(target, { childList: true, subtree: true });
  return { hide, observer };
}

export function loadMascotStyles(doc, hrefs = MASCOT_STYLES) {
  if (!doc || typeof doc.createElement !== 'function') return [];
  const head = doc.head || doc.getElementsByTagName?.('head')?.[0] || doc.documentElement;
  const added = [];
  for (const href of hrefs) {
    const existing = typeof doc.querySelector === 'function'
      && doc.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (head && typeof head.appendChild === 'function') head.appendChild(link);
    added.push(link);
  }
  return added;
}

async function readPublicConfig(fetchImpl) {
  if (typeof fetchImpl !== 'function') return { config: null, reason: 'no-fetch' };
  try {
    const response = await fetchImpl(CONFIG_URL, { method: 'GET', credentials: 'include', cache: 'no-store' });
    if (!response || !response.ok) return { config: null, reason: 'config-failed' };
    const config = await response.json();
    return { config, reason: shouldEnableMascot(config) ? 'preview' : 'not-preview' };
  } catch (_) {
    return { config: null, reason: 'config-failed' };
  }
}

export async function mountMascot(options = {}) {
  const {
    document: doc,
    location,
    fetch: fetchImpl,
    crypto,
    select = selectChatAdapter,
    Controller = MascotController,
    Panel = ChatPanel,
    svgSource = MASCOT_SVGS,
  } = options;

  if (!isHomepage(location)) return { mounted: false, mode: 'off', reason: 'route' };

  const { config, reason: configReason } = await readPublicConfig(fetchImpl);
  if (!shouldEnableMascot(config)) return { mounted: false, mode: 'off', reason: configReason };

  const selected = await select({
    flags: { MASCOT_REAL_ADAPTER: true },
    location,
    fetch: fetchImpl,
    crypto,
  });
  if (!selected || selected.mode !== 'real') {
    return { mounted: false, mode: 'off', reason: (selected && selected.reason) || 'adapter-mock' };
  }

  if (doc) {
    loadMascotStyles(doc);
    hideLegacyAssistant(doc);
  }

  const container = doc && typeof doc.createElement === 'function' ? doc.createElement('div') : { id: '' };
  container.id = 'lavaall-mascot';
  if (typeof container.setAttribute === 'function') container.setAttribute('aria-label', 'LAVAALL Assistant widget');
  if (doc && doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(container);

  const mascot = new Controller({
    container,
    variant: 'technology',
    enabled: true,
    svgSource,
  });
  const chatPanel = new Panel({
    mascot,
    adapter: selected.adapter,
    container: doc && doc.body ? doc.body : container,
  });
  if (typeof mascot.setState === 'function') mascot.setState('idle');
  if (typeof mascot.setMessage === 'function') mascot.setMessage('Need a hand?');

  return { mounted: true, mode: 'real', reason: selected.reason || 'enabled', mascot, chatPanel, adapter: selected.adapter, container };
}

export function autoStart(globals = typeof globalThis !== 'undefined' ? globalThis : {}) {
  const win = globals.window || (globals.document ? globals : null);
  if (!win || !win.document || typeof win.fetch !== 'function') return Promise.resolve({ mounted: false, mode: 'off', reason: 'no-window' });
  return mountMascot({
    document: win.document,
    location: win.location,
    fetch: win.fetch.bind(win),
    crypto: win.crypto,
  }).catch(() => ({ mounted: false, mode: 'off', reason: 'boot-error' }));
}

const isNode = typeof process !== 'undefined' && Boolean(process.versions && process.versions.node);
const isBrowser = !isNode && typeof window !== 'undefined' && typeof document !== 'undefined'
  && typeof window.fetch === 'function'
  && !globalThis.__MASCOT_BOOT_TEST__;
if (isBrowser) autoStart(window);
