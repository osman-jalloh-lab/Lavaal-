/* LAVAALL OS Brain: the canvas graph view (full) and the Home card (mini). Built in-house, no d3.
   Seeded layout, ~320 pre-steps, then a very slow sinusoidal drift. Pauses when the tab or the view is hidden.
   Resizing clears a canvas bitmap, so every resize redraws immediately (the prototype's graph went blank). */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;
  var B = OS.brain;

  var SINGULAR = { desk: 'Desk', rule: 'Rule', skill: 'Skill', routine: 'Routine', decision: 'Decision', lead: 'Lead', note: 'Note' };

  // One graph per data object. Layout runs once, so Home and Brain show the same picture.
  var cache = { data: null, graph: null };
  function graphFor(data) {
    if (cache.data !== data) {
      cache.data = data;
      cache.graph = B.build(data);
      B.layout(cache.graph, 7);
    }
    return cache.graph;
  }
  OS.brainGraph = graphFor;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    var c = { text: cs.getPropertyValue('--text').trim() || '#E7EEF7', light: document.documentElement.getAttribute('data-theme') === 'light' };
    B.ORDER.forEach(function (t) { c[t] = cs.getPropertyValue(B.TYPES[t].css).trim() || '#888888'; });
    return c;
  }

  // What a tap or click on the canvas does. A mouse click selects (the Open button opens);
  // on touch the first tap selects and highlights, and a second tap on the same node opens it.
  function tapAction(selected, node, pointerType) {
    if (!node) return 'clear';
    if (node !== selected) return 'select';
    return pointerType === 'touch' || pointerType === 'pen' ? 'open' : 'select';
  }
  OS.brainTap = tapAction;

  // ---- engine -----------------------------------------------------------------
  function createEngine(canvas, g, opts) {
    opts = opts || {};
    var mini = !!opts.mini;
    var ctx = canvas.getContext('2d');
    var reduce = false;
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }

    var st = {
      k: 1, tx: 0, ty: 0, W: 0, H: 0, q: '', hov: null, sel: null, drag: null, pan: null, moved: false,
      run: false, t: 0, raf: 0, off: opts.off || {}, destroyed: false, fitted: false, touched: false, frames: 0
    };
    var colors = readColors();
    var onTheme = OS.onTheme;
    OS.onTheme = function (theme) { if (onTheme) onTheme(theme); colors = readColors(); draw(); };

    function visible(n) { return !st.off[n.t]; }
    function match(n) { var q = st.q; return !q || n.label.toLowerCase().indexOf(q) !== -1 || B.TYPES[n.t].label.toLowerCase().indexOf(q) !== -1; }

    function resize() {
      var host = canvas.parentElement;
      var r = host.getBoundingClientRect();
      var w = Math.max(10, Math.round(r.width));
      var h = Math.max(10, Math.round(r.height));
      var dpr = Math.max(1, window.devicePixelRatio || 1);
      if (w === st.W && h === st.H && canvas.width === Math.round(w * dpr)) return false;
      st.W = w; st.H = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      return true;
    }

    function fit() {
      var v = g.nodes.filter(visible);
      if (!v.length) return;
      var a = 1e9, b = 1e9, c = -1e9, d = -1e9;
      v.forEach(function (n) { a = Math.min(a, n.x); b = Math.min(b, n.y); c = Math.max(c, n.x); d = Math.max(d, n.y); });
      var pad = mini ? 18 : 70, top = mini ? 0 : 40;
      var k = Math.min((st.W - pad * 2) / (c - a || 1), (st.H - pad * 2 - top) / (d - b || 1), mini ? 1 : 1.6);
      st.k = Math.min(4, Math.max(0.25, k));
      st.tx = st.W / 2 - (a + c) / 2 * st.k;
      st.ty = (st.H + top) / 2 - (b + d) / 2 * st.k;
      st.fitted = true;
    }

    function draw() {
      if (st.destroyed || !canvas.isConnected) return;
      if (resize() && !st.touched) fit();
      if (!st.W) return;
      var dpr = Math.max(1, window.devicePixelRatio || 1);
      var L = colors.light;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, st.W, st.H);
      ctx.translate(st.tx, st.ty);
      ctx.scale(st.k, st.k);

      var foc = st.hov || st.sel;
      var ns = foc ? B.neighbours(g, foc) : null;
      var inFocus = function (n) { return !ns || ns.indexOf(n) !== -1; };

      g.links.forEach(function (l) {
        if (!visible(l.s) || !visible(l.t)) return;
        var on = foc && (l.s === foc || l.t === foc);
        ctx.strokeStyle = on ? colors[foc.t] : (L ? 'rgba(30,50,80,.16)' : 'rgba(140,170,210,.14)');
        ctx.globalAlpha = foc && !on ? 0.18 : (st.q && !(match(l.s) && match(l.t)) ? 0.18 : 1);
        ctx.lineWidth = (on ? 1.4 : 1) / st.k;
        ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); ctx.stroke();
      });
      ctx.globalAlpha = 1;

      g.nodes.forEach(function (n) {
        if (!visible(n)) return;
        var r = B.radius(n), col = colors[n.t];
        var dim = !inFocus(n) || (st.q && !match(n));
        ctx.globalAlpha = dim ? 0.18 : 1;
        if (!L && !dim) { // radial glow: dark theme only
          var gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.2);
          gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.2, 0, 7); ctx.fill();
        }
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 7); ctx.fill();
        if (!L) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(n.x - r * 0.3, n.y - r * 0.3, r * 0.33, 0, 7); ctx.fill(); }
        if (n === st.sel) {
          ctx.strokeStyle = L ? '#0B1320' : '#fff'; ctx.lineWidth = 1.5 / st.k;
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 3.5 / st.k, 0, 7); ctx.stroke();
        }
        var showLabel = mini ? n.t === 'desk' : (n.t === 'desk' || n === foc || (st.hov && ns && ns.indexOf(n) !== -1 && ns.length < 16) || (st.q && match(n)) || st.k > 1.5);
        if (showLabel) {
          var fs = (mini ? 10 : n.t === 'desk' ? 12 : 11) / st.k;
          ctx.font = (n.t === 'desk' ? 500 : 400) + ' ' + fs + 'px Inter, system-ui, sans-serif';
          ctx.fillStyle = colors.text;
          ctx.globalAlpha = dim ? 0.25 : (n.t === 'desk' || n === foc ? 1 : 0.78);
          var lb = n.label.length > 34 ? n.label.slice(0, 33) + '…' : n.label;
          if (mini) lb = (n.info && n.info.short) || lb.split(/[ ,&]/)[0];
          ctx.textAlign = 'center';
          ctx.fillText(lb, n.x, n.y + r + 12 / st.k);
        }
      });
      ctx.globalAlpha = 1;
      st.frames++;
    }

    function loop() {
      if (!st.run || st.destroyed) return;
      st.t++;
      // Slow sinusoidal drift, very low amplitude.
      for (var i = 0; i < g.nodes.length; i++) {
        var n = g.nodes[i];
        if (n !== st.drag) { n.vx += Math.sin(st.t * 0.004 + i * 1.7) * 0.01; n.vy += Math.cos(st.t * 0.0035 + i * 1.3) * 0.01; }
      }
      B.step(g, 0.22, st.off, st.drag);
      draw();
      st.raf = requestAnimationFrame(loop);
    }
    function start() {
      if (st.destroyed || reduce || st.run) { if (!st.run) draw(); return; }
      st.run = true;
      st.raf = requestAnimationFrame(loop);
    }
    function stop() { st.run = false; cancelAnimationFrame(st.raf); }
    function refresh() { if (!st.run) draw(); }

    // Pause when the tab is hidden; resume when it is shown again.
    function onVisibility() {
      if (st.destroyed) return;
      if (document.hidden) stop(); else start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    // A resize clears the bitmap: redraw in the same task.
    var ro = null;
    // Layout can still be settling at mount, so keep refitting on resize until the user pans or zooms.
    function onResize() { if (st.destroyed) return; var changed = resize(); if (changed && !st.touched) fit(); draw(); }
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(onResize); ro.observe(canvas.parentElement); }
    window.addEventListener('resize', onResize);

    var api = {
      st: st, fit: function () { st.touched = false; fit(); refresh(); }, draw: draw, start: start, stop: stop,
      setQuery: function (v) { st.q = String(v || '').trim().toLowerCase(); refresh(); },
      toggle: function (type) { st.off[type] = !st.off[type]; if (st.sel && st.off[st.sel.t]) st.sel = null; refresh(); return !st.off[type]; },
      select: function (n) { st.sel = n; refresh(); },
      center: function (n) { st.touched = true; st.tx = st.W / 2 - n.x * st.k; st.ty = st.H / 2 - n.y * st.k; refresh(); },
      destroy: function () {
        st.destroyed = true; stop();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('resize', onResize);
        if (ro) ro.disconnect();
        OS.onTheme = onTheme;
      }
    };

    if (mini) { resize(); fit(); draw(); start(); return api; }

    // ---- full-size interaction ------------------------------------------------
    var TAP_SLOP = 6;      // px a finger or mouse may wander and still count as a tap
    var TOUCH_REACH = 14;  // extra px of hit area for touch, nodes are only 3-8 px wide
    var pointers = {};     // active pointers, for pinch
    var pinch = null;

    function world(e) {
      var r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left - st.tx) / st.k, (e.clientY - r.top - st.ty) / st.k];
    }
    function hit(e) {
      var p = world(e), best = null, bd = 1e9;
      var reach = (e.pointerType === 'touch' || e.pointerType === 'pen' ? TOUCH_REACH : 4) / st.k;
      g.nodes.forEach(function (n) {
        if (!visible(n)) return;
        var d = (n.x - p[0]) * (n.x - p[0]) + (n.y - p[1]) * (n.y - p[1]), r = B.radius(n) + reach;
        if (d < r * r && d < bd) { bd = d; best = n; }
      });
      return best;
    }
    function zoomAt(mx, my, k2) {
      k2 = Math.min(4, Math.max(0.25, k2));
      st.tx = mx - (mx - st.tx) * k2 / st.k; st.ty = my - (my - st.ty) * k2 / st.k; st.k = k2; st.touched = true;
    }
    function pinchState() {
      var ids = Object.keys(pointers), a = pointers[ids[0]], b = pointers[ids[1]], r = canvas.getBoundingClientRect();
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
    }

    canvas.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      if (Object.keys(pointers).length === 2) { // second finger: pinch, and never a tap
        st.drag = null; st.pan = null; st.moved = true;
        pinch = { start: pinchState(), k: st.k };
        return;
      }
      st.moved = false;
      st.down = [e.clientX, e.clientY];
      var h = hit(e);
      if (h) st.drag = h; else st.pan = [e.clientX, e.clientY, st.tx, st.ty];
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }
      if (pinch && Object.keys(pointers).length >= 2) {
        var now = pinchState();
        zoomAt(now.mx, now.my, pinch.k * now.d / pinch.start.d);
        st.tx += now.mx - pinch.start.mx; st.ty += now.my - pinch.start.my; // two fingers also pan
        pinch.start.mx = now.mx; pinch.start.my = now.my;
        refresh();
        return;
      }
      if (st.drag || st.pan) {
        if (!st.moved && Math.hypot(e.clientX - st.down[0], e.clientY - st.down[1]) <= TAP_SLOP) return; // still a tap
        st.moved = true; st.touched = true;
        if (st.drag) { var p = world(e); st.drag.x = p[0]; st.drag.y = p[1]; st.drag.vx = st.drag.vy = 0; }
        else { st.tx = st.pan[2] + e.clientX - st.pan[0]; st.ty = st.pan[3] + e.clientY - st.pan[1]; }
        refresh();
        return;
      }
      if (e.pointerType === 'touch') return; // no hover on touch
      var h = hit(e);
      if (h !== st.hov) { st.hov = h; refresh(); }
      canvas.style.cursor = h ? 'pointer' : 'grab';
    });
    function release(e) {
      var wasPinch = !!pinch;
      delete pointers[e.pointerId];
      if (pinch) { if (Object.keys(pointers).length < 2) pinch = null; st.drag = null; st.pan = null; refresh(); return; }
      var node = st.drag;
      if (!st.moved && !wasPinch) {
        var action = tapAction(st.sel, node, e.pointerType);
        if (action === 'open') { if (opts.onOpen) opts.onOpen(node); }
        else if (action === 'select') { st.sel = node; if (opts.onSelect) opts.onSelect(node, e.pointerType); }
        else { st.sel = null; if (opts.onSelect) opts.onSelect(null, e.pointerType); }
      }
      st.drag = null; st.pan = null; canvas.style.cursor = 'grab'; refresh();
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; pinch = null; st.drag = null; st.pan = null; refresh(); });
    canvas.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch' && st.hov) { st.hov = null; refresh(); } });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, st.k * Math.exp(-e.deltaY * 0.0015));
      refresh();
    }, { passive: false });

    resize(); fit(); draw(); start();
    return api;
  }

  // ---- side panel -------------------------------------------------------------
  function target(n, g) {
    if (n.t === 'desk') return ['desks', n.info.deskId];
    if (n.t === 'decision') return ['decisions', n.info.rawId];
    if (n.t === 'routine') return ['routines', ''];
    if (n.t === 'note') return ['notes', n.info.rawId];
    if (n.t === 'lead') return ['outreach', ''];
    for (var i = 0; i < g.links.length; i++) { // rule or skill: open the desk that owns it
      var l = g.links[i], o = l.s === n ? l.t : l.t === n ? l.s : null;
      if (o && o.t === 'desk') return ['desks', o.info.deskId];
    }
    return null;
  }

  function infoLines(n) {
    var i = n.info, out = [];
    if (n.t === 'desk' && i.now) out.push('Now: ' + i.now);
    if (n.t === 'rule' && i.text) out.push(i.text);
    if (n.t === 'routine') out.push('Last run: ' + (i.lastRun || 'never') + (i.status ? ' · ' + String(i.status).replace(/_/g, ' ') : ''));
    if (n.t === 'decision') out.push([i.level, i.status, OS.fmtLongDate(i.date), i.desk].filter(Boolean).join(' · '));
    if (n.t === 'lead') out.push([i.stage, i.kind, i.place].filter(Boolean).join(' · '));
    if (n.t === 'note' && (i.source || i.updatedAt)) out.push([i.source, OS.fmtDate(i.updatedAt)].filter(Boolean).join(' · '));
    return out.filter(Boolean);
  }

  function sideEmpty(g) {
    var rows = B.ORDER.map(function (t) {
      return '<div class="bl"><i class="dotc" style="background:var(' + B.TYPES[t].css + ')"></i><span>' + esc(B.TYPES[t].label) + '</span><small class="num">' + g.counts[t] + '</small></div>';
    }).join('');
    return '<h3>Select a node</h3><p>Click a node to see what it links to. Hover to highlight its neighbours.</p>' +
      '<div class="lbl">Nodes by type</div>' + rows +
      (g.links.length ? '' : '<p class="note">No links yet: desks, rules and skills link once SOUL data is loaded, and routines link to desks once routines record an owner.</p>');
  }

  function sideNode(n, g, off) {
    var lines = infoLines(n).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('');
    var nb = g.links.filter(function (l) { return l.s === n || l.t === n; })
      .map(function (l) { return [l.s === n ? l.t : l.s, l.why]; })
      .filter(function (p) { return !off[p[0].t]; });
    var list = nb.map(function (p) {
      return '<div class="bl" tabindex="0" data-focus="' + esc(p[0].id) + '"><i class="dotc" style="background:var(' + B.TYPES[p[0].t].css + ')"></i><span>' + esc(p[0].label) + '</span><small>' + esc(p[1]) + '</small></div>';
    }).join('');
    var tg = target(n, g);
    var open = tg ? '<div class="bopen"><button class="btn" type="button" data-go="' + esc(tg[0] + (tg[1] ? '/' + tg[1] : '')) + '">Open ' + esc(SINGULAR[n.t].toLowerCase()) + '</button></div>' : '';
    return '<div class="brow"><span class="pill"><i class="dotc" style="background:var(' + B.TYPES[n.t].css + ')"></i>' + esc(SINGULAR[n.t]) + '</span>' +
      '<button class="ib" type="button" id="bclear" aria-label="Clear selection">' + icon('x') + '</button></div>' +
      '<h3>' + esc(n.label) + '</h3>' + lines +
      '<div class="lbl">Linked · ' + nb.length + '</div>' + (list || '<p class="note">Nothing links to this node yet.</p>') + open;
  }

  // ---- full view --------------------------------------------------------------
  var engine = null;

  OS.registerView('brain', {
    render: function (ctx) {
      var g = graphFor(ctx.data);
      var head = '<div class="ph"><div><h1>Brain</h1><p>How desks, rules, skills, routines, decisions, leads and notes connect. Drag, scroll to zoom, click a node.</p></div>' +
        '<div class="r"><button class="btn" type="button" id="bfit">' + icon('fit') + 'Fit</button></div></div>';
      if (!g.nodes.length) return head + '<div class="card">' + OS.empty('The Brain has no nodes yet.', 'desks') + '</div>';
      var chips = B.ORDER.map(function (t) {
        return '<button class="tchip" type="button" data-t="' + t + '" aria-pressed="true"><i style="background:var(' + B.TYPES[t].css + ')"></i>' + esc(B.TYPES[t].label) + ' <b>' + g.counts[t] + '</b></button>';
      }).join('');
      return head + '<div class="card brain"><div class="bstage"><div class="btool"><input id="bq" type="search" placeholder="Search nodes..." autocomplete="off" aria-label="Search nodes"/>' + chips + '</div>' +
        '<canvas id="bc" role="img" aria-label="Graph of desks, rules, skills, routines, decisions, leads and notes"></canvas><div class="bhint" id="bhint" aria-live="polite"></div><div class="bleg" id="bleg"></div></div>' +
        '<aside class="bside" id="bside"></aside></div>';
    },
    mount: function (root, ctx) {
      var g = graphFor(ctx.data);
      var canvas = root.querySelector('#bc');
      if (!canvas) return;
      var side = root.querySelector('#bside');
      var off = {};

      function legend() {
        var vn = g.nodes.filter(function (n) { return !off[n.t]; });
        var vl = g.links.filter(function (l) { return !off[l.s.t] && !off[l.t.t]; });
        root.querySelector('#bleg').textContent = vn.length + ' nodes · ' + vl.length + ' links · Source: ' + g.source;
      }
      function showSide() {
        var n = engine && engine.st.sel;
        side.innerHTML = n ? sideNode(n, g, off) : sideEmpty(g);
      }
      function setHash(id) {
        try { history.replaceState(null, '', '#brain' + (id ? '/' + encodeURIComponent(id).replace(/%3A/gi, ':') : '')); } catch (e) { /* ignore */ }
      }
      var hint = root.querySelector('#bhint');
      function showHint(n, pointerType) {
        if (!hint) return;
        var touch = pointerType === 'touch' || pointerType === 'pen';
        if (!n || !touch) { hint.textContent = ''; hint.classList.remove('on'); return; }
        hint.textContent = target(n, g) ? 'Tap again to open ' + n.label : 'Nothing to open for this node';
        hint.classList.add('on');
      }
      function choose(n, pointerType) { engine.select(n); showSide(); setHash(n ? n.id : ''); showHint(n, pointerType); }
      function open(n) {
        var tg = target(n, g);
        if (tg) OS.go(tg[0], tg[1]);
      }

      engine = createEngine(canvas, g, { off: off, onSelect: choose, onOpen: open });
      OS.brainEngine = engine;

      // Deep link first, so the side panel is laid out before the next measure.
      var deep = ctx.sub && g.ix[ctx.sub];
      if (deep) {
        if (off[deep.t]) { off[deep.t] = false; }
        engine.select(deep);
      }
      showSide();
      legend();
      engine.fit();

      root.querySelector('#bfit').addEventListener('click', function () { engine.fit(); });
      root.querySelector('#bq').addEventListener('input', function (e) { engine.setQuery(e.target.value); });
      Array.prototype.forEach.call(root.querySelectorAll('.tchip'), function (chip) {
        chip.addEventListener('click', function () {
          var on = engine.toggle(chip.getAttribute('data-t'));
          chip.classList.toggle('off', !on);
          chip.setAttribute('aria-pressed', on ? 'true' : 'false');
          legend(); showSide();
        });
      });
      side.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('#bclear')) { choose(null); return; }
        var row = e.target.closest ? e.target.closest('[data-focus]') : null;
        if (!row) return;
        var n = g.ix[row.getAttribute('data-focus')];
        if (!n) return;
        choose(n); engine.center(n);
      });
      side.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var row = e.target.closest ? e.target.closest('[data-focus]') : null;
        var n = row && g.ix[row.getAttribute('data-focus')];
        if (n) { choose(n); engine.center(n); }
      });
    },
    unmount: function () {
      if (engine) { engine.destroy(); engine = null; OS.brainEngine = null; }
    }
  });

  // ---- Home card (mini mode) ----------------------------------------------------
  OS.brainMini = function (root, data) {
    var canvas = root.querySelector('#bmini-c');
    if (!canvas) return null;
    var g = graphFor(data);
    var stat = root.querySelector('#bmini-stat');
    if (stat) stat.textContent = g.nodes.length + ' nodes · ' + g.links.length + ' links';
    var eng = createEngine(canvas, g, { mini: true });
    canvas.parentElement.addEventListener('click', function () { OS.go('brain'); });
    return eng;
  };
})();
