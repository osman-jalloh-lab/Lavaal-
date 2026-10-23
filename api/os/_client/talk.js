/* LAVAALL OS Talk: one-on-one chats with the desks, at #talk/<deskId>.
   No new server code and no model client. It uses the existing /ops Talk path, same origin, with the founder's
   /ops session and its CSRF token:
     desks other than the CEO  GET /ops/desk-talk/<id>/thread, POST /ops/desk-talk/<id>/message  (_agent_thread.js)
     the CEO                   GET /ops/ceo-bridge/thread,      POST /ops/ceo-bridge/message      (_ceo_bridge.js)
   Left: the desks with their last message and its time. Right: the thread, founder bubbles on the right, desk
   bubbles on the left, times in America/Chicago, typing dots while a desk has not answered, and a composer.
   A desk with no thread shows "No messages with <desk> yet." Message text is shown as plain text (escaped). */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var CEO = 'lavaall-ceo';
  var MAX_TEXT = 2000;
  var POLL_MS = 6000;

  // id -> { thread, waiting, waitingCopy, csrf, error, loaded }
  var state = {};
  var timer = null;
  var alive = false;
  var rootEl = null;

  function url(id, kind) {
    return id === CEO ? '/ops/ceo-bridge/' + kind : '/ops/desk-talk/' + encodeURIComponent(id) + '/' + kind;
  }

  function talkDesks(data) {
    return (data.desks || []).filter(function (d) { return d.talk; });
  }

  function deskOf(data, id) {
    return talkDesks(data).filter(function (d) { return d.id === id; })[0] || null;
  }

  function lastMessage(entry) {
    var list = entry && entry.thread && entry.thread.messages;
    return list && list.length ? list[list.length - 1] : null;
  }

  function clip(text, n) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  // ---- pure renderers (also used by the tests) ------------------------------------------------------

  function listHtml(data, current) {
    return talkDesks(data).map(function (d) {
      var e = state[d.id];
      var last = lastMessage(e);
      var preview;
      if (!e || !e.loaded) preview = 'Loading…';
      else if (e.error) preview = 'Could not load';
      else if (last) preview = (last.role === 'founder' ? 'You: ' : '') + clip(last.text, 60);
      else preview = 'No messages yet';
      var when = last ? OS.fmtTime(last.at) : '';
      return '<a class="li talkrow' + (d.id === current ? ' on' : '') + '" href="#talk/' + esc(d.id) + '" data-desk="' + esc(d.id) + '">' +
        '<span class="av sq" aria-hidden="true">' + esc(String(d.short || d.name || '?').charAt(0).toUpperCase()) + '</span>' +
        '<div class="t"><div>' + esc(d.short || d.name) + '</div><small>' + esc(preview) + '</small></div>' +
        (when ? '<span class="dim num talktime">' + esc(when) + '</span>' : '') + '</a>';
    }).join('');
  }

  function typing(copy) {
    return '<div class="bub-row"><div class="bub desk waiting"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span> ' + esc(copy) + '</div></div>';
  }

  function threadHtml(entry, desk) {
    var name = desk.short || desk.name;
    if (!entry || !entry.loaded) return '<div class="empty"><b>Loading the thread…</b></div>';
    if (entry.error) {
      return '<div class="empty"><b>' + esc(entry.error) + '</b><small>Source: the existing /ops Talk path (' + esc(url(desk.id, 'thread')) + ').</small></div>';
    }
    var messages = entry.thread && entry.thread.messages ? entry.thread.messages : [];
    if (!messages.length && !entry.waiting) {
      return '<div class="empty"><b>No messages with ' + esc(name) + ' yet.</b><small>Send one below. It goes through the same Talk path as /ops Chat.</small></div>';
    }
    return messages.map(function (m) {
      var mine = m.role === 'founder';
      return '<div class="bub-row' + (mine ? ' mine' : '') + '"><div class="bub ' + (mine ? 'mine' : 'desk') + '"><div class="bt">' + esc(m.text) + '</div>' +
        '<div class="bm">' + esc(mine ? 'You' : name) + ' · ' + esc(OS.fmtTime(m.at)) + '</div></div></div>';
    }).join('') + (entry.waiting ? typing(entry.waitingCopy || 'Waiting on ' + name + '…') : '');
  }

  function paneHtml(desk, entry) {
    return '<div class="talkhead"><a class="ib talkback" href="#talk" aria-label="Back to the desks">' + icon('chev') + '</a>' +
      '<span class="av sq" aria-hidden="true">' + esc(String(desk.short || desk.name).charAt(0).toUpperCase()) + '</span>' +
      '<div class="t"><b>' + esc(desk.name) + '</b><small>' + esc(desk.now || 'Status not recorded yet') + '</small></div>' +
      '<span class="link" data-go="desks/' + esc(desk.id) + '">Desk</span></div>' +
      '<div class="thread" id="talk-thread" aria-live="polite">' + threadHtml(entry, desk) + '</div>' +
      '<div class="composer"><textarea id="talk-input" rows="2" maxlength="' + MAX_TEXT + '" placeholder="Message ' + esc(desk.short || desk.name) + '" aria-label="Message ' + esc(desk.short || desk.name) + '"></textarea>' +
      '<button class="btn pri" type="button" id="talk-send">Send</button></div>' +
      '<p class="note foot" id="talk-note"></p>';
  }

  // ---- network (existing /ops endpoints, same origin) ----------------------------------------------

  function request(id, kind, method, body) {
    var init = { method: method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return window.fetch(url(id, kind), init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) { return { status: res.status, json: json }; });
    });
  }

  function failure(status) {
    if (status === 401 || status === 403) return 'Talk needs your /ops sign-in. Open /ops, sign in, then come back.';
    if (status === 503) return 'The desk Talk store is unavailable right now.';
    return 'Could not load this thread (HTTP ' + status + ').';
  }

  function apply(id, result) {
    var e = state[id] || (state[id] = {});
    e.loaded = true;
    if (result.status === 200 && result.json && result.json.ok) {
      e.error = '';
      e.thread = result.json.thread || { messages: [] };
      e.waiting = Boolean(result.json.waiting);
      e.waitingCopy = result.json.waitingCopy || '';
      e.csrf = result.json.csrf || e.csrf || '';
    } else {
      e.error = failure(result.status);
    }
    return e;
  }

  function load(id) {
    return request(id, 'thread', 'GET').then(function (r) { return apply(id, r); }, function () {
      var e = state[id] || (state[id] = {});
      e.loaded = true;
      e.error = 'Could not reach the server.';
      return e;
    });
  }

  // ---- painting ---------------------------------------------------------------------------------------

  function current(ctx) {
    var desks = talkDesks(ctx.data);
    return ctx.sub && deskOf(ctx.data, ctx.sub) ? ctx.sub : (desks[0] ? desks[0].id : '');
  }

  function paintList(ctx, cur) {
    var el = rootEl && rootEl.querySelector('#talk-list');
    if (el) el.innerHTML = listHtml(ctx.data, cur);
  }

  function paintThread(ctx, cur) {
    var desk = deskOf(ctx.data, cur);
    var el = rootEl && rootEl.querySelector('#talk-thread');
    if (!desk || !el) return;
    el.innerHTML = threadHtml(state[cur], desk);
    if (el.scrollTo) el.scrollTo(0, el.scrollHeight); else el.scrollTop = el.scrollHeight;
  }

  function schedulePoll(ctx, cur) {
    if (timer) { window.clearTimeout(timer); timer = null; }
    if (!alive || !state[cur] || !state[cur].waiting) return;
    timer = window.setTimeout(function () {
      load(cur).then(function () {
        if (!alive) return;
        paintList(ctx, cur);
        paintThread(ctx, cur);
        schedulePoll(ctx, cur);
      });
    }, POLL_MS);
  }

  function send(ctx, cur) {
    var input = rootEl.querySelector('#talk-input');
    var button = rootEl.querySelector('#talk-send');
    var note = rootEl.querySelector('#talk-note');
    var text = String(input.value || '').trim();
    if (!text) { note.textContent = 'Write a message first.'; return; }
    var e = state[cur] || (state[cur] = {});
    if (!e.csrf) { note.textContent = 'The thread has not loaded yet, so there is no session token. Reload and try again.'; return; }
    button.disabled = true;
    note.textContent = 'Sending…';
    request(cur, 'message', 'POST', { text: text, threadId: e.thread && e.thread.id ? e.thread.id : undefined, csrf: e.csrf }).then(function (r) {
      button.disabled = false;
      if (r.status === 200 && r.json && r.json.ok) {
        apply(cur, r);
        input.value = '';
        note.textContent = '';
        paintList(ctx, cur);
        paintThread(ctx, cur);
        schedulePoll(ctx, cur);
      } else {
        note.textContent = (r.json && r.json.message) || failure(r.status);
      }
    }, function () {
      button.disabled = false;
      note.textContent = 'Could not reach the server. Your message was not sent.';
    });
  }

  OS.talk = { listHtml: listHtml, threadHtml: threadHtml, url: url, state: state };

  OS.registerView('talk', {
    render: function (ctx) {
      var desks = talkDesks(ctx.data);
      var head = '<div class="ph"><div><h1>Talk</h1><p>One-on-one chats with the desks, through the same Talk path as /ops Chat. Times are America/Chicago.</p></div></div>';
      if (!desks.length) return head + '<div class="card">' + OS.empty('No desks can Talk.', 'desks') + '</div>';
      var cur = current(ctx);
      var desk = deskOf(ctx.data, cur);
      return head + '<div class="card talk' + (ctx.sub && desk ? ' open' : '') + '"><div class="talklist" id="talk-list">' + listHtml(ctx.data, cur) + '</div>' +
        '<div class="talkpane" id="talk-pane">' + paneHtml(desk, state[cur]) + '</div></div>';
    },
    mount: function (root, ctx) {
      var desks = talkDesks(ctx.data);
      if (!desks.length) return;
      alive = true;
      rootEl = root;
      var cur = current(ctx);
      var input = root.querySelector('#talk-input');
      var button = root.querySelector('#talk-send');
      if (button) button.addEventListener('click', function () { send(ctx, cur); });
      if (input) input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ctx, cur); }
      });
      Promise.all(desks.map(function (d) { return load(d.id); })).then(function () {
        if (!alive) return;
        paintList(ctx, cur);
        paintThread(ctx, cur);
        schedulePoll(ctx, cur);
      });
    },
    unmount: function () {
      alive = false;
      rootEl = null;
      if (timer) { window.clearTimeout(timer); timer = null; }
    }
  });
})();
