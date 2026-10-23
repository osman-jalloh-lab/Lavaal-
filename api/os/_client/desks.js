/* LAVAALL OS Desks: a card grid and a detail drawer, opened by #desks/<deskId>.
   Desk names come from the desk registry. Skills, rules and the "now" line come from SOUL packs,
   which are deferred (docs/os/DECISIONS.md #4), so they show empty states. Nothing is invented. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  function initial(desk) { return esc(String(desk.short || desk.name || '?').charAt(0).toUpperCase()); }

  // A desk matches a decision by registry id or short name, ignoring case.
  function decisionsFor(data, desk) {
    if (!data.decisions) return null;
    var keys = [desk.id, desk.short, desk.name].map(function (k) { return String(k || '').toLowerCase(); });
    return data.decisions.filter(function (d) { return keys.indexOf(String(d.desk || '').toLowerCase()) !== -1; });
  }

  function routinesFor(data, desk) {
    if (!data.routines) return null;
    return data.routines.filter(function (r) { return r.owner === desk.id; });
  }

  function card(desk, data) {
    var decisions = decisionsFor(data, desk);
    var meta = decisions ? decisions.length + (decisions.length === 1 ? ' decision' : ' decisions') : '';
    return '<button class="card deskcard" type="button" data-go="desks/' + esc(desk.id) + '">' +
      '<span class="av sq" aria-hidden="true">' + initial(desk) + '</span>' +
      '<span class="dc-t"><b>' + esc(desk.name) + '</b>' +
      '<small>' + esc(desk.now || 'Status not recorded yet') + '</small></span>' +
      (meta ? '<span class="dc-m num">' + esc(meta) + '</span>' : '') + '</button>';
  }

  function section(title, body) { return '<div class="sect">' + esc(title) + '</div>' + body; }

  function drawer(desk, data) {
    var decisions = decisionsFor(data, desk);
    var routines = routinesFor(data, desk);
    var soulNote = 'Desk SOUL data is not loaded yet.';

    var now = desk.now
      ? '<p>' + esc(desk.now) + '</p>'
      : '<div class="empty tight"><b>No "now" line recorded.</b><small>' + esc(soulNote) + '</small></div>';
    var rules = desk.rules && desk.rules.length
      ? '<ul class="plain">' + desk.rules.map(function (r) { return '<li>' + icon('shield') + esc(r) + '</li>'; }).join('') + '</ul>'
      : '<div class="empty tight"><b>No rules loaded.</b><small>' + esc(soulNote) + '</small></div>';
    var skills = desk.skills && desk.skills.length
      ? '<div class="chips">' + desk.skills.map(function (k) { return '<span class="tag mono">' + esc(k) + '</span>'; }).join('') + '</div>'
      : '<div class="empty tight"><b>No skills loaded.</b><small>' + esc(soulNote) + '</small></div>';
    var rts = routines === null
      ? OS.empty('Routines could not be loaded.', 'routines')
      : routines.length
        ? routines.map(function (r) { return '<div class="li" data-go="routines"><div class="t"><div>' + esc(r.name) + '</div><small>' + esc(r.lastRunLabel || 'never run') + '</small></div></div>'; }).join('')
        : '<div class="empty tight"><b>No routines are linked to this desk.</b><small>The store keeps no owner on routines.</small></div>';
    var recent = decisions === null
      ? OS.empty('No decision log yet.', 'decisions')
      : decisions.length
        ? decisions.slice(0, 5).map(function (d) {
          return '<div class="li" data-go="decisions/' + esc(d.id) + '">' + OS.level(d.level) + '<div class="t"><div>' + esc(d.title) + '</div><small>' + esc(OS.fmtDate(d.date)) + '</small></div>' + OS.jev(d.jev) + '</div>';
        }).join('')
        : '<div class="empty tight"><b>No decisions for this desk.</b></div>';

    return '<div class="dh"><span class="av sq" aria-hidden="true">' + initial(desk) + '</span><h3>' + esc(desk.name) + '</h3>' +
      '<button class="ib" type="button" data-close aria-label="Close" style="margin-left:auto">' + icon('x') + '</button></div>' +
      '<div class="db">' + section('Now', now) + section('Rules', rules) + section('Skills', skills) +
      section('Routines', '<div class="listbox">' + rts + '</div>') + section('Recent decisions', '<div class="listbox">' + recent + '</div>') + '</div>' +
      '<div class="df"><a class="btn" href="' + esc(desk.talk || '/ops/office') + '">' + icon('council') + 'Talk in /ops</a><button class="btn" type="button" data-close>Close</button></div>';
  }

  OS.registerView('desks', {
    render: function (ctx) {
      var desks = ctx.data.desks || [];
      return '<div class="ph"><div><h1>Desks</h1><p>' + desks.length + ' desks. Open one to see its now line, rules, skills, routines and decisions.</p></div></div>' +
        (desks.length ? '<div class="deskgrid">' + desks.map(function (d) { return card(d, ctx.data); }).join('') + '</div>'
          : '<div class="card">' + OS.empty('No desks are registered.', 'desks') + '</div>');
    },
    mount: function (root, ctx) {
      if (!ctx.sub) return;
      var desk = (ctx.data.desks || []).filter(function (d) { return d.id === ctx.sub; })[0];
      if (desk) OS.openDrawer(drawer(desk, ctx.data));
    }
  });
})();
