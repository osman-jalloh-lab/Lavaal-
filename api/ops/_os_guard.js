// api/ops/_os_guard.js — founders-only access check for the /os section.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// Same rule as the existing private ops pages: a live session cookie for an
// allow-listed founder, no agent/bot credentials, no header-claimed identity.
// Never logs emails or cookies.

const { looksLikeAgentRequest } = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');

async function osGuard(req) {
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  const session = await readLiveSession(req);
  if (session && session.email) return { session };
  return { status: 401, error: 'sign_in_required' };
}

module.exports = { osGuard };
