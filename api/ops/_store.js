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
const MAX_MESSAGES = 40;
const MAX_PROPOSALS = 20;
const CHAT_ID = 'ops-shared';
const PROPOSAL_KINDS = Object.freeze(['save-goal', 'add-task', 'add-note', 'update-task']);
const PROPOSAL_STATUSES = Object.freeze(['pending', 'confirmed', 'dismissed']);
const MESSAGE_ROLES = Object.freeze(['user', 'assistant', 'system']);
const STATUSES = Object.freeze(['todo', 'doing', 'done']);
const STATUS_LABELS = Object.freeze({
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
});

let memory = emptyStore();

function emptyStore() {
  return { profiles: {}, goal: null, projects: [], tasks: [], notes: [], chats: [] };
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
  const deletedAt = Number.isFinite(row && row.deletedAt) && row.deletedAt > 0 ? row.deletedAt : 0;
  return {
    id: clean(row && row.id, 40) || newId(),
    title: clean(row && row.title, 160),
    body: clean(row && row.body, 4000),
    source: clean(row && row.source, 240),
    createdAt: Number.isFinite(row && row.createdAt) ? row.createdAt : Date.now(),
    updatedAt: Number.isFinite(row && row.updatedAt) ? row.updatedAt : Date.now(),
    createdBy: clean(row && row.createdBy, 120),
    deletedAt,
  };
}

function isDeletedNote(note) {
  return Boolean(note && note.deletedAt > 0);
}

function activeNotes(storeData) {
  return (storeData.notes || []).filter((note) => !isDeletedNote(note) && note.title);
}

// Ticket 05 chat context: only live notes. Deleted notes stay in the store
// but must never be offered as selectableForChat.
function selectableForChat(note) {
  return Boolean(note && note.id && note.title && !isDeletedNote(note));
}

function notesSelectableForChat(storeData) {
  return activeNotes(storeData).filter(selectableForChat);
}

function searchNotes(storeData, query) {
  const needle = clean(query, 200).toLowerCase();
  const list = activeNotes(storeData).slice().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!needle) return list;
  return list.filter((note) => {
    const hay = `${note.title} ${note.body} ${note.source}`.toLowerCase();
    return hay.includes(needle);
  });
}

function normalizeMessage(row) {
  const role = MESSAGE_ROLES.includes(row && row.role) ? row.role : 'user';
  return {
    id: clean(row && row.id, 40) || newId(),
    role,
    text: clean(row && row.text, 4000),
    createdAt: Number.isFinite(row && row.createdAt) ? row.createdAt : Date.now(),
    createdBy: clean(row && row.createdBy, 120),
    leadAgent: clean(row && row.leadAgent, 80),
    helperAgents: Array.isArray(row && row.helperAgents)
      ? row.helperAgents.map((item) => clean(item, 80)).filter(Boolean).slice(0, 8)
      : [],
    grounded: Boolean(row && row.grounded),
    setup: Boolean(row && row.setup),
    contextSummary: clean(row && row.contextSummary, 400),
  };
}

function normalizeProposal(row) {
  const kind = PROPOSAL_KINDS.includes(row && row.kind) ? row.kind : '';
  const status = PROPOSAL_STATUSES.includes(row && row.status) ? row.status : 'pending';
  const fields = row && typeof row.fields === 'object' && row.fields ? row.fields : {};
  return {
    id: clean(row && row.id, 40) || newId(),
    kind,
    status,
    title: clean(row && row.title, 200),
    body: clean(row && row.body, 2000),
    fields: {
      title: clean(fields.title, 200),
      body: clean(fields.body, 2000),
      nextStep: clean(fields.nextStep, 200),
      definitionOfDone: clean(fields.definitionOfDone, 400),
      nextAction: clean(fields.nextAction, 200),
      source: clean(fields.source, 240),
      taskId: clean(fields.taskId, 40),
    },
    createdAt: Number.isFinite(row && row.createdAt) ? row.createdAt : Date.now(),
  };
}

function normalizeChat(row) {
  return {
    id: clean(row && row.id, 40) || CHAT_ID,
    messages: Array.isArray(row && row.messages)
      ? row.messages.map(normalizeMessage).filter((item) => item.text).slice(-MAX_MESSAGES)
      : [],
    proposals: Array.isArray(row && row.proposals)
      ? row.proposals.map(normalizeProposal).filter((item) => item.kind).slice(-MAX_PROPOSALS)
      : [],
    updatedAt: Number.isFinite(row && row.updatedAt) ? row.updatedAt : Date.now(),
  };
}

