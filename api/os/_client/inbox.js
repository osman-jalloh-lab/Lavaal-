/* LAVAALL OS Inbox: the business Gmail inbox as a mail client. Piles on the left, threads in the middle, the
   selected thread on the right (stacked on a phone). Read-only: nothing is sent, archived or marked read from here;
   "Draft a reply" only fills the Gmail draft form. Mail text is untrusted and always escaped. Each thread opens in Gmail. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var pile = 'all';
  var sel = '';
  var query = '';
  var last = null;

  function gmailUrl(id) { return /^[A-Za-z0-9_-]+$/.test(id || '') ? 'https://mail.google.com/mail/u/0/#inbox/' + id : ''; }

  function sender(from) {
    var m = String(from || '').match(/^\s*"?([^"<]+?)"?\s*</);
    return m ? m[1] : String(from || '');
  }
  function address(from) {
    var m = String(from || '').match(/<([^<>\s]+@[^<>\s]+)>/) || String(from || '').match(/([^\s<>"]+@[^\s<>"]+)/);
    return m ? m[1] : '';
  }
  function initials(name) {
    var parts = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  // A stable tint per sender, from the brand palette.
  function tint(name) {
    var h = 0, s = String(name || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ['a', 'b', 'c', 'd', 'e'][h % 5];
  }
  function ago(ms) {
    if (!(ms > 0)) return '';
    var m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    if (m < 1440) return Math.round(m / 60) + 'h';
    try { return new Date(ms).toLocaleDateString('en-US', m < 7 * 1440 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
  }

  function visible(data) {
    var q = query.toLowerCase();
    return data.items.filter(function (i) {
      if (pile !== 'all' && i.pile !== pile) return false;
      return !q || (String(i.from) + ' ' + i.subject + ' ' + i.snippet).toLowerCase().indexOf(q) !== -1;
    });
  }

  function reader(i, label) {
    if (!i) return '<div class="mail-read empty"><b>Pick a message to read it here.</b></div>';
    var url = gmailUrl(i.id);
    var who = sender(i.from), addr = address(i.from);
    return '<article class="mail-read" aria-label="Selected message">' +
      '<div class="mail-rh"><span class="avatar t-' + tint(who) + '" aria-hidden="true">' + esc(initials(who)) + '</span>' +
        '<div class="mail-rwho"><b>' + esc(who || '(unknown sender)') + '</b>' + (addr && addr !== who ? '<small>' + esc(addr) + '</small>' : '') + '</div>' +
        '<span class="tag">' + esc(label[i.pile] || i.pile) + '</span></div>' +
      '<h2 class="mail-rsubj">' + esc(i.subject || '(no subject)') + '</h2>' +
      '<p class="note num">' + esc(OS.fmtTime(i.receivedAt)) + (i.unread ? ' · unread' : '') + '</p>' +
      '<div class="mail-rbody">' + (i.snippet ? esc(i.snippet) : '<span class="dim">No preview. Open it in Gmail to read the whole thread.</span>') + '</div>' +
      '<div class="mail-acts">' +
        (url ? '<a class="btn pri" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open in Gmail</a>' : '') +
        (addr ? '<button type="button" class="btn" data-reply="' + esc(i.id) + '">Draft a reply</button>' : '') +
      '</div><p class="note">Only Gmail sends mail. A reply here is saved as a draft for you to send.</p></article>';
  }

  function body(data) {
    if (!data) return '<div class="card empty"><b>Loading your inbox…</b></div>';
    if (data.error) return '<div class="card empty"><b>' + esc(data.message || 'The inbox could not be loaded.') + '</b><small>' + esc(data.error) + '</small></div>';
    if (!data.connected) return '<div class="card empty"><b>Gmail is not connected.</b><small>' + esc(data.message || '') + '</small></div>';
    var counts = {}, unread = 0;
    data.items.forEach(function (i) { counts[i.pile] = (counts[i.pile] || 0) + 1; if (i.unread) unread++; });
    var label = {};
    data.piles.forEach(function (p) { label[p.id] = p.label; });
    var rail = '<nav class="mail-piles" role="group" aria-label="Piles">' +
      '<button type="button" class="mail-pile' + (pile === 'all' ? ' on' : '') + '" data-pile="all" aria-pressed="' + (pile === 'all') + '"><span>All mail</span><span class="num">' + data.items.length + '</span></button>' +
      data.piles.map(function (p) {
        return '<button type="button" class="mail-pile' + (pile === p.id ? ' on' : '') + (p.id === 'reply' && counts.reply ? ' hot' : '') + '" data-pile="' + esc(p.id) + '" aria-pressed="' + (pile === p.id) + '"><span>' + esc(p.label) + '</span><span class="num">' + (counts[p.id] || 0) + '</span></button>';
      }).join('') + '</nav>';
    var rows = visible(data);
    if (!rows.some(function (i) { return i.id === sel; })) sel = rows.length ? rows[0].id : '';
    var list = rows.length ? rows.map(function (i) {
      var url = gmailUrl(i.id), who = sender(i.from);
      return '<div class="mail-row' + (i.unread ? ' unread' : '') + (i.id === sel ? ' on' : '') + '" data-sel="' + esc(i.id) + '" tabindex="0" role="button" aria-pressed="' + (i.id === sel) + '">' +
        '<span class="avatar t-' + tint(who) + '" aria-hidden="true">' + esc(initials(who)) + '</span>' +
        '<div class="mail-main"><div class="inbox-top"><span class="inbox-from">' + esc(who) + '</span>' +
        '<span class="inbox-when num" title="' + esc(OS.fmtTime(i.receivedAt)) + '">' + esc(ago(i.receivedAt)) + '</span></div>' +
        '<div class="inbox-subj">' + esc(i.subject) + '</div>' +
        (i.snippet ? '<div class="inbox-snip">' + esc(i.snippet) + '</div>' : '') +
        (url ? '<a class="inbox-open" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open in Gmail</a>' : '') + '</div>' +
      '</div>';
    }).join('') : '<div class="empty"><b>' + (query ? 'No mail matches “' + esc(query) + '”.' : 'Nothing in this pile.') + '</b></div>';
    var current = rows.filter(function (i) { return i.id === sel; })[0];
    var who = data.mailbox ? '<p class="note inbox-acct">Reading <b>' + esc(data.mailbox) + '</b>' + (data.mailboxVerified ? ' (confirmed by Google)' : ' (from settings; Google did not confirm)') + '</p>' : '';
    var strip = '<div class="mail-strip"><span><b class="num">' + unread + '</b> unread</span><span><b class="num">' + (counts.reply || 0) + '</b> to reply today</span><span><b class="num">' + (counts.sales || 0) + '</b> sales and quotes</span></div>';
    return who + strip + '<div class="mail">' + rail +
      '<section class="mail-list card" aria-label="Messages"><label class="sr" for="mail-q">Search mail</label><input id="mail-q" class="mail-q" type="search" placeholder="Search this inbox" value="' + esc(query) + '" maxlength="100" />' +
      '<div class="mail-rows">' + list + '</div></section>' +
      '<section class="card mail-pane">' + reader(current, label) + '</section></div>';
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
      function repaint(keepFocus) {
        var host = root.querySelector('#inbox-body');
        if (!host || !last) return;
        host.innerHTML = body(last);
        if (keepFocus) { var q = root.querySelector('#mail-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
      }
      function pick(el) {
        sel = el.getAttribute('data-sel'); repaint(false);
        var pane = root.querySelector('.mail-pane');
        if (pane && (window.innerWidth || 1024) < 900 && pane.scrollIntoView) pane.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      root.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'mail-q') { query = e.target.value; repaint(true); }
      });
      root.addEventListener('keydown', function (e) {
        var row = e.target.closest ? e.target.closest('[data-sel]') : null;
        if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(row); }
      });
      root.addEventListener('click', function (e) {
        var c = e.target.closest ? e.target : null;
        if (!c) return;
        var chip = c.closest('[data-pile]');
        if (chip) { pile = chip.getAttribute('data-pile'); sel = ''; repaint(false); return; }
        var rep = c.closest('[data-reply]');
        if (rep && last && last.items) {
          var it = last.items.filter(function (i) { return i.id === rep.getAttribute('data-reply'); })[0];
          var det = root.querySelector('.gdraft');
          if (it && det) {
            det.open = true;
            root.querySelector('#gd-to').value = address(it.from);
            root.querySelector('#gd-subj').value = /^re:/i.test(it.subject) ? it.subject : 'Re: ' + it.subject;
            var t = root.querySelector('#gd-text'); if (t) t.focus();
            if (det.scrollIntoView) det.scrollIntoView({ block: 'start', behavior: 'smooth' });
          }
          return;
        }
        if (c.closest('a')) return;
        var row = c.closest('[data-sel]');
        if (row) { pick(row); return; }
        if (c.closest('#inbox-refresh')) load(root, true);
      });
    }
  });
})();
