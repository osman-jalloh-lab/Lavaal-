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
