// api/ops/_os_guard.js — founders-only access check for the /os section.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// Same rule as the existing private ops pages: a live session cookie for an
// allow-listed founder, no agent/bot credentials, no header-claimed identity.
// Never logs emails or cookies.
//
// One exception, for working on /os on a developer PC: a local-only bypass
// (see localDevBypass). It cannot open on Vercel or in production.

const { looksLikeAgentRequest } = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function headerOf(req, name) {
  const value = req && req.headers ? req.headers[name] : '';
  return String(Array.isArray(value) ? value[0] : value || '');
}

// True only when every condition holds: the explicit flag, a non-production
// Node, no Vercel runtime, a loopback Host, no proxy headers, a loopback peer.
// The flag alone is never enough, so a stray OS_DEV_BYPASS=1 in a hosted
// environment still gets the normal sign-in.
function localDevBypass(req, env) {
  const e = env || process.env;
  if (e.OS_DEV_BYPASS !== '1') return false;
  if (e.NODE_ENV === 'production') return false;
  if (e.VERCEL || e.VERCEL_ENV || e.VERCEL_URL) return false;

  const host = headerOf(req, 'host').toLowerCase().replace(/:\d+$/, '');
  if (!LOOPBACK_HOSTS.has(host)) return false;
  if (headerOf(req, 'x-forwarded-host') || headerOf(req, 'x-forwarded-for') || headerOf(req, 'x-real-ip')) return false;

  const peer = req && req.socket && req.socket.remoteAddress;
  if (!peer || !LOOPBACK_ADDRS.has(peer)) return false;
  return true;
}

async function osGuard(req) {
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  if (localDevBypass(req)) return { session: { email: 'local-dev@localhost' } };
  const session = await readLiveSession(req);
  if (session && session.email) return { session };
  return { status: 401, error: 'sign_in_required' };
}

module.exports = { osGuard, localDevBypass };
