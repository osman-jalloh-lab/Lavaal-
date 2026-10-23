/* LAVAALL OS Notes: a searchable list and a reader, opened by #notes/<noteId>. Read only.
   Notes come from the vault pack (scripts/build-notes-pack.js; never committed) and the ops store.
   Filters: a search box, folder and type chips, and a tag list. Note text is shown as plain text, never
   as HTML or markdown. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var TYPE_LABEL = { 'scout-find': 'Scout find', idea: 'Idea', decision: 'Decision', note: 'Note' };
  var MAX_ROWS = 200;
  var MAX_TAGS = 24;
  var f = { q: '', folder: 'All', type: 'All', tag: '' };

  function typeLabel(t) { return TYPE_LABEL[t] || (t ? t : ''); }

  function passes(n) {
    if (f.folder !== 'All' && n.folder !== f.folder) return false;
    if (f.type !== 'All' && n.type !== f.type) return false;
    if (f.tag && (n.tags || []).indexOf(f.tag) === -1) return false;
    if (f.q) {
      var hay = [n.title, n.body, (n.tags || []).join(' ')].join('\n').toLowerCase();
      if (hay.indexOf(f.q.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function distinct(list, key) {
    var out = [];
    list.forEach(function (n) { if (n[key] && out.indexOf(n[key]) === -1) out.push(n[key]); });
    return out;
  }

  function chip(kind, value, label, n) {
    return '<button class="chip' + (f[kind] === value ? ' on' : '') + '" type="button" data-nf="' + kind + '" data-v="' + esc(value) + '">' + esc(label) +
      (n == null ? '' : ' <span class="num">' + n + '</span>') + '</button>';
  }

  function tagList(list) {
    var counts = {};
    list.forEach(function (n) { (n.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var tags = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || (a < b ? -1 : 1); }).slice(0, MAX_TAGS);
    if (!tags.length) return '';
    return '<div class="dfrow"><b>Tags</b><div class="chips">' + tags.map(function (t) {
      return '<button class="chip tchip' + (f.tag === t ? ' on' : '') + '" type="button" data-nf="tag" data-v="' + esc(t) + '">' + esc(t) + ' <span class="num">' + counts[t] + '</span></button>';
    }).join('') + '</div></div>';
  }

  function filters(list) {
    var folders = distinct(list, 'folder');
    var types = distinct(list, 'type');
    var rows = '<div class="nsearch"><input class="q" id="notes-q" type="search" placeholder="Search notes" aria-label="Search notes" value="' + esc(f.q) + '" autocomplete="off"></div>';
    if (folders.length) {
      rows += '<div class="dfrow"><b>Folder</b><div class="chips">' + chip('folder', 'All', 'All', list.length) +
        folders.map(function (x) { return chip('folder', x, x, list.filter(function (n) { return n.folder === x; }).length); }).join('') + '</div></div>';
    }
    if (types.length > 1) {
      rows += '<div class="dfrow"><b>Type</b><div class="chips">' + chip('type', 'All', 'All', null) +
        types.map(function (x) { return chip('type', x, typeLabel(x), list.filter(function (n) { return n.type === x; }).length); }).join('') + '</div></div>';
    }
    return '<div class="dfilters" role="group" aria-label="Filter notes">' + rows + tagList(list) + '</div>';
  }

  function pick(list, sub) {
    if (sub) { var hit = list.filter(function (n) { return n.id === sub; })[0]; if (hit) return hit; }
    return list[0];
  }

  function listHtml(shown, current, total) {
    if (!shown.length) return '<div class="empty tight"><b>No notes match these filters.</b></div>';
    var rows = shown.slice(0, MAX_ROWS).map(function (n) {
      var sub = [typeLabel(n.type), OS.fmtDate(n.date || n.updatedAt) || '', n.type ? '' : n.source].filter(Boolean).join(' · ');
      return '<div class="li' + (current && n.id === current.id ? ' on' : '') + '" tabindex="0" data-go="notes/' + esc(n.id) + '">' + icon('notes') +
        '<div class="t"><div>' + esc(n.title) + '</div>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' +
        (n.urgent ? '<span class="pill bad">urgent</span>' : '') + '</div>';
    }).join('');
    var more = shown.length > MAX_ROWS ? '<p class="note foot">Showing ' + MAX_ROWS + ' of ' + shown.length + '. Narrow the filters to see the rest.</p>' : '';
    return rows + more;
  }

  function reader(n, all) {
    if (!n) return '<div class="empty tight"><b>Select a note.</b></div>';
    var meta = [];
    if (n.type) meta.push('<span class="pill">' + esc(typeLabel(n.type)) + '</span>');
    if (n.folder) meta.push('<span class="pill">' + esc(n.folder) + '</span>');
    if (n.urgent) meta.push('<span class="pill bad">urgent</span>');
    if (n.status) meta.push('<span class="pill">' + esc(n.status) + '</span>');
    if (n.level) meta.push(OS.level(n.level));
    if (n.desk) meta.push(OS.deskChip(n.desk));
    if (n.type === 'scout-find' || n.jev !== null) meta.push(OS.jev(n.jev));
    var dates = [n.date ? 'Dated ' + OS.fmtLongDate(n.date) : '', n.updatedAt && n.updatedAt !== n.date ? 'Updated ' + OS.fmtLongDate(n.updatedAt) : ''].filter(Boolean).join(' · ');
    var linked = (n.links || []).map(function (id) { return all.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
    return '<h2>' + esc(n.title) + '</h2>' +
      (meta.length ? '<div class="dmeta">' + meta.join('') + '</div>' : '') +
      (dates ? '<p class="note">' + esc(dates) + '</p>' : '') +
      (n.source ? '<p class="note">Source: ' + esc(n.source) + '</p>' : '') +
      (n.url ? '<p class="note">Link: ' + esc(n.url) + '</p>' : '') +
      (n.body ? '<p class="pre">' + esc(n.body) + '</p>' : '<p class="note">This note has no body.</p>') +
      ((n.tags || []).length ? '<div class="sect">Tags</div><div class="chips">' + n.tags.map(function (t) { return '<span class="pill">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      (linked.length ? '<div class="sect">Linked notes</div>' + linked.map(function (x) { return '<div class="li" tabindex="0" data-go="notes/' + esc(x.id) + '">' + icon('notes') + '<div class="t"><div>' + esc(x.title) + '</div></div></div>'; }).join('') : '');
  }

  OS.registerView('notes', {
    render: function (ctx) {
      var list = ctx.data.notes;
      var head = '<div class="ph"><div><h1>Notes</h1><p>Founder notes from the vault pack and the ops store. View only.</p></div></div>';
      if (list === null) return head + '<div class="card">' + OS.empty('Notes could not be loaded.', 'notes') + '</div>';
      if (!list.length) return head + '<div class="card">' + OS.empty('No notes yet.', 'notes') + '</div>';
      var shown = list.filter(passes);
      var current = pick(shown.length ? shown : [], ctx.sub) || null;
      if (ctx.sub && !current) current = pick(list, ctx.sub);
      return head + '<div id="notes-filters">' + filters(list) + '</div>' +
        '<div class="card notes"><div class="lst" id="notes-list">' + listHtml(shown, current, list.length) + '</div><div class="md" id="notes-reader">' + reader(current, list) + '</div></div>';
    },
    mount: function (root, ctx) {
      var list = ctx.data.notes;
      if (!list || !list.length) return;
      function redraw(keepSearch) {
        var shown = list.filter(passes);
        var cur = shown[0] || null;
        if (!keepSearch) root.querySelector('#notes-filters').innerHTML = filters(list);
        root.querySelector('#notes-list').innerHTML = listHtml(shown, cur, list.length);
        root.querySelector('#notes-reader').innerHTML = reader(cur, list);
      }
      root.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-nf]') : null;
        if (!b) return;
        var kind = b.getAttribute('data-nf');
        var v = b.getAttribute('data-v');
        f[kind] = kind === 'tag' && f.tag === v ? '' : v;
        redraw(false);
      });
      root.addEventListener('input', function (e) {
        if (!e.target || e.target.id !== 'notes-q') return;
        f.q = String(e.target.value || '').trim();
        redraw(true);
      });
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var row = e.target.closest ? e.target.closest('.li[data-go]') : null;
        if (row) OS.go('notes', row.getAttribute('data-go').split('/')[1]);
      });
    }
  });
})();
