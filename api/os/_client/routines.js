/* LAVAALL OS Routines: name, schedule (CT), last run, health, status.
   Names and last runs come from the store; health comes from the routine-health record.
   The store keeps no schedule, so it shows a dash. Read only: no toggles, no runs. */
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

  function row(r) {
    return '<tr><td class="wrap">' + esc(r.name) + '<div class="sub mono">' + esc(r.id) + '</div></td>' +
      '<td class="dim num">' + esc(r.schedule || '—') + '</td>' +
      '<td class="dim num">' + esc(r.lastRunLabel || '—') + '</td>' +
      '<td>' + healthCell(r) + '</td>' +
      '<td>' + (r.lastRunStatus ? '<span class="pill">' + esc(human(r.lastRunStatus)) + '</span>' : '<span class="dim">—</span>') + '</td></tr>';
  }

  OS.registerView('routines', {
    render: function (ctx) {
      var list = ctx.data.routines;
      var head = '<div class="ph"><div><h1>Routines</h1><p>Times are America/Chicago. View only.</p></div></div>';
      if (list === null) return head + '<div class="card">' + OS.empty('Routines could not be loaded.', 'routines') + '</div>';
      if (!list.length) return head + '<div class="card">' + OS.empty('No routines are stored.', 'routines') + '</div>';
      var anyHealth = list.some(function (r) { return r.health; });
      return head + '<div class="card tablewrap"><table><thead><tr><th>Routine</th><th>Schedule (CT)</th><th>Last run</th><th>Health</th><th>Status</th></tr></thead><tbody>' +
        list.map(row).join('') + '</tbody></table></div>' +
        '<p class="note foot">Schedules are not stored yet. ' + (anyHealth ? 'Health is from the routine-health record.' : 'No routine-health record yet.') + '</p>';
    }
  });
})();
