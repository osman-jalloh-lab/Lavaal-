/* LAVAALL OS Inbox: the business Gmail inbox sorted into piles. Read-only: nothing is sent, archived or marked
   read from here. Mail text is untrusted and always escaped. Each thread opens in Gmail. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var pile = 'all';
  var last = null;

  function gmailUrl(id) { return /^[A-Za-z0-9_-]+$/.test(id || '') ? 'https://mail.google.com/mail/u/0/#inbox/' + id : ''; }

  function sender(from) {
    var m = String(from || '').match(/^\s*"?([^"<]+?)"?\s*</);
    return m ? m[1] : String(from || '');
  }

  function body(data) {
    if (!data) return '<div class="card empty"><b>Loading your inbox…</b></div>';
    if (data.error) return '<div class="card empty"><b>' + esc(data.message || 'The inbox could not be loaded.') + '</b><small>' + esc(data.error) + '</small></div>';
    if (!data.connected) return '<div class="card empty"><b>Gmail is not connected.</b><small>' + esc(data.message || '') + '</small></div>';
    var counts = {};
    data.items.forEach(function (i) { counts[i.pile] = (counts[i.pile] || 0) + 1; });
    var chips = '<div class="inbox-piles" role="group" aria-label="Piles">' +
      '<button type="button" class="chip' + (pile === 'all' ? ' on' : '') + '" data-pile="all" aria-pressed="' + (pile === 'all') + '">All <span class="num">' + data.items.length + '</span></button>' +
      data.piles.map(function (p) {
        return '<button type="button" class="chip' + (pile === p.id ? ' on' : '') + '" data-pile="' + esc(p.id) + '" aria-pressed="' + (pile === p.id) + '">' + esc(p.label) + ' <span class="num">' + (counts[p.id] || 0) + '</span></button>';
      }).join('') + '</div>';
    var rows = data.items.filter(function (i) { return pile === 'all' || i.pile === pile; });
    var label = {};
    data.piles.forEach(function (p) { label[p.id] = p.label; });
    var list = rows.length ? rows.map(function (i) {
      var url = gmailUrl(i.id);
      return '<div class="inbox-row' + (i.unread ? ' unread' : '') + '">' +
        '<div class="inbox-top"><span class="inbox-from">' + esc(sender(i.from)) + '</span><span class="tag">' + esc(label[i.pile] || i.pile) + '</span>' +
        '<span class="inbox-when num">' + esc(OS.fmtTime(i.receivedAt)) + '</span></div>' +
        '<div class="inbox-subj">' + esc(i.subject) + '</div>' +
        (i.snippet ? '<div class="inbox-snip">' + esc(i.snippet) + '</div>' : '') +
        (url ? '<a class="inbox-open" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open in Gmail</a>' : '') +
      '</div>';
    }).join('') : '<div class="empty"><b>Nothing in this pile.</b></div>';
    var who = data.mailbox ? '<p class="note inbox-acct">Reading <b>' + esc(data.mailbox) + '</b>' + (data.mailboxVerified ? ' (confirmed by Google)' : ' (from settings; Google did not confirm)') + '</p>' : '';
    return who + chips + '<section class="card mt">' + list + '</section>';
  }

  function load(root, fresh) {
    var host = root.querySelector('#inbox-body');
    window.fetch('/ops/os/inbox' + (fresh ? '?fresh=1' : ''), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return res.ok ? d : { error: d.error || ('HTTP ' + res.status), message: d.message }; }); })
      .catch(function () { return { error: 'network', message: 'The inbox could not be reached.' }; })
      .then(function (data) { last = data; if (host) host.innerHTML = body(data); });
  }

  OS.inboxBody = body;
  OS.registerView('inbox', {
    render: function () {
      return '<div class="ph"><div><h1>Inbox</h1><p>Your business Gmail, sorted into piles. Read-only: nothing is sent or changed from here.</p></div>' +
        '<div class="r"><button class="btn" type="button" id="inbox-refresh">Refresh</button></div></div>' +
        '<div id="gpanel">' + (OS.googlePanel ? OS.googlePanel() : '') + '</div>' +
        '<div id="inbox-body" class="mt">' + body(last) + '</div>' + (OS.draftForm ? OS.draftForm() : '');
    },
    mount: function (root) {
      if (OS.mountGooglePanel) OS.mountGooglePanel(root);
      if (OS.mountDraftForm) OS.mountDraftForm(root);
      load(root, false);
      root.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('[data-pile]') : null;
        if (chip) { pile = chip.getAttribute('data-pile'); var host = root.querySelector('#inbox-body'); if (host && last) host.innerHTML = body(last); return; }
        if (e.target.closest && e.target.closest('#inbox-refresh')) load(root, true);
      });
    }
  });
})();
