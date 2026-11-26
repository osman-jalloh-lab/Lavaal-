/* LAVAALL OS Build: what Claude and the agents are building, from the build-log feed only.
   Lanes in the order Osman acts on them: Waiting on you, In progress, Done, Up next. Nothing here is
   invented: with no feed every lane is empty and names its source. Links open only https URLs. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;

  var LANES = [
    { key: 'waiting', label: 'Waiting on you', tint: 'o', empty: 'Nothing is waiting on you.' },
    { key: 'active', label: 'In progress', tint: 'b', empty: 'Nothing is in progress.' },
    { key: 'done', label: 'Done', tint: 'g', empty: 'Nothing finished yet.' },
    { key: 'next', label: 'Up next', tint: 'v', empty: 'Nothing queued.' }
  ];
  var PROJECTS = { 'lavaall-os': 'LAVAALL OS', salonehire: 'SaloneHire', saloneworks: 'SaloneWorks', agents: 'Agents', website: 'Website' };

  function safeUrl(u) { return typeof u === 'string' && /^https:\/\/[^\s@]+$/.test(u) ? u : ''; }

  function item(it) {
    var url = safeUrl(it.url);
    return '<div class="bl-item">' +
      '<div class="bl-top"><span class="tag">' + esc(PROJECTS[it.project] || (OS.businessLabel ? OS.businessLabel(it.project) : it.project)) + '</span><span class="bl-title">' + esc(it.title) + '</span></div>' +
      (it.detail ? '<p class="bl-detail">' + esc(it.detail) + '</p>' : '') +
      '<div class="bl-meta"><span class="num">' + esc(OS.fmtTime(it.updatedAt)) + '</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open</a>' : '') + '</div>' +
      '</div>';
  }

  // ---- Business overview: one card per business with progress, launch countdown and what is left ----
  function groupOf(id) {
    var gs = (OS.data.harness && OS.data.harness.groups) || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].id === id) return gs[i];
    return null;
  }
  function daysTo(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.ceil((new Date(day + 'T00:00:00').getTime() - t.getTime()) / 86400000);
  }
  function overviewCard(b, items) {
    var mine = items.filter(function (i) { return OS.businessOf(i.project) === b.id; });
    var count = function (k) { return mine.filter(function (i) { return i.status === k; }).length; };
    var done = count('done'), total = mine.length, left = total - done;
    var pct = total ? Math.round(done * 100 / total) : 0;
    var g = groupOf(b.id) || {};
    var lead = (g.projects || [])[0] || {};
    var d = daysTo(g.launch);
    var launch = d == null ? '' : '<span class="pill ' + (d <= 7 ? 'flag' : '') + '">' + (d > 1 ? d + ' days to launch' : d === 1 ? 'Launches tomorrow' : d === 0 ? 'Launch day' : 'Launched') + '</span>';
    var remaining = mine.filter(function (i) { return i.status !== 'done'; })
      .sort(function (x, y) { var o = { waiting: 0, active: 1, next: 2 }; return o[x.status] - o[y.status]; }).slice(0, 4);
    var LBL = { waiting: 'Needs you', active: 'In progress', next: 'Up next' };
    return '<section class="card bz" data-biz="' + esc(b.id) + '">' +
      '<div class="bz-h"><b>' + esc(b.label) + '</b>' + launch + '</div>' +
      (lead.status ? '<p class="note bz-s">' + esc(String(lead.status).slice(0, 140)) + '</p>' : '') +
      '<div class="bz-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + esc(b.label) + ' done"><i style="width:' + pct + '%"></i></div>' +
      '<div class="bz-n"><span><b class="num">' + done + '</b> done</span><span><b class="num">' + count('active') + '</b> in progress</span><span><b class="num">' + count('next') + '</b> up next</span>' +
        (count('waiting') ? '<span class="bz-w"><b class="num">' + count('waiting') + '</b> need you</span>' : '') + '</div>' +
      (remaining.length ? '<ul class="bz-left">' + remaining.map(function (i) { return '<li><span class="bz-k ' + i.status + '">' + LBL[i.status] + '</span>' + esc(i.title) + '</li>'; }).join('') +
        (left > remaining.length ? '<li class="note">+' + (left - remaining.length) + ' more</li>' : '') + '</ul>'
        : '<p class="note">' + (total ? 'Everything logged is done.' : 'Nothing logged for this business yet.') + '</p>') +
    '</section>';
  }
  function overviewHtml(items) {
    var list = (OS.businesses || []).filter(function (b) { return b.id !== 'all' && (OS.business() === 'all' || OS.business() === b.id); });
    return '<div class="sect">Businesses</div><div class="bz-grid">' + list.map(function (b) { return overviewCard(b, items); }).join('') + '</div>';
  }
  OS.businessOverviewHtml = function (data) {
    var log = data && data.build;
    return overviewHtml(log && Array.isArray(log.items) ? log.items : []);
  };

  OS.registerView('build', {
    render: function (ctx) {
      var log = ctx.data.build;
      var items = log && Array.isArray(log.items) ? log.items.filter(function (i) { return !OS.inBusiness || OS.inBusiness(i.project); }) : [];
      var head = '<div class="ph"><div><h1>Build</h1><p>What Claude and the agents are building' + (OS.business && OS.business() !== 'all' ? ' for ' + esc(OS.businessLabel()) : '') + ', and what is waiting on your yes.</p></div>' +
        (log ? '<div class="r"><span class="dim">Updated ' + esc(OS.fmtTime(log.receivedAt)) + '</span></div>' : '') + '</div>';
      var tiles = '<div class="grid g4">' + LANES.map(function (l) {
        var n = items.filter(function (i) { return i.status === l.key; }).length;
        return '<div class="card kpi t-' + l.tint + '"><span>' + esc(l.label) + '</span><b class="num">' + (log ? n : '—') + '</b><i>' + (log ? 'items' : 'no build log yet') + '</i></div>';
      }).join('') + '</div>';
      if (!log) return head + overviewHtml([]) + tiles + '<section class="card mt">' + OS.empty('No build log has been received yet.', 'build') + '</section>';
      var lanes = LANES.map(function (l) {
        var rows = items.filter(function (i) { return i.status === l.key; });
        return '<section class="card mt bl-lane' + (l.key === 'waiting' && rows.length ? ' wait' : '') + '"><div class="ch"><h3>' + esc(l.label) + '</h3><div class="r"><span class="num">' + rows.length + '</span></div></div>' +
          (rows.length ? rows.map(item).join('') : '<div class="empty"><b>' + esc(l.empty) + '</b></div>') + '</section>';
      }).join('');
      return head + overviewHtml(items) + '<div class="sect">All work</div>' + tiles + lanes;
    },
    mount: function (root) {
      root.addEventListener('click', function (e) {
        var card = e.target.closest ? e.target.closest('[data-biz]') : null;
        if (card && OS.business() === 'all' && OS.setBusiness) OS.setBusiness(card.getAttribute('data-biz'));
      });
    }
  });
})();
