/* LAVAALL OS Routines: name, desk, schedule (CT), last run, health, status.
   Name, desk (owner), schedule and status come from the static data pack's routines.json
   (docs/os/DECISIONS.md #20). The pack's own last-run fields are stale and ignored: "last run" and health
   come only from the live routine-health record, merged by id, and show a dash without one.
   Read only: no toggles, no runs. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;

  var TONE = { ok: 'pass', warn: 'flag', bad: 'bad' };

  function human(status) { return String(status || '').replace(/_/g, ' '); }

  function healthCell(r) {
    if (!r.health) return '<span class="dim">—</span>';
    return '<span class="pill ' + (TONE[r.health.tone] || '') + '" title="' + esc(r.health.reason || '') + '">' + esc(r.health.status) + '</span>';
  }

  function deskName(desks, id) {
    for (var i = 0; i < (desks || []).length; i++) if (desks[i].id === id) return desks[i].short || desks[i].name;
    return id || '';
  }

  function statusCell(r) {
    if (!r.status) return '<span class="dim">—</span>';
    return '<span class="pill ' + (r.status === 'active' ? 'pass' : 'flag') + '">' + esc(human(r.status)) + '</span>';
  }

  function row(r, desks) {
    return '<tr><td class="wrap">' + esc(r.name) + '<div class="sub mono">' + esc(r.id) + '</div>' +
      '<div class="sub m-only">' + esc(r.schedule || '—') + '</div></td>' +
      '<td>' + (r.owner ? '<span class="link" data-go="desks/' + esc(r.owner) + '">' + esc(deskName(desks, r.owner)) + '</span>' : '<span class="dim">—</span>') + '</td>' +
      '<td class="wrap dim rt-sched">' + esc(r.schedule || '—') + '</td>' +
      '<td class="dim num rt-last">' + esc(r.lastRunLabel || '—') + '</td>' +
      '<td>' + healthCell(r) + '</td>' +
      '<td>' + statusCell(r) + '</td></tr>';
  }

  OS.registerView('routines', {
    render: function (ctx) {
      var list = ctx.data.routines;
      var head = '<div class="ph"><div><h1>Routines</h1><p>Times are America/Chicago. View only.</p></div></div>';
      if (list === null) return head + '<div class="card">' + OS.empty('Routines could not be loaded.', 'routines') + '</div>';
      if (!list.length) return head + '<div class="card">' + OS.empty('No routines are listed.', 'routines') + '</div>';
      var anyHealth = list.some(function (r) { return r.health; });
      var desks = ctx.data.desks || [];
      return head + '<div class="card tablewrap"><table><thead><tr><th>Routine</th><th>Desk</th><th class="rt-sched">Schedule (CT)</th><th class="rt-last">Last run</th><th>Health</th><th>Status</th></tr></thead><tbody>' +
        list.map(function (r) { return row(r, desks); }).join('') + '</tbody></table></div>' +
        '<p class="note foot">Schedule, desk and status are from the data pack. ' + (anyHealth ? 'Last run and health are from the routine-health record.' : 'Last run and health need a routine-health record, and there is none yet.') + '</p>';
    }
  });
})();
