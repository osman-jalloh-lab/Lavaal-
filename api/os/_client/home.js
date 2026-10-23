/* LAVAALL OS Home. Every widget reads OS.data (built by api/ops/_os_data.js).
   No source, no number: widgets show "—" or an empty state that names where the data would come from. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var KIND = { 'save-goal': 'Goal', 'add-task': 'Task', 'add-note': 'Note', 'update-task': 'Task update' };

  function from(key) {
    var s = OS.data.sources && OS.data.sources[key];
    return s && s.from ? s.from : '';
  }

  function empty(title, key) {
    var src = from(key);
    return '<div class="empty"><b>' + esc(title) + '</b>' + (src ? '<small>Source: ' + esc(src) + '</small>' : '') + '</div>';
  }

  function card(id, iconName, title, right, body, extra) {
    return '<section class="card"' + (id ? ' id="' + id + '"' : '') + '>' +
      '<div class="ch">' + icon(iconName) + '<h3>' + esc(title) + '</h3><div class="r">' + (right || '') + '</div></div>' +
      body + (extra || '') + '</section>';
  }

  function kpi(tint, label, value, sub) {
    var shown = value == null ? '—' : esc(value);
    return '<div class="card kpi t-' + tint + '"><span>' + esc(label) + '</span><b class="num">' + shown + '</b><i>' + esc(sub) + '</i></div>';
  }

  function greeting() {
    var h = OS.chicagoHour();
    return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function subtitle(d) {
    if (!d.storeAvailable) return 'The store could not be read, so approvals and routines are not shown.';
    var n = d.kpis.awaitingApproval;
    return n ? n + (n === 1 ? ' item is' : ' items are') + ' waiting for your approval.' : 'Nothing is waiting for your approval.';
  }

  function approvalsCard(d) {
    var list = d.approvals;
    if (list === null) return card('approvals-card', 'inbox', 'Approvals', '', empty('Approvals could not be loaded.', 'approvals'));
    if (!list.length) return card('approvals-card', 'inbox', 'Approvals', '<span class="num">0</span>', empty('Nothing is waiting for approval.', 'approvals'));
    var rows = list.slice(0, 6).map(function (a) {
      var sub = [KIND[a.kind] || a.kind, OS.fmtDate(a.createdAt)].filter(Boolean).join(' · ');
      return '<div class="li"><div class="t"><div>' + esc(a.title || '(untitled)') + '</div><small>' + esc(sub) + '</small></div>' +
        '<button class="btn" type="button" data-approval="' + esc(a.id) + '">Approve</button></div>';
    }).join('');
    return card('approvals-card', 'inbox', 'Approvals', '<span class="num">' + list.length + '</span>', rows);
  }

  function briefCard(d) {
    var body = d.brief && d.brief.text
      ? '<div class="brief">' + esc(d.brief.text) + '</div>'
      : empty('No morning brief has been received yet.', 'brief');
    return card('', 'sunrise', 'Morning brief', d.brief && d.brief.date ? '<span class="num">' + esc(d.brief.date) + '</span>' : '', body);
  }

  // Routines that report a status, by status. Counts come from the routine-health feed; nothing is guessed.
  function healthCard(d) {
    var h = d.routineHealth;
    var right = '<span class="link" data-go="routines">View routines</span>';
    if (!h) return card('', 'timer', 'Routine health', right, empty('No routine health has been received yet.', 'routines'));
    var rows = [['ok', 'pass', 'OK'], ['late', 'flag', 'Late'], ['failed', 'bad', 'Failed'], ['skipped', 'flag', 'Skipped'], ['other', '', 'Other']]
      .filter(function (r) { return r[0] !== 'other' || h.counts.other > 0; })
      .map(function (r) {
        return '<div class="li static"><span class="pill ' + r[1] + '">' + esc(r[2]) + '</span><div class="t"></div><b class="num">' + h.counts[r[0]] + '</b></div>';
      }).join('');
    var failed = (h.failed || []).length
      ? '<p class="note foot">Failed: ' + h.failed.map(esc).join(', ') + '.</p>' : '';
    var foot = failed + '<p class="note foot">' + h.reporting + ' of ' + h.total + ' routines report' + (h.checkedLabel ? '. Checked ' + esc(h.checkedLabel) : '') + '.</p>';
    return card('', 'timer', 'Routine health', right, rows, foot);
  }

  function bounceText(k) {
    return k.hotelBounceRate == null ? null : (Math.round(k.hotelBounceRate * 1000) / 10) + '%';
  }

  var COUNCIL_STATUS = { waiting_l3: 'Waiting', approved: 'Approved', changes_requested: 'Changes requested', flagged: 'Flagged', held: 'Held' };

  function councilCard(d) {
    var list = d.council;
    if (list === null) return card('', 'council', 'AI Council', '', empty('No council records yet.', 'council'));
    if (!list.length) return card('', 'council', 'AI Council', '', empty('The council record list is empty.', 'council'));
    var r = list[0];
    var right = r.round ? 'round ' + r.round + ' of ' + r.maxRounds : '';
    var roles = {};
    (r.messages || []).forEach(function (m) { roles[m.role] = true; });
    var people = [roles.builder ? 'Claude drafted' : '', roles.reviewer ? 'Codex reviewed' : '', roles.scorer ? 'Jev scored' : '', COUNCIL_STATUS[r.status] ? (r.status === 'waiting_l3' ? 'waiting for ' + (r.level || 'L3') + ' OK' : COUNCIL_STATUS[r.status].toLowerCase()) : ''].filter(Boolean).join(' · ');
    var row = '<div class="li" data-go="council/' + esc(r.id) + '"><div class="t"><div>' + esc(r.title) + '</div><small>' + esc(people || 'No participants recorded') + '</small></div>' +
      OS.jev(r.jev) + '<button class="btn" type="button" data-go="council/' + esc(r.id) + '">Open</button></div>';
    return card('', 'council', 'AI Council', esc(right), row);
  }

  // ---- Today column ------------------------------------------------------
  var DAY = 86400000;

  function ageText(ms) {
    if (!(ms > 0)) return '';
    var n = Math.max(0, Math.floor((Date.now() - ms) / DAY));
    return n === 1 ? '1 day open' : n + ' days open';
  }

  // Open decisions at L3 or L4, oldest first. Only the decision log feeds this.
  function waitingCard(d) {
    var right = '<span class="link" data-go="decisions">View all</span>';
    var list = d.decisions;
    if (list === null) return card('', 'scale', 'Waiting on Osman', right, empty('No decision log yet.', 'decisions'));
    var rows = list.filter(function (x) { return String(x.status).toLowerCase() === 'open' && (x.level === 'L3' || x.level === 'L4'); })
      .sort(function (a, b) { return a.date - b.date; });
    if (!rows.length) return card('', 'scale', 'Waiting on Osman', right, empty('Nothing at L3 or L4 is waiting.', 'decisions'));
    var body = rows.slice(0, 6).map(function (x) {
      return '<div class="li" data-go="decisions/' + esc(x.id) + '">' + OS.level(x.level) +
        '<div class="t"><div>' + esc(x.title) + '</div><small>' + esc([OS.deskShort(x.desk), ageText(x.date) || 'Date not recorded'].filter(Boolean).join(' · ')) + '</small></div>' + icon('chev') + '</div>';
    }).join('');
    var more = rows.length > 6 ? '<p class="note foot">' + (rows.length - 6) + ' more in Decisions.</p>' : '';
    return card('', 'scale', 'Waiting on Osman', '<span class="num">' + rows.length + '</span>', body, more);
  }

  // The five newest notes typed scout-find (notes pack, phase 3). No note, no row.
  function scoutCard(d) {
    var right = '<span class="link" data-go="notes">View notes</span>';
    if (d.notes === null) return card('', 'sunrise', 'Latest Scout finds', right, empty('No notes yet.', 'notes'));
    var rows = d.notes.filter(function (n) { return n.type === 'scout-find'; })
      .sort(function (a, b) { return (b.date || b.updatedAt || 0) - (a.date || a.updatedAt || 0); }).slice(0, 5);
    if (!rows.length) return card('', 'sunrise', 'Latest Scout finds', right, empty('No Scout finds yet.', 'notes'));
    var body = rows.map(function (n) {
      return '<div class="li" data-go="notes/' + esc(n.id) + '"><div class="t"><div>' + esc(n.title) + '</div><small>' +
        esc(OS.fmtDate(n.date || n.updatedAt)) + '</small></div>' + (n.urgent ? '<span class="pill bad">urgent</span>' : '') + '</div>';
    }).join('');
    return card('', 'sunrise', 'Latest Scout finds', right, body);
  }

  function todayColumn(d) {
    return '<div class="sect today-h">Today</div>' +
      '<div class="grid g2 today">' + waitingCard(d) + healthCard(d) + scoutCard(d) + councilCard(d) + '</div>';
  }

  function decisionsCard(d) {
    var list = d.decisions;
    var right = '<span class="link" data-go="decisions">View all</span>';
    if (list === null) return card('', 'scale', 'Recent decisions', right, empty('No decision log yet.', 'decisions'));
    if (!list.length) return card('', 'scale', 'Recent decisions', right, empty('The decision log is empty.', 'decisions'));
    var rows = list.slice(0, 5).map(function (x) {
      var sub = [OS.fmtDate(x.date), OS.deskShort(x.desk)].filter(Boolean).join(' · ');
      return '<div class="li" data-go="decisions/' + esc(x.id) + '">' + OS.level(x.level) + '<div class="t"><div>' + esc(x.title) + '</div><small>' + esc(sub) + '</small></div>' + OS.jev(x.jev) + '</div>';
    }).join('');
    return card('', 'scale', 'Recent decisions', right, rows);
  }

  function desksCard(d) {
    var rows = d.desks.map(function (x) {
      return '<div class="li" data-go="desks/' + esc(x.id) + '"><span class="dot"></span><div class="t"><div>' + esc(x.name) + '</div>' +
        '<small>' + esc(x.now || 'Status not recorded yet') + '</small></div>' + icon('chev') + '</div>';
    }).join('');
    return card('', 'users', 'Desks', '<span class="num">' + d.desks.length + '</span>', rows);
  }

  function approvalDrawer(a) {
    var rows = [['Type', KIND[a.kind] || a.kind], ['Created', OS.fmtDate(a.createdAt)], ['Source', a.source]]
      .filter(function (r) { return r[1]; })
      .map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    return '<div class="dh"><h3>' + esc(a.title || '(untitled)') + '</h3><button class="ib" type="button" data-close aria-label="Close" style="margin-left:auto">' + icon('x') + '</button></div>' +
      '<div class="db"><span class="pill">Read-only</span>' +
      '<dl class="kv">' + rows + '</dl>' +
      (a.body ? '<div class="sect">Proposal</div><p class="pre">' + esc(a.body) + '</p>' : '') +
      '<div class="sect">Approval</div><p class="note">This is a read-only view. Nothing was approved or changed. Approvals are made in /ops.</p></div>' +
      '<div class="df"><button class="btn" type="button" data-close>Close</button></div>';
  }

  OS.registerView('home', {
    render: function (ctx) {
      var d = ctx.data;
      var k = d.kpis || {};
      return '<div class="ph"><div><h1>' + esc(greeting()) + '</h1><p>' + esc(subtitle(d)) + '</p></div>' +
        '<div class="r"><button class="btn" type="button" id="home-cmd">' + icon('command') + 'Commands <kbd>⌘K</kbd></button>' +
        '<button class="btn pri" type="button" id="home-review">Review approvals</button></div></div>' +
        '<div class="grid g4">' +
          kpi('b', 'Awaiting approval', k.awaitingApproval, 'pending proposals') +
          kpi('v', 'Open decisions', k.openDecisions, k.openDecisions == null ? 'no decision log yet' : 'from the decision log') +
          kpi('o', 'Hotel bounce rate', bounceText(k), k.hotelBounceRate == null ? 'no outreach results yet' : 'bounced of sent, ' + k.hotelBounceDate) +
          kpi('g', 'AI spend this month', k.aiSpendMonth == null ? null : OS.money(k.aiSpendMonth), k.aiSpendMonth == null ? 'no spend records yet' : 'from spend records') +
        '</div>' +
        '<div class="stack">' +
          '<div class="grid g32">' + briefCard(d) + approvalsCard(d) + '</div>' +
          todayColumn(d) +
          '<div class="grid g32">' + decisionsCard(d) + desksCard(d) + '</div>' +
        '</div>';
    },
    mount: function (root, ctx) {
      var byId = {};
      (ctx.data.approvals || []).forEach(function (a) { byId[a.id] = a; });
      var cmd = root.querySelector('#home-cmd');
      if (cmd) cmd.addEventListener('click', OS.openPalette);
      var review = root.querySelector('#home-review');
      if (review) review.addEventListener('click', function () {
        var target = root.querySelector('#approvals-card');
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      root.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-approval]') : null;
        if (!btn) return;
        var a = byId[btn.getAttribute('data-approval')];
        if (a) OS.openDrawer(approvalDrawer(a));
      });
    }
  });
})();
