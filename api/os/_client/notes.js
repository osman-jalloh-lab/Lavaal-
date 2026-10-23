/* LAVAALL OS Notes: a list and a reader, opened by #notes/<noteId>. Read only.
   Note text is shown as plain text, never as HTML or markdown. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  function pick(list, sub) {
    if (sub) { var hit = list.filter(function (n) { return n.id === sub; })[0]; if (hit) return hit; }
    return list[0];
  }

  function listHtml(list, current) {
    return list.map(function (n) {
      var sub = [OS.fmtDate(n.updatedAt), n.source].filter(Boolean).join(' · ');
      return '<div class="li' + (n.id === current.id ? ' on' : '') + '" tabindex="0" data-go="notes/' + esc(n.id) + '">' + icon('notes') +
        '<div class="t"><div>' + esc(n.title) + '</div>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div></div>';
    }).join('');
  }

  function reader(n) {
    return '<h2>' + esc(n.title) + '</h2>' +
      (n.source ? '<p class="note">Source: ' + esc(n.source) + '</p>' : '') +
      (n.body ? '<p class="pre">' + esc(n.body) + '</p>' : '<p class="note">This note has no body.</p>');
  }

  OS.registerView('notes', {
    render: function (ctx) {
      var list = ctx.data.notes;
      var head = '<div class="ph"><div><h1>Notes</h1><p>Founder notes from the ops store. View only.</p></div></div>';
      if (list === null) return head + '<div class="card">' + OS.empty('Notes could not be loaded.', 'notes') + '</div>';
      if (!list.length) return head + '<div class="card">' + OS.empty('No notes yet.', 'notes') + '</div>';
      var current = pick(list, ctx.sub);
      return head + '<div class="card notes"><div class="lst">' + listHtml(list, current) + '</div><div class="md">' + reader(current) + '</div></div>';
    },
    mount: function (root, ctx) {
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var row = e.target.closest ? e.target.closest('.li[data-go]') : null;
        if (row) OS.go('notes', row.getAttribute('data-go').split('/')[1]);
      });
    }
  });
})();
