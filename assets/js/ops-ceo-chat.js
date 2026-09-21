document.addEventListener('DOMContentLoaded', () => {
  const dataNode = document.getElementById('ceo-bridge-data');
  const form = document.getElementById('ceo-bridge-form');
  const threadNode = document.getElementById('ceo-thread');
  const waitingNode = document.getElementById('ceo-waiting');
  const emptyNode = document.getElementById('ceo-empty');
  const threadIdInput = document.getElementById('ceo-thread-id');
  const box = document.getElementById('ceo-message');
  const DESK_VOICE = {
    'lavaall-ceo': 'LAVAALL CEO',
    sales: 'LAVAALL Sales & Customer Success',
    technical: 'LAVAALL Technical & QA',
    growth: 'LAVAALL Growth, UGC & Ads',
    lifecycle: 'LAVAALL Lifecycle & Klaviyo',
    researchy: 'Researchy',
  };
  let graph = { threadId: '', status: 'answered', csrf: '', pollUrl: '', postUrl: '', waitingCopy: '', agentId: '', agentName: '' };
  let timer = 0;
  let inFlight = false;

  try {
    graph = Object.assign({}, graph, JSON.parse(dataNode && dataNode.textContent ? dataNode.textContent : '{}') || {});
  } catch (err) {
    graph = { threadId: '', status: 'answered', csrf: '', pollUrl: '', postUrl: '', waitingCopy: '', agentId: '', agentName: '' };
  }

  function agentFromLocation() {
    try {
      const params = new URLSearchParams(window.location.search);
      const query = params.get('agent') || params.get('agentId') || '';
      const path = String(window.location.pathname || '');
      const match = path.match(/\/ops\/chat\/([a-z0-9-]+)/i);
      return (match && match[1]) || query || '';
    } catch (err) {
      return '';
    }
  }

  function normalizeTalkAgent(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'ceo') return 'lavaall-ceo';
    return DESK_VOICE[raw] ? raw : '';
  }

  function currentAgentId() {
    const fromInput = form && form.querySelector('[name="agentId"]');
    return normalizeTalkAgent(graph.agentId || (fromInput && fromInput.value) || agentFromLocation());
  }

  function rememberDesk(payload) {
    if (!payload) return;
    if (payload.agentId) graph.agentId = normalizeTalkAgent(payload.agentId) || graph.agentId;
    if (payload.agentName) graph.agentName = payload.agentName;
    if (payload.thread && payload.thread.agentId) {
      graph.agentId = normalizeTalkAgent(payload.thread.agentId) || graph.agentId;
    }
  }

  function deskVoice() {
    const id = currentAgentId();
    if (graph.agentName && id && graph.agentId === id) return graph.agentName;
    if (id && DESK_VOICE[id]) return DESK_VOICE[id];
    if (graph.agentName) return graph.agentName;
    return 'LAVAALL desk';
  }

  function isCeoTalk() {
    return currentAgentId() === 'lavaall-ceo';
  }

  function isDeskTalk() {
    const id = currentAgentId();
    return Boolean(id && id !== 'lavaall-ceo');
  }

  function isTalkChromeNoise(text) {
    return /this desk uses office talk|not the anthropic or openai helper|open chat with no agent|answering through the \/ops talk bridge|\/ops talk bridge/i.test(String(text || ''));
  }

  function visibleTalkText(text) {
    return String(text || '')
      .split(/\n+/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line && !isTalkChromeNoise(line); })
      .join('\n')
      .trim();
  }

  function threadPollUrl(threadId) {
    const agentId = currentAgentId();
    const id = encodeURIComponent(threadId || '');
    if (agentId && agentId !== 'lavaall-ceo') {
      return '/ops/desk-talk/' + encodeURIComponent(agentId) + '/thread' + (id ? '?id=' + id : '');
    }
    if (agentId === 'lavaall-ceo') {
      return '/ops/ceo-bridge/thread' + (id ? '?id=' + id : '');
    }
    return '';
  }

  function threadPostUrl() {
    const agentId = currentAgentId();
    if (agentId && agentId !== 'lavaall-ceo') return '/ops/desk-talk/' + encodeURIComponent(agentId) + '/message';
    if (agentId === 'lavaall-ceo') return '/ops/ceo-bridge/message';
    return '';
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
      const text = visibleTalkText(item && item.text);
      if (!text) return '';
      return '<li class="bubble ' + (mine ? 'user' : 'assistant') + '">'
        + '<div class="kicker">' + (mine ? 'You' : escapeHtml(deskVoice())) + '</div>'
        + '<p>' + escapeHtml(text) + '</p>'
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
    const base = threadPollUrl(graph.threadId);
    if (!base) return '';
    if (!isCeoTalk() && base.indexOf('ceo-bridge') !== -1) return '';
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
  }

  function startPoll() {
    if (timer) return;
    if (!pollUrl()) return;
    poll();
    timer = window.setInterval(poll, 2000);
  }

  function stopPoll() {
    if (!timer) return;
    window.clearInterval(timer);
    timer = 0;
  }

  async function poll() {
    const url = pollUrl();
    if (!url || (!isCeoTalk() && url.indexOf('ceo-bridge') !== -1)) return;
    if (inFlight) return;
    inFlight = true;
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload && payload.csrf) graph.csrf = payload.csrf;
      rememberDesk(payload);
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
      const postUrl = threadPostUrl() || graph.postUrl;
      if (!postUrl || (!isCeoTalk() && postUrl.indexOf('ceo-bridge') !== -1)) return;
      const body = {
        csrf: graph.csrf || (form.querySelector('[name="csrf"]') && form.querySelector('[name="csrf"]').value) || '',
        threadId: graph.threadId || (threadIdInput && threadIdInput.value) || '',
        source: 'ops-office',
        agentId: currentAgentId(),
        correlationId: (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
          : String(Date.now()) + Math.random().toString(16).slice(2, 10),
        text,
      };
      try {
        const response = await fetch(postUrl, {
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
        rememberDesk(payload);
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
