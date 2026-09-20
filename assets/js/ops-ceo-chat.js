document.addEventListener('DOMContentLoaded', () => {
  const dataNode = document.getElementById('ceo-bridge-data');
  const form = document.getElementById('ceo-bridge-form');
  const threadNode = document.getElementById('ceo-thread');
  const waitingNode = document.getElementById('ceo-waiting');
  const emptyNode = document.getElementById('ceo-empty');
  const threadIdInput = document.getElementById('ceo-thread-id');
  const box = document.getElementById('ceo-message');
  let graph = { threadId: '', status: 'answered', csrf: '', pollUrl: '/ops/api/ceo-bridge/thread', postUrl: '/ops/api/ceo-bridge/message', waitingCopy: 'Waiting on CEO…' };
  let timer = 0;

  try {
    graph = JSON.parse(dataNode && dataNode.textContent ? dataNode.textContent : '{}') || graph;
  } catch (err) {
    graph = { threadId: '', status: 'answered', csrf: '', pollUrl: '/ops/api/ceo-bridge/thread', postUrl: '/ops/api/ceo-bridge/message', waitingCopy: 'Waiting on CEO…' };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMessages(messages) {
    if (!threadNode) return;
    const rows = Array.isArray(messages) ? messages : [];
    threadNode.innerHTML = rows.map((item) => {
      const mine = item.role === 'founder';
      return '<li class="bubble ' + (mine ? 'user' : 'assistant') + '">'
        + '<div class="kicker">' + (mine ? 'You' : 'LAVAALL CEO') + '</div>'
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

  function applyThread(thread) {
    if (!thread || !thread.id) return;
    graph.threadId = thread.id;
    graph.status = thread.status || 'answered';
    graph.pollUrl = '/ops/api/ceo-bridge/thread?id=' + encodeURIComponent(thread.id);
    if (threadIdInput) threadIdInput.value = thread.id;
    renderMessages(thread.messages);
    setWaiting(thread.status === 'pending');
    if (thread.status === 'pending') startPoll();
    else stopPoll();
  }

  function startPoll() {
    if (timer) return;
    timer = window.setInterval(poll, 4000);
  }

  function stopPoll() {
    if (!timer) return;
    window.clearInterval(timer);
    timer = 0;
  }

  async function poll() {
    const url = graph.pollUrl || '/ops/api/ceo-bridge/thread';
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload && payload.csrf) graph.csrf = payload.csrf;
      if (payload && payload.thread) applyThread(payload.thread);
    } catch (err) {
      return;
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
        text,
      };
      try {
        const response = await fetch(graph.postUrl || '/ops/api/ceo-bridge/message', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
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
        if (payload && payload.thread) applyThread(payload.thread);
        setWaiting(true);
        startPoll();
      } catch (err) {
        return;
      }
    });
  }

  if (graph.status === 'pending') startPoll();
});
