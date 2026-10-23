// api/ops/_os_data.js — read-only data adapter for the /os section.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// Hard rules (docs/os/DECISIONS.md, brief section 6):
//  - Read only. This module never calls readStore() (it can SET the seeded goal)
//    and never issues anything but a KV GET.
//  - Never invent data. A source that does not exist returns null, and the
//    caller shows an empty state using SOURCES[key].reason.
//  - No model calls, no env writes, no secrets: Settings reports names only.

const fs = require('fs');

const { STORE_KEY } = require('./_store');
const { OFFICE_AGENTS } = require('./_office');
const { formatChicago, readRoutineHealthView } = require('./_routine_health');

// Where each widget's data comes from today. `live` is set per load.
const SOURCES = Object.freeze({
  approvals: { label: 'Pending chat proposals', from: 'store lavaall-ops-v2, chats[].proposals (status pending)' },
  decisions: { label: 'Decision log', from: 'a decisions record in the store or docs; none exists yet' },
  jev: { label: 'Jev scores', from: 'Jev scores stored with the decision log; none exist yet' },
  hotelBounceRate: { label: 'Hotel bounce rate', from: 'outreach results from the daily Sierra Leone leads routine; none are read yet' },
  outreach: { label: 'Outreach leads', from: 'the daily Sierra Leone leads routine; no read path is wired in this PR' },
  spend: { label: 'AI spend', from: 'AI spend records; none exist yet' },
  council: { label: 'AI Council records', from: 'stored council records (drafter, reviewer, rounds); none exist yet' },
  brief: { label: 'Morning brief', from: 'the latest CEO brief in the store; none is stored yet' },
  routines: { label: 'Routines', from: 'store lavaall-ops-v2, routines[]; health from the routine-health record' },
  notes: { label: 'Notes', from: 'store lavaall-ops-v2, notes[] (not deleted)' },
  desks: { label: 'Desks', from: 'desk registry (api/ops/_office.js); SOUL data deferred (DECISIONS.md #4)' },
  settings: { label: 'Connections', from: 'presence of existing env var names only' },
});

// ---- raw readers (GET only) -------------------------------------------------

