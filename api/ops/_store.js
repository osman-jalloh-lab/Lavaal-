// LAVAALL OS store — profile, current goal, projects, tasks, notes.
// Durable path: Vercel KV / Upstash REST via fetch (no npm).
// Local fallback: OPS_STORE_FILE JSON (ignored on Vercel — /tmp is not shared).
// Preview without KV stays demo memory + banner.
// Underscore prefix: not a Vercel function.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

function filePath() {
  if (kvConfigured()) return '';
  if (process.env.VERCEL) return '';
  const custom = process.env.OPS_STORE_FILE;
  return typeof custom === 'string' && custom.trim() ? custom.trim() : '';
}

function storeMode() {
  if (kvConfigured()) return 'kv';
  if (filePath()) return 'file';
  return 'memory';
}

function isDurable() {
  return storeMode() === 'kv' || storeMode() === 'file';
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

function decodeKvResult(result) {
  if (result == null) return emptyStore();
  if (typeof result === 'string') {
    try {
      return normalizeStore(JSON.parse(result));
    } catch {
      return emptyStore();
    }
  }
  return normalizeStore(result);
}

async function kvCommand(args) {
  const base = process.env.KV_REST_API_URL.replace(/\/$/, '');
  const response = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error('kv_command_failed');
  return response.json();
}

async function kvGet() {
  const payload = await kvCommand(['GET', STORE_KEY]);
  return decodeKvResult(payload && payload.result);
}

async function kvSet(storeData) {
  await kvCommand(['SET', STORE_KEY, JSON.stringify(storeData)]);
}

function fileGet() {
  const target = filePath();
  if (!target || !fs.existsSync(target)) return emptyStore();
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(target, 'utf8')));
  } catch {
    return emptyStore();
  }
}

function fileSet(storeData) {
  const target = filePath();
  if (!target) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(storeData));
}

async function readStore() {
  if (kvConfigured()) {
    memory = await kvGet();
  } else if (filePath()) {
    memory = fileGet();
  }
  return clone(normalizeStore(memory));
}

async function writeStore(next) {
  const normalized = normalizeStore(next);
  if (kvConfigured()) {
    await kvSet(normalized);
  } else if (filePath()) {
    fileSet(normalized);
  }
  memory = normalized;
  return clone(memory);
}

async function mutate(work) {
  try {
    return await work();
  } catch {
    console.log(JSON.stringify({ type: 'OpsStore', event: 'store_unavailable', mode: storeMode() }));
    return { error: 'store_unavailable' };
  }
}

function getProfile(storeData, email) {
  return storeData.profiles[normalizeEmail(email)] || null;
}

async function saveProfile(email, fields) {
  return mutate(async () => {
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
  });
}

async function saveGoal(fields) {
  return mutate(async () => {
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
  });
}

async function addProject({ name, finishLine, createdBy }) {
  return mutate(async () => {
    const storeData = await readStore();
    const project = normalizeProject({ name, finishLine, createdBy, createdAt: Date.now() });
    if (!project.name) return { error: 'invalid_project' };
    storeData.projects = [project].concat(storeData.projects).slice(0, MAX_PROJECTS);
    await writeStore(storeData);
    return { ok: true, project };
  });
}

async function addTask({ title, nextAction, status, due, projectId, createdBy }) {
  return mutate(async () => {
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
  });
}

async function updateTask(id, patch) {
  return mutate(async () => {
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
  });
}

async function addNote({ title, body, createdBy }) {
  return mutate(async () => {
    const storeData = await readStore();
    const note = normalizeNote({ title, body, createdBy, createdAt: Date.now() });
    if (!note.title) return { error: 'invalid_note' };
    storeData.notes = [note].concat(storeData.notes).slice(0, MAX_NOTES);
    await writeStore(storeData);
    return { ok: true, note };
  });
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
