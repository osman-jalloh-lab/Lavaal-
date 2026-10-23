/* LAVAALL OS (/os) shell. Served from /os/app.js. No inline handlers: the CSP is script-src 'self'.
   Views register with OS.registerView(id, { render(ctx) -> html, mount(root, ctx), unmount() }). */
(function () {
  'use strict';

  var OS = (window.OS = window.OS || {});
  var doc = document;

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ICONS = {
    home: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    timer: '<path d="M10 2h4"/><path d="m12 14 3-3"/><circle cx="12" cy="14" r="8"/>',
    notes: '<path d="M2 6h4M2 10h4M2 14h4M2 18h4"/><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9.5 8h5M9.5 12H16M9.5 16H14"/>',
    brain: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5"/><circle cx="12" cy="19" r="2.5"/><path d="m10.4 6.9-3.8 3.2M13.6 6.9l3.8 3.2M7.5 12h9M6.6 13.9l3.8 3.2M17.4 13.9l-3.8 3.2"/>',
    council: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
    spend: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    settings: '<path d="M4 7h16"/><circle cx="9" cy="7" r="2"/><path d="M4 17h16"/><circle cx="15" cy="17" r="2"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    theme: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>'
  };
  function icon(name) {
    return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  // id, label, icon, shortcut hint, key after "g", crumb, one-line purpose, data source key
  var NAV = [
    { id: 'home', label: 'Home', icon: 'home', hint: 'G H', key: 'h', about: 'What needs you today.', src: null },
    { id: 'desks', label: 'Desks', icon: 'users', hint: 'G D', key: 'd', about: 'The desks, their rules and routines.', src: 'desks' },
    { id: 'decisions', label: 'Decisions + Jev', icon: 'scale', hint: 'G J', key: 'j', about: 'Decision log with Jev scores.', src: 'decisions' },
    { id: 'outreach', label: 'Outreach', icon: 'send', hint: 'G O', key: 'o', about: 'Leads by stage. View only; nothing is sent from here.', src: 'outreach' },
    { id: 'routines', label: 'Routines', icon: 'timer', hint: 'G R', key: 'r', about: 'Schedules, last runs and health.', src: 'routines' },
    { id: 'notes', label: 'Notes', icon: 'notes', hint: 'G N', key: 'n', about: 'Founder notes.', src: 'notes' },
    { id: 'brain', label: 'Brain', icon: 'brain', hint: 'G B', key: 'b', about: 'How desks, rules, skills, routines and decisions connect.', src: 'desks' },
    { id: 'council', label: 'AI Council', icon: 'council', hint: 'G C', key: 'c', about: 'Drafter and reviewer rounds, read from stored records.', src: 'council' },
    { id: 'spend', label: 'Spend', icon: 'spend', hint: 'G S', key: 's', about: 'AI spend from real records.', src: 'spend' },
    { id: 'settings', label: 'Settings', icon: 'settings', hint: 'G ,', key: ',', about: 'Connection status. Names only, never values.', src: 'settings' }
  ];
  var TABS = ['home', 'desks', 'decisions', 'outreach', 'routines'];

  function readData() {
    var node = $('#os-data');
    try { return JSON.parse(node ? node.textContent : '{}') || {}; } catch (e) { return {}; }
  }

  OS.data = readData();
  OS.nav = NAV;
  OS.esc = esc;
  OS.icon = icon;
  OS.$ = $;
  OS.$$ = $$;
  OS.views = {};
  OS.registerView = function (id, view) { OS.views[id] = view; };

  function navItem(id) {
    for (var i = 0; i < NAV.length; i++) if (NAV[i].id === id) return NAV[i];
    return null;
  }

  // ---- toast -------------------------------------------------------------
  OS.toast = function (message) {
    var el = doc.createElement('div');
    el.className = 'toast';
    el.innerHTML = icon('check') + '<span>' + esc(message) + '</span>';
    $('#toasts').appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .2s';
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    }, 2600);
  };

  // ---- theme -------------------------------------------------------------
  var root = doc.documentElement;
  function storedTheme() {
    try { var t = localStorage.getItem('os-theme'); return t === 'light' || t === 'dark' ? t : ''; } catch (e) { return ''; }
  }
  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('os-theme', theme); } catch (e) { /* storage may be blocked */ }
    if (OS.onTheme) OS.onTheme(theme);
  }
  function toggleTheme() { setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
  OS.toggleTheme = toggleTheme;
  if (storedTheme()) root.setAttribute('data-theme', storedTheme());

  // ---- clock (Chicago) ---------------------------------------------------
  var clockFmt = null;
  function clockText() {
    try {
      clockFmt = clockFmt || new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      var p = {};
      clockFmt.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      return p.weekday + ' ' + p.day + ' ' + p.month + ' · ' + p.hour + ':' + p.minute + ' ' + String(p.dayPeriod || '').toUpperCase() + ' CT';
    } catch (e) { return ''; }
  }
  function tickClock() { var el = $('#clock'); if (el) el.textContent = clockText(); }

  // ---- nav ---------------------------------------------------------------
  var cur = 'home';
  function renderNav() {
    $('#nav').innerHTML = '<div class="navlbl">Workspace</div>' + NAV.map(function (n) {
      return '<a href="#' + n.id + '" data-nav="' + n.id + '"' + (n.id === cur ? ' class="on" aria-current="page"' : '') + '>' +
        icon(n.icon) + esc(n.label) + '<kbd>' + esc(n.hint) + '</kbd></a>';
    }).join('');
    $('#tabbar').innerHTML = TABS.map(function (id) {
      var n = navItem(id);
      return '<a href="#' + id + '"' + (id === cur ? ' class="on" aria-current="page"' : '') + '>' + icon(n.icon) + esc(n.label.split(' ')[0]) + '</a>';
    }).join('');
  }

  // ---- router ------------------------------------------------------------
  var mounted = null;
  function parseHash() {
    var raw = location.hash.replace(/^#/, '');
    var i = raw.indexOf('/');
    var id = i < 0 ? raw : raw.slice(0, i);
    var sub = '';
    if (i >= 0) { try { sub = decodeURIComponent(raw.slice(i + 1)); } catch (e) { sub = raw.slice(i + 1); } }
    return { id: navItem(id) ? id : 'home', sub: sub };
  }
  function hashFor(id, sub) {
    return '#' + id + (sub ? '/' + encodeURIComponent(sub).replace(/%3A/gi, ':') : '');
  }
  OS.go = function (id, sub) {
    var next = hashFor(id, sub);
    if (location.hash === next) render(); else location.hash = next;
  };

  function placeholder(n) {
    var src = n.src && OS.data.sources ? OS.data.sources[n.src] : null;
    var from = src && src.from ? '<small>Data source: ' + esc(src.from) + '</small>' : '';
    return '<div class="ph"><div><h1>' + esc(n.label) + '</h1><p>' + esc(n.about) + '</p></div></div>' +
      '<div class="card empty"><b>This view is not built yet.</b>' + from + '</div>';
  }

  function render() {
    var route = parseHash();
    var n = navItem(route.id);
    if (mounted && mounted.unmount) { try { mounted.unmount(); } catch (e) { /* ignore */ } }
    mounted = null;
    cur = route.id;
    $('#crumb').textContent = n.label;
    doc.title = n.label + ' · LAVAALL OS';
    renderNav();
    closeDrawer();
    var view = OS.views[route.id];
    var ctx = { id: route.id, sub: route.sub, data: OS.data, esc: esc, icon: icon, go: OS.go };
    var host = $('#view');
    host.innerHTML = '<div class="fade">' + (view ? view.render(ctx) : placeholder(n)) + '</div>';
    if (view) {
      mounted = view;
      if (view.mount) view.mount(host, ctx);
    }
  }

  // ---- drawer ------------------------------------------------------------
  function openDrawer(html) {
    $('#drawer').innerHTML = html;
    $('#drawer').classList.add('on');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('on');
  }
  function closeDrawer() {
    $('#drawer').classList.remove('on');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#scrim').classList.remove('on');
  }
  OS.openDrawer = openDrawer;
  OS.closeDrawer = closeDrawer;

  // ---- command palette ---------------------------------------------------
  var CMDS = NAV.map(function (n) {
    return { label: n.label, icon: n.icon, hint: n.hint, run: function () { OS.go(n.id); } };
  }).concat([
    { label: 'Open Brain graph', icon: 'brain', hint: 'G B', run: function () { OS.go('brain'); } },
    { label: 'Search Brain…', icon: 'search', hint: '', run: function () {
      OS.go('brain');
      setTimeout(function () { var q = $('#bq'); if (q) q.focus(); }, 250);
    } },
    { label: 'Toggle theme', icon: 'theme', hint: 'T', run: toggleTheme }
  ]);
  var psel = 0;
  var shown = [];
  function renderPalette() {
    var q = $('#pq').value.trim().toLowerCase();
    shown = CMDS.filter(function (c) { return c.label.toLowerCase().indexOf(q) !== -1; });
    psel = Math.max(0, Math.min(psel, shown.length - 1));
    $('#plist').innerHTML = shown.length ? shown.map(function (c, i) {
      return '<div class="pi' + (i === psel ? ' sel' : '') + '" data-i="' + i + '" role="option">' + icon(c.icon) + esc(c.label) +
        (c.hint ? '<kbd>' + esc(c.hint) + '</kbd>' : '') + '</div>';
    }).join('') : '<div class="pnone">No matching command.</div>';
  }
  function openPalette() {
    $('#pal').classList.add('on');
    $('#pq').value = '';
    psel = 0;
    renderPalette();
    $('#pq').focus();
  }
  function closePalette() { $('#pal').classList.remove('on'); }
  function runCommand(i) {
    var cmd = shown[i];
    closePalette();
    if (cmd) cmd.run();
  }
  OS.openPalette = openPalette;

  // ---- wiring ------------------------------------------------------------
  function typing(el) {
    var tag = el && el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable);
  }
  var gAt = 0;

  function init() {
    var email = (OS.data.me && OS.data.me.email) || '';
    $('#me-av').textContent = (email.split('@')[0] || '?').slice(0, 2).toUpperCase();
    $('#side-theme').innerHTML = icon('theme');
    $('#hdr-theme').innerHTML = icon('theme');
    $('#hdr-pal').innerHTML = icon('command');

    $('#side-search').addEventListener('click', openPalette);
    $('#hdr-pal').addEventListener('click', openPalette);
    $('#side-theme').addEventListener('click', toggleTheme);
    $('#hdr-theme').addEventListener('click', toggleTheme);
    $('#scrim').addEventListener('click', closeDrawer);
    $('#pal').addEventListener('click', function (e) { if (e.target === this) closePalette(); });
    $('#plist').addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.pi') : null;
      if (row) runCommand(+row.getAttribute('data-i'));
    });
    $('#plist').addEventListener('mousemove', function (e) {
      var row = e.target.closest ? e.target.closest('.pi') : null;
      if (row && +row.getAttribute('data-i') !== psel) { psel = +row.getAttribute('data-i'); renderPalette(); }
    });
    $('#pq').addEventListener('input', function () { psel = 0; renderPalette(); });
    $('#pq').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { psel = Math.min(psel + 1, shown.length - 1); renderPalette(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { psel = Math.max(0, psel - 1); renderPalette(); e.preventDefault(); }
      else if (e.key === 'Enter') { runCommand(psel); e.preventDefault(); }
      else if (e.key === 'Escape') closePalette();
    });

    doc.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if (e.key === 'Escape') { closeDrawer(); closePalette(); return; }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 't') { toggleTheme(); return; }
      if (e.key === 'g') { gAt = Date.now(); return; }
      if (Date.now() - gAt < 800) {
        for (var i = 0; i < NAV.length; i++) {
          if (NAV[i].key === e.key) { gAt = 0; OS.go(NAV[i].id); return; }
        }
      }
    });

    window.addEventListener('hashchange', render);
    tickClock();
    setInterval(tickClock, 30000);
    render();
  }

  // Later view files are concatenated after this one; start once they have registered.
  setTimeout(init, 0);
})();
