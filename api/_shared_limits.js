// Enabling SECURITY_SHARED_LIMITS uses the EXISTING KV database (extra commands
// per request) and needs founder approval. Preview currently shares production
// KV, so the environment prefix keeps keys apart.
const crypto = require('crypto');
const memory = new Map();
const MAX_KEYS = 5000;

function sharedLimitsEnabled() {
  return process.env.SECURITY_SHARED_LIMITS === '1'
    && Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function storageKey(key) {
  const hash = crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 32);
  return `sec:${process.env.VERCEL_ENV || 'local'}:${hash}`;
}

function memoryHit(key, ttlMs) {
  const now = Date.now();
  for (const [k, entry] of memory) {
    if (entry.expires <= now) memory.delete(k);
  }
  let entry = memory.get(key);
  if (!entry) {
    entry = { expires: now + ttlMs, count: 0 };
    memory.set(key, entry);
  }
  entry.count += 1;
  while (memory.size > MAX_KEYS) memory.delete(memory.keys().next().value);
  return entry.count;
}

async function pipeline(commands) {
  const response = await fetch(`${process.env.KV_REST_API_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) throw new Error('kv_http');
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== commands.length
      || rows.some((row) => !row || row.error || !Object.hasOwn(row, 'result'))) {
    throw new Error('kv_response');
  }
  return rows;
}

function fallback() {
  console.log(JSON.stringify({ type: 'SharedLimits', event: 'fallback' }));
}

async function hit(key, { windowMs, max }) {
  const k = storageKey(key);
  if (sharedLimitsEnabled()) {
    try {
      const rows = await pipeline([['SET', k, '0', 'PX', String(windowMs), 'NX'], ['INCR', k]]);
      if (!Number.isInteger(rows[1].result) || rows[1].result < 1
          || !['OK', null].includes(rows[0].result)) throw new Error('kv_result');
      return { limited: rows[1].result > max, mode: 'shared' };
    } catch {
      fallback();
    }
  }
  return { limited: memoryHit(k, windowMs) > max, mode: 'memory' };
}

async function once(key, ttlMs) {
  const k = storageKey(key);
  if (sharedLimitsEnabled()) {
    try {
      const rows = await pipeline([['SET', k, '1', 'PX', String(ttlMs), 'NX']]);
      if (!['OK', null].includes(rows[0].result)) throw new Error('kv_result');
      return rows[0].result === 'OK';
    } catch {
      fallback();
    }
  }
  return memoryHit(k, ttlMs) === 1;
}

function resetSharedLimits() { memory.clear(); }

module.exports = { sharedLimitsEnabled, hit, once, resetSharedLimits };
