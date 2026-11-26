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
      if (!log) return head + tiles + '<section class="card mt">' + OS.empty('No build log has been received yet.', 'build') + '</section>';
      var lanes = LANES.map(function (l) {
        var rows = items.filter(function (i) { return i.status === l.key; });
        return '<section class="card mt bl-lane' + (l.key === 'waiting' && rows.length ? ' wait' : '') + '"><div class="ch"><h3>' + esc(l.label) + '</h3><div class="r"><span class="num">' + rows.length + '</span></div></div>' +
          (rows.length ? rows.map(item).join('') : '<div class="empty"><b>' + esc(l.empty) + '</b></div>') + '</section>';
      }).join('');
      return head + tiles + lanes;
    }
  });
})();
