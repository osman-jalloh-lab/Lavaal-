// Single door for /ops durability.
// Every KV client, KV key, and local OPS_STORE_FILE path comes from here.
// Production keeps today's key names and the KV_REST_API_* client.
// Preview and development never send an un-namespaced key.
// Underscore prefix: not a Vercel function. No npm. Never log tokens.

class StoreEnvError extends Error {
  constructor(code) {
    super(code);
    this.name = 'StoreEnvError';
    this.code = code;
    this.statusCode = 503;
  }
}

// Byte-for-byte production names. Modules keep their own copies of these
// strings; tests compare both so a rename cannot land quietly.
const PRODUCTION_KEYS = Object.freeze({
  office: 'lavaall-ops-v2',
  foundersDm: 'lavaall-ops-founders-dm-v1',
  foundersDmRead: 'lavaall-ops-founders-dm-v1:read',
  foundersDmLegacy: 'lavaall-ops-founders-dm-v1:legacy',
  signinLog: 'lavaall-ops-signin-log-v1',
  sessionGeneration: 'lavaall-ops-session-gen-v1',
  routineHealth: 'lavaall-ops-routine-health-v1',
  ceoPending: 'ops:ceo:pending',
  ceoThreadPrefix: 'ops:ceo:thread:',
  deskThreadPrefix: 'ops:agent:thread:',
});

const KNOWN_KIT_REGISTRY_SHEET_ID = '155IRHtVgDcAVXeeW6EU8X4fw7eOpjX4pgSejR92Ch_4';

// Redis commands /ops actually sends. The listed indexes are key slots.
// Anything else fails closed so a new command cannot skip the prefix check.
const COMMAND_KEY_SLOTS = Object.freeze({
  GET: [1],
  SET: [1],
  INCR: [1],
  DEL: 'all',
  LPUSH: [1],
  RPUSH: [1],
  LTRIM: [1],
  LRANGE: [1],
  HGETALL: [1],
  HSET: [1],
  RENAME: [1, 2],
});

function deploymentEnv() {
  const raw = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  if (raw === 'production') return 'production';
  if (raw === 'preview') return 'preview';
  if (raw === 'development') return 'development';
  // Vercel always sets VERCEL_ENV. A Vercel process with it missing must not
  // guess "production" and touch founder keys. Local `node` leaves it unset
  // and keeps today's unprefixed names so tests and OPS_STORE_FILE match.
  if (!raw) return process.env.VERCEL ? 'unknown' : 'production';
  return 'unknown';
}

function keyPrefix() {
  const env = deploymentEnv();
  switch (env) {
    case 'production':
      return '';
    case 'preview':
      return 'preview:';
    case 'development':
      return 'dev:';
    case 'unknown':
      return null;
    default: {
      const neverEnv = env;
      void neverEnv;
      return null;
    }
  }
}

function fileMarker() {
  const env = deploymentEnv();
  switch (env) {
    case 'production':
      return '';
    case 'preview':
      return '.preview';
    case 'development':
      return '.dev';
    case 'unknown':
      return null;
    default: {
      const neverEnv = env;
      void neverEnv;
      return null;
    }
  }
}

function readPair(urlName, tokenName) {
  const url = String(process.env[urlName] || '').trim().replace(/\/$/, '');
  const token = String(process.env[tokenName] || '').trim();
  if (!url && !token) return { mode: 'absent' };
  if (!url || !token) return { mode: 'incomplete' };
  return { mode: 'ready', url, token };
}

function previewKvPair() {
  return readPair('PREVIEW_KV_REST_API_URL', 'PREVIEW_KV_REST_API_TOKEN');
}

function productionKvPair() {
  return readPair('KV_REST_API_URL', 'KV_REST_API_TOKEN');
}

function persistenceBlock() {
  const env = deploymentEnv();
  if (env === 'unknown') return 'isolation_not_guaranteed';
  if ((env === 'preview' || env === 'development') && previewKvPair().mode === 'incomplete') {
    return 'preview_kv_incomplete';
  }
  return '';
}

function assertIsolation() {
  const reason = persistenceBlock();
  if (reason) throw new StoreEnvError(reason);
}

function blocksProductionFounderIntegration() {
  const env = deploymentEnv();
  switch (env) {
    case 'production':
      return false;
    case 'preview':
    case 'development':
    case 'unknown':
      return true;
    default: {
      const neverEnv = env;
      void neverEnv;
      return true;
    }
  }
}

function separationGuaranteed() {
  const env = deploymentEnv();
  switch (env) {
    case 'production':
      return true;
    case 'preview':
      return persistenceBlock() === '' && keyPrefix() === 'preview:';
    case 'development':
      return persistenceBlock() === '' && keyPrefix() === 'dev:';
    case 'unknown':
      return false;
    default: {
      const neverEnv = env;
      void neverEnv;
      return false;
    }
  }
}

function key(canonical) {
  const base = String(canonical || '');
  if (!base) throw new StoreEnvError('empty_key');
  const env = deploymentEnv();
  if (env === 'unknown') throw new StoreEnvError('isolation_not_guaranteed');
  if (env === 'production') {
    if (base.startsWith('preview:') || base.startsWith('dev:')) {
      throw new StoreEnvError('env_prefix_on_production');
    }
    return base;
  }
  const prefix = keyPrefix();
  if (!prefix) throw new StoreEnvError('isolation_not_guaranteed');
  if (base.startsWith(prefix)) return base;
  if (base.startsWith('preview:') || base.startsWith('dev:')) {
    throw new StoreEnvError('foreign_env_prefix');
  }
  return `${prefix}${base}`;
}

