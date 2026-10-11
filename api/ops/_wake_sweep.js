// Queue-check sweep — OFF (404) unless OPS_WAKE_SWEEP_SECRET is set.
// GET/POST /ops/api/ceo-bridge/wake-sweep with Authorization: Bearer $OPS_WAKE_SWEEP_SECRET.
// Reads ops:ceo:pending and the Researchy pending list. Calls wakeBox only
// when something is waiting, at most once per queue per sweep, and skips
// items already woken OPS_WAKE_MAX_ATTEMPTS times (held items stop costing
// box runs). Empty sweeps cost no agent run. Response has counts only.
// Caller: GitHub Actions workflow .github/workflows/ops-wake-sweep.yml
// (every 30 min, gated by repo variable OPS_WAKE_SWEEP_ENABLED + secret).
// Underscore prefix: not a Vercel function. No npm. Never log secrets.

const { header, json, timingSafeEqualString } = require('./_lib');
const ceo = require('./_ceo_bridge');
const { listResearchyPending, readStore } = require('./_store');
const { maxAttempts, pruneAttempts, wakeBox, wakeConfigured } = require('./_wake');

function sweepSecret() {
  const raw = process.env.OPS_WAKE_SWEEP_SECRET;
  return typeof raw === 'string' && raw.trim().length >= 16 ? raw.trim() : '';
}

function wakeSweepKind(req) {
  const area = String((req && req.query && req.query.area) || '');
  const pathOnly = String((req && req.url) || '').split('?')[0].replace(/\/+$/, '');
  const hay = `${area} ${pathOnly}`.toLowerCase();
  return /(?:^|[\s/])(?:api\/)?ceo-bridge\/wake-sweep(?:$|\s)/.test(hay) ? 'wake-sweep' : '';
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return json(res, status, body);
}

function authorized(req) {
  const expected = sweepSecret();
  if (!expected) return { error: 'disabled' };
  const raw = String(header(req, 'authorization') || '');
  const match = raw.match(/^\s*Bearer\s+(\S+)\s*$/i);
  const got = match ? match[1] : '';
  if (!got || !timingSafeEqualString(got, expected)) return { error: 'unauthorized' };
  return { ok: true };
}

function oldestEligible(items, attempts, cap) {
  const rows = (items || [])
    .filter((item) => item && item.messageId)
    .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  return rows.find((item) => (Number(attempts[item.messageId]) || 0) < cap) || null;
}

async function runWakeSweep() {
  const ceoList = await ceo.listPending();
  if (ceoList.error) return { error: ceoList.error };
  let researchy = [];
  try {
    researchy = listResearchyPending(await readStore()) || [];
  } catch {
    return { error: 'store_unavailable' };
  }
  const ceoItems = ceoList.pending || [];
  const liveIds = ceoItems.concat(researchy).map((item) => item && item.messageId).filter(Boolean);
  const attempts = await pruneAttempts(liveIds);
  const cap = maxAttempts();
  const counts = { ceo: ceoItems.length, researchy: researchy.length };
  const woke = [];
  const skipped = [];
  if (!wakeConfigured()) {
    return { ok: true, waiting: counts, woke, skipped: ['unconfigured'] };
  }
  const plan = [
    ['ceo', oldestEligible(ceoItems, attempts, cap)],
    ['researchy', oldestEligible(researchy, attempts, cap)],
  ];
  for (const [queue, item] of plan) {
    if (!item) continue;
    const result = await wakeBox({ queue, pendingId: item.messageId });
    if (result.ok && !result.skipped) woke.push(queue);
    else skipped.push(queue);
  }
  return { ok: true, waiting: counts, woke, skipped };
}

async function handleWakeSweep(req, res) {
  if (!wakeSweepKind(req)) return false;
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
    send(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  const auth = authorized(req);
  if (auth.error === 'disabled') {
    send(res, 404, { error: 'not_found' });
    return true;
  }
  if (auth.error) {
    send(res, 401, { error: 'unauthorized' });
    return true;
  }
  const result = await runWakeSweep();
  if (result.error) {
    send(res, 503, { error: result.error });
    return true;
  }
  send(res, 200, result);
  return true;
}

module.exports = {
  handleWakeSweep,
  runWakeSweep,
  wakeSweepKind,
};
