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

  // ---- Calendar: a live Day / Week grid on the device clock, with a now line that moves every minute ----
  var DAYMS = 86400000, HOUR_PX = 48;
  var events = null;
  var cal = { mode: '', anchor: 0 };
  function dayStart(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function weekStart(ms) { var d = new Date(dayStart(ms)); var back = (d.getDay() + 6) % 7; d.setDate(d.getDate() - back); return d.getTime(); }
  function addDays(ms, n) { var d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
  function hm(ms) { var d = new Date(ms); var h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + (m ? ':' + (m < 10 ? '0' : '') + m : '') + (h < 12 ? 'am' : 'pm'); }
  function dayLabel(ms) { try { return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }); } catch (e) { return ''; } }
  function rangeLabel(from, days) {
    try {
      var a = new Date(from), b = new Date(addDays(from, days - 1));
      var o = { month: 'short', day: 'numeric' };
      return days === 1 ? a.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : a.toLocaleDateString('en-US', o) + ' – ' + b.toLocaleDateString('en-US', o);
    } catch (e) { return ''; }
  }
  function range() {
    if (!cal.mode) cal.mode = (window.innerWidth || 1024) < 720 ? 'day' : 'week';
    if (!cal.anchor) cal.anchor = Date.now();
    return cal.mode === 'day' ? { from: dayStart(cal.anchor), days: 1 } : { from: weekStart(cal.anchor), days: 7 };
  }
  function norm(e) {
    var s = Date.parse(e.start), en = Date.parse(e.end);
    if (!s) return null;
    if (e.allDay) { s = new Date(e.start + 'T00:00:00').getTime() || s; en = e.end ? (new Date(e.end + 'T00:00:00').getTime() || s + DAYMS) : s + DAYMS; }
    return { e: e, s: s, en: en > s ? en : s + 30 * 60000 };
  }
  function safeLink(e) { return /^https:\/\/www\.google\.com\/calendar\//.test(e.link || '') ? e.link : ''; }
  function when(e) {
    var ms = Date.parse(e.start);
    if (!ms) return '';
    return e.allDay ? OS.fmtDate(ms) + ' · all day' : OS.fmtTime(ms);
  }
  function until(ms, now) {
    var m = Math.round((ms - now) / 60000);
    if (m <= 0) return 'now';
    if (m < 60) return 'in ' + m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h < 24 ? 'in ' + h + 'h' + (r ? ' ' + r + 'm' : '') : 'in ' + Math.round(h / 24) + ' days';
  }
  // Happening now, or the next timed event. Used on Home and above the grid.
  function nowNext(list, now) {
    var timed = list.map(norm).filter(function (x) { return x && !x.e.allDay && x.en > now; }).sort(function (a, b) { return a.s - b.s; });
    var cur = timed.filter(function (x) { return x.s <= now; })[0];
    var nxt = timed.filter(function (x) { return x.s > now; })[0];
    return { now: cur || null, next: nxt || null };
  }
  function nowNextHtml(list, now) {
    var nn = nowNext(list, now);
    if (!nn.now && !nn.next) return '<div class="nownext"><span class="nn-free">You are free for the rest of this view.</span></div>';
    return '<div class="nownext">' +
      (nn.now ? '<div class="nn"><span class="nn-k live">Now</span><b>' + esc(nn.now.e.title) + '</b><span class="num">until ' + esc(hm(nn.now.en)) + '</span></div>' : '') +
      (nn.next ? '<div class="nn"><span class="nn-k">Next</span><b>' + esc(nn.next.e.title) + '</b><span class="num">' + esc(hm(nn.next.s)) + ' · ' + esc(until(nn.next.s, now)) + '</span></div>' : '') +
    '</div>';
  }
  OS.calendarNowNext = nowNext;
  // Side-by-side lanes for events that overlap in one day column.
  function lanes(items) {
    var ends = [];
    items.forEach(function (x) {
      var lane = 0;
      while (ends[lane] > x.s) lane++;
      ends[lane] = x.en; x.lane = lane;
    });
    items.forEach(function (x) { x.lanes = Math.max(1, items.filter(function (y) { return y.s < x.en && y.en > x.s; }).reduce(function (m, y) { return Math.max(m, y.lane + 1); }, 1)); });
    return items;
  }
  function gridHtml(list, r, now) {
    var all = list.map(norm).filter(Boolean);
    var timed = all.filter(function (x) { return !x.e.allDay; });
    var first = 7, last = 21;
    timed.forEach(function (x) { var a = new Date(x.s).getHours(), b = new Date(x.en - 1).getHours() + 1; if (a < first) first = a; if (b > last && b <= 24) last = b; });
    var nowH = new Date(now).getHours();
    if (now >= r.from && now < addDays(r.from, r.days)) { first = Math.min(first, nowH); last = Math.max(last, nowH + 1); }
    var hours = []; for (var h = first; h < last; h++) hours.push(h);
    var height = hours.length * HOUR_PX;
    var cols = [];
    for (var i = 0; i < r.days; i++) {
      var d0 = addDays(r.from, i), d1 = addDays(r.from, i + 1);
      var isToday = now >= d0 && now < d1;
      var allday = all.filter(function (x) { return x.e.allDay && x.s < d1 && x.en > d0; });
      var mine = lanes(timed.filter(function (x) { return x.s < d1 && x.en > d0; }).sort(function (a, b) { return a.s - b.s; }));
      var blocks = mine.map(function (x) {
        var top = Math.max(0, (Math.max(x.s, d0) - d0) / 3600000 - first) * HOUR_PX;
        var bottom = Math.min(hours.length, (Math.min(x.en, d1) - d0) / 3600000 - first) * HOUR_PX;
        var w = 100 / x.lanes;
        var link = safeLink(x.e);
        var past = x.en <= now, live = x.s <= now && x.en > now;
        var inner = '<b>' + esc(x.e.title) + '</b><span>' + esc(hm(x.s) + ' – ' + hm(x.en)) + (x.e.where ? ' · ' + esc(x.e.where) : '') + '</span>';
        var style = 'top:' + top.toFixed(1) + 'px;height:' + Math.max(20, bottom - top - 2).toFixed(1) + 'px;left:calc(' + (x.lane * w).toFixed(2) + '% + 2px);width:calc(' + w.toFixed(2) + '% - 4px)';
        var cls = 'cal-ev' + (past ? ' past' : '') + (live ? ' live' : '');
        return link ? '<a class="' + cls + '" style="' + style + '" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>'
          : '<div class="' + cls + '" style="' + style + '">' + inner + '</div>';
      }).join('');
      var nowLine = isToday ? '<div class="cal-now" data-nowline="1" style="top:' + (((now - d0) / 3600000 - first) * HOUR_PX).toFixed(1) + 'px"></div>' : '';
      cols.push({ head: '<div class="cal-dh' + (isToday ? ' today' : '') + '">' + esc(dayLabel(d0)) + '</div>',
        allday: '<div class="cal-ad">' + allday.map(function (x) { return '<span class="cal-adev">' + esc(x.e.title) + '</span>'; }).join('') + '</div>',
        body: '<div class="cal-col' + (isToday ? ' today' : '') + '" data-day="' + d0 + '" style="height:' + height + 'px">' + blocks + nowLine + '</div>' });
    }
    var anyAllDay = all.some(function (x) { return x.e.allDay; });
    var tpl = 'grid-template-columns:52px repeat(' + r.days + ',minmax(0,1fr))';
    return '<div class="cal-grid" data-first="' + first + '" style="--hour:' + HOUR_PX + 'px">' +
      '<div class="cal-row-h" style="' + tpl + '"><div></div>' + cols.map(function (c) { return c.head; }).join('') + '</div>' +
      (anyAllDay ? '<div class="cal-row-h ad" style="' + tpl + '"><div class="cal-gut">all day</div>' + cols.map(function (c) { return c.allday; }).join('') + '</div>' : '') +
      '<div class="cal-scroll"><div class="cal-body" style="' + tpl + '"><div class="cal-hours">' +
        hours.map(function (h) { return '<span style="height:' + HOUR_PX + 'px">' + ((h % 12) || 12) + (h < 12 ? 'am' : 'pm') + '</span>'; }).join('') + '</div>' +
        cols.map(function (c) { return c.body; }).join('') + '</div></div></div>';
  }
  function calBody() {
    if (!status) return '';
    if (!status.connected) return '<div class="card empty mt"><b>Connect Google to see your calendar.</b></div>';
    if (!events) return '<div class="card empty mt"><b>Loading your calendar…</b></div>';
    if (events.error) return '<div class="card empty mt"><b>' + esc(events.error) + '</b></div>';
    var r = range(), now = Date.now();
    return '<section class="card mt cal-card">' + nowNextHtml(events.list, now) + gridHtml(events.list, r, now) + '</section>';
  }
  OS.calendarBody = calBody;

  // ---- Home: Now / Next, then the rest of today and the next few events ----
  function homeCal(list, err, connected) {
    var head = '<div class="ch"><h3>Calendar</h3><div class="r"><a href="#calendar">Open</a></div></div>';
    if (connected === false) return head + '<div class="empty"><b>Connect Google to see your calendar here.</b><small><a href="#calendar">Open Calendar</a></small></div>';
    if (err) return head + '<div class="empty"><b>' + esc(err) + '</b></div>';
    if (!list) return head + '<div class="empty"><b>Loading…</b></div>';
    if (!list.length) return head + '<div class="empty"><b>Nothing in the next two weeks.</b></div>';
    var now = Date.now();
    return head + nowNextHtml(list, now) + list.slice(0, 5).map(function (e) {
      var ms = Date.parse(e.start);
      var soon = ms > now && ms - now < DAYMS && !e.allDay ? '<span class="cal-soon">' + esc(until(ms, now)) + '</span>' : '';
      return '<div class="cal-row"><span class="cal-when num">' + esc(when(e)) + '</span><span class="cal-title">' + esc(e.title) + '</span>' + soon + '</div>';
    }).join('');
  }
  OS.homeCalendarHtml = homeCal;
  OS.mountHomeCalendar = function (root) {
    var host = root.querySelector('#home-cal');
    if (!host) return;
    host.innerHTML = homeCal(null);
    var last = null;
    function load() {
      return api('/ops/os/calendar').then(function (d) { last = d.events || []; if (host.isConnected !== false) host.innerHTML = homeCal(last); });
    }
    api('/ops/os/google/status').then(function (s) {
      status = s;
      if (!s.connected) { host.innerHTML = homeCal(null, null, false); return; }
      return load();
    }).catch(function (err) { host.innerHTML = homeCal(null, err.message); });
    // Keep "in 25 min" honest while Home stays open; refetch every 5 minutes.
    var ticks = 0;
    var t = window.setInterval(function () {
      if (host.isConnected === false) { window.clearInterval(t); return; }
      ticks++;
      if (ticks % 5 === 0 && status && status.connected) load().catch(function () {});
      else if (last) host.innerHTML = homeCal(last);
    }, 60000);
  };
  OS.setCalendarEvents = function (list) { events = { list: list }; };
  OS.registerView('calendar', {
    render: function () {
      var r = range();
      return '<div class="ph"><div><h1>Calendar</h1><p>Your Google calendar, live. Events are added only when you click Add event.</p></div></div>' +
        '<div id="gpanel">' + panel() + '</div>' +
        '<div class="cal-bar mt"><div class="seg" role="group" aria-label="Move">' +
          '<button type="button" class="btn" data-cal="prev" aria-label="Previous">‹</button>' +
          '<button type="button" class="btn" data-cal="today">Today</button>' +
          '<button type="button" class="btn" data-cal="next" aria-label="Next">›</button></div>' +
          '<b class="cal-range" id="cal-range">' + esc(rangeLabel(r.from, r.days)) + '</b>' +
          '<div class="seg" role="group" aria-label="View">' +
          '<button type="button" class="btn' + (cal.mode === 'day' ? ' on' : '') + '" data-cal="day" aria-pressed="' + (cal.mode === 'day') + '">Day</button>' +
          '<button type="button" class="btn' + (cal.mode === 'week' ? ' on' : '') + '" data-cal="week" aria-pressed="' + (cal.mode === 'week') + '">Week</button></div></div>' +
        '<div id="cal-body">' + calBody() + '</div>' +
        '<details class="card mt cal-addw"><summary>Add event</summary><form class="cal-add" id="cal-add" autocomplete="off">' +
          '<label class="sr" for="cal-title">Event</label><input id="cal-title" maxlength="200" placeholder="New event" required />' +
          '<label class="sr" for="cal-start">Starts</label><input id="cal-start" type="datetime-local" required />' +
          '<label class="sr" for="cal-end">Ends</label><input id="cal-end" type="datetime-local" required />' +
          '<button class="btn pri" type="submit">Add event</button></form>' +
        '<p class="note">Tip: click an empty hour in the grid to fill in the time.</p></details>' +
        '<p class="note" id="cal-msg" role="status" aria-live="polite"></p>';
    },
    mount: function (root) {
      var host = root.querySelector('#cal-body'), msg = root.querySelector('#cal-msg');
      function local(ms) { var d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }
      function paint() {
        if (host) host.innerHTML = calBody();
        var r = range(), lab = root.querySelector('#cal-range');
        if (lab) lab.textContent = rangeLabel(r.from, r.days);
        root.querySelectorAll('[data-cal="day"],[data-cal="week"]').forEach(function (b) {
          var on = b.getAttribute('data-cal') === cal.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
        });
        var line = root.querySelector('[data-nowline]');
        var sc = root.querySelector('.cal-scroll');
        if (line && sc && !paint.scrolled) { sc.scrollTop = Math.max(0, parseFloat(line.style.top) - 120); paint.scrolled = true; }
      }
      function load() {
        if (!status || !status.connected) { paint(); return; }
        var r = range();
        api('/ops/os/calendar?from=' + r.from + '&days=' + r.days).then(function (d) { events = { list: d.events || [] }; paint(); })
          .catch(function (err) { events = { error: err.message }; paint(); });
      }
      mountPanel(root, load);
      root.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-cal]') : null;
        if (b) {
          var a = b.getAttribute('data-cal'), step = cal.mode === 'day' ? 1 : 7;
          if (a === 'prev') cal.anchor = addDays(cal.anchor || Date.now(), -step);
          if (a === 'next') cal.anchor = addDays(cal.anchor || Date.now(), step);
          if (a === 'today') { cal.anchor = Date.now(); paint.scrolled = false; }
          if (a === 'day' || a === 'week') cal.mode = a;
          events = events && events.error ? events : null; paint(); load();
          return;
        }
        var col = e.target.closest ? e.target.closest('.cal-col') : null;
        if (col && !(e.target.closest && e.target.closest('.cal-ev'))) {
          var rect = col.getBoundingClientRect(), grid = root.querySelector('.cal-grid');
          var first = Number(grid && grid.getAttribute('data-first')) || 0;
          var hour = Math.floor((e.clientY - rect.top) / HOUR_PX) + first;
          var at = Number(col.getAttribute('data-day')) + hour * 3600000;
          var det = root.querySelector('.cal-addw'); if (det) det.open = true;
          root.querySelector('#cal-start').value = local(at);
          root.querySelector('#cal-end').value = local(at + 3600000);
          var t = root.querySelector('#cal-title'); if (t && t.focus) t.focus();
        }
      });
      // Move the now line every minute and refetch every 5 minutes while this page is open.
      var ticks = 0;
      var timer = window.setInterval(function () {
        if (!root.isConnected) { window.clearInterval(timer); return; }
        ticks++;
        if (ticks % 5 === 0) load(); else if (events && events.list) paint();
      }, 60000);
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
