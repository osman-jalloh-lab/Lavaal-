// One trusted-record block for CEO Talk, desk Talk, and the Chat page.
// Counts and short titles only. No kit identity, customer PII, message text,
// or raw outside-origin bodies. Reads through existing helpers. No new KV keys.

const { formatKitsTrustedLine, readStore } = require('./_store');
const { foundersDmOfficeSummary } = require('./_founders_dm');
const { signInOfficeSummary } = require('./_signin_hardening');
const { readRoutineHealthView } = require('./_routine_health');

const CHICAGO = 'America/Chicago';
const MAX_CHARS = 7500;
const TASK_LIMIT = 12;
const NOTE_LIMIT = 8;
const EVENT_LIMIT = 8;
const ISSUE_LIMIT = 8;
const ASSIGN_LIMIT = 8;
const PROJECT_LIMIT = 8;
const NOTE_BODY = 80;
const FOUNDER_ROLES = Object.freeze({
  'osmanjalloh104@gmail.com': 'Osman',
  'abdulhbah55@gmail.com': 'Hameed',
});

function scrub(value) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .replace(/\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[redacted]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted]')
    .replace(/\b(?:\d{1,3}\.){2}x\.x\b/g, '[redacted]')
    .replace(/\b(?:sk|rk|ghp|xoxb|xoxp)_[A-Za-z0-9]+/g, '[redacted]');
}