function scopeKey(canonical) {
  return key(canonical);
}

function assertBoundKey(value) {
  const env = deploymentEnv();
  const keyName = String(value || '');
  if (!keyName) throw new StoreEnvError('empty_key');
  switch (env) {
    case 'preview':
      if (!keyName.startsWith('preview:')) throw new StoreEnvError('unprefixed_preview_key');
      return keyName;
    case 'development':
      if (!keyName.startsWith('dev:')) throw new StoreEnvError('unprefixed_dev_key');
      return keyName;
    case 'production':
      if (keyName.startsWith('preview:') || keyName.startsWith('dev:')) {
        throw new StoreEnvError('env_prefix_on_production');
      }
      return keyName;
    case 'unknown':
      throw new StoreEnvError('isolation_not_guaranteed');
    default: {
      const neverEnv = env;
      void neverEnv;
      throw new StoreEnvError('isolation_not_guaranteed');
    }
  }
}

function bindCommand(args) {
  if (!Array.isArray(args) || args.length === 0) throw new StoreEnvError('empty_command');
  if (Array.isArray(args[0])) return args.map((row) => bindCommand(row));
  const name = String(args[0] || '');
  const slots = COMMAND_KEY_SLOTS[name];
  if (!slots) throw new StoreEnvError('unknown_kv_command');
  const next = args.slice();
  const indexes = slots === 'all'
    ? next.map((_, index) => index).filter((index) => index > 0)
    : slots;
  if (!indexes.length) throw new StoreEnvError('empty_key');
  indexes.forEach((index) => {
    if (typeof next[index] !== 'string') throw new StoreEnvError('empty_key');
    next[index] = assertBoundKey(next[index]);
  });
  return next;
}

function resolveClient() {
  const env = deploymentEnv();
  if (env === 'preview') {
    const preview = previewKvPair();
    if (preview.mode === 'ready') {
      return { url: preview.url, token: preview.token, database: 'preview' };
    }
  }
  const prod = productionKvPair();
  if (prod.mode !== 'ready') return null;
  let database = 'shared';
  if (env === 'production') database = 'production';
  return { url: prod.url, token: prod.token, database };
}

function kvConfigured() {
  if (persistenceBlock()) return false;
  return Boolean(resolveClient());
}

function withMarker(target, marker) {
  if (!marker) return target;
  const slash = Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'));
  const dir = slash >= 0 ? target.slice(0, slash + 1) : '';
  const base = slash >= 0 ? target.slice(slash + 1) : target;
  const dot = base.lastIndexOf('.');
  if (dot > 0) return `${dir}${base.slice(0, dot)}${marker}${base.slice(dot)}`;
  return `${target}${marker}`;
}

function opsStoreFile(suffix) {
  if (persistenceBlock()) return '';
  if (kvConfigured()) return '';
  if (process.env.VERCEL) return '';
  const custom = typeof process.env.OPS_STORE_FILE === 'string' ? process.env.OPS_STORE_FILE.trim() : '';
  if (!custom) return '';
  const marker = fileMarker();
  if (marker == null) return '';
  const joined = suffix ? `${custom}${suffix}` : custom;
  const target = withMarker(joined, marker);
  const env = deploymentEnv();
  if (env === 'preview' && !target.includes('.preview')) return '';
  if (env === 'development' && !target.includes('.dev')) return '';
  return target;
}

async function kvCommand(args, options) {
  assertIsolation();
  if (!separationGuaranteed()) throw new StoreEnvError('isolation_not_guaranteed');
  const guarded = bindCommand(args);
  const client = resolveClient();
  if (!client) {
    const err = new StoreEnvError('kv_unconfigured');
    throw err;
  }
  const pipelined = Array.isArray(guarded[0]);
  const endpoint = pipelined ? `${client.url}/pipeline` : client.url;
  const timeoutMs = options && Number(options.timeoutMs);
  let signal;
  if (Number.isFinite(timeoutMs) && timeoutMs > 0
    && typeof AbortSignal !== 'undefined'
    && typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(timeoutMs);
  }
  const init = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${client.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(guarded),
  };
  if (signal) init.signal = signal;
  const response = await fetch(endpoint, init);
  if (!response || !response.ok) throw new Error('kv_command_failed');
  return response.json();
}

function kitRegistrySheetId(productionId) {
  if (!blocksProductionFounderIntegration()) return productionId || '';
  const id = String(process.env.PREVIEW_KIT_REGISTRY_SHEET_ID || '').trim();
  const production = String(process.env.KIT_REGISTRY_SHEET_ID || '').trim();
  if (!id || id === production || id === KNOWN_KIT_REGISTRY_SHEET_ID) return '';
  return id;
}

function googleCalendarId(productionId) {
  const current = String(productionId || '').trim();
  if (!blocksProductionFounderIntegration()) return current;
  const id = String(process.env.PREVIEW_OPS_GOOGLE_CALENDAR_ID || '').trim();
  if (!id || id.toLowerCase() === 'primary') return '';
  if (current && id === current) return '';
  return id;
}

function supportMailboxAllowed() {
  return !blocksProductionFounderIntegration();
}

module.exports = {
  KNOWN_KIT_REGISTRY_SHEET_ID,
  PRODUCTION_KEYS,
  StoreEnvError,
  assertBoundKey,
  assertIsolation,
  blocksProductionFounderIntegration,
  deploymentEnv,
  googleCalendarId,
  key,
  keyPrefix,
  kitRegistrySheetId,
  kvCommand,
  kvConfigured,
  opsStoreFile,
  persistenceBlock,
  scopeKey,
  separationGuaranteed,
  supportMailboxAllowed,
};
