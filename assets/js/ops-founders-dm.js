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
  let seen = 0;
  let etag = '';

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

  function hasId(id) {
    if (!list || !id) return false;
    return Array.prototype.some.call(list.children, (node) => node.getAttribute('data-id') === id);
  }

  function nearBottom() {
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  function showNew(on) {
    const pill = document.getElementById('dm-new');
    if (pill) pill.hidden = !on;
  }

  function scrollToNewest() {
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    showNew(false);
  }

  function appendMessages(messages) {
    if (!list) return 0;
    const rows = Array.isArray(messages) ? messages : [];
    const stick = nearBottom();
    let added = 0;
    rows.forEach((item) => {
      const id = item && item.id ? String(item.id) : '';
      if (id && hasId(id)) return;
      const li = document.createElement('li');
      li.className = `bubble ${item && item.mine ? 'user' : 'assistant'}`;
      if (id) li.setAttribute('data-id', id);
      const kicker = document.createElement('div');
      kicker.className = 'kicker';
      kicker.textContent = item && item.author ? item.author : '';
      const text = document.createElement('p');
      text.textContent = item && item.text ? item.text : '';
      li.appendChild(kicker);
      li.appendChild(text);
      list.appendChild(li);
      added += 1;
    });
    if (empty) empty.hidden = list.children.length > 0;
    if (added && stick) scrollToNewest();
    else if (added) showNew(true);
    return added;
  }

  function applyPayload(body) {
    if (!body) return;
    if (Array.isArray(body.messages)) appendMessages(body.messages);
    if (typeof body.unread === 'number') badge(body.unread);
    if (typeof body.csrf === 'string' && body.csrf) graph.csrf = body.csrf;
  }

  function pollUnread() {
    if (!link || root || document.hidden) return;
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
    if (!root || inFlight || document.hidden) return;
    const mine = ++seen;
    const last = list && list.children && list.children.length
      ? list.children[list.children.length - 1].getAttribute('data-id')
      : '';
    const url = last
      ? `/ops/api/founders-dm?after=${encodeURIComponent(last)}`
      : '/ops/api/founders-dm';
    const headers = { accept: 'application/json' };
    if (etag) headers['if-none-match'] = etag;
    fetch(url, {
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    }).then((res) => {
      const next = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('etag') : '';
      if (next) etag = next;
      if (res && res.status === 304) return null;
      return res && res.ok ? res.json() : null;
    }).then((body) => {
      if (mine !== seen || inFlight) return;
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
      const mine = ++seen;
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
        if (mine !== seen) return;
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

  function tabActive() {
    return !document.hidden && (typeof document.hasFocus !== 'function' || document.hasFocus());
  }

  function markRead() {
    if (!root || !tabActive() || !graph.csrf) return;
    fetch('/ops/api/founders-dm', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ action: 'read', csrf: graph.csrf }),
    }).then((res) => (res.ok ? res.json() : null)).then((body) => {
      if (body && typeof body.unread === 'number') badge(body.unread);
    }).catch(() => {});
  }

  function onVisible() {
    if (document.hidden) return;
    if (root) {
      pollThread();
      if (tabActive()) markRead();
      return;
    }
    if (link) pollUnread();
  }

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  const newer = document.getElementById('dm-new');
  if (newer) newer.addEventListener('click', scrollToNewest);
  if (list) scrollToNewest();

  if (root) {
    if (tabActive()) markRead();
    pollThread();
    window.setInterval(() => {
      if (document.hidden) return;
      pollThread();
    }, graph.pollMs || 4000);
    return;
  }
  if (link) {
    pollUnread();
    window.setInterval(() => {
      if (document.hidden) return;
      pollUnread();
    }, graph.badgeMs || 8000);
  }
});
