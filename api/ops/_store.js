// Shared LAVAALL OS dashboard store (ticket 02).
// In-memory Map by default (same cold-start limit as Slack task memory).
// Optional durable backend: Vercel KV / Upstash REST via fetch — no npm.
// Ticket 03 hardens persistence. Underscore prefix: not a Vercel function.

const crypto = require('crypto');

const STORE_KEY = 'lavaall-ops-dashboard-v1';
const MAX_TASKS = 100;
const MAX_NOTES = 100;
const STATUSES = Object.freeze(['todo', 'doing', 'done']);

let memory = emptyStore();

function emptyStore() {
  return { goal: null, tasks: [], notes: [] };
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function storeMode() {
  return kvConfigured() ? 'kv' : 'memory';
}

function isDurable() {
  return storeMode() === 'kv';
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, max) : '';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTask(row) {
  const status = STATUSES.includes(row && row.status) ? row.status : 'todo';
  return {
    id: clean(row && row.id, 40) || crypto.randomBytes(8).toString('hex'),
    title: clean(row && row.title, 160),
    status,
    nextAction: clean(row && row.nextAction, 200),
    createdAt: Number.isFinite(row && row.createdAt) ? row.createdAt : Date.now(),
    createdBy: clean(row && row.createdBy, 120),
  };
}

function normalizeNote(row) {
  return {
    id: clean(row && row.id, 40) || crypto.randomBytes(8).toString('hex'),
    title: clean(row && row.title, 160),
    body: clean(row && row.body, 4000),
    createdAt: Number.isFinite(row && row.createdAt) ? row.createdAt : Date.now(),
    createdBy: clean(row && row.createdBy, 120),
  };
}

function normalizeGoal(row) {
  if (!row || typeof row !== 'object') return null;
  const title = clean(row.title, 200);
  if (!title) return null;
  return {
    title,
    definitionOfDone: clean(row.definitionOfDone, 400),
    nextStep: clean(row.nextStep, 200),
    targetDate: clean(row.targetDate, 32),
  };
}

function normalizeStore(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    goal: normalizeGoal(src.goal),
    tasks: Array.isArray(src.tasks) ? src.tasks.map(normalizeTask).filter((row) => row.title).slice(0, MAX_TASKS) : [],
    notes: Array.isArray(src.notes) ? src.notes.map(normalizeNote).filter((row) => row.title).slice(0, MAX_NOTES) : [],
  };
}

function unfinishedTasks(store) {
  return (store.tasks || []).filter((task) => task.status !== 'done');
}

function nextActionFrom(store) {
  const open = unfinishedTasks(store);
  const withStep = open.find((task) => task.nextAction);
  const pick = withStep || open[0];
  if (!pick) return null;
  return {
    taskId: pick.id,
    title: pick.title,
    detail: pick.nextAction || pick.title,
  };
}

function dashboardSnapshot(store) {
  const data = normalizeStore(store);
  return {
    goal: data.goal,
    unfinished: unfinishedTasks(data),
    nextAction: nextActionFrom(data),
    notes: data.notes.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    empty: !data.goal && unfinishedTasks(data).length === 0 && data.notes.length === 0,
    mode: storeMode(),
    durable: isDurable(),
  };
}

async function kvGet() {
  const response = await fetch(`${process.env.KV_REST_API_URL.replace(/\/$/, '')}/get/${STORE_KEY}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  if (!response.ok) throw new Error('kv_get_failed');
  const payload = await response.json();
  if (payload == null || payload.result == null) return emptyStore();
  if (typeof payload.result === 'string') {
    try {
      return normalizeStore(JSON.parse(payload.result));
    } catch {
      return emptyStore();
    }
  }
  return normalizeStore(payload.result);
}

async function kvSet(store) {
  const response = await fetch(`${process.env.KV_REST_API_URL.replace(/\/$/, '')}/set/${STORE_KEY}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(store),
  });
  if (!response.ok) throw new Error('kv_set_failed');
}

async function readStore() {
  if (kvConfigured()) {
    try {
      memory = await kvGet();
    } catch {
      console.log(JSON.stringify({ type: 'OpsStore', event: 'kv_get_failed', durable: false }));
    }
  }
  return clone(normalizeStore(memory));
}

async function writeStore(next) {
  memory = normalizeStore(next);
  if (kvConfigured()) {
    try {
      await kvSet(memory);
    } catch {
      console.log(JSON.stringify({ type: 'OpsStore', event: 'kv_set_failed', durable: false }));
    }
  }
  return clone(memory);
}

async function addTask({ title, nextAction, createdBy }) {
  const store = await readStore();
  const task = normalizeTask({ title, nextAction, createdBy, status: 'todo', createdAt: Date.now() });
  if (!task.title) return { error: 'invalid_task' };
  store.tasks = [task].concat(store.tasks).slice(0, MAX_TASKS);
  await writeStore(store);
  return { ok: true, task };
}

async function addNote({ title, body, createdBy }) {
  const store = await readStore();
  const note = normalizeNote({ title, body, createdBy, createdAt: Date.now() });
  if (!note.title) return { error: 'invalid_note' };
  store.notes = [note].concat(store.notes).slice(0, MAX_NOTES);
  await writeStore(store);
  return { ok: true, note };
}

async function setGoal(goal, createdBy) {
  const store = await readStore();
  store.goal = normalizeGoal(Object.assign({}, goal, { title: goal && goal.title }));
  if (createdBy && store.goal) store.goal.updatedBy = clean(createdBy, 120);
  await writeStore(store);
  return { ok: true, goal: store.goal };
}

function resetStore(seed) {
  memory = normalizeStore(seed || emptyStore());
}

module.exports = {
  STORE_KEY,
  addNote,
  addTask,
  dashboardSnapshot,
  emptyStore,
  isDurable,
  kvConfigured,
  nextActionFrom,
  normalizeStore,
  readStore,
  resetStore,
  setGoal,
  storeMode,
  unfinishedTasks,
  writeStore,
};
