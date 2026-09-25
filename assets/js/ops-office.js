document.addEventListener('DOMContentLoaded', () => {
  const dataNode = document.getElementById('office-data');
  const cameras = document.getElementById('office-cameras');
  const hotspots = document.getElementById('office-hotspots');
  const selected = document.getElementById('office-selected');
  const roster = document.getElementById('office-roster');
  let graph = { agents: [], cameras: [], hotspots: {}, wordmark: {} };
  let cameraId = 'lead';
  let selectedId = '';

  try {
    graph = JSON.parse(dataNode && dataNode.textContent ? dataNode.textContent : '{}') || graph;
  } catch (err) {
    graph = { agents: [], cameras: [], hotspots: {}, wordmark: {} };
  }
  if (!Array.isArray(graph.agents)) graph.agents = [];
  if (!Array.isArray(graph.cameras)) graph.cameras = [];
  if (!graph.hotspots || typeof graph.hotspots !== 'object') graph.hotspots = {};
  if (!graph.wordmark || typeof graph.wordmark !== 'object') graph.wordmark = {};

  // Founder 2026-09-22: hide frosted LAVAALL glass; shrink CEO aisle hotspots.
  (function applyAisleFix() {
    const style = document.createElement('style');
    style.setAttribute('data-office-aisle-fix', '1');
    style.textContent = [
      '.office-wordmark,#office-wordmark{display:none!important;pointer-events:none!important;}',
      '@media (min-width:1200px){',
      '.office-cameras{z-index:3!important;}',
      '.office-roster,.office-selected{z-index:4!important;}',
      '.office-hotspots{z-index:1!important;}',
      '}',
    ].join('');
    document.head.appendChild(style);
    const mark = document.getElementById('office-wordmark');
    if (mark) {
      mark.hidden = true;
      mark.style.display = 'none';
      mark.style.pointerEvents = 'none';
    }
    const ceo = {
      wide: { id: 'lavaall-ceo', left: 42, top: 36, width: 16, height: 28 },
      'front-left': { id: 'lavaall-ceo', left: 54, top: 32, width: 18, height: 30 },
      'front-right': { id: 'lavaall-ceo', left: 30, top: 32, width: 18, height: 30 },
      side: { id: 'lavaall-ceo', left: 37, top: 30, width: 20, height: 32 },
      lead: { id: 'lavaall-ceo', left: 38, top: 28, width: 24, height: 36 },
    };
    Object.keys(ceo).forEach((cam) => {
      const list = Array.isArray(graph.hotspots[cam]) ? graph.hotspots[cam].slice() : [];
      const idx = list.findIndex((s) => s && s.id === 'lavaall-ceo');
      if (idx >= 0) list[idx] = ceo[cam];
      else list.push(ceo[cam]);
      graph.hotspots[cam] = list;
    });
  })();

  function agentById(id) {
    return graph.agents.find((item) => item.id === id) || null;
  }

  function bindPhotoFallback(img) {
    if (!img) return;
    const fallback = img.parentElement && img.parentElement.querySelector('.office-photo-fallback');
    function showFallback() {
      img.hidden = true;
      if (fallback) fallback.hidden = false;
    }
    img.addEventListener('error', showFallback);
    if (img.complete && img.naturalWidth === 0) showFallback();
  }

  document.querySelectorAll('img[data-office-photo]').forEach(bindPhotoFallback);

  function bindCameraPhoto(img) {
    if (!img) return;
    const id = img.getAttribute('data-camera-photo');
    function showArt() {
      img.hidden = true;
      document.querySelectorAll('[data-camera-art]').forEach((node) => {
        node.hidden = node.getAttribute('data-camera-art') !== cameraId;
      });
    }
    img.addEventListener('error', () => {
      img.setAttribute('data-missing', '1');
      if (id === cameraId) showArt();
    });
    if (img.complete && img.naturalWidth === 0) {
      img.setAttribute('data-missing', '1');
    }
  }

  document.querySelectorAll('img[data-camera-photo]').forEach(bindCameraPhoto);

  function showCameraArt() {
    const photos = document.querySelectorAll('[data-camera-photo]');
    let showingPhoto = false;
    photos.forEach((node) => {
      const match = node.getAttribute('data-camera-photo') === cameraId;
      const missing = node.getAttribute('data-missing') === '1';
      node.hidden = !match || missing;
      if (match && !missing) showingPhoto = true;
    });
    document.querySelectorAll('[data-camera-art]').forEach((node) => {
      node.hidden = showingPhoto || node.getAttribute('data-camera-art') !== cameraId;
    });
  }

  function setSelected(id) {
    const agent = agentById(id);
    selectedId = agent && !agent.placeholder ? agent.id : '';
    document.querySelectorAll('.office-hotspot').forEach((node) => {
      node.classList.toggle('is-on', node.getAttribute('data-agent') === selectedId);
    });
    if (roster) {
      roster.querySelectorAll('button[data-agent]').forEach((node) => {
        node.classList.toggle('is-on', node.getAttribute('data-agent') === selectedId);
      });
    }
    if (selected) {
      selected.textContent = agent && !agent.placeholder
        ? agent.name
        : 'Tap a desk or a name.';
    }
  }

  function drawHotspots() {
    if (!hotspots) return;
    while (hotspots.firstChild) hotspots.removeChild(hotspots.firstChild);
    const map = graph.hotspots[cameraId] || [];
    map.forEach((spot) => {
      const agent = agentById(spot.id);
      if (!agent || agent.placeholder) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'office-hotspot';
      button.setAttribute('data-agent', agent.id);
      button.setAttribute('aria-label', agent.name);
      button.style.left = spot.left + '%';
      button.style.top = spot.top + '%';
      button.style.width = spot.width + '%';
      button.style.height = spot.height + '%';
      if (agent.id === 'researchy') {
        const cap = document.createElement('span');
        cap.className = 'office-hotspot-label';
        cap.textContent = 'Researchy';
        button.appendChild(cap);
      }
      if (selectedId === agent.id) button.classList.add('is-on');
      button.addEventListener('click', () => setSelected(agent.id));
      hotspots.appendChild(button);
    });
  }

  function setWordmark() {
    const mark = document.getElementById('office-wordmark');
    if (!mark) return;
    // Founder: never show frosted LAVAALL glass; keep Lead view camera chip only.
    mark.hidden = true;
    mark.style.display = 'none';
    mark.style.pointerEvents = 'none';
  }

  function setCamera(nextId) {
    const found = (graph.cameras || []).find((item) => item.id === nextId);
    if (!found) return;
    cameraId = found.id;
    if (cameras) {
      cameras.querySelectorAll('button[data-camera]').forEach((node) => {
        node.classList.toggle('is-on', node.getAttribute('data-camera') === cameraId);
      });
    }
    showCameraArt();
    drawHotspots();
    setWordmark();
    if (selectedId) setSelected(selectedId);
  }

  if (cameras) {
    cameras.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-camera]');
      if (!button) return;
      setCamera(button.getAttribute('data-camera'));
    });
  }
  if (roster) {
    roster.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-agent]');
      if (!button) return;
      setSelected(button.getAttribute('data-agent'));
    });
  }

  setCamera('lead');
});