function kvGet(key, env, fetchImpl) {
  const base = String(env.KV_REST_API_URL || '').replace(/\/$/, '');
  const body = ['GET', key];
  if (body[0] !== 'GET') throw new Error('os_data_read_only');
  return fetchImpl(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then((response) => {
    if (!response.ok) throw new Error('kv_get_failed');
    return response.json();
  });
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Returns the raw store object, or null when it cannot be read.
async function readRawStore(opts) {
  const env = (opts && opts.env) || process.env;
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  try {
    if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
      const payload = await kvGet(STORE_KEY, env, fetchImpl);
      return parseJson(payload && payload.result);
    }
    const file = String(env.OPS_STORE_FILE || '').trim();
    if (file && !env.VERCEL && fs.existsSync(file)) {
      return parseJson(fs.readFileSync(file, 'utf8'));
    }
  } catch {
    return null;
  }
  return null;
}

async function readHealth(opts) {
  if (opts && opts.health !== undefined) return opts.health;
  try {
    const view = await readRoutineHealthView();
    return view && view.ok && !view.empty ? view : null;
  } catch {
    return null;
  }
}

// ---- pure mappers: raw sources in, view data out ----------------------------

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function time(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function approvalsFrom(store) {
  if (!store) return null;
  const chats = Array.isArray(store.chats) ? store.chats : [];
  const items = [];
  chats.forEach((chat) => {
    (Array.isArray(chat && chat.proposals) ? chat.proposals : []).forEach((row) => {
      if (!row || row.status !== 'pending') return;
      items.push({
        id: text(row.id, 40),
        kind: text(row.kind, 40),
        title: text(row.title, 200),
        body: text(row.body, 2000),
        source: text(row.fields && row.fields.source, 240),
        createdAt: time(row.createdAt),
      });
    });
  });
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

function routinesFrom(store, health) {
  if (!store) return null;
  const byId = new Map();
  if (health && Array.isArray(health.routines)) {
    health.routines.forEach((row) => byId.set(row.slug, row));
  }
  const rows = Array.isArray(store.routines) ? store.routines : [];
  return rows
    .filter((row) => row && text(row.id, 40) && text(row.name, 160))
    .map((row) => {
      const lastRunAt = time(row.lastRunAt);
      const h = byId.get(row.id) || null;
      return {
        id: text(row.id, 40),
        name: text(row.name, 160),
        schedule: null, // the store keeps no schedule field; shown as "—"
        owner: null, // the store keeps no owner field; routine->desk links need one
        lastRunAt,
        lastRunLabel: lastRunAt ? formatChicago(new Date(lastRunAt).toISOString()) : '',
        lastRunStatus: text(row.lastRunStatus, 40),
        health: h ? { status: h.status, tone: h.tone, reason: h.reason, checkedLabel: health.checkedLabel } : null,
      };
    });
}

function notesFrom(store) {
  if (!store) return null;
  const rows = Array.isArray(store.notes) ? store.notes : [];
  return rows
    .filter((row) => row && !(row.deletedAt > 0) && text(row.title, 160))
    .map((row) => ({
      id: text(row.id, 40),
      title: text(row.title, 160),
      body: text(row.body, 4000),
      source: text(row.source, 240),
      updatedAt: time(row.updatedAt),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

const DECISION_LEVELS = /^L[0-4]$/;

function stamp(value) {
  if (Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

// Reads store.decisions only if a decision log exists there (it does not today).
// A Jev score outside 0..1 is dropped, never clamped: no score means "Jev: not run".
function decisionsFrom(store) {
  if (!store || !Array.isArray(store.decisions)) return null;
  return store.decisions
    .filter((row) => row && text(row.title, 200))
    .map((row) => ({
      id: text(row.id, 40),
      title: text(row.title, 200),
      level: DECISION_LEVELS.test(text(row.level, 4)) ? text(row.level, 4) : '',
      status: text(row.status, 40),
      desk: text(row.desk, 60),
      text: text(row.text, 4000),
      source: text(row.source, 240),
      date: stamp(row.date),
      jev: Number.isFinite(row.jev) && row.jev >= 0 && row.jev <= 1 ? row.jev : null,
    }))
    .sort((a, b) => b.date - a.date);
}

const COUNCIL_STATUSES = ['waiting_l3', 'approved', 'changes_requested', 'flagged', 'held'];

function wholeNumber(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

// Reads store.council only if council records exist there (they do not today).
// A record is data the council already produced; nothing here runs or calls a model.
function councilFrom(store) {
  if (!store || !Array.isArray(store.council)) return null;
  const person = (row) => ({ name: text(row && row.name, 60), role: text(row && row.role, 60) });
  return store.council
    .filter((row) => row && text(row.title, 200))
    .map((row) => {
      const seen = new Set();
      const rounds = (Array.isArray(row.rounds) ? row.rounds : [])
        .filter((r) => r && wholeNumber(r.n, 1, 20) && (text(r.draft, 8000) || text(r.review, 8000)))
        .sort((a, b) => a.n - b.n)
        .filter((r) => (seen.has(r.n) ? false : seen.add(r.n)))
        .map((r) => ({ n: r.n, draft: text(r.draft, 8000), review: text(r.review, 8000), at: stamp(r.at) }));
      return {
        id: text(row.id, 40),
        title: text(row.title, 200),
        desk: text(row.desk, 60),
        level: DECISION_LEVELS.test(text(row.level, 4)) ? text(row.level, 4) : '',
        date: stamp(row.date),
        drafter: person(row.drafter),
        reviewer: person(row.reviewer),
        maxRounds: wholeNumber(row.maxRounds, 1, 10) ? row.maxRounds : 3,
        rounds,
        round: rounds.length ? rounds[rounds.length - 1].n : 0,
        jev: Number.isFinite(row.jev) && row.jev >= 0 && row.jev <= 1 ? row.jev : null,
        status: COUNCIL_STATUSES.includes(row.status) ? row.status : '',
        source: text(row.source, 240),
      };
    })
    .sort((a, b) => b.date - a.date);
}

// Reads store.spend only if spend records exist there (they do not today).
// Amounts are US dollars. A record in another currency, or without a real amount, is skipped:
// nothing is converted, guessed or estimated.
function spendFrom(store) {
  if (!store || !Array.isArray(store.spend)) return null;
  return store.spend
    .filter((row) => row && Number.isFinite(row.amount) && row.amount >= 0 && row.amount <= 1000000)
    .filter((row) => !row.currency || String(row.currency).toUpperCase() === 'USD')
    .filter((row) => stamp(row.date) > 0)
    .map((row) => ({
      id: text(row.id, 40),
      date: stamp(row.date),
      cents: Math.round(row.amount * 100),
      provider: text(row.provider, 60),
      note: text(row.note, 200),
    }))
    .sort((a, b) => b.date - a.date);
}

const CHICAGO_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric' });
function chicagoDay(ms) {
  const p = {};
  CHICAGO_DAY.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = Number(x.value); });
  return { y: p.year, m: p.month, d: p.day };
}

// Month-to-date summary for the Chicago month containing `now`. Totals are summed in whole cents.
function spendSummary(records, now) {
  if (!records) return null;
  const today = chicagoDay(Number.isFinite(now) ? now : Date.now());
  const inMonth = records.filter((r) => { const d = chicagoDay(r.date); return d.y === today.y && d.m === today.m && d.d <= today.d; });
  const daysInMonth = new Date(Date.UTC(today.y, today.m, 0)).getUTCDate();
  const byDay = new Array(today.d + 1).fill(0);
  inMonth.forEach((r) => { byDay[chicagoDay(r.date).d] += r.cents; });
  const series = [];
  let run = 0;
  for (let day = 1; day <= today.d; day++) { run += byDay[day]; series.push({ day, cents: byDay[day], cumulativeCents: run }); }
  const providers = {};
  inMonth.forEach((r) => { const k = r.provider || 'Unspecified'; providers[k] = (providers[k] || 0) + r.cents; });
  const largest = inMonth.reduce((best, r) => (!best || r.cents > best.cents ? r : best), null);
  return {
    year: today.y,
    month: today.m,
    today: today.d,
    daysInMonth,
    count: inMonth.length,
    totalCents: run,
    total: run / 100,
    largest: largest ? { cents: largest.cents, date: largest.date, provider: largest.provider } : null,
    last: inMonth.length ? { cents: inMonth[0].cents, date: inMonth[0].date, provider: inMonth[0].provider } : null,
    providers: Object.keys(providers).sort().map((name) => ({ name, cents: providers[name] })),
    entries: inMonth.slice(0, 50).map((r) => ({ id: r.id, date: r.date, cents: r.cents, provider: r.provider, note: r.note })),
    series,
  };
}

function desksFrom() {
  return OFFICE_AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    short: agent.short,
    talk: agent.talk,
    now: null, // SOUL data deferred
    skills: null,
    rules: null,
    routines: null,
    decisions: null,
  }));
}

function present(env, names) {
  return names.some((name) => Boolean(env[name] && String(env[name]).trim()));
}

// Names only. Never values, never key material.
function settingsFrom(env) {
  const conn = (name, envNames, status) => ({ name, envNames: envNames.slice(), status });
  const status = (set) => (set ? 'configured' : 'not configured');
  const kvNames = ['KV_REST_API_URL', 'KV_REST_API_TOKEN'];
  const mailNames = ['OPS_GMAIL_CLIENT_ID', 'OPS_GMAIL_CLIENT_SECRET', 'OPS_GMAIL_REFRESH_TOKEN', 'RESEND_API_KEY'];
  return [
    // No GitHub env var exists in the ops app; report it as unknown, not as connected.
    conn('GitHub', [], 'unknown'),
    conn('Vercel', ['VERCEL', 'VERCEL_ENV'], status(present(env, ['VERCEL']))),
    conn('Mail', mailNames, status(present(env, mailNames))),
    conn('Store (KV)', kvNames, status(kvNames.every((name) => present(env, [name])))),
  ];
}

// Build the whole /os data object from already-read sources. Pure.
function buildOsData(sources, opts) {
  const store = sources && sources.store ? sources.store : null;
  const health = sources && sources.health ? sources.health : null;
  const env = (opts && opts.env) || process.env;

  const approvals = approvalsFrom(store);
  const decisions = decisionsFrom(store);
  const council = councilFrom(store);
  const spend = spendFrom(store);
  const spendMonth = spendSummary(spend, opts && opts.now);
  const data = {
    storeAvailable: Boolean(store),
    approvals,
    kpis: {
      awaitingApproval: approvals ? approvals.length : null,
      openDecisions: decisions ? decisions.filter((row) => row.status.toLowerCase() === 'open').length : null,
      hotelBounceRate: null,
      aiSpendMonth: spendMonth ? spendMonth.total : null,
    },
    brief: null,
    decisions,
    outreach: null,
    council,
    spend,
    spendMonth,
    routines: routinesFrom(store, health),
    notes: notesFrom(store),
    desks: desksFrom(),
    settings: settingsFrom(env),
  };
  data.sources = Object.keys(SOURCES).reduce((out, key) => {
    const live = key === 'desks' || key === 'settings'
      ? true
      : key === 'approvals' ? approvals !== null
        : key === 'routines' ? data.routines !== null
          : key === 'notes' ? data.notes !== null
            : key === 'decisions' ? decisions !== null
              : key === 'jev' ? Boolean((decisions && decisions.some((row) => row.jev !== null)) || (council && council.some((row) => row.jev !== null)))
                : key === 'council' ? council !== null
                  : key === 'spend' ? spend !== null
                    : false;
    out[key] = Object.assign({ live }, SOURCES[key]);
    return out;
  }, {});
  return data;
}

async function loadOsData(opts) {
  const store = (opts && opts.store !== undefined) ? opts.store : await readRawStore(opts);
  const health = await readHealth(opts);
  return buildOsData({ store, health }, opts);
}

module.exports = {
  SOURCES,
  approvalsFrom,
  buildOsData,
  councilFrom,
  decisionsFrom,
  spendFrom,
  spendSummary,
  desksFrom,
  loadOsData,
  notesFrom,
  readRawStore,
  routinesFrom,
  settingsFrom,
};
