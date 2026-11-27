/* LAVAALL OS Visual cortex: a radial map of everything the OS remembers. Each memory source gets a sector sized by
   its real count, filled with one dot per item (up to a cap). Counts come only from OS.data and saved memories:
   no source, no sector. A side panel lists the sources with on/off switches (remembered per browser). */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var CAP = 160;
  var SOURCES = [
    { id: 'notes', label: 'Notes', color: '#E2B97A', count: function (d) { return (d.notes || []).length; } },
    { id: 'decisions', label: 'Decisions', color: '#8B7BFF', count: function (d) { return (d.decisions || []).length; } },
    { id: 'saved', label: 'Saved', color: '#00C2FF', count: function (d, s) { return s ? s.memories.filter(function (m) { return m.tags.indexOf('recap') === -1; }).length : 0; } },
    { id: 'recaps', label: 'Recaps', color: '#FFE03D', count: function (d, s) { return ((d.recap && d.recap.entries) || []).length + (s ? s.memories.filter(function (m) { return m.tags.indexOf('recap') !== -1; }).length : 0); } },
    { id: 'build', label: 'Build', color: '#00F5A0', count: function (d) { return ((d.build && d.build.items) || []).length; } },
    { id: 'goals', label: 'Goals', color: '#FF8A3C', count: function (d, s) { return s ? s.goals.length : 0; } },
    { id: 'desks', label: 'Desks', color: '#FF5C5C', count: function (d) { return (d.desks || []).length; } },
    { id: 'skills', label: 'Skills', color: '#5BD1FF', count: function (d) { return (d.skills || []).length; } },
    { id: 'routines', label: 'Routines', color: '#C9B8FF', count: function (d) { return (d.routines || []).length; } },
    { id: 'chats', label: 'Chats', color: '#7BE0C8', count: function (d) { return ((d.harness && d.harness.projects) || []).length; } }
  ];
  var off = {};
  try { (JSON.parse(localStorage.getItem('os-cortex-off') || '[]') || []).forEach(function (id) { off[id] = true; }); } catch (e) { /* per browser */ }

  function rng(seed) { var x = seed >>> 0 || 1; return function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

  function counts() {
    var d = OS.data || {}, s = OS.saved && OS.saved.get ? OS.saved.get() : null;
    return SOURCES.map(function (src) { var n = 0; try { n = Number(src.count(d, s)) || 0; } catch (e) { n = 0; } return { src: src, n: n }; });
  }
  OS.cortexCounts = counts;

  function svg(rows) {
    var C = 260, R0 = 62, R1 = 206;
    var live = rows.filter(function (r) { return r.n > 0 && !off[r.src.id]; });
    var total = live.reduce(function (a, r) { return a + r.n; }, 0);
    var weights = live.map(function (r) { return Math.sqrt(r.n) + 1; });
    var sum = weights.reduce(function (a, b) { return a + b; }, 0) || 1;
    var gap = live.length > 1 ? 0.05 : 0, usable = Math.PI * 2 - gap * live.length;
    var a = -Math.PI / 2, dots = '', labels = '', arcs = '';
    live.forEach(function (r, i) {
      var span = usable * weights[i] / sum, rand = rng(1013904223 * (SOURCES.indexOf(r.src) + 7));
      var n = Math.min(r.n, CAP);
      for (var k = 0; k < n; k++) {
        var t = a + rand() * span, rad = R0 + 8 + Math.pow(rand(), 0.75) * (R1 - R0 - 8), sz = 1.3 + rand() * 1.6;
        dots += '<circle cx="' + (C + Math.cos(t) * rad).toFixed(1) + '" cy="' + (C + Math.sin(t) * rad).toFixed(1) + '" r="' + sz.toFixed(2) + '" fill="' + r.src.color + '" opacity="' + (0.45 + rand() * 0.55).toFixed(2) + '"/>';
      }
      var x1 = C + Math.cos(a) * (R1 + 10), y1 = C + Math.sin(a) * (R1 + 10), x2 = C + Math.cos(a + span) * (R1 + 10), y2 = C + Math.sin(a + span) * (R1 + 10);
      arcs += '<path d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A' + (R1 + 10) + ' ' + (R1 + 10) + ' 0 ' + (span > Math.PI ? 1 : 0) + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '" stroke="' + r.src.color + '" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>';
      var mid = a + span / 2, lx = C + Math.cos(mid) * (R1 + 32), ly = C + Math.sin(mid) * (R1 + 32);
      var anchor = Math.cos(mid) > 0.25 ? 'start' : Math.cos(mid) < -0.25 ? 'end' : 'middle';
      labels += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + anchor + '" class="cx-l"><tspan fill="' + r.src.color + '">●</tspan> ' + esc(r.src.label.toUpperCase()) + ' <tspan class="cx-n">' + r.n + '</tspan></text>';
      a += span + gap;
    });
    var hex = [];
    for (var h = 0; h < 6; h++) { var ang = Math.PI / 6 + h * Math.PI / 3; hex.push((C + Math.cos(ang) * 40).toFixed(1) + ',' + (C + Math.sin(ang) * 40).toFixed(1)); }
    return '<svg class="cx-svg" viewBox="-60 -20 640 560" role="img" aria-label="Visual cortex: ' + total + ' memories across ' + live.length + ' sources">' +
      '<defs><radialGradient id="cxg"><stop offset="0" stop-color="#8B7BFF" stop-opacity=".35"/><stop offset="1" stop-color="#8B7BFF" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="' + C + '" cy="' + C + '" r="' + (R1 + 22) + '" class="cx-ring"/>' +
      '<circle cx="' + C + '" cy="' + C + '" r="' + R0 + '" class="cx-ring in"/>' +
      '<g class="cx-spin">' + dots + '</g>' + arcs +
      '<circle cx="' + C + '" cy="' + C + '" r="58" fill="url(#cxg)"/>' +
      '<polygon points="' + hex.join(' ') + '" class="cx-core"/>' +
      '<text x="' + C + '" y="' + (C - 2) + '" text-anchor="middle" class="cx-c">Memory core</text>' +
      '<text x="' + C + '" y="' + (C + 14) + '" text-anchor="middle" class="cx-cn">' + total + ' items</text>' +
      labels + '</svg>';
  }

  function panel(rows) {
    return '<aside class="cx-src card"><div class="cx-sh"><b>Memory sources</b><span class="note">' + rows.filter(function (r) { return !off[r.src.id]; }).length + ' on</span></div>' +
      rows.map(function (r) {
        var on = !off[r.src.id];
        return '<label class="cx-row"><span class="cx-dot" style="background:' + r.src.color + '"></span><span class="cx-name">' + esc(r.src.label) + '<small>' + (r.n ? r.n + (r.n === 1 ? ' item' : ' items') : 'nothing yet') + '</small></span>' +
          '<input type="checkbox" class="cx-sw" data-cx="' + r.src.id + '"' + (on ? ' checked' : '') + ' aria-label="Show ' + esc(r.src.label) + '"/></label>';
      }).join('') + '</aside>';
  }

  function html() {
    var rows = counts();
    var total = rows.reduce(function (a, r) { return a + r.n; }, 0);
    return '<div class="cx"><section class="card cx-main"><div class="cx-h"><b>Visual cortex</b><span class="pill">Rings</span>' +
      '<span class="note cx-tot">' + total + ' items · ' + rows.filter(function (r) { return r.n; }).length + ' sources</span></div>' + svg(rows) + '</section>' + panel(rows) + '</div>';
  }
  OS.cortexHtml = html;
  OS.cortexPaint = function (root) { var host = root && root.querySelector('#cortex'); if (host) host.innerHTML = html(); };
  OS.cortexMount = function (root) {
    root.addEventListener('change', function (e) {
      var id = e.target && e.target.getAttribute && e.target.getAttribute('data-cx');
      if (!id) return;
      if (e.target.checked) delete off[id]; else off[id] = true;
      try { localStorage.setItem('os-cortex-off', JSON.stringify(Object.keys(off))); } catch (err) { /* per browser */ }
      OS.cortexPaint(root);
    });
  };
})();
