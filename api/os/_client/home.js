/* LAVAALL OS Home. Every widget reads OS.data (built by api/ops/_os_data.js).
   No source, no number: widgets show "—" or an empty state that names where the data would come from. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var miniEngine = null;
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
      : empty('No morning brief is stored yet.', 'brief');
    return card('', 'sunrise', 'Morning brief', '', body);
  }

  function brainCard() {
    // Mini mode of the Brain graph (api/os/_client/brain.js). It draws the same layout as the full view.
    var body = '<div class="bmini" role="link" tabindex="0" aria-label="Open the Brain graph"><canvas id="bmini-c"></canvas></div>';
    return card('', 'brain', 'Brain', '<span id="bmini-stat" class="num"></span><span class="link" data-go="brain">Open graph</span><kbd>G B</kbd>', body);
  }

  function councilCard() {
    return card('', 'council', 'AI Council', '', empty('No council records yet.', 'council'));
  }

  function decisionsCard(d) {
    var list = d.decisions;
    var right = '<span class="link" data-go="decisions">View all</span>';
    if (list === null) return card('', 'scale', 'Recent decisions', right, empty('No decision log yet.', 'decisions'));
    if (!list.length) return card('', 'scale', 'Recent decisions', right, empty('The decision log is empty.', 'decisions'));
    var rows = list.slice(0, 5).map(function (x) {
      var sub = [OS.fmtDate(x.date), x.desk].filter(Boolean).join(' · ');
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
          kpi('v', 'Open decisions', k.openDecisions, 'no decision log yet') +
          kpi('o', 'Hotel bounce rate', k.hotelBounceRate, 'no outreach results yet') +
          kpi('g', 'AI spend this month', k.aiSpendMonth, 'no spend records yet') +
        '</div>' +
        '<div class="stack">' +
          '<div class="grid g32">' + briefCard(d) + approvalsCard(d) + '</div>' +
          brainCard() + councilCard() +
          '<div class="grid g32">' + decisionsCard(d) + desksCard(d) + '</div>' +
        '</div>';
    },
    unmount: function () {
      if (miniEngine) { miniEngine.destroy(); miniEngine = null; }
    },
    mount: function (root, ctx) {
      var byId = {};
      (ctx.data.approvals || []).forEach(function (a) { byId[a.id] = a; });
      if (OS.brainMini) miniEngine = OS.brainMini(root, ctx.data);
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