function clip(value, max) {
  const text = scrub(value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function modeOf(options) {
  const mode = options && options.mode;
  if (mode === 'phatic' || mode === 'status' || mode === 'answer_first' || mode === 'default') return mode;
  return 'default';
}

function asBundle(data) {
  if (data && (Object.prototype.hasOwnProperty.call(data, 'store') || data.foundersDm || data.signIns || data.routineHealth)) {
    return {
      store: data.store && typeof data.store === 'object' ? data.store : {},
      foundersDm: data.foundersDm || null,
      signIns: data.signIns || null,
      routineHealth: data.routineHealth || null,
      pendingCount: data.pendingCount,
    };
  }
  return {
    store: data && typeof data === 'object' ? data : {},
    foundersDm: null,
    signIns: null,
    routineHealth: null,
    pendingCount: undefined,
  };
}

function chicagoParts(ms) {
  const date = new Date(ms);
  if (!Number.isFinite(ms) || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const pick = (type) => {
    const part = parts.find((item) => item.type === type);
    return part ? part.value : '';
  };
  return {
    year: pick('year'),
    month: pick('month').padStart(2, '0'),
    day: pick('day').padStart(2, '0'),
    hour: String(Number(pick('hour'))),
    minute: pick('minute').padStart(2, '0'),
    period: pick('dayPeriod').replace(/\./g, '').toUpperCase(),
  };
}

function formatChicagoInstant(ms) {
  const parts = chicagoParts(ms);
  if (!parts || !parts.year) return '';
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.period} CT`;
}

function chicagoDate(ms) {
  const parts = chicagoParts(ms);
  if (!parts) return '';
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateStr, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return '';
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function wallTimeToUtc(dateStr, timeStr, timeZone) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!date) return null;
  const time = /^(\d{2}):(\d{2})$/.exec(timeStr || '00:00');
  const desired = Date.UTC(
    Number(date[1]),
    Number(date[2]) - 1,
    Number(date[3]),
    time ? Number(time[1]) : 0,
    time ? Number(time[2]) : 0
  );
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const read = (ms) => {
    const parts = fmt.formatToParts(new Date(ms));
    const pick = (type) => {
      const part = parts.find((item) => item.type === type);
      return part ? Number(part.value) : 0;
    };
    return Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'));
  };
  let utc = desired;
  for (let i = 0; i < 3; i += 1) {
    const delta = desired - read(utc);
    if (delta === 0) break;
    utc += delta;
  }
  return utc;
}

function listOrEmpty(store, key) {
  return store && Array.isArray(store[key]) ? store[key] : [];
}

function moreLine(label, hidden) {
  return hidden > 0 ? `${label}: +${hidden} more.` : '';
}

function goalLines(store) {
  const goal = store && store.goal && store.goal.title ? store.goal : null;
  if (!goal) return ['Goal: none loaded.'];
  const lines = [`Goal: ${clip(goal.title, 200)}`];
  if (goal.definitionOfDone) lines.push(`Definition of done: ${clip(goal.definitionOfDone, 200)}`);
  if (goal.nextStep) lines.push(`Next step: ${clip(goal.nextStep, 200)}`);
  if (goal.targetDate) lines.push(`Target date: ${clip(goal.targetDate, 40)}`);
  return lines;
}

function taskLines(store) {
  const tasks = listOrEmpty(store, 'tasks').filter((task) => task && task.title);
  if (!tasks.length) return ['Tasks: none loaded.'];
  const open = [];
  const done = [];
  tasks.forEach((task) => {
    if (task.status === 'done') done.push(task);
    else open.push(task);
  });
  const sortNewest = (rows) => rows.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const ordered = sortNewest(open).concat(sortNewest(done));
  const shown = ordered.slice(0, TASK_LIMIT);
  const lines = shown.map((task) => {
    const owner = task.ownerAgentId ? clip(task.ownerAgentId, 40) : 'unassigned';
    const next = task.nextAction ? `; next: ${clip(task.nextAction, 120)}` : '';
    return `Task: ${clip(task.title, 160)} (${clip(task.status || 'todo', 20)}, ${owner})${next}`;
  });
  const extra = moreLine('Tasks', ordered.length - shown.length);
  if (extra) lines.push(extra);
  return lines;
}

function noteLines(store) {
  const notes = listOrEmpty(store, 'notes').filter((note) => note && note.title && !(note.deletedAt > 0));
  if (!notes.length) return ['Notes: none loaded.'];
  const ordered = notes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, NOTE_LIMIT);
  const lines = ordered.map((note) => {
    const body = note.body ? ` - ${clip(note.body, NOTE_BODY)}` : '';
    return `Note: ${clip(note.title, 160)}${body}`;
  });
  const extra = moreLine('Notes', notes.length - ordered.length);
  if (extra) lines.push(extra);
  return lines;
}

function assignLines(store) {
  const tasks = listOrEmpty(store, 'tasks').filter((task) => task && task.title && (task.assignStatus || task.ownerAgentId));
  const lines = [];
  if (!tasks.length) lines.push('Assigns: none loaded.');
  else {
    const ordered = tasks.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const shown = ordered.slice(0, ASSIGN_LIMIT);
    shown.forEach((task) => {
      const desk = task.ownerAgentId ? clip(task.ownerAgentId, 40) : 'unassigned';
      const status = task.assignStatus ? clip(task.assignStatus, 40) : 'open';
      const recommend = task.synthesis || task.result ? 'recorded' : 'none';
      lines.push(`Assign: ${clip(task.title, 120)} - ${desk} - ${status}; recommend: ${recommend}`);
    });
    const extra = moreLine('Assigns', ordered.length - shown.length);
    if (extra) lines.push(extra);
  }
  const queue = listOrEmpty(store, 'researchyPending');
  lines.push(queue.length ? `Assign queue: ${queue.length} pending.` : 'Assign queue: none loaded.');
  const seq = store && Number.isFinite(store.assignSeq) ? store.assignSeq : 0;
  lines.push(`Assign sequence: ${seq}.`);
  return lines;
}

function routineLines(store, health) {
  const routines = listOrEmpty(store, 'routines').filter((row) => row && row.name);
  const lines = [];
  if (!routines.length) lines.push('Routines: none loaded.');
  else {
    routines.slice(0, 12).forEach((row) => {
      const when = row.lastRunAt ? formatChicagoInstant(row.lastRunAt) : 'none';
      const status = row.lastRunStatus ? clip(row.lastRunStatus, 40) : 'none';
      lines.push(`Routine: ${clip(row.name, 80)}; schedule: manual; enabled: yes; last run: ${status} ${when}`.trim());
    });
  }
  if (!health) {
    lines.push('Routine health: not loaded.');
    return lines;
  }
  if (health.ok === false) {
    lines.push('Routine health: not loaded.');
    return lines;
  }
  const rows = Array.isArray(health.routines) ? health.routines : [];
  if (!rows.length || health.empty) {
    lines.push('Routine health: none loaded.');
    return lines;
  }
  rows.slice(0, 12).forEach((row) => {
    const when = row.lastRunAt ? formatChicagoInstant(Date.parse(row.lastRunAt)) : (row.lastRunLabel ? clip(row.lastRunLabel, 40) : 'none');
    lines.push(`Routine health: ${clip(row.slug, 40)} ${clip(row.status, 20)} ${when}`.trim());
  });
  return lines;
}

function issueLines(store) {
  const issues = listOrEmpty(store, 'issues').filter((row) => row && row.title);
  if (!issues.length) return ['Issues: none loaded.'];
  const ordered = issues.slice().sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
  const shown = ordered.slice(0, ISSUE_LIMIT);
  const lines = shown.map((row) => (
    `Issue: ${clip(row.title, 120)}, count ${Number(row.count) || 1} (no status or severity field).`
  ));
  const extra = moreLine('Issues', ordered.length - shown.length);
  if (extra) lines.push(extra);
  return lines;
}

function calendarLines(store, now) {
  const clock = Number.isFinite(now) ? now : Date.now();
  const start = chicagoDate(clock);
  const end = addDays(start, 14);
  const events = listOrEmpty(store, 'events').filter((event) => (
    event && event.title && event.date && event.date >= start && event.date < end
  ));
  if (!events.length) return ['Calendar: none loaded.'];
  const ordered = events.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start || '').localeCompare(String(b.start || '')));
  const shown = ordered.slice(0, EVENT_LIMIT);
  const lines = shown.map((event) => {
    if (event.allDay) return `Calendar: ${clip(event.title, 120)} - ${event.date} all day CT.`;
    const utc = wallTimeToUtc(event.date, event.start || '00:00', event.timezone || 'Africa/Freetown');
    const label = utc ? formatChicagoInstant(utc) : `${event.date} ${clip(event.start, 8)} CT`;
    return `Calendar: ${clip(event.title, 120)} - ${label}.`;
  });
  const extra = moreLine('Calendar', ordered.length - shown.length);
  if (extra) lines.push(extra);
  return lines;
}

function bookingLines(store) {
  const rows = listOrEmpty(store, 'pendingBookings').filter((row) => row && (row.leadId || row.createdAt));
  if (!rows.length) return ['Bookings: none loaded.'];
  return [`Bookings: ${rows.length} pending. Next upcoming time: not stored.`];
}

function inboxLines(store) {
  const rows = listOrEmpty(store, 'inbox');
  if (!rows.length) return ['Inbox: none loaded.'];
  const counts = { needs_reply: 0, task: 0, reference: 0, done: 0, unread: 0 };
  rows.forEach((row) => {
    const label = row && counts[row.label] != null ? row.label : '';
    if (label) counts[label] += 1;
    if (row && row.unread) counts.unread += 1;
  });
  return [`Inbox: ${rows.length} total (needs reply ${counts.needs_reply}, task ${counts.task}, reference ${counts.reference}, done ${counts.done}, unread ${counts.unread}).`];
}

function profileLines(store) {
  const profiles = store && store.profiles && typeof store.profiles === 'object' ? store.profiles : null;
  if (!profiles) return ['Profiles: none loaded.'];
  const lines = [];
  Object.keys(FOUNDER_ROLES).forEach((email) => {
    const profile = profiles[email];
    if (!profile) return;
    const role = profile.role ? clip(profile.role, 40) : 'role not set';
    lines.push(`Profile: ${FOUNDER_ROLES[email]}, role ${role}.`);
  });
  if (!lines.length) return ['Profiles: none loaded.'];
  return lines;
}

function foundersChatLines(summary) {
  if (!summary || summary.loaded === false) return ['Founders chat: not loaded.'];
  const total = Number(summary.total) || 0;
  if (!total) return ['Founders chat: none loaded.'];
  const when = summary.lastMessageAt ? formatChicagoInstant(summary.lastMessageAt) : 'none';
  return [`Founders chat: ${Number(summary.messagesToday) || 0} messages today, ${Number(summary.unread) || 0} unread, last message ${when}.`];
}

function signInLines(summary) {
  if (!summary || summary.loaded === false) return ['Sign-ins: not loaded.'];
  const roles = summary.roles || {};
  const osman = roles.Osman || { successes: 0, lastSuccessAt: 0 };
  const hameed = roles.Hameed || { successes: 0, lastSuccessAt: 0 };
  if (!osman.successes && !hameed.successes && !summary.rejected) return ['Sign-ins: none loaded.'];
  const when = (at) => (at ? formatChicagoInstant(at) : 'none');
  return [
    `Sign-ins: Osman ${osman.successes} successful, last ${when(osman.lastSuccessAt)}; Hameed ${hameed.successes} successful, last ${when(hameed.lastSuccessAt)}; rejected ${Number(summary.rejected) || 0}.`,
  ];
}

function projectLines(store) {
  const projects = listOrEmpty(store, 'projects').filter((row) => row && row.name);
  if (!projects.length) return ['Projects: none loaded.'];
  const shown = projects.slice(0, PROJECT_LIMIT);
  const lines = shown.map((row) => {
    const finish = row.finishLine ? ` - ${clip(row.finishLine, 80)}` : '';
    return `Project: ${clip(row.name, 80)}${finish}`;
  });
  const extra = moreLine('Projects', projects.length - shown.length);
  if (extra) lines.push(extra);
  return lines;
}

function draftLines(store) {
  const chats = listOrEmpty(store, 'chats');
  const proposals = [];
  let messages = 0;
  chats.forEach((chat) => {
    messages += chat && Array.isArray(chat.messages) ? chat.messages.length : 0;
    (chat && Array.isArray(chat.proposals) ? chat.proposals : []).forEach((row) => {
      if (row && row.status !== 'dismissed' && row.kind) proposals.push(row);
    });
  });
  const lines = [];
  lines.push(messages ? `Office chat: ${messages} messages.` : 'Office chat: none loaded.');
  if (!proposals.length) lines.push('Drafts: none loaded.');
  else {
    const kinds = proposals.slice(0, 8).map((row) => clip(row.kind, 40));
    lines.push(`Drafts: ${proposals.length} pending (${kinds.join(', ')}).`);
  }
  return lines;
}

function mailLines(store) {
  const rows = listOrEmpty(store, 'mailAudit');
  if (!rows.length) return ['Mail audit: none loaded.'];
  return [`Mail audit: ${rows.length} recorded.`];
}

function mapLines() {
  return ['Map: not stored separately (derived from kits, notes, tasks, and the goal).'];
}

function queueLines(count) {
  if (!Number.isFinite(count)) return ['CEO queue: not loaded.'];
  if (count <= 0) return ['CEO queue: none loaded.'];
  return [`CEO queue: ${count} pending.`];
}

function formatOfficeTrustedContext(data, options) {
  const mode = modeOf(options);
  const lines = ['Trusted LAVAALL OS records (KV). Use only these facts:'];
  if (mode === 'phatic') {
    lines.push('None loaded. Do not invent goals, tasks, notes, prices, SKUs, or legal positions.');
    return lines.join('\n');
  }
  const bundle = asBundle(data);
  const store = bundle.store;
  const now = options && Number.isFinite(options.now) ? options.now : Date.now();
  const sections = [
    goalLines(store),
    taskLines(store),
    noteLines(store),
    [formatKitsTrustedLine(store)],
    assignLines(store),
    routineLines(store, bundle.routineHealth),
    issueLines(store),
    calendarLines(store, now),
    bookingLines(store),
    inboxLines(store),
    profileLines(store),
    foundersChatLines(bundle.foundersDm),
    signInLines(bundle.signIns),
    projectLines(store),
    draftLines(store),
    mailLines(store),
    mapLines(),
    queueLines(bundle.pendingCount),
  ];
  const maxChars = options && Number.isFinite(options.maxChars) ? options.maxChars : MAX_CHARS;
  let omitted = 0;
  sections.forEach((section) => {
    const chunk = section.join('\n');
    const current = lines.join('\n');
    if (current.length + chunk.length + 1 > maxChars) {
      omitted += 1;
      return;
    }
    section.forEach((line) => lines.push(line));
  });
  if (omitted) lines.push(`+${omitted} sections omitted for size.`);
  let text = lines.join('\n');
  if (text.length > maxChars) {
    text = `${text.slice(0, Math.max(0, maxChars - 40)).trim()}\n+ further lines omitted for size.`;
  }
  return text;
}

async function loadOfficeTrustedBundle(now) {
  let store = {};
  try {
    store = await readStore();
  } catch {
    store = {};
  }
  const foundersDm = await foundersDmOfficeSummary(now).catch(() => ({ loaded: false }));
  const signIns = await signInOfficeSummary().catch(() => ({ loaded: false }));
  let routineHealth = null;
  try {
    routineHealth = await readRoutineHealthView(now);
  } catch {
    routineHealth = { ok: false, empty: true, routines: [] };
  }
  return { store, foundersDm, signIns, routineHealth };
}

module.exports = {
  MAX_CHARS,
  formatChicagoInstant,
  formatOfficeTrustedContext,
  loadOfficeTrustedBundle,
  wallTimeToUtc,
};
