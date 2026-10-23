/* LAVAALL OS Settings: read-only connection status. Names only, never keys or values.
   Status comes from whether the existing env var names are set (api/ops/_os_data.js). A connection
   with no env var in the ops app (GitHub) is "unknown", not "connected". */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;

  var TONE = { configured: 'pass', 'not configured': 'flag', unknown: '' };

  function row(c) {
    var names = c.envNames && c.envNames.length
      ? '<div class="envs">' + c.envNames.map(function (n) { return '<code class="tag mono">' + esc(n) + '</code>'; }).join('') + '</div>'
      : '<small class="dim">No environment variable is used for this in the ops app.</small>';
    return '<div class="li static"><div class="t"><div>' + esc(c.name) + '</div>' + names + '</div>' +
      '<span class="pill ' + (TONE[c.status] || '') + '">' + esc(c.status) + '</span></div>';
  }

  OS.registerView('settings', {
    render: function (ctx) {
      var list = ctx.data.settings || [];
      var head = '<div class="ph"><div><h1>Settings</h1><p>Connection status, read only. Names are shown; keys and values are never read into this page.</p></div></div>';
      if (!list.length) return head + '<div class="card">' + OS.empty('No connections are listed.', 'settings') + '</div>';
      return head + '<div class="card">' + list.map(row).join('') + '</div>' +
        '<p class="note foot">Status means the variable is set on this deployment, not that the service answered. Change these in Vercel project settings; this page cannot.</p>';
    }
  });
})();
