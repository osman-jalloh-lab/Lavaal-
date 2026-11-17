'use strict';
const { createHmac } = require('crypto');

// 30 POSTs per hashed IP per UTC minute allows normal sessions and retries.
const REQUEST_LIMIT = 30;
const WINDOW_MS = 60 * 1000;
async function requestRateLimit(store, salt, ip, now) {
  const hash = createHmac('sha256', salt).update(ip).digest('hex');
  const window = Math.floor(now / WINDOW_MS);
  // Store failure must fail closed with store_unavailable, never allow a flood.
  // Rotating IPs can still consume the existing monthly spending cap.
  try {
    return await store.transaction(records => {
      const key = 'chat:request-rate';
      const previous = records.get(key);
      const counters = previous?.window === window ? previous.counters : {};
      const count = counters[hash] || 0;
      if (count >= REQUEST_LIMIT) return { allowed: false, retryAfter: Math.ceil(((window + 1) * WINDOW_MS - now) / 1000) };
      counters[hash] = count + 1;
      records.set(key, { window, counters });
      return { allowed: true };
    });
  } catch (_) {
    const error = new Error('store_unavailable');
    error.code = 'store_unavailable';
    throw error;
  }
}
module.exports = { requestRateLimit, REQUEST_LIMIT, WINDOW_MS };
