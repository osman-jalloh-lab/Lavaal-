/**
 * LAVAALL Mascot — chat adapter selection (feature flag, OFF by default).
 *
 * The real backend is used only when ALL of these hold:
 *   1. flags.MASCOT_REAL_ADAPTER === true (default false; set by the page owner, never by a visitor)
 *   2. the trusted route is the Technology homepage '/' (LAVAALL Web is a stub until A4 is approved)
 *   3. the server's public config says CHAT_ENABLED and environment === 'preview'
 * Otherwise the existing MockChatAdapter is returned, so the mascot keeps working as a demo.
 */
import { MockChatAdapter } from './mock-chat-adapter.js';
import { RealChatAdapter } from './real-chat-adapter.js';

export const DEFAULT_FLAGS = Object.freeze({ MASCOT_REAL_ADAPTER: false });

export async function selectChatAdapter({ flags = DEFAULT_FLAGS, location, fetch, crypto, adapterOptions = {} } = {}) {
  const mock = reason => ({ adapter: new MockChatAdapter(), mode: 'mock', reason });
  if (!flags || flags.MASCOT_REAL_ADAPTER !== true) return mock('flag-off');
  const pathname = location && typeof location.pathname === 'string' ? location.pathname : '';
  if (pathname !== '/') return mock(pathname.startsWith('/web') ? 'web-not-approved' : 'route');
  if (typeof fetch !== 'function') return mock('no-fetch');
  const adapter = new RealChatAdapter({ ...adapterOptions, fetch, crypto, site: 'technology' });
  const config = await adapter.loadConfig();
  if (!config.enabled) return mock('server-disabled');
  return { adapter, mode: 'real', reason: 'enabled' };
}
