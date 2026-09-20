document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('map-root');
  const svg = document.getElementById('map-svg');
  const hint = document.getElementById('map-empty');
  const card = document.getElementById('map-detail');
  const search = document.getElementById('map-search');
  const filters = document.getElementById('map-filters');
  const cream = document.getElementById('map-opt-cream');
  const sound = document.getElementById('map-opt-sound');
  const capNote = document.getElementById('map-cap');
  const placeholder = 'Tap a bubble. You’ll see what it is, what we’re working on, and a link to the real Kits, Memory, or Tasks record.';
  const typeLabel = { kit: 'Kit', person: 'Person', task: 'Task', decision: 'Decision' };
  const radius = { kit: 13, person: 11, task: 11, decision: 15 };
  const drifts = ['float-a', 'float-b', 'float-c'];
  const ns = 'http://www.w3.org/2000/svg';
  let graph = { nodes: [], edges: [] };
  let enabled = { kit: true, person: true, task: true, decision: true };
  let selectedId = '';
  let audio = { ctx: null, osc: null, gain: null, running: false };

  function readEmbedded() {
    const block = document.getElementById('map-data');
    if (!block) return null;
    try {
      return JSON.parse(block.textContent || 'null');
    } catch (err) {
      return null;
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function layout(nodes) {
    const width = 360;
    const height = 320;
    const cx = 180;
    const cy = 150;
    const decisions = nodes.filter((node) => node.type === 'decision');
    const others = nodes.filter((node) => node.type !== 'decision');
    decisions.forEach((node, index) => {
      const spread = (index - (decisions.length - 1) / 2) * 40;
      node.x = clamp(cx + spread, 28, width - 28);
      node.y = cy;
    });
    others.forEach((node, index) => {
      const angle = (index * 2.399963) % (Math.PI * 2);
      const rad = 36 + Math.sqrt(index + 1) * 20;
      const wobble = node.type === 'kit' ? 0 : node.type === 'person' ? 6 : -4;
      node.x = clamp(cx + Math.cos(angle) * rad, 22, width - 22);
      node.y = clamp(cy + Math.sin(angle) * (rad * 0.78) + wobble, 22, height - 22);
    });
    if (nodes.length === 1) {
      nodes[0].x = cx;
      nodes[0].y = cy;
    }
  }

  function visibleNodes() {
    return graph.nodes.filter((node) => enabled[node.type]);
  }

  function svgEl(name, attrs) {
    const node = document.createElementNS(ns, name);
    Object.keys(attrs || {}).forEach((key) => {
      node.setAttribute(key, String(attrs[key]));
    });
    return node;
  }

  function clearCard() {
    selectedId = '';
    if (!card) return;
    card.replaceChildren();
    const p = document.createElement('p');
    p.className = 'map-placeholder';
    p.textContent = placeholder;
    card.appendChild(p);
  }

  function showCard(node) {
    if (!card || !node) return;
    selectedId = node.id;
    card.replaceChildren();
    const type = document.createElement('div');
    type.className = 'map-type';
    type.textContent = typeLabel[node.type] || node.type;
    const title = document.createElement('h2');
    title.textContent = node.title || node.label || '';
    const working = document.createElement('p');
    working.className = 'map-working';
    working.textContent = node.working || '';
    const actions = document.createElement('div');
    actions.className = 'map-actions';
    const open = document.createElement('a');
    open.className = 'btn';
    open.href = node.href || '/ops';
    open.textContent = node.linkLabel || 'Open';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn map-btn-ghost';
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      clearCard();
      draw();
    });
    actions.appendChild(open);
    actions.appendChild(close);
    card.appendChild(type);
    card.appendChild(title);
    card.appendChild(working);
    card.appendChild(actions);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function relatedIds(id) {
    const ids = new Set([id]);
    (graph.edges || []).forEach((edge) => {
      if (edge.from === id) ids.add(edge.to);
      if (edge.to === id) ids.add(edge.from);
    });
    return ids;
  }

  function draw() {
    if (!svg) return;
    const shown = visibleNodes();
    const shownIds = new Set(shown.map((node) => node.id));
    layout(shown);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const edges = (graph.edges || []).filter((edge) => shownIds.has(edge.from) && shownIds.has(edge.to));
    const byId = new Map(shown.map((node) => [node.id, node]));
    const related = selectedId ? relatedIds(selectedId) : null;
    edges.forEach((edge) => {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (!a || !b) return;
      const on = Boolean(selectedId && (edge.from === selectedId || edge.to === selectedId));
      svg.appendChild(svgEl('line', {
        class: `map-edge${on ? ' is-on' : ''}`,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
      }));
    });
      const needle = search && search.value ? search.value.trim().toLowerCase() : '';
    shown.forEach((node, index) => {
      const hay = String(node.search || `${node.title} ${node.label}`).toLowerCase();
      const hit = !needle || hay.indexOf(needle) !== -1;
      const isOn = selectedId === node.id;
      const isRelated = Boolean(related && !isOn && related.has(node.id));
      const isIdle = Boolean(selectedId && !isOn && !isRelated);
      const group = svgEl('g', {
        class: `map-node map-${node.type} ${drifts[index % drifts.length]}${isOn ? ' is-on' : ''}${isRelated ? ' is-related' : ''}${isIdle ? ' is-idle' : ''}${needle && hit ? ' is-hit' : ''}${needle && !hit ? ' is-dim' : ''}`,
        'data-id': node.id,
        tabindex: '0',
        role: 'button',
        'aria-label': `${typeLabel[node.type] || node.type} ${node.title || node.label || ''}`,
      });
      group.appendChild(svgEl('circle', {
        cx: node.x,
        cy: node.y,
        r: radius[node.type] || 11,
      }));
      const text = svgEl('text', {
        x: node.x,
        y: node.y + 4,
        'text-anchor': 'middle',
      });
      text.textContent = node.label || '';
      group.appendChild(text);
      group.addEventListener('click', () => {
        showCard(node);
        draw();
      });
      group.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        showCard(node);
        draw();
      });
      svg.appendChild(group);
    });
    if (hint) {
      const sparse = !graph.nodes.length || !(graph.edges && graph.edges.length);
      hint.hidden = !sparse;
    }
    if (capNote) {
      capNote.hidden = !graph.truncated;
    }
  }

  function applyGraph(next) {
    graph = next && typeof next === 'object' ? next : { nodes: [], edges: [] };
    if (!Array.isArray(graph.nodes)) graph.nodes = [];
    if (!Array.isArray(graph.edges)) graph.edges = [];
    graph.nodes = graph.nodes.filter((node) => node && typeLabel[node.type]);
    draw();
  }

  async function load() {
    const embedded = readEmbedded();
    if (embedded) applyGraph(embedded);
    try {
      const response = await fetch('/ops/api/map', {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const payload = await response.json();
      applyGraph(payload);
    } catch (err) {
      if (!embedded) applyGraph({ nodes: [], edges: [] });
    }
  }

  if (filters) {
    filters.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-type]');
      if (!button) return;
      const type = button.getAttribute('data-type');
      if (!Object.prototype.hasOwnProperty.call(enabled, type)) return;
      enabled[type] = !enabled[type];
      button.classList.toggle('is-on', enabled[type]);
      button.setAttribute('aria-pressed', enabled[type] ? 'true' : 'false');
      draw();
    });
  }
  if (search) search.addEventListener('input', draw);
  if (cream && root) {
    cream.checked = false;
    cream.addEventListener('change', () => {
      root.classList.toggle('is-wash', cream.checked);
    });
  }
  if (sound) {
    sound.checked = false;
    sound.addEventListener('change', async () => {
      if (!sound.checked) {
        if (audio.gain) audio.gain.gain.value = 0;
        return;
      }
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
          sound.checked = false;
          return;
        }
        audio.ctx = audio.ctx || new Ctx();
        if (audio.ctx.state === 'suspended') await audio.ctx.resume();
        if (!audio.running) {
          audio.osc = audio.ctx.createOscillator();
          audio.gain = audio.ctx.createGain();
          audio.osc.type = 'sine';
          audio.osc.frequency.value = 110;
          audio.gain.gain.value = 0.015;
          audio.osc.connect(audio.gain);
          audio.gain.connect(audio.ctx.destination);
          audio.osc.start();
          audio.running = true;
        } else if (audio.gain) {
          audio.gain.gain.value = 0.015;
        }
      } catch (err) {
        sound.checked = false;
      }
    });
  }

  clearCard();
  load();
});
