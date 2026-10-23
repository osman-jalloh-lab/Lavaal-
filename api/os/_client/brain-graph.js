/* LAVAALL OS Brain: graph model and physics. No DOM here, so it can be tested directly.
   Links exist only where the data really relates two things (docs/os/DECISIONS.md, brief 5.7):
     desk -> skill      uses skill      (desk.skills, from the data pack's desks.json)
     desk -> rule       follows rule    (FR ids found in desk.rules; desks.json rules carry no FR ids, so none today)
     routine -> desk    runs            (routine.owner, a desk id from the data pack's routines.json)
   Every pack skill and rule is a node, linked or not (skills.json, rules.json); an unlinked one is not guessed
   a link.
     decision -> desk   decided         (decision.desk matches the desk id, short name or name)
     lead -> sales desk works lead      (data.outreach; no read path yet, so none today)
     lead -> decision   named in        (the decision text contains the lead's full name)
     note -> rule/desk/decision/lead  mentions  (the note text contains the FR id, the desk's full name,
                                                  the decision title or the lead's full name)
     note -> note       links to        (note.links, ids of other notes in the vault pack)
     note -> desk       owned by        (note.desk, a desk id from the vault pack)
   Nothing is guessed from first words or synonyms. */
(function () {
  'use strict';
  var OS = window.OS;

  var TYPES = {
    desk: { label: 'Desks', css: '--accent' },
    rule: { label: 'Rules', css: '--warn' },
    skill: { label: 'Skills (FR-030 override)', css: '--c-skill' },
    routine: { label: 'Routines', css: '--c-amber' },
    decision: { label: 'Decisions', css: '--bad' },
    lead: { label: 'Leads', css: '--ok' },
    note: { label: 'Notes', css: '--c-note' }
  };
  var ORDER = ['desk', 'rule', 'skill', 'routine', 'decision', 'lead', 'note'];

  function lower(v) { return String(v == null ? '' : v).toLowerCase(); }

  function deskMatches(desk, label) {
    var want = lower(label);
    return !!want && [desk.id, desk.short, desk.name].some(function (k) { return lower(k) === want; });
  }

  function build(data) {
    data = data || {};
    var nodes = [];
    var links = [];
    var ix = {};

    function add(id, type, label, info) {
      if (ix[id]) return ix[id];
      var n = { id: id, t: type, label: String(label || id), info: info || {}, deg: 0, x: 0, y: 0, vx: 0, vy: 0 };
      ix[id] = n;
      nodes.push(n);
      return n;
    }
    function link(a, b, why) {
      if (!a || !b || a === b) return;
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        if ((l.s === a && l.t === b) || (l.s === b && l.t === a)) return;
      }
      links.push({ s: a, t: b, why: why });
      a.deg++;
      b.deg++;
    }

    var desks = data.desks || [];
    desks.forEach(function (d) {
      add('d:' + d.id, 'desk', d.name, { deskId: d.id, short: d.short, now: d.now || '' });
    });

    (data.skills || []).forEach(function (s) {
      add('s:' + s.id, 'skill', s.name, { whenToUse: s.whenToUse, routedTo: s.desks });
    });
    (data.rules || []).forEach(function (r) {
      add('r:' + r.id, 'rule', r.id, { title: r.title, text: r.rule, section: r.section });
    });

    desks.forEach(function (d) {
      var node = ix['d:' + d.id];
      (d.skills || []).forEach(function (s) { link(node, add('s:' + s, 'skill', s), 'uses skill'); });
      (d.rules || []).forEach(function (r) {
        (String(r).match(/FR-\d+/g) || []).forEach(function (fr) {
          link(node, add('r:' + fr, 'rule', fr, { text: String(r) }), 'follows rule');
        });
      });
    });

    (data.routines || []).forEach(function (r) {
      var n = add('rt:' + r.id, 'routine', r.name, { rawId: r.id, lastRun: r.lastRunLabel || '', status: r.lastRunStatus || '' });
      if (r.owner && ix['d:' + r.owner]) link(n, ix['d:' + r.owner], 'runs');
    });

    var decisionNodes = [];
    (data.decisions || []).forEach(function (d) {
      var n = add('dc:' + d.id, 'decision', d.title, { rawId: d.id, level: d.level, status: d.status, date: d.date, desk: d.desk, text: d.text });
      decisionNodes.push({ node: n, hay: lower(d.title + ' ' + d.text) });
      desks.forEach(function (desk) { if (deskMatches(desk, d.desk)) link(n, ix['d:' + desk.id], 'decided'); });
    });

    var leadNodes = [];
    (data.outreach || []).forEach(function (l) {
      var n = add('l:' + l.id, 'lead', l.name, { rawId: l.id, stage: l.stage, kind: l.kind, place: l.place });
      leadNodes.push({ node: n, name: lower(l.name) });
      if (ix['d:sales']) link(n, ix['d:sales'], 'works lead');
      decisionNodes.forEach(function (dn) {
        if (l.name && lower(l.name).length >= 4 && dn.hay.indexOf(lower(l.name)) !== -1) link(n, dn.node, 'named in');
      });
    });

    (data.notes || []).forEach(function (nt) {
      var n = add('n:' + nt.id, 'note', nt.title, { rawId: nt.id, source: nt.source, updatedAt: nt.updatedAt });
      var hay = lower(nt.title + ' ' + nt.body);
      (String(nt.title + ' ' + nt.body).match(/FR-\d+/g) || []).forEach(function (fr) { if (ix['r:' + fr]) link(n, ix['r:' + fr], 'mentions'); });
      desks.forEach(function (d) { if (d.name && hay.indexOf(lower(d.name)) !== -1) link(n, ix['d:' + d.id], 'mentions'); });
      decisionNodes.forEach(function (dn) {
        var t = lower(dn.node.label);
        if (t.length >= 8 && hay.indexOf(t) !== -1) link(n, dn.node, 'mentions');
      });
      leadNodes.forEach(function (ln) { if (ln.name.length >= 4 && hay.indexOf(ln.name) !== -1) link(n, ln.node, 'mentions'); });
    });

    // Notes from the vault pack carry links[] (ids of other notes) and a desk id (docs/os/SCHEMA.md): those are real
    // relations, so they become edges. A link only exists when both ends are nodes.
    (data.notes || []).forEach(function (nt) {
      var from = ix['n:' + nt.id];
      if (!from) return;
      (nt.links || []).forEach(function (id) { if (ix['n:' + id]) link(from, ix['n:' + id], 'links to'); });
      if (nt.desk && ix['d:' + nt.desk]) link(from, ix['d:' + nt.desk], 'owned by');
    });

    var counts = {};
    ORDER.forEach(function (t) { counts[t] = 0; });
    nodes.forEach(function (n) { counts[n.t]++; });

    var parts = ['desk registry'];
    if (data.routines) parts.push('routines');
    if (data.notes) parts.push('notes store');
    if (data.decisions) parts.push('decision log');
    if (data.outreach) parts.push('outreach board');
    if (data.packBuiltAt) parts.push('data pack ' + data.packBuiltAt);
    else if (counts.skill || counts.rule) parts.push('desk skills and rules');

    return { nodes: nodes, links: links, ix: ix, counts: counts, source: parts.join(', '), laid: false };
  }

  // ---- physics (ported from the prototype) ------------------------------------
  function radius(n) {
    return n.t === 'desk' ? 7 + Math.min(5, n.deg * 0.25) : 3.2 + Math.min(2.5, n.deg * 0.4);
  }

  function neighbours(g, n) {
    var set = [n];
    g.links.forEach(function (l) {
      if (l.s === n) set.push(l.t);
      if (l.t === n) set.push(l.s);
    });
    return set;
  }

  // off: { type: true } hides a type; hidden nodes stop repelling once the layout exists.
  function step(g, alpha, off, drag) {
    var N = g.nodes.filter(function (n) { return !off[n.t] || !g.laid; });
    for (var i = 0; i < N.length; i++) {
      for (var j = i + 1; j < N.length; j++) {
        var p = N[i], q = N[j];
        var dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy || 1;
        if (d2 > 90000) continue;
        var f = (p.t === 'desk' && q.t === 'desk' ? 2600 : 620) / d2, d = Math.sqrt(d2);
        dx /= d; dy /= d;
        p.vx -= dx * f; p.vy -= dy * f;
        q.vx += dx * f; q.vy += dy * f;
      }
    }
    g.links.forEach(function (l) {
      var dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.hypot(dx, dy) || 1;
      var want = (l.s.t === 'desk' || l.t.t === 'desk') ? 62 : 90, f = (d - want) * 0.02;
      l.s.vx += dx / d * f; l.s.vy += dy / d * f;
      l.t.vx -= dx / d * f; l.t.vy -= dy / d * f;
    });
    g.nodes.forEach(function (n) {
      n.vx -= n.x * 0.0015; n.vy -= n.y * 0.0015;
      if (drag && n === drag) return;
      n.x += n.vx * alpha; n.y += n.vy * alpha;
      n.vx *= 0.82; n.vy *= 0.82;
    });
  }

  // Seeded start positions, then about 320 pre-steps so the first frame is already settled.
  function layout(g, seed) {
    if (g.laid) return;
    var s = seed || 7;
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    var desks = g.nodes.filter(function (n) { return n.t === 'desk'; });
    desks.forEach(function (n, i) {
      var a = i / desks.length * Math.PI * 2;
      n.x = Math.cos(a) * 170; n.y = Math.sin(a) * 130;
    });
    g.nodes.forEach(function (n) {
      if (n.t === 'desk') return;
      var anchor = null;
      for (var k = 0; k < g.links.length && !anchor; k++) {
        var l = g.links[k];
        if (l.s === n && l.t.t === 'desk') anchor = l.t;
        else if (l.t === n && l.s.t === 'desk') anchor = l.s;
      }
      var o = anchor || { x: 0, y: 0 };
      var spread = anchor ? 120 : 360;
      n.x = o.x + (rnd() - 0.5) * spread;
      n.y = o.y + (rnd() - 0.5) * spread;
    });
    for (var i = 0; i < 320; i++) step(g, 1, {}, null);
    g.laid = true;
  }

  OS.brain = { TYPES: TYPES, ORDER: ORDER, build: build, step: step, layout: layout, radius: radius, neighbours: neighbours, deskMatches: deskMatches };
})();
