/* LAVAALL OS Decisions + Jev: a filterable table (All / Open / Closed), level L0-L4, a Jev pill
   (PASS at 0.75 and above, FLAG below, "Jev: not run" without a score) and a detail drawer,
   opened by #decisions/<id>. Reads data.decisions, which is null until a decision log exists. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var FILTERS = ['All', 'Open', 'Closed'];
  var filter = 'All';

  function matches(row) {
    return filter === 'All' || String(row.status).toLowerCase() === filter.toLowerCase();
  }

  function count(list, name) {
    return name === 'All' ? list.length : list.filter(function (r) { return String(r.status).toLowerCase() === name.toLowerCase(); }).length;
  }

  function chips(list) {
    return '<div class="chips" role="group" aria-label="Filter decisions">' + FILTERS.map(function (f) {
      return '<button class="chip' + (f === filter ? ' on' : '') + '" type="button" data-filter="' + f + '">' + f + ' <span class="num">' + count(list, f) + '</span></button>';
    }).join('') + '</div>';
  }

  function rows(list) {
    var shown = list.filter(matches);
    if (!shown.length) return '<tr><td colspan="6" class="none">No ' + esc(filter.toLowerCase()) + ' decisions.</td></tr>';
    return shown.map(function (d) {
      return '<tr class="row" tabindex="0" data-go="decisions/' + esc(d.id) + '">' +
        '<td class="dim num">' + esc(OS.fmtDate(d.date) || '—') + '</td>' +
        '<td>' + OS.level(d.level) + '</td>' +
        '<td class="wrap">' + esc(d.title) + '</td>' +
        '<td class="dim">' + esc(d.desk || '—') + '</td>' +
        '<td>' + (d.status ? '<span class="pill">' + esc(d.status) + '</span>' : '<span class="dim">—</span>') + '</td>' +
        '<td class="n">' + OS.jev(d.jev) + '</td></tr>';
    }).join('');
  }

  function table(list) {
    return '<div class="card tablewrap"><table><thead><tr><th>Date</th><th>Level</th><th>Decision</th><th>Desk</th><th>Status</th><th class="n">Jev</th></tr></thead>' +
      '<tbody id="dec-rows">' + rows(list) + '</tbody></table></div>';
  }

  function scoreBlock(d) {
    if (d.jev === null) return '<div class="score"><span>' + OS.jev(null) + '</span><small class="note">No Jev score is stored for this decision.</small></div>';
    var pct = Math.round(d.jev * 100);
    return '<div class="score"><b class="num big">' + d.jev.toFixed(2) + '</b><div class="bar"><i style="width:' + pct + '%;background:var(--' + (d.jev >= 0.75 ? 'ok' : 'warn') + ')"></i><u></u></div>' + OS.jev(d.jev) + '</div>' +
      '<p class="note">Marker at 0.75 = PASS line.</p>';
  }

  function drawer(d) {
    var kv = [['Date', OS.fmtLongDate(d.date)], ['Desk', d.desk], ['Status', d.status]]
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
      return head + '<div id="dec-chips">' + chips(list) + '</div>' + table(list);
    },
    mount: function (root, ctx) {
      var list = ctx.data.decisions;
      if (!list || !list.length) return;
      root.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('[data-filter]') : null;
        if (!chip) return;
        filter = chip.getAttribute('data-filter');
        root.querySelector('#dec-chips').innerHTML = chips(list);
        root.querySelector('#dec-rows').innerHTML = rows(list);
      });
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var row = e.target.closest ? e.target.closest('tr[data-go]') : null;
        if (row) OS.go('decisions', row.getAttribute('data-go').split('/')[1]);
      });
      if (ctx.sub) {
        var d = list.filter(function (x) { return x.id === ctx.sub; })[0];
        if (d) OS.openDrawer(drawer(d));
      }
    }
  });
})();
