document.addEventListener('DOMContentLoaded', () => {
  const dataNode = document.getElementById('ceo-bridge-data');
  const form = document.getElementById('ceo-bridge-form');
  const threadNode = document.getElementById('ceo-thread');
  const waitingNode = document.getElementById('ceo-waiting');
  const emptyNode = document.getElementById('ceo-empty');
  const threadIdInput = document.getElementById('ceo-thread-id');
  const box = document.getElementById('ceo-message');
  let graph = { threadId: '', status: 'answered', csrf: '', pollUrl: '/ops/api/ceo-bridge/thread', postUrl: '/ops/api/ceo-bridge/message', waitingCopy: 'Waiting on CEO…', agentName: 'LAVAALL CEO' };
  let timer = 0;
  let inFlight = false;

  try {
    graph = JSON.parse(dataNode && dataNode.textContent ? dataNode.textContent : '{}') || graph;
  } catch (err) {
    graph = { threadId: '', status: 'answered', csrf: '', pollUrl: '/ops/api/ceo-bridge/thread', postUrl: '/ops/api/ceo-bridge/message', waitingCopy: 'Waiting on CEO…', agentName: 'LAVAALL CEO' };
  }

  function deskVoice() {
    return graph.agentName || 'LAVAALL CEO';
  }

  function threadPollUrl(threadId) {
    const id = encodeURIComponent(threadId || '');
    if (graph.agentId && graph.agentId !== 'lavaall-ceo') {
      return '/ops/api/desk-talk/thread?agent=' + encodeURIComponent(graph.agentId) + '&id=' + id;
    }
    return '/ops/api/ceo-bridge/thread?id=' + id;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function lastMessage(thread) {
    const rows = thread && Array.isArray(thread.messages) ? thread.messages : [];
    return rows.length ? rows[rows.length - 1] : null;
  }

  function threadIsWaiting(thread, flag) {
    if (!thread) return false;
    const last = lastMessage(thread);
    if (last && (last.role === 'ceo' || last.role === 'assistant')) return false;
    if (flag === false) return false;
    return thread.status === 'pending' || flag === true;
  }

  function renderMessages(messages) {
    if (!threadNode) return;
    const rows = Array.isArray(messages) ? messages : [];
    threadNode.innerHTML = rows.map((item) => {
      const mine = item.role === 'founder';
      return '<li class="bubble ' + (mine ? 'user' : 'assistant') + '">'
        + '<div class="kicker">' + (mine ? 'You' : escapeHtml(deskVoice())) + '</div>'
        + '<p>' + escapeHtml(item.text || '') + '</p>'
        + '</li>';
    }).join('');
    if (emptyNode) emptyNode.hidden = rows.length > 0;
  }

  function setWaiting(on) {
    if (waitingNode) {
      waitingNode.hidden = !on;
      waitingNode.textContent = graph.waitingCopy || 'Waiting on CEO…';
    }
  }

  function applyThread(thread, waitingFlag) {
    if (!thread || !thread.id) return false;
    const waiting = threadIsWaiting(thread, waitingFlag);
    graph.threadId = thread.id;
    graph.status = waiting ? 'pending' : 'answered';
    graph.pollUrl = threadPollUrl(thread.id);
    if (threadIdInput) threadIdInput.value = thread.id;
    renderMessages(thread.messages);
    setWaiting(waiting);
    if (waiting) startPoll();
    else stopPoll();
    return waiting;
  }

  function pollUrl() {
    const base = graph.pollUrl || '/ops/api/ceo-bridge/thread';
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
  }

  function startPoll() {
    if (timer) return;
    poll();
    timer = window.setInterval(poll, 2000);
  }

  function stopPoll() {
    if (!timer) return;
    window.clearInterval(timer);
    timer = 0;
  }

  async function poll() {
    if (inFlight) return;
    inFlight = true;
    try {
      const response = await fetch(pollUrl(), {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload && payload.csrf) graph.csrf = payload.csrf;
      if (payload && payload.thread) applyThread(payload.thread, payload.waiting);
    } catch (err) {
      return;
    } finally {
      inFlight = false;
    }
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = box && box.value ? box.value.trim() : '';
      if (!text) return;
      const body = {
        csrf: graph.csrf || (form.querySelector('[name="csrf"]') && form.querySelector('[name="csrf"]').value) || '',
        threadId: graph.threadId || (threadIdInput && threadIdInput.value) || '',
        source: 'ops-office',
        agentId: graph.agentId || '',
        correlationId: (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
          : String(Date.now()) + Math.random().toString(16).slice(2, 10),
        text,
      };
      try {
        const response = await fetch(graph.postUrl || '/ops/api/ceo-bridge/message', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        const payload = await response.json();
        if (!response.ok) return;
        if (payload && payload.csrf) {
          graph.csrf = payload.csrf;
          const csrfInput = form.querySelector('[name="csrf"]');
          if (csrfInput) csrfInput.value = payload.csrf;
        }
        if (box) box.value = '';
        if (payload && payload.thread) applyThread(payload.thread, payload.waiting);
        else setWaiting(true);
        startPoll();
      } catch (err) {
        return;
      }
    });
  }

  if (graph.status === 'pending') startPoll();
});
