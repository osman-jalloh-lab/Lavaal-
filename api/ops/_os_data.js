// api/ops/_os_data.js — read-only data adapter for the /os section.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// Hard rules (docs/os/DECISIONS.md, brief section 6):
//  - Read only. This module never calls readStore() (it can SET the seeded goal)
//    and never issues anything but a KV GET.
//  - Never invent data. A source that does not exist returns null, and the
//    caller shows an empty state using SOURCES[key].reason.
//  - No model calls, no env writes, no secrets: Settings reports names only.
//  - Live feeds (morning brief, routine health, spend, outreach counts, desk now lines) are written only by the
//    ingest endpoint (api/ops/_os_ingest.js) into their own KV keys. This module only reads them, through
//    readFeeds() in _os_feeds.js, which issues GETs and nothing else.
//  - The static LAVAALL OS data pack (api/os/_data, built 22 Oct 2026) supplies decisions, routines, desk
//    now/rules/skills, skills and rules. It is bundled with the function by literal require() and is never
//    written to the KV store (DECISIONS.md #20).

const fs = require('fs');

const { STORE_KEY } = require('./_store');
const { OFFICE_AGENTS } = require('./_office');
const { readRoutineHealthView } = require('./_routine_health');
const { briefView, deskStatusView, healthView, outreachView, readFeeds, spendRows } = require('./_os_feeds');
const DATA_PACK = require('../os/_data/index.js');

