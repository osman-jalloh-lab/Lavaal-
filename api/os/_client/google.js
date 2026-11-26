/* LAVAALL OS Google: Connect Google (support@lavaall.com), Calendar, and Gmail drafts.
   Drafts are saved to Gmail; nothing is ever sent from the OS. Calendar events are added only from a click here.
   All Google text is escaped. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var status = null;

  function api(path, method, body) {
    return window.fetch(path, {
      method: method || 'GET', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.message || d.error || ('HTTP ' + res.status));
        return d;
      });
    });
  }
  OS.google = { api: api, status: function () { return status; } };

  // ---- Google panel (shown on Inbox and Calendar) ----
  function panel() {
    if (!status) return '<div class="card gconn"><span class="dim">Checking Google…</span></div>';
    if (!status.connected) {
      return '<div class="card gconn"><div><b>Connect Google</b><p class="note">Sign in as support@lavaall.com to read its inbox, write Gmail drafts and see or add calendar events. Nothing is ever sent from the OS.</p></div>' +
        '<a class="btn pri" href="/ops/os/google/connect">Connect Google</a></div>';
    }
    return '<div class="card gconn"><div><b>Google connected</b><p class="note">' + esc(status.email || '') + ' · Gmail read and drafts, Calendar</p></div>' +
      '<button type="button" class="btn" data-gdisconnect="1">Disconnect</button></div>';
  }
  OS.googlePanel = panel;
  OS.setGoogleStatus = function (s) { status = s; };
  function mountPanel(root, after) {
    var host = root.querySelector('#gpanel');
    function paint() { if (host) host.innerHTML = panel(); }
    api('/ops/os/google/status').then(function (s) { status = s; paint(); if (after) after(); })
      .catch(function () { status = { connected: false }; paint(); });
    root.addEventListener('click', function (e) {
      if (!(e.target.closest && e.target.closest('[data-gdisconnect]'))) return;
      api('/ops/os/google/disconnect', 'POST', {}).then(function (s) { status = s; paint(); }).catch(function () {});
    });
  }
  OS.mountGooglePanel = mountPanel;

  // ---- Draft composer (on Inbox) ----
  OS.draftForm = function () {
    return '<details class="card mt gdraft"><summary>New Gmail draft</summary><form id="gdraft" autocomplete="off">' +
      '<label for="gd-to">To</label><input id="gd-to" type="email" maxlength="200" required />' +
      '<label for="gd-subj">Subject</label><input id="gd-subj" maxlength="200" required />' +
      '<label for="gd-text">Message</label><textarea id="gd-text" rows="6" maxlength="20000" required></textarea>' +
      '<button class="btn pri" type="submit">Save draft in Gmail</button><p class="note" id="gd-msg" role="status" aria-live="polite">Saved as a draft. You send it from Gmail.</p></form></details>';
  };
  OS.mountDraftForm = function (root) {
    var f = root.querySelector('#gdraft');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = root.querySelector('#gd-msg');
      api('/ops/os/gmail/draft', 'POST', { to: f.querySelector('#gd-to').value, subject: f.querySelector('#gd-subj').value, text: f.querySelector('#gd-text').value })
        .then(function (d) { msg.textContent = d.message || 'Draft saved.'; f.reset(); })
        .catch(function (err) { msg.textContent = err.message; });
    });
  };

  // ---- Calendar ----
  var events = null;
  function when(e) {
    var ms = Date.parse(e.start);
    if (!ms) return '';
    return e.allDay ? OS.fmtDate(ms) + ' · all day' : OS.fmtTime(ms);
  }
  function calBody() {
    if (!status) return '';
    if (!status.connected) return '<div class="card empty mt"><b>Connect Google to see your calendar.</b></div>';
    if (!events) return '<div class="card empty mt"><b>Loading your calendar…</b></div>';
    if (events.error) return '<div class="card empty mt"><b>' + esc(events.error) + '</b></div>';
    return '<section class="card mt"><div class="ch"><h3>Next 14 days</h3><div class="r"><span class="num">' + events.list.length + '</span></div></div>' +
      (events.list.length ? events.list.map(function (e) {
        return '<div class="cal-row"><span class="cal-when num">' + esc(when(e)) + '</span><span class="cal-title">' + esc(e.title) + '</span>' +
          (e.where ? '<span class="cal-where">' + esc(e.where) + '</span>' : '') +
          (/^https:\/\/www\.google\.com\/calendar\//.test(e.link) ? '<a class="cal-open" href="' + esc(e.link) + '" target="_blank" rel="noopener noreferrer">Open</a>' : '') + '</div>';
      }).join('') : '<div class="empty"><b>Nothing on the calendar.</b></div>') + '</section>';
  }
  OS.calendarBody = calBody;

  // ---- Home: the next few events ----
  function homeCal(list, err, connected) {
    var head = '<div class="ch"><h3>Calendar</h3><div class="r"><a href="#calendar">Open</a></div></div>';
    if (connected === false) return head + '<div class="empty"><b>Connect Google to see your calendar here.</b><small><a href="#calendar">Open Calendar</a></small></div>';
    if (err) return head + '<div class="empty"><b>' + esc(err) + '</b></div>';
    if (!list) return head + '<div class="empty"><b>Loading…</b></div>';
    if (!list.length) return head + '<div class="empty"><b>Nothing in the next two weeks.</b></div>';
    return head + list.slice(0, 5).map(function (e) {
      return '<div class="cal-row"><span class="cal-when num">' + esc(when(e)) + '</span><span class="cal-title">' + esc(e.title) + '</span></div>';
    }).join('');
  }
  OS.homeCalendarHtml = homeCal;
  OS.mountHomeCalendar = function (root) {
    var host = root.querySelector('#home-cal');
    if (!host) return;
    host.innerHTML = homeCal(null);
    api('/ops/os/google/status').then(function (s) {
      status = s;
      if (!s.connected) { host.innerHTML = homeCal(null, null, false); return; }
      return api('/ops/os/calendar').then(function (d) { host.innerHTML = homeCal(d.events || []); });
    }).catch(function (err) { host.innerHTML = homeCal(null, err.message); });
  };
  OS.setCalendarEvents = function (list) { events = { list: list }; };
  OS.registerView('calendar', {
    render: function () {
      return '<div class="ph"><div><h1>Calendar</h1><p>Your Google calendar. Events are added only when you click Add event.</p></div></div>' +
        '<div id="gpanel">' + panel() + '</div>' +
        '<form class="card mt cal-add" id="cal-add" autocomplete="off">' +
          '<label class="sr" for="cal-title">Event</label><input id="cal-title" maxlength="200" placeholder="New event" required />' +
          '<label class="sr" for="cal-start">Starts</label><input id="cal-start" type="datetime-local" required />' +
          '<label class="sr" for="cal-end">Ends</label><input id="cal-end" type="datetime-local" required />' +
          '<button class="btn pri" type="submit">Add event</button></form>' +
        '<p class="note" id="cal-msg" role="status" aria-live="polite"></p><div id="cal-body">' + calBody() + '</div>';
    },
    mount: function (root) {
      var host = root.querySelector('#cal-body'), msg = root.querySelector('#cal-msg');
      function paint() { if (host) host.innerHTML = calBody(); }
      function load() {
        if (!status || !status.connected) { paint(); return; }
        api('/ops/os/calendar').then(function (d) { events = { list: d.events || [] }; paint(); })
          .catch(function (err) { events = { error: err.message }; paint(); });
      }
      mountPanel(root, load);
      root.querySelector('#cal-add').addEventListener('submit', function (e) {
        e.preventDefault();
        var s = root.querySelector('#cal-start').value, en = root.querySelector('#cal-end').value;
        api('/ops/os/calendar/event', 'POST', { title: root.querySelector('#cal-title').value, start: new Date(s).toISOString(), end: new Date(en).toISOString() })
          .then(function () { msg.textContent = 'Event added.'; e.target.reset(); load(); })
          .catch(function (err) { msg.textContent = err.message; });
      });
    }
  });
})();
