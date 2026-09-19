// LAVAALL OS store — profile, current goal, projects, tasks, notes.
// Memory demo until KV_REST_API_URL + KV_REST_API_TOKEN are set.
// Durable path: Vercel KV / Upstash REST via fetch. No npm.
// Underscore prefix: not a Vercel function.

const crypto = require('crypto');

const STORE_KEY = 'lavaall-ops-v2';
const MAX_TASKS = 100;
const MAX_NOTES = 100;
const MAX_PROJECTS = 50;
const STATUSES = Object.freeze(['todo', 'doing', 'done']);
const STATUS_LABELS = Object.freeze({
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
});

let memory = emptyStore();

function emptyStore() {
  return { profiles: {}, goal: null, projects: [], tasks: [], notes: [] };
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

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeEmail(value) {
  return clean(value, 120).toLowerCase();
}

function normalizeDate(value) {
  const raw = clean(value, 32);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeStatus(value) {
  return STATUSES.includes(value) ? value : 'todo';
}

function statusLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)];
}

function normalizeProfile(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    role: clean(row.role, 80),
    timezone: clean(row.timezone, 80),
    writingPreferences: clean(row.writingPreferences, 800),
    updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : Date.now(),
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
    targetDate: normalizeDate(row.targetDate),
    updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : Date.now(),
  };
}

function normalizeProject(row) {
  return {
    id: clean(row && row.id, 40) || newId(),
    name: clean(row && row.name, 160),
    finishLine: clean(row && row.finishLine, 240),
    createdAt: Number.isFinite(row && row.createdAt) ? row.createdAt : Date.now(),
    createdBy: clean(row && row.createdBy, 120),
  };
}

function normalizeTask(row, projectIds) {
  const status = normalizeStatus(row && row.status);
  const projectId = clean(row && row.projectId, 40);
  const linked = projectId && projectIds && projectIds.has(projectId) ? projectId : (projectId && !projectIds ? projectId : '');
  return {
    id: clean(row && row.id, 40) || newId(),
    title: clean(row && row.title, 160),
    status,
    nextAction: clean(row && row.nextAction, 200),
    due: normalizeDate(row && row.due),
    projectId: linked,
    createdAt: Number.isFinite(row && row.createdAt) ? row.createdAt : Date.now(),
    updatedAt: Number.isFinite(row && row.updatedAt) ? row.updatedAt : Date.now(),
    createdBy: clean(row && row.createdBy, 120),
  };
}

function normalizeNote(row) {
  return {
    id: clean(row && row.id, 40) || newId(),
    title: clean(row && row.title, 160),
    body: clean(row && row.body, 4000),
    createdAt: Number.isFinite(row && row.createdAt) ? row.createdAt : Date.now(),
    createdBy: clean(row && row.createdBy, 120),
  };
}

function normalizeProfiles(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach((key) => {
    const email = normalizeEmail(key);
    const profile = normalizeProfile(raw[key]);
    if (email && profile) out[email] = profile;
  });
  return out;
}

function normalizeStore(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const projects = Array.isArray(src.projects)
    ? src.projects.map(normalizeProject).filter((row) => row.name).slice(0, MAX_PROJECTS)
    : [];
  const projectIds = new Set(projects.map((row) => row.id));
  return {
    profiles: normalizeProfiles(src.profiles),
    goal: normalizeGoal(src.goal),
    projects,
    tasks: Array.isArray(src.tasks)
      ? src.tasks.map((row) => normalizeTask(row, projectIds)).filter((row) => row.title).slice(0, MAX_TASKS)
      : [],
    notes: Array.isArray(src.notes)
      ? src.notes.map(normalizeNote).filter((row) => row.title).slice(0, MAX_NOTES)
      : [],
  };
}

function unfinishedTasks(storeData) {
  return (storeData.tasks || []).filter((task) => task.status !== 'done');
}

function nextActionFrom(storeData) {
  const open = unfinishedTasks(storeData);
  const withStep = open.find((task) => task.nextAction);
  const pick = withStep || open[0];
  if (!pick) return null;
  return {
    taskId: pick.id,
    title: pick.title,
    detail: pick.nextAction || pick.title,
  };
}

