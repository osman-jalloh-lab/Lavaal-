document.addEventListener('DOMContentLoaded', () => {
  const dataNode = document.getElementById('office-data');
  const cameras = document.getElementById('office-cameras');
  const hotspots = document.getElementById('office-hotspots');
  const selected = document.getElementById('office-selected');
  const roster = document.getElementById('office-roster');
  let graph = { agents: [], cameras: [], hotspots: {} };
  let cameraId = 'wide';
  let selectedId = '';

  try {
    graph = JSON.parse(dataNode && dataNode.textContent ? dataNode.textContent : '{}') || graph;
  } catch (err) {
    graph = { agents: [], cameras: [], hotspots: {} };
  }
  if (!Array.isArray(graph.agents)) graph.agents = [];
  if (!graph.hotspots || typeof graph.hotspots !== 'object') graph.hotspots = {};

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

  function showCameraArt() {
    document.querySelectorAll('[data-camera-art]').forEach((node) => {
      node.hidden = node.getAttribute('data-camera-art') !== cameraId;
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
      if (selectedId === agent.id) button.classList.add('is-on');
      if (agent.photo) {
        const img = document.createElement('img');
        img.src = agent.photo;
        img.alt = '';
        img.addEventListener('error', () => {
          if (img.parentNode) img.parentNode.removeChild(img);
        });
        button.appendChild(img);
      }
      button.addEventListener('click', () => setSelected(agent.id));
      hotspots.appendChild(button);
    });
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

  setCamera('wide');
});
