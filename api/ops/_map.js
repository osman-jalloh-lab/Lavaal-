// Ticket 11 — founder-only workspace map graph from kits mirror + /ops store.
// Four node types only (Kit · Person · Task · Decision). Mail out. No fake nodes.
// Edges only from real matches. Unlinked kits still appear. Underscore: not a function.

const { kitsGuard } = require('./_kits');
const {
  activeNotes,
  listKits,
  statusLabel,
} = require('./_store');

const MAP_NODE_TYPES = Object.freeze(['kit', 'person', 'task', 'decision']);
const MAX_MAP_NODES = 200;
const TYPE_SET = new Set(MAP_NODE_TYPES);

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, max) : '';
}

function stripEmail(value, max) {
  return clean(value, max)
    .replace(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keyName(value) {
  return stripEmail(value, 160).toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsToken(hay, needle) {
  const n = stripEmail(needle, 200);
  if (!n || n.length < 2) return false;
  const h = String(hay || '');
  if (n.includes('@')) return h.toLowerCase().includes(n.toLowerCase());
  if (/^kit[0-9a-z-]+$/i.test(n.replace(/\s+/g, '')) || n.length >= 8) {
    if (h.toLowerCase().includes(n.toLowerCase())) return true;
  }
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(n)}([^a-z0-9]|$)`, 'i');
  return pattern.test(h);
}

function noteHay(note) {
  if (!note) return '';
  return `${note.title || ''} ${note.body || ''} ${note.source || ''}`;
}

function isDecisionNote(note) {
  const hay = noteHay(note).toLowerCase();
  return /\bdecision\b/.test(hay);
}

function workingText(value, fallback) {
  const text = stripEmail(value, 280);
  if (text) return text;
  return fallback;
}

function personId(name) {
  return `person:${keyName(name)}`;
}

function kitNodeId(kitNumber) {
  return `kit:${clean(kitNumber, 40).toUpperCase()}`;
}

function upsertPerson(people, name, patch) {
  const title = stripEmail(name, 160);
  const key = keyName(title);
  if (!key) return null;
  const id = personId(title);
  const current = people.get(id) || {
    id,
    type: 'person',
    title,
    label: title.split(/\s+/)[0] || title,
    working: '',
    href: `/ops/memory?q=${encodeURIComponent(title).slice(0, 160)}`,
    linkLabel: 'Open in Memory',
    search: title.toLowerCase(),
    noteId: '',
  };
  if (patch && patch.working && !current.working) current.working = patch.working;
  if (patch && patch.noteId) {
    current.noteId = patch.noteId;
    current.href = `/ops/memory?q=${encodeURIComponent(title).slice(0, 160)}`;
  }
  if (patch && patch.search) current.search = `${current.search} ${patch.search}`.trim();
  people.set(id, current);
  return current;
}

function addEdge(edges, seen, from, to, kind) {
  if (!from || !to || from === to) return;
  const pair = from < to ? `${from}|${to}` : `${to}|${from}`;
  if (seen.has(pair)) return;
  seen.add(pair);
  edges.push({ from, to, kind });
}

function buildMapGraph(storeData) {
  const kits = listKits(storeData);
  const notes = activeNotes(storeData || {});
  const tasks = Array.isArray(storeData && storeData.tasks) ? storeData.tasks.filter((row) => row && row.title) : [];
  const goal = storeData && storeData.goal && storeData.goal.title ? storeData.goal : null;
  const people = new Map();
  const kitNodes = [];

  kits.forEach((kit) => {
    const kitNumber = clean(kit.kit_number, 40).toUpperCase();
    if (!kitNumber) return;
    const personName = stripEmail(kit.person_name, 160);
    const id = kitNodeId(kitNumber);
    const node = {
      id,
      type: 'kit',
      title: personName ? `${kitNumber} · ${personName}` : kitNumber,
      label: kitNumber,
      working: workingText(
        kit.notes,
        `${kit.status || 'Unknown'} in the registry. Open Kits for the person and status.`
      ),
      href: `/ops/kits?kit=${encodeURIComponent(kitNumber)}`,
      linkLabel: 'Open in Kits',
      search: `${kitNumber} ${personName}`.toLowerCase(),
      kit_number: kitNumber,
      person_name: personName,
      status: kit.status || 'Unknown',
    };
    kitNodes.push(node);
    if (personName) {
      upsertPerson(people, personName, { search: kitNumber.toLowerCase() });
    }
  });

  const decisionNotes = [];
  notes.forEach((note) => {
    if (isDecisionNote(note)) {
      decisionNotes.push(note);
      return;
    }
    const who = stripEmail(note.title, 160);
    if (!who) return;
    upsertPerson(people, who, {
      working: workingText(note.body, 'Someone tied to a kit or note. Short note only here.'),
      noteId: note.id,
    });
  });

  people.forEach((person) => {
    if (!person.working) {
      person.working = 'Someone tied to a kit or note. Open Memory to add a short note.';
    }
  });

  const taskNodes = tasks.map((task) => {
    const title = stripEmail(task.title, 160);
    const next = stripEmail(task.nextAction, 200);
    const status = statusLabel(task.status);
    return {
      id: `task:${clean(task.id, 40)}`,
      type: 'task',
      title,
      label: title.length > 14 ? `${title.slice(0, 12)}…` : title,
      working: workingText(next, `${status}. Open Tasks to update it.`),
      href: '/ops/tasks',
      linkLabel: 'Open in Tasks',
      search: `${title} ${next} ${status}`.toLowerCase(),
      status: task.status,
      rawTitle: title,
      rawNext: next,
    };
  });

  const decisionNodes = [];
  if (goal) {
    const title = stripEmail(goal.title, 200);
    decisionNodes.push({
      id: 'decision:goal',
      type: 'decision',
      title,
      label: title.length > 14 ? `${title.slice(0, 12)}…` : (title || 'Decision'),
      working: workingText(
        goal.nextStep || goal.definitionOfDone,
        'A founder call to remember. Open You for the current goal.'
      ),
      href: '/ops/profile',
      linkLabel: 'Open in You',
      search: `${title} ${goal.nextStep || ''} ${goal.definitionOfDone || ''}`.toLowerCase(),
      source: 'goal',
    });
  }
  decisionNotes.forEach((note) => {
    const title = stripEmail(note.title, 160) || 'Decision';
    decisionNodes.push({
      id: `decision:note:${clean(note.id, 40)}`,
      type: 'decision',
      title,
      label: title.length > 14 ? `${title.slice(0, 12)}…` : title,
      working: workingText(note.body, 'A founder call to remember. Open Memory for the note.'),
      href: `/ops/memory?q=${encodeURIComponent(title).slice(0, 160)}`,
      linkLabel: 'Open in Memory',
      search: `${title} ${stripEmail(note.body, 200)}`.toLowerCase(),
      source: 'note',
      noteHay: noteHay(note),
    });
  });

  const grouped = {
    kit: kitNodes,
    person: Array.from(people.values()),
    task: taskNodes,
    decision: decisionNodes,
  };

  const nodes = [];
  let truncated = false;
  MAP_NODE_TYPES.forEach((type) => {
    grouped[type].forEach((node) => {
      if (nodes.length >= MAX_MAP_NODES) {
        truncated = true;
        return;
      }
      nodes.push(node);
    });
  });
  const allowed = new Set(nodes.map((node) => node.id));

  const edges = [];
  const seen = new Set();

  kitNodes.forEach((kit) => {
    if (!allowed.has(kit.id)) return;
    const person = kit.person_name ? people.get(personId(kit.person_name)) : null;
    const personOk = person && allowed.has(person.id);
    notes.forEach((note) => {
      const hay = noteHay(note);
      const hit = containsToken(hay, kit.kit_number)
        || containsToken(hay, kit.person_name)
        || storeEmailHit(hay, storeData, kit.kit_number);
      if (!hit) return;
      if (personOk) addEdge(edges, seen, kit.id, person.id, 'kit-person');
      if (!isDecisionNote(note)) {
        const who = people.get(personId(note.title));
        if (who && allowed.has(who.id)) addEdge(edges, seen, kit.id, who.id, 'kit-person');
      }
    });
  });

  taskNodes.forEach((task) => {
    if (!allowed.has(task.id)) return;
    const hay = `${task.rawTitle} ${task.rawNext}`;
    people.forEach((person) => {
      if (!allowed.has(person.id)) return;
      if (containsToken(hay, person.title)) addEdge(edges, seen, task.id, person.id, 'task-person');
    });
    decisionNodes.forEach((decision) => {
      if (!allowed.has(decision.id)) return;
      if (decision.id === 'decision:goal' && containsToken(hay, decision.title) && decision.title.length >= 4) {
        addEdge(edges, seen, task.id, decision.id, 'task-decision');
      }
      if (decision.noteHay && (containsToken(decision.noteHay, task.rawTitle) || containsToken(hay, decision.title))) {
        addEdge(edges, seen, task.id, decision.id, 'task-decision');
      }
    });
  });

  const publicNodes = nodes.map((node) => {
    const row = {
      id: node.id,
      type: node.type,
      title: node.title,
      label: node.label,
      working: node.working,
      href: node.href,
      linkLabel: node.linkLabel,
      search: node.search,
    };
    if (node.type === 'kit') {
      row.kit_number = node.kit_number;
      row.status = node.status;
    }
    return row;
  });

  const publicEdges = edges.filter((edge) => allowed.has(edge.from) && allowed.has(edge.to));
  const counts = { kit: 0, person: 0, task: 0, decision: 0, edges: publicEdges.length };
  publicNodes.forEach((node) => {
    if (TYPE_SET.has(node.type)) counts[node.type] += 1;
  });

  return {
    nodes: publicNodes,
    edges: publicEdges,
    types: MAP_NODE_TYPES.slice(),
    counts,
    cap: MAX_MAP_NODES,
    truncated,
    empty: publicNodes.length === 0,
    sparse: publicEdges.length === 0,
  };
}

function storeEmailHit(hay, storeData, kitNumber) {
  const kit = listKits(storeData).find((row) => row.kit_number === kitNumber);
  if (!kit || !kit.email) return false;
  return String(hay).toLowerCase().includes(String(kit.email).toLowerCase());
}

function mapGuard(req) {
  return kitsGuard(req);
}

function mapListPayload(storeData) {
  const graph = buildMapGraph(storeData);
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    types: graph.types,
    counts: graph.counts,
    cap: graph.cap,
    truncated: graph.truncated,
    empty: graph.empty,
    sparse: graph.sparse,
  };
}

module.exports = {
  MAP_NODE_TYPES,
  MAX_MAP_NODES,
  buildMapGraph,
  mapGuard,
  mapListPayload,
};