function getSharedChat(storeData) {
  const list = storeData && Array.isArray(storeData.chats) ? storeData.chats : [];
  return list[0] ? normalizeChat(list[0]) : normalizeChat({ id: CHAT_ID });
}

function pendingProposals(storeData) {
  return getSharedChat(storeData).proposals.filter((item) => item.status === 'pending');
}

function listIds(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 40)).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => clean(item, 40)).filter(Boolean);
  return [];
}

function resolveChatContext(storeData, selection) {
  const data = storeData && typeof storeData === 'object' ? storeData : emptyStore();
  const flag = selection && selection.useGoal;
  const useGoal = flag === true || flag === '1' || flag === 'on' || flag === 'yes';
  const taskIds = new Set(listIds(selection && (selection.taskIds || selection.taskId)));
  const noteIds = new Set(listIds(selection && (selection.noteIds || selection.noteId)));
  const goal = useGoal && data.goal ? data.goal : null;
  const tasks = (data.tasks || []).filter((task) => taskIds.has(task.id));
  const notes = notesSelectableForChat(data).filter((note) => noteIds.has(note.id));
  const parts = [];
  if (goal) parts.push(`Goal: ${goal.title}`);
  tasks.forEach((task) => parts.push(`Task: ${task.title}`));
  notes.forEach((note) => parts.push(`Note: ${note.title}`));
  return {
    goal,
    tasks,
    notes,
    selected: Boolean(goal || tasks.length || notes.length),
    summary: parts.length ? parts.join(' · ') : 'No records selected',
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
    chats: Array.isArray(src.chats)
      ? src.chats.map(normalizeChat).slice(0, 1)
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
  const liveNotes = activeNotes(data).slice().sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    goal: data.goal,
    unfinished: unfinishedTasks(data),
    nextAction: nextActionFrom(data),
    notes: liveNotes.slice(0, 5),
    projects: data.projects,
    tasks: data.tasks,
    empty: !data.goal && unfinishedTasks(data).length === 0 && liveNotes.length === 0,
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

async function addNote({ title, body, source, createdBy, proposed, approved }) {
  return mutate(async () => {
    // Ticket 05 hook: AI-proposed memories require an explicit approve-before-save.
    // Manual create from /ops is implicit approval (the founder typed it).
    if (proposed && approved !== true) {
      return { error: 'memory_review_required' };
    }
    const storeData = await readStore();
    const note = normalizeNote({
      title,
      body,
      source,
      createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (!note.title) return { error: 'invalid_note' };
    storeData.notes = [note].concat(storeData.notes).slice(0, MAX_NOTES);
    await writeStore(storeData);
    return { ok: true, note };
  });
}

async function updateNote(id, patch) {
  return mutate(async () => {
    const storeData = await readStore();
    const noteId = clean(id, 40);
    const index = storeData.notes.findIndex((row) => row.id === noteId && !isDeletedNote(row));
    if (index === -1) return { error: 'note_not_found' };
    const current = storeData.notes[index];
    const next = normalizeNote({
      id: current.id,
      title: patch.title == null ? current.title : patch.title,
      body: patch.body == null ? current.body : patch.body,
      source: patch.source == null ? current.source : patch.source,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      deletedAt: current.deletedAt,
      updatedAt: Date.now(),
    });
    if (!next.title) return { error: 'invalid_note' };
    storeData.notes[index] = next;
    await writeStore(storeData);
    return { ok: true, note: next };
  });
}

async function deleteNote(id) {
  return mutate(async () => {
    const storeData = await readStore();
    const noteId = clean(id, 40);
    const index = storeData.notes.findIndex((row) => row.id === noteId && !isDeletedNote(row));
    if (index === -1) return { error: 'note_not_found' };
    const current = storeData.notes[index];
    const next = normalizeNote({
      id: current.id,
      title: current.title,
      body: current.body,
      source: current.source,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      updatedAt: Date.now(),
      deletedAt: Date.now(),
    });
    storeData.notes[index] = next;
    await writeStore(storeData);
    return { ok: true, note: next };
  });
}

// Ticket 05: persist a chat-proposed memory only after founder review.
async function approveProposedNote(proposal, { approvedBy }) {
  return addNote({
    title: proposal && proposal.title,
    body: proposal && proposal.body,
    source: proposal && proposal.source,
    createdBy: approvedBy,
    proposed: true,
    approved: true,
  });
}

async function writeSharedChat(mutator) {
  return mutate(async () => {
    const storeData = await readStore();
    const chat = getSharedChat(storeData);
    const next = mutator(chat);
    if (next && next.error) return next;
    storeData.chats = [normalizeChat(next || chat)];
    await writeStore(storeData);
    return { ok: true, chat: storeData.chats[0] };
  });
}

async function appendChatTurn({ user, assistant }) {
  return writeSharedChat((chat) => {
    const messages = chat.messages.slice();
    if (user && user.text) messages.push(normalizeMessage(Object.assign({ role: 'user' }, user)));
    if (assistant && assistant.text) messages.push(normalizeMessage(Object.assign({ role: 'assistant' }, assistant)));
    return {
      id: chat.id,
      messages,
      proposals: chat.proposals,
      updatedAt: Date.now(),
    };
  });
}

async function addChatProposals(drafts) {
  const incoming = Array.isArray(drafts) ? drafts : [];
  if (!incoming.length) return { ok: true, proposals: [] };
  return writeSharedChat((chat) => {
    const added = incoming.map((draft) => normalizeProposal({
      kind: draft.kind,
      title: draft.title || (draft.fields && draft.fields.title),
      body: draft.body || (draft.fields && draft.fields.body),
      fields: draft.fields || draft,
      status: 'pending',
      createdAt: Date.now(),
    })).filter((item) => item.kind);
    return {
      id: chat.id,
      messages: chat.messages,
      proposals: chat.proposals.concat(added).slice(-MAX_PROPOSALS),
      updatedAt: Date.now(),
    };
  });
}

async function dismissChatProposal(id) {
  return writeSharedChat((chat) => {
    const proposalId = clean(id, 40);
    const index = chat.proposals.findIndex((item) => item.id === proposalId && item.status === 'pending');
    if (index === -1) return { error: 'proposal_not_found' };
    const proposals = chat.proposals.slice();
    proposals[index] = Object.assign({}, proposals[index], { status: 'dismissed' });
    return { id: chat.id, messages: chat.messages, proposals, updatedAt: Date.now() };
  });
}

async function markProposalStatus(id, status) {
  return writeSharedChat((chat) => {
    const proposalId = clean(id, 40);
    const index = chat.proposals.findIndex((item) => item.id === proposalId && item.status === 'pending');
    if (index === -1) return { error: 'proposal_not_found' };
    const proposals = chat.proposals.slice();
    proposals[index] = Object.assign({}, proposals[index], { status });
    return { id: chat.id, messages: chat.messages, proposals, updatedAt: Date.now() };
  });
}

async function confirmChatProposal(id, { approvedBy }) {
  const storeData = await readStore();
  const proposal = getSharedChat(storeData).proposals.find((item) => item.id === clean(id, 40) && item.status === 'pending');
  if (!proposal) return { error: 'proposal_not_found' };
  const fields = proposal.fields || {};
  let applied;
  switch (proposal.kind) {
    case 'add-note':
      applied = await addNote({
        title: fields.title || proposal.title,
        body: fields.body || proposal.body,
        source: fields.source,
        createdBy: approvedBy,
        proposed: true,
        approved: true,
      });
      break;
    case 'save-goal':
      applied = await saveGoal({
        title: fields.title || proposal.title,
        nextStep: fields.nextStep,
        definitionOfDone: fields.definitionOfDone,
      });
      break;
    case 'add-task':
      applied = await addTask({
        title: fields.title || proposal.title,
        nextAction: fields.nextAction,
        createdBy: approvedBy,
      });
      break;
    case 'update-task':
      applied = await updateTask(fields.taskId, {
        title: fields.title || undefined,
        nextAction: fields.nextAction || undefined,
      });
      break;
    default: {
      const _never = proposal.kind;
      void _never;
      return { error: 'invalid_proposal' };
    }
  }
  if (applied && applied.error) return applied;
  const marked = await markProposalStatus(proposal.id, 'confirmed');
  if (marked.error) return marked;
  return { ok: true, applied, proposal: Object.assign({}, proposal, { status: 'confirmed' }) };
}

function resetStore(seed) {
  memory = normalizeStore(seed || emptyStore());
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  STORE_KEY,
  CHAT_ID,
  PROPOSAL_KINDS,
  activeNotes,
  addChatProposals,
  addNote,
  addProject,
  addTask,
  appendChatTurn,
  approveProposedNote,
  confirmChatProposal,
  dashboardSnapshot,
  deleteNote,
  dismissChatProposal,
  emptyStore,
  getProfile,
  getSharedChat,
  isDurable,
  kvConfigured,
  nextActionFrom,
  normalizeStore,
  notesSelectableForChat,
  pendingProposals,
  readStore,
  resetStore,
  resolveChatContext,
  saveGoal,
  saveProfile,
  searchNotes,
  selectableForChat,
  statusLabel,
  storeMode,
  unfinishedTasks,
  updateNote,
  updateTask,
  writeStore,
};
