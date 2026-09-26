document.addEventListener('DOMContentLoaded', () => {
  const link = document.querySelector('a[href="/ops/founders"]');
  const root = document.getElementById('founders-dm');
  const dataNode = document.getElementById('founders-dm-data');
  const form = document.getElementById('dm-form');
  const field = document.getElementById('dm-text');
  const status = document.getElementById('dm-status');
  const mic = document.getElementById('dm-mic');
  const micStatus = document.getElementById('dm-mic-status');
  const list = document.getElementById('dm-thread');
  const empty = document.getElementById('dm-empty');
  let graph = { csrf: '', pollMs: 4000, badgeMs: 8000 };
  let inFlight = false;

  try {
    graph = Object.assign({}, graph, JSON.parse(dataNode && dataNode.textContent ? dataNode.textContent : '{}') || {});
  } catch (err) {
    graph = { csrf: '', pollMs: 4000, badgeMs: 8000 };
  }

  function badge(count) {
    if (!link) return;
    const n = Math.max(0, Math.floor(Number(count) || 0));
    let node = link.querySelector('.nav-unread');
    if (n <= 0) {
      if (node) node.remove();
      return;
    }
    const shown = n > 99 ? '99+' : String(n);
    if (!node) {
      node = document.createElement('span');
      node.className = 'nav-unread';
      link.appendChild(node);
    }
    node.textContent = shown;
    node.setAttribute('aria-label', `${shown} unread`);
  }

  function render(messages) {
    if (!list) return;
    list.textContent = '';
    const rows = Array.isArray(messages) ? messages : [];
    if (empty) empty.hidden = rows.length > 0;
    rows.forEach((item) => {
      const li = document.createElement('li');
      li.className = `bubble ${item && item.mine ? 'user' : 'assistant'}`;
      const kicker = document.createElement('div');
      kicker.className = 'kicker';
      kicker.textContent = item && item.author ? item.author : '';
      const text = document.createElement('p');
      text.textContent = item && item.text ? item.text : '';
      li.appendChild(kicker);
      li.appendChild(text);
      list.appendChild(li);
    });
  }

  function applyPayload(body) {
    if (!body) return;
    if (Array.isArray(body.messages)) render(body.messages);
    if (typeof body.unread === 'number') badge(body.unread);
    if (typeof body.csrf === 'string' && body.csrf) graph.csrf = body.csrf;
  }

  function pollUnread() {
    if (!link || root) return;
    fetch('/ops/api/founders-dm?scope=unread', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    }).then((res) => (res.ok ? res.json() : null)).then((body) => {
      if (!body || typeof body.unread !== 'number') return;
      badge(body.unread);
    }).catch(() => {});
  }

  function pollThread() {
    if (!root || inFlight) return;
    fetch('/ops/api/founders-dm', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    }).then((res) => (res.ok ? res.json() : null)).then((body) => {
      applyPayload(body);
    }).catch(() => {});
  }

  if (mic && field && typeof window.lavaallBindSpeechMic === 'function') {
    window.lavaallBindSpeechMic({
      box: field,
      mic,
      status: micStatus,
      maxLength: 2000,
      hideIfMissing: true,
    });
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      if (typeof window.fetch !== 'function') return;
      event.preventDefault();
      if (inFlight) return;
      const text = field ? field.value : '';
      inFlight = true;
      fetch('/ops/api/founders-dm', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ text, csrf: graph.csrf || '' }),
      }).then((res) => res.json().then((body) => ({ ok: res.ok, body }))).then((result) => {
        inFlight = false;
        if (!result.ok) {
          if (status) status.textContent = 'Message was not sent. Reload and try again.';
          return;
        }
        if (field) field.value = '';
        if (status) status.textContent = '';
        applyPayload(result.body);
      }).catch(() => {
        inFlight = false;
        if (status) status.textContent = 'Message was not sent. Reload and try again.';
      });
    });
  }

  if (root) {
    pollThread();
    window.setInterval(pollThread, graph.pollMs || 4000);
    return;
  }
  if (link) {
    pollUnread();
    window.setInterval(pollUnread, graph.badgeMs || 8000);
  }
});