// Where each widget's data comes from today. `live` is set per load.
const SOURCES = Object.freeze({
  approvals: { label: 'Pending chat proposals', from: 'store lavaall-ops-v2, chats[].proposals (status pending)' },
  decisions: { label: 'Decision log', from: 'decisions.json in the LAVAALL OS data pack (built 22 Oct 2026); a decisions copy in the store wins if one exists' },
  jev: { label: 'Jev scores', from: 'Jev scores recorded with the decision log; a decision without one shows "Jev: not run"' },
  hotelBounceRate: { label: 'Hotel bounce rate', from: 'the outreach-stats feed from the daily Sierra Leone leads routine (bounced of sent); none has been received yet' },
  outreach: { label: 'Outreach', from: 'the outreach-stats feed from the daily Sierra Leone leads routine (counts only, no names); none has been received yet' },
  spend: { label: 'AI spend', from: 'the spend feed; none has been received yet' },
  council: { label: 'AI Council records', from: 'stored council records (drafter, reviewer, rounds); none exist yet' },
  brief: { label: 'Morning brief', from: 'the morning-brief feed; none has been received yet' },
  routines: { label: 'Routines', from: 'routines.json in the LAVAALL OS data pack (schedule, owner, status); live routine health (the routine-health feed) merged by id' },
  notes: { label: 'Notes', from: 'store lavaall-ops-v2, notes[] (not deleted)' },
  desks: { label: 'Desks', from: 'desk registry (api/ops/_office.js) plus desks.json in the data pack (rules, skills; Scout from extraDesks); the now line comes from the desk-status feed when one exists' },
  skills: { label: 'Skills', from: 'skills.json in the LAVAALL OS data pack' },
  rules: { label: 'Founder rules', from: 'rules.json in the LAVAALL OS data pack (matched by FR id)' },
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

// Routines come from the data pack: name, schedule, owner (a desk id) and status. The pack's lastRunAt and
// lastRunStatus are stale and are ignored. The only "last run" shown is the live routine-health record,
// merged by id.
function routinesFrom(pack, health) {
  if (!pack || !Array.isArray(pack.routines)) return null;
  const byId = new Map();
  if (health && Array.isArray(health.routines)) {
    health.routines.forEach((row) => byId.set(row.slug, row));
  }
  return pack.routines
    .filter((row) => row && text(row.id, 60) && text(row.name, 160))
    .map((row) => {
      const h = byId.get(text(row.id, 60)) || null;
      const ranAt = h ? Date.parse(h.lastRunAt) : NaN;
      return {
        id: text(row.id, 60),
        name: text(row.name, 160),
        schedule: text(row.schedule, 160) || null,
        owner: text(row.owner, 40) || null,
        status: text(row.status, 20),
        lastRunAt: Number.isFinite(ranAt) ? ranAt : 0,
        lastRunLabel: h ? text(h.lastRunLabel, 40) : '',
        lastRunStatus: '',
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

// Decisions: a decisions array in the store wins if one ever exists (normalizeStore drops the key today, so
// none does); otherwise the data pack's decisions.json. A Jev score outside 0..1 is dropped, never clamped:
// no score means "Jev: not run". An unreadable level becomes empty and shows as a dash.
function decisionsFrom(store, pack) {
  const rows = store && Array.isArray(store.decisions) ? store.decisions
    : pack && Array.isArray(pack.decisions) ? pack.decisions
      : null;
  if (!rows) return null;
  return rows
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

// Desk now line, rules and skills come from the data pack's desks.json, merged into the desk registry by id.
// A desk the pack has no row for keeps null (unknown). Scout is not in the registry; desks.json lists it under
// extraDesks, and it is added as a seventh desk with no Talk link (there is no /ops chat for it).
function packDesk(row, live) {
  const list = (value, max) => (Array.isArray(value) ? value.map((x) => text(x, max)).filter(Boolean) : null);
  return {
    now: live ? live.now : row ? text(row.now, 200) || null : null,
    nowUpdatedAt: live && Number.isFinite(live.updatedAt) ? live.updatedAt : 0,
    skills: row ? list(row.skills, 80) : null,
    rules: row ? list(row.rules, 400) : null,
  };
}

function desksFrom(pack, liveNow) {
  const live = liveNow || {};
  const rows = pack && pack.desks && Array.isArray(pack.desks.desks) ? pack.desks.desks : [];
  const extra = pack && pack.desks && Array.isArray(pack.desks.extraDesks) ? pack.desks.extraDesks : [];
  const byId = new Map(rows.map((row) => [text(row.id, 40), row]));
  const registry = OFFICE_AGENTS.map((agent) => Object.assign({
    id: agent.id,
    name: agent.name,
    short: agent.short,
    talk: agent.talk,
    inRegistry: true,
  }, packDesk(byId.get(agent.id), live[agent.id]), { routines: null, decisions: null }));
  const added = extra
    .filter((row) => row && text(row.id, 40) && text(row.name, 120))
    .map((row) => Object.assign({
      id: text(row.id, 40),
      name: text(row.name, 120),
      short: text(row.short, 40) || text(row.name, 40),
      talk: '',
      inRegistry: false,
    }, packDesk(row, live[text(row.id, 40)]), { routines: null, decisions: null }));
  return registry.concat(added);
}

// Skills (id, name, when to use, desks the routing table names) and founder rules (FR id, title, rule, section).
// Long text is never truncated: limits sit far above the longest value in the pack.
function skillsFrom(pack) {
  if (!pack || !Array.isArray(pack.skills)) return null;
  return pack.skills
    .filter((row) => row && text(row.id, 80))
    .map((row) => ({
      id: text(row.id, 80),
      name: text(row.name, 120) || text(row.id, 80),
      whenToUse: text(row.whenToUse, 4000),
      desks: Array.isArray(row.desks) ? row.desks.map((d) => text(d, 40)).filter(Boolean) : [],
    }));
}

function rulesFrom(pack) {
  if (!pack || !Array.isArray(pack.rules)) return null;
  return pack.rules
    .filter((row) => row && /^FR-\d+$/.test(text(row.id, 20)))
    .map((row) => ({
      id: text(row.id, 20),
      title: text(row.title, 400),
      rule: text(row.rule, 4000),
      section: text(row.section, 200),
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

// The routine-health feed wins over the older routine-health record, routine by routine.
function mergeHealth(legacy, fed) {
  if (!fed) return legacy || null;
  if (!legacy || !Array.isArray(legacy.routines)) return fed;
  const seen = new Set(fed.routines.map((r) => r.slug));
  return { checkedLabel: fed.checkedLabel, routines: fed.routines.concat(legacy.routines.filter((r) => !seen.has(r.slug))) };
}

// Counts for the Home health card: routines that report a status, by status. null when none report.
function healthSummary(routines) {
  if (!Array.isArray(routines)) return null;
  const reporting = routines.filter((r) => r.health && r.health.status);
  if (!reporting.length) return null;
  const counts = { ok: 0, late: 0, failed: 0, skipped: 0, other: 0 };
  reporting.forEach((r) => {
    const k = String(r.health.status).toLowerCase();
    if (k === 'ok') counts.ok += 1;
    else if (k === 'late') counts.late += 1;
    else if (k === 'failed' || k === 'missing') counts.failed += 1;
    else if (k === 'skipped') counts.skipped += 1;
    else counts.other += 1;
  });
  return { reporting: reporting.length, total: routines.length, checkedLabel: reporting[0].health.checkedLabel || '', counts };
}

// Build the whole /os data object from already-read sources. Pure.
function buildOsData(sources, opts) {
  const store = sources && sources.store ? sources.store : null;
  const feeds = (sources && sources.feeds) || {};
  const health = mergeHealth(sources && sources.health ? sources.health : null, healthView(feeds.health));
  const env = (opts && opts.env) || process.env;

  const pack = opts && opts.pack !== undefined ? opts.pack : DATA_PACK;

  const approvals = approvalsFrom(store);
  const decisions = decisionsFrom(store, pack);
  const council = councilFrom(store);
  const spend = spendRows(feeds.spend) || spendFrom(store);
  const outreachStats = outreachView(feeds.outreach);
  const brief = briefView(feeds.brief);
  const routines = routinesFrom(pack, health);
  const spendMonth = spendSummary(spend, opts && opts.now);
  const data = {
    storeAvailable: Boolean(store),
    approvals,
    kpis: {
      awaitingApproval: approvals ? approvals.length : null,
      openDecisions: decisions ? decisions.filter((row) => row.status.toLowerCase() === 'open').length : null,
      hotelBounceRate: outreachStats ? outreachStats.bounceRate : null,
      hotelBounceDate: outreachStats ? outreachStats.date : null,
      aiSpendMonth: spendMonth ? spendMonth.total : null,
    },
    brief,
    decisions,
    outreach: null,
    outreachStats,
    council,
    spend,
    spendMonth,
    routines,
    routineHealth: healthSummary(routines),
    notes: notesFrom(store),
    desks: desksFrom(pack, deskStatusView(feeds.desks)),
    skills: skillsFrom(pack),
    rules: rulesFrom(pack),
    packBuiltAt: pack && pack.builtAt ? pack.builtAt : null,
    settings: settingsFrom(env),
  };
  data.sources = Object.keys(SOURCES).reduce((out, key) => {
    const live = key === 'desks' || key === 'settings'
      ? true
      : key === 'approvals' ? approvals !== null
        : key === 'routines' ? data.routines !== null
          : key === 'notes' ? data.notes !== null
            : key === 'brief' ? brief !== null
              : key === 'outreach' ? outreachStats !== null
                : key === 'hotelBounceRate' ? Boolean(outreachStats && outreachStats.bounceRate !== null)
            : key === 'decisions' ? decisions !== null
              : key === 'jev' ? Boolean((decisions && decisions.some((row) => row.jev !== null)) || (council && council.some((row) => row.jev !== null)))
                : key === 'council' ? council !== null
                  : key === 'spend' ? spend !== null
                    : key === 'skills' ? data.skills !== null
                      : key === 'rules' ? data.rules !== null
                        : false;
    out[key] = Object.assign({ live }, SOURCES[key]);
    return out;
  }, {});
  return data;
}

async function loadOsData(opts) {
  const store = (opts && opts.store !== undefined) ? opts.store : await readRawStore(opts);
  const health = await readHealth(opts);
  const feeds = await readFeeds(opts);
  return buildOsData({ store, health, feeds }, opts);
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
  healthSummary,
  loadOsData,
  mergeHealth,
  notesFrom,
  readRawStore,
  routinesFrom,
  rulesFrom,
  settingsFrom,
  skillsFrom,
};
