'use strict';

// Live chat-handoff transport. One attempt, no retries — including network
// errors and timeouts — because Apps Script may already have delivered.
// Apps Script Web apps do not reliably expose custom request headers, so the
// shared secret is sent in the JSON body (`secret`), never in the URL.

const TIMEOUT_MS = 18000;
const EMAIL = 'support@lavaall.com';
const WHATSAPP = '+1 (737) 704-4182';
// Composed from existing customer-assistant "unknown" copy plus the standing
// contact line already used in chat fallbacks. Not a new SLA.
// Customer-facing wording approved by Osman 2026-11-15.
const HANDOFF_FALLBACK = "Sorry, we couldn't send your request just now. Please don't resend it. Email "
  + EMAIL + ' or WhatsApp ' + WHATSAPP + " and we'll pick it up.";

function secretInUrl(url, secret) {
  if (typeof url !== 'string' || typeof secret !== 'string' || !secret) return false;
  try {
    const parsed = new URL(url);
    if (parsed.username === secret || parsed.password === secret) return true;
    for (const value of parsed.searchParams.values()) {
      if (value === secret) return true;
    }
    return url.includes(secret);
  } catch {
    return url.includes(secret);
  }
}

function createHandoffTransport({
  fetch: fetchImpl,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  return async function handoffFetch(url, init = {}) {
    const impl = fetchImpl || globalThis.fetch;
    if (typeof impl !== 'function') throw new Error('unconfigured');
    if (typeof url !== 'string' || !url) throw new Error('invalid_url');
    const body = typeof init.body === 'string' ? init.body : '';
    let parsed = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { parsed = null; }
    const secret = parsed && typeof parsed.secret === 'string' ? parsed.secret : '';
    if (secret && secretInUrl(url, secret)) throw new Error('secret_in_url');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await impl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createHandoffTransport, HANDOFF_FALLBACK, TIMEOUT_MS, secretInUrl };
