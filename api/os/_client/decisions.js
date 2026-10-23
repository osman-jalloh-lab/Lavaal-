/* LAVAALL OS Decisions + Jev: cards grouped as "Waiting on you" (open, L3/L4), "Open" and "Closed", with
   status, desk and level filters. Each card shows the title, a status pill, a level chip (L3/L4 in orange),
   the desk (short name, with its colour dot), a Jev pill ("Jev: not run" without a score) and the age.
   A card opens the detail drawer, also reachable by #decisions/<id>. Reads data.decisions, which is null
   until a decision log exists. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var STATUS_FILTERS = ['All', 'Open', 'Closed'];
  var DAY = 86400000;
  var f = { status: 'All', desk: 'All', level: 'All' };

  function isOpen(d) { return String(d.status).toLowerCase() === 'open'; }
  function isWaiting(d) { return isOpen(d) && (d.level === 'L3' || d.level === 'L4'); }

  function ageText(d) {
    if (!(d.date > 0)) return '';
    var n = Math.max(0, Math.floor((Date.now() - d.date) / DAY));
    if (isOpen(d)) return n === 1 ? '1 day open' : n + ' days open';
    return (String(d.status).toLowerCase() === 'closed' ? 'Decided ' : '') + OS.fmtDate(d.date);
  }

  function passes(d) {
    if (f.status !== 'All' && String(d.status).toLowerCase() !== f.status.toLowerCase()) return false;
    if (f.desk !== 'All' && (d.desk || '') !== f.desk) return false;
    if (f.level !== 'All' && d.level !== f.level) return false;
    return true;
  }

  function chip(kind, value, label, n) {
    return '<button class="chip' + (f[kind] === value ? ' on' : '') + '" type="button" data-f="' + kind + '" data-v="' + esc(value) + '">' + esc(label) +
      (n == null ? '' : ' <span class="num">' + n + '</span>') + '</button>';
  }

  function filters(list) {
    var status = STATUS_FILTERS.map(function (s) {
      return chip('status', s, s, s === 'All' ? list.length : list.filter(function (d) { return String(d.status).toLowerCase() === s.toLowerCase(); }).length);
    }).join('');
    var deskIds = [];
    list.forEach(function (d) { if (d.desk && deskIds.indexOf(d.desk) === -1) deskIds.push(d.desk); });
    var desks = chip('desk', 'All', 'All', null) + deskIds.map(function (id) { return chip('desk', id, OS.deskShort(id), null); }).join('');
    var levels = ['L0', 'L1', 'L2', 'L3', 'L4'].filter(function (l) { return list.some(function (d) { return d.level === l; }); });
    var lv = chip('level', 'All', 'All', null) + levels.map(function (l) { return chip('level', l, l, null); }).join('');
    return '<div class="dfilters" role="group" aria-label="Filter decisions">' +
      '<div class="dfrow"><b>Status</b><div class="chips">' + status + '</div></div>' +
      '<div class="dfrow"><b>Desk</b><div class="chips">' + desks + '</div></div>' +
      '<div class="dfrow"><b>Level</b><div class="chips">' + lv + '</div></div></div>';
  }

  function card(d, kind) {
    return '<article class="dcard ' + kind + '" tabindex="0" role="button" data-go="decisions/' + esc(d.id) + '">' +
      '<h3>' + esc(d.title) + '</h3>' +
      '<div class="dmeta"><span class="pill ' + (isOpen(d) ? 'open' : 'closed') + '">' + esc(d.status || '—') + '</span>' +
      OS.level(d.level) + OS.deskChip(d.desk) + OS.jev(d.jev) + '</div>' +
      '<div class="dfoot"><span>' + esc(ageText(d) || 'Date not recorded') + '</span><span class="num">' + esc(OS.fmtDate(d.date)) + '</span></div></article>';
  }

  function group(title, items, kind) {
    if (!items.length) return '';
    return '<section class="dgroup"><h2>' + esc(title) + ' <span class="num">' + items.length + '</span></h2><div class="dgrid">' +
      items.map(function (d) { return card(d, kind); }).join('') + '</div></section>';
  }

  // Oldest first for the groups that are waiting on someone; newest first for Closed.
  function groups(list) {
    var shown = list.filter(passes);
    if (!shown.length) return '<div class="card"><div class="empty"><b>No decisions match these filters.</b></div></div>';
    var waiting = shown.filter(isWaiting).sort(function (a, b) { return a.date - b.date; });
    var open = shown.filter(function (d) { return isOpen(d) && !isWaiting(d); }).sort(function (a, b) { return a.date - b.date; });
    var closed = shown.filter(function (d) { return String(d.status).toLowerCase() === 'closed'; });
    var other = shown.filter(function (d) { return !isOpen(d) && String(d.status).toLowerCase() !== 'closed'; });
    return group('Waiting on you', waiting, 'wait') + group('Open', open, 'open') + group('Closed', closed, 'done') + group('Other', other, 'done');
  }

  function scoreBlock(d) {
    if (d.jev === null) return '<div class="score"><span>' + OS.jev(null) + '</span><small class="note">No Jev score is stored for this decision.</small></div>';
    var pct = Math.round(d.jev * 100);
    return '<div class="score"><b class="num big">' + d.jev.toFixed(2) + '</b><div class="bar"><i style="width:' + pct + '%;background:var(--' + (d.jev >= 0.75 ? 'ok' : 'warn') + ')"></i><u></u></div>' + OS.jev(d.jev) + '</div>' +
      '<p class="note">Marker at 0.75 = PASS line.</p>';
  }

  function drawer(d) {
    var kv = [['Date', OS.fmtLongDate(d.date)], ['Desk', OS.deskShort(d.desk)], ['Status', d.status], ['Age', ageText(d)]]
      .filter(function (r) { return r[1]; })
      .map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    return '<div class="dh">' + OS.level(d.level) + '<h3>' + esc(d.title) + '</h3>' +
      '<button class="ib" type="button" data-close aria-label="Close" style="margin-left:auto">' + icon('x') + '</button></div>' +
      '<div class="db"><dl class="kv">' + kv + '</dl>' +
      '<div class="sect">Decision</div>' + (d.text ? '<p class="pre">' + esc(d.text) + '</p>' : '<p class="note">No full text is stored for this decision.</p>') +
      '<div class="sect">Source</div>' + (d.source ? '<p class="pre">' + esc(d.source) + '</p>' : '<p class="note">No source is recorded.</p>') +
      '<div class="sect">Jev score</div>' + scoreBlock(d) + '</div>' +
      '<div class="df"><button class="btn" type="button" data-close>Close</button></div>';
  }

  OS.registerView('decisions', {
    render: function (ctx) {
      var list = ctx.data.decisions;
      var head = '<div class="ph"><div><h1>Decisions + Jev</h1><p>Evidence first, then the Jev line. PASS at 0.75 and above.</p></div></div>';
      if (list === null) return head + '<div class="card">' + OS.empty('No decision log yet.', 'decisions') + '</div>';
      if (!list.length) return head + '<div class="card">' + OS.empty('The decision log is empty.', 'decisions') + '</div>';
      return head + '<div id="dec-filters">' + filters(list) + '</div><div id="dec-groups">' + groups(list) + '</div>';
    },
    mount: function (root, ctx) {
      var list = ctx.data.decisions;
      if (!list || !list.length) return;
      root.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-f]') : null;
        if (!b) return;
        f[b.getAttribute('data-f')] = b.getAttribute('data-v');
        root.querySelector('#dec-filters').innerHTML = filters(list);
        root.querySelector('#dec-groups').innerHTML = groups(list);
      });
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var c = e.target.closest ? e.target.closest('.dcard[data-go]') : null;
        if (!c) return;
        e.preventDefault();
        OS.go('decisions', c.getAttribute('data-go').split('/')[1]);
      });
      if (ctx.sub) {
        var d = list.filter(function (x) { return x.id === ctx.sub; })[0];
        if (d) OS.openDrawer(drawer(d));
      }
    }
  });
})();
