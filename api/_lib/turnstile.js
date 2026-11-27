'use strict';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MESSAGE = 'Please complete the verification and try again.';
let warned = false;

async function verifyTurnstile(body, headers = {}) {
  const secret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  // Leave existing form behavior intact until a production secret is configured.
  if (!secret) {
    if (!warned) console.warn('Turnstile is not enforced because TURNSTILE_SECRET_KEY is not configured.');
    warned = true;
    return null;
  }
  const token = body && (body.turnstileToken || body['cf-turnstile-response']);
  if (typeof token !== 'string' || !token.trim()) return { error: 'turnstile_required', message: MESSAGE };
  const payload = { secret, response: token.trim() };
  const ip = String(headers['x-forwarded-for'] || headers['x-real-ip'] || '').split(',')[0].trim();
  if (ip) payload.remoteip = ip;
  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (response.ok && result && result.success === true) return null;
  } catch (_) { /* Treat network and malformed response failures as verification failures. */ }
  return { error: 'turnstile_failed', message: MESSAGE };
}

module.exports = { verifyTurnstile };
