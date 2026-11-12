'use strict';

// A durable adapter must serialize transactions across instances, commit before
// resolving, roll back throws, isolate returned values, and expire records.
// This implementation models those semantics only inside a shared TEST process.
function memoryStore() {
  let records = new Map();
  let queue = Promise.resolve();

  function transaction(operation) {
    const next = queue.then(async () => {
      const snapshot = structuredClone(records);
      const result = await operation(snapshot);
      // Clone both sides before committing so uncloneable results roll back too.
      const committed = structuredClone(snapshot);
      const isolatedResult = structuredClone(result);
      records = committed;
      return isolatedResult;
    });
    queue = next.catch(() => {});
    return next;
  }

  return { kind: 'mock', transaction };
}

module.exports = { memoryStore };

// Optimistic Redis CAS serializes transactions across serverless instances.
// Every key belongs exclusively to chat A2; no shared ops adapter or namespace.
function kvStore({ url, token, fetch: request = globalThis.fetch } = {}) {
  if (!url || !token || typeof request !== 'function') throw new Error('store_unavailable');
  const key = 'chat:a2:state';
  async function command(args) {
    try {
      const response = await request(url, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(args), signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (body.error) throw new Error();
      return body.result;
    } catch (_) { const error = new Error('store_unavailable'); error.code = 'store_unavailable'; throw error; }
  }
  return { kind: 'kv', async transaction(operation) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const previous = await command(['GET', key]);
      let records;
      try { records = new Map(previous ? JSON.parse(previous).records : []); }
      catch (_) { const error = new Error('store_unavailable'); error.code = 'store_unavailable'; throw error; }
      const result = await operation(records);
      const isolatedResult = structuredClone(result);
      const next = JSON.stringify({ revision: require('crypto').randomBytes(16).toString('hex'), records: [...records] });
      const committed = await command(['EVAL',
        "local old=redis.call('GET',KEYS[1]); if (old or '') ~= ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1",
        '1', key, previous || '', next]);
      if (Number(committed) === 1) return isolatedResult;
    }
    const error = new Error('store_unavailable'); error.code = 'store_unavailable'; throw error;
  } };
}
module.exports.kvStore = kvStore;