function dashboardSnapshot(storeData) {
  const data = normalizeStore(storeData);
  return {
    goal: data.goal,
    unfinished: unfinishedTasks(data),
    nextAction: nextActionFrom(data),
    notes: data.notes.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    projects: data.projects,
    tasks: data.tasks,
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

async function kvSet(storeData) {
  const response = await fetch(`${process.env.KV_REST_API_URL.replace(/\/$/, '')}/set/${STORE_KEY}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(storeData),
  });
  if (!response.ok) throw new Error('kv_set_failed');
}

async function readStore() {
  if (kvConfigured()) {
    try {
      memory = await kvGet();
    } catch {
      console.log(JSON.stringify({ type: 'OpsStore', event: 'kv_get_failed', mode: storeMode() }));
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
      console.log(JSON.stringify({ type: 'OpsStore', event: 'kv_set_failed', mode: storeMode() }));
    }
  }
  return clone(memory);
}

function getProfile(storeData, email) {
  return storeData.profiles[normalizeEmail(email)] || null;
}

async function saveProfile(email, fields) {
  const who = normalizeEmail(email);
  if (!who) return { error: 'invalid_profile' };
  const storeData = await readStore();
  storeData.profiles[who] = normalizeProfile({
    role: fields && fields.role,
    timezone: fields && fields.timezone,
    writingPreferences: fields && fields.writingPreferences,
    updatedAt: Date.now(),
  });
  await writeStore(storeData);
  return { ok: true, profile: storeData.profiles[who] };
}

async function saveGoal(fields) {
  const storeData = await readStore();
  storeData.goal = normalizeGoal({
    title: fields && fields.title,
    definitionOfDone: fields && fields.definitionOfDone,
    nextStep: fields && fields.nextStep,
    targetDate: fields && fields.targetDate,
    updatedAt: Date.now(),
  });
  if (!storeData.goal) return { error: 'invalid_goal' };
  await writeStore(storeData);
  return { ok: true, goal: storeData.goal };
}

async function addProject({ name, finishLine, createdBy }) {
  const storeData = await readStore();
  const project = normalizeProject({ name, finishLine, createdBy, createdAt: Date.now() });
  if (!project.name) return { error: 'invalid_project' };
  storeData.projects = [project].concat(storeData.projects).slice(0, MAX_PROJECTS);
  await writeStore(storeData);
  return { ok: true, project };
}

async function addTask({ title, nextAction, status, due, projectId, createdBy }) {
  const storeData = await readStore();
  const task = normalizeTask({
    title,
    nextAction,
    status,
    due,
    projectId,
    createdBy,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }, new Set(storeData.projects.map((row) => row.id)));
  if (!task.title) return { error: 'invalid_task' };
  storeData.tasks = [task].concat(storeData.tasks).slice(0, MAX_TASKS);
  await writeStore(storeData);
  return { ok: true, task };
}

async function updateTask(id, patch) {
  const storeData = await readStore();
  const taskId = clean(id, 40);
  const index = storeData.tasks.findIndex((row) => row.id === taskId);
  if (index === -1) return { error: 'task_not_found' };
  const current = storeData.tasks[index];
  const next = normalizeTask({
    id: current.id,
    title: patch.title == null ? current.title : patch.title,
    status: patch.status == null ? current.status : patch.status,
    nextAction: patch.nextAction == null ? current.nextAction : patch.nextAction,
    due: patch.due == null ? current.due : patch.due,
    projectId: patch.projectId == null ? current.projectId : patch.projectId,
    createdAt: current.createdAt,
    createdBy: current.createdBy,
    updatedAt: Date.now(),
  }, new Set(storeData.projects.map((row) => row.id)));
  if (!next.title) return { error: 'invalid_task' };
  storeData.tasks[index] = next;
  await writeStore(storeData);
  return { ok: true, task: next };
}

async function addNote({ title, body, createdBy }) {
  const storeData = await readStore();
  const note = normalizeNote({ title, body, createdBy, createdAt: Date.now() });
  if (!note.title) return { error: 'invalid_note' };
  storeData.notes = [note].concat(storeData.notes).slice(0, MAX_NOTES);
  await writeStore(storeData);
  return { ok: true, note };
}

function resetStore(seed) {
  memory = normalizeStore(seed || emptyStore());
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  STORE_KEY,
  addNote,
  addProject,
  addTask,
  dashboardSnapshot,
  emptyStore,
  getProfile,
  isDurable,
  kvConfigured,
  nextActionFrom,
  normalizeStore,
  readStore,
  resetStore,
  saveGoal,
  saveProfile,
  statusLabel,
  storeMode,
  unfinishedTasks,
  updateTask,
  writeStore,
};
