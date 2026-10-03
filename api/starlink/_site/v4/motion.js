(function () {
  "use strict";

  var reduce = matchMedia("(prefers-reduced-motion: reduce)");
  var narrow = matchMedia("(max-width: 767px)");

  // ---------------- Hero: entrance from darkness + light parallax ----------------
  requestAnimationFrame(function () { requestAnimationFrame(function () { document.documentElement.classList.add("is-ready"); }); });


  // ---------------- Unboxing: one scene, one camera ----------------
  var section = document.querySelector(".unbox");
  var track = document.getElementById("unboxTrack");
  var world = document.getElementById("world");
  var parts = [].slice.call(world.querySelectorAll(".part"));
  var intro = document.getElementById("unboxIntro");
  var statement = document.getElementById("unboxStatement");
  var finalTxt = document.getElementById("unboxFinal");
  var label = document.getElementById("unboxLabel");
  var nameEl = document.getElementById("unboxName");
  var countEl = document.getElementById("unboxCount");
  var tagEl = document.getElementById("unboxTag");
  var bar = document.getElementById("unboxBar");

  var U = 720; // world unit = part box size in px (scene is scaled DOWN for crisp rendering)
  var NAMES = ["Starlink box", "Dish", "Kickstand", "Router", "Cable", "Power supply",
               "Mounting", "Power protection + UPS", "Mesh Wi-Fi", "Installation"];
  var N = parts.length;
  // natural image sizes (for converting the hero's vw/vh layout into part transforms)
  var NAT = [[644, 800], [796, 596], [596, 796], [532, 800], [800, 800], [796, 596], [532, 800], [644, 800], [800, 800], [720, 720]];
  // Hero composition — MUST match .art--* in styles.css (left vw, top vh, width vw)
  var HERO_DESK = {
    0: { l: 41, t: 20, w: 13 }, 1: { l: 50, t: 15, w: 34 }, 2: { l: 55, t: 45, w: 10 },
    3: { l: 74, t: 49, w: 11 }, 4: { l: 58, t: 60, w: 14 }, 5: { l: 43, t: 57, w: 11 }
  };
  var HERO_TAB = {
    0: { l: 38, t: 22, w: 16 }, 1: { l: 46, t: 17, w: 42 }, 2: { l: 54, t: 47, w: 12 },
    3: { l: 76, t: 50, w: 13 }, 4: { l: 58, t: 62, w: 17 }, 5: { l: 40, t: 60, w: 13 }
  };
  var heroCopy = document.querySelector(".hero__copy");
  var heroPanel = document.getElementById("stagePanel") || document.querySelector(".hero__panel");
  var nav = document.querySelector(".nav");
  var artDish = document.querySelector(".art--dish"), artRouter = document.querySelector(".art--router"), artCable = document.querySelector(".art--cable");
  var howAnchor = document.getElementById("how");

  // Layout A: an exploded view. The dish stays the dominant object; the rest of the Starlink kit
  // spreads around it. LAVAALL additions form a second cluster to the right (camera pans to it).
  var A = [
    { x: -1.95, y: -0.38, s: 0.95 },  // 0 box
    { x: 0,     y: 0,     s: 1.6  },  // 1 dish
    { x: -1.55, y: 0.78,  s: 0.72 },  // 2 kickstand
    { x: 1.6,   y: 0.32,  s: 0.88 },  // 3 router
    { x: 0.55,  y: 1.08,  s: 0.82 },  // 4 cable
    { x: 2.2,   y: -0.6,  s: 0.72 },  // 5 power
    // LAVAALL additions sit BELOW the kit, not beside it: the camera travels
    // down the page the way the reader scrolls, never sideways.
    { x: -1.5,  y: 2.95,  s: 1.15 },  // 6 mount
    { x: 1.35,  y: 3.35,  s: 0.95 },  // 7 ups
    { x: 0.05,  y: 2.6,   s: 0.85 },  // 8 mesh
    { x: 1.9,   y: 2.5,   s: 1.5  }   // 9 installation
  ];
  // The assembled system lands further down again, so the final move is also a descent.
  var B_DY = 5.9;
  // Layout B: the complete system, assembled around the installed dish
  var B = [];
  // depth composition: installed dish dominant, add-ons in front at real size (lower = closer)
  B[9] = { x: 0.1,   y: -0.28, s: 1.95 };  // installed dish on pole
  B[3] = { x: -1.2,  y: 0.34,  s: 0.95 };  // router
  B[8] = { x: -2.05, y: 0.62,  s: 0.82 };  // mesh
  B[4] = { x: -0.62, y: 0.9,   s: 0.74 };  // cable (front)
  B[7] = { x: 1.45,  y: 0.4,   s: 1.0  };  // ups
  B[5] = { x: 2.0,   y: 0.86,  s: 0.68 };  // power
  B[0] = { x: 2.6,   y: -0.4,  s: 0.8  };  // box (fades out — it's empty now)
  B[1] = { x: 0.1,   y: -0.28, s: 1.95 };  // dish -> merges into install
  B[2] = { x: -1.2,  y: 0.34,  s: 0.6  };  // kickstand fades (pole replaces it)
  B[6] = { x: 0.1,   y: -0.28, s: 1.95 };  // pole -> merges into install
  var HIDE_IN_B = { 0: 1, 1: 1, 2: 1, 6: 1 };

  // Layout Z: everything folded inside the box. Keyframes lerp toward this with
  // `tuck`, so the kit genuinely comes OUT of the carton instead of cross-fading in.
  var Z = { x: A[0].x + 0.05, y: A[0].y - 0.1, s: 0.12 };
  // Order the kit leaves the carton: dish first, then the rest.
  var ORDER = { 1: 0, 2: 2, 3: 1, 4: 3, 5: 4 };

  // Which piece feeds which, drawn as the system assembles. This is the
  // "how it connects" diagram: dish -> router -> coverage, mains -> UPS -> router.
  var LINKS = [
    { a: 9, b: 3, label: "Cable" },
    { a: 3, b: 8, label: "Mesh" },
    { a: 7, b: 5, label: "Backup" },
    { a: 5, b: 3, label: "Power" }
  ];
  // Which side each callout sits on, so leaders fan outward instead of crossing.
  // Index 0 (the box) must sit on the RIGHT: it is on screen while the headline
  // occupies the left column, and a left-side chip lands on the type.
  var LAB_SIDE = [1, 1, -1, 1, -1, 1, -1, 1, -1, 1];
  var labs = [];
  var labHost = document.getElementById("plabs");
  if (labHost) {
    [].forEach.call(labHost.querySelectorAll(".plab"), function (el) {
      labs[+el.getAttribute("data-p")] = el;
    });
  }

  var wires = document.getElementById("wires");
  var wctx = wires && wires.getContext ? wires.getContext("2d") : null;
  var SEEN = [];  // per-part screen centre + on-screen size, filled each frame

  var kitCx = 0.1;

  // Keyframes: camera rect (units) + per-part opacity + overlays
  function op(fn) { return parts.map(function (_, i) { return fn(i); }); }
  var K = [];
  var KIT_CAM = { x: kitCx, y: -0.22, w: 5.0, h: 2.45 };
  // Offset left of the box so the box renders RIGHT of centre, clear of the
  // headline column on the left.
  var BOX_CAM  = { x: A[0].x - 0.46, y: A[0].y, w: 1.7, h: 0.9 };
  var LAVA_CAM = { x: 0.2, y: 2.95, w: 5.0, h: 2.45 };
  var SYS_CAM  = { x: -0.45, y: -0.12 + B_DY, w: 4.9, h: 2.15 };

  // One continuous dive: in to the box, it opens, the kit unpacks, the system assembles.
  // No per-part tour — every product is seen once, in motion, never twice.
  // 1 — hand off from the hero composition
  K.push({ cam: KIT_CAM, op: op(function (i) { return i < 6 ? 1 : 0; }), mix: 0, tuck: 0, hero: 1, focus: -1 });
  // 2 — dive: camera pushes into the closed box, kit folded inside it
  K.push({ cam: BOX_CAM, op: op(function (i) { return i === 0 ? 1 : 0; }), mix: 0, tuck: 1, intro: 1, focus: 0 });
  // 3 — it opens. CAMERA HOLDS on the box so the reveal is the only motion:
  //     the kit fades up still packed inside, at 14% scale.
  K.push({ cam: BOX_CAM, op: op(function (i) { return i < 6 ? 1 : 0; }), mix: 0, tuck: 1, focus: 0 });
  // 4 — the dish comes out first, alone
  K.push({ cam: { x: A[0].x + 0.7, y: A[0].y + 0.05, w: 2.8, h: 1.45 }, op: op(function (i) { return i < 6 ? 1 : 0; }), mix: 0, tuck: 0.62, focus: 1 });
  // 5 — the rest follow it out, one at a time, camera opening just enough to hold them
  K.push({ cam: { x: A[0].x + 1.6, y: A[0].y + 0.12, w: 4.2, h: 2.17 }, op: op(function (i) { return i < 6 ? 1 : 0; }), mix: 0, tuck: 0.28, focus: -1 });
  // 5 — the kit, open and complete; now the camera opens out to hold it
  K.push({ cam: KIT_CAM, op: op(function (i) { return i < 6 ? 1 : 0; }), mix: 0, tuck: 0, focus: -1 });
  // 6 — the statement. Kit stays legible behind it rather than dimming to nothing.
  K.push({ cam: { x: 0.1, y: 1.5, w: 6.4, h: 2.4 }, op: op(function (i) { return i < 6 ? 0.3 : 0; }), mix: 0, tuck: 0, statement: 1, focus: -1 });
  // 7 — what LAVAALL adds, as one group rather than four separate stops
  K.push({ cam: LAVA_CAM, op: op(function (i) { return i >= 6 ? 1 : 0.08; }), mix: 0, tuck: 0, focus: -1 });
  // 8 — it all connects
  K.push({ cam: SYS_CAM, op: op(function (i) { return HIDE_IN_B[i] ? 0 : 1; }), mix: 1, tuck: 0, fin: 1, focus: -1 });
  // 9 — settle, a slow push in on the finished system
  K.push({ cam: { x: -0.4, y: -0.1 + B_DY, w: 4.35, h: 1.9 }, op: op(function (i) { return HIDE_IN_B[i] ? 0 : 1; }), mix: 1, tuck: 0, fin: 1, focus: -1 });

  var SEG = K.length - 1;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  var vw = 0, vh = 0, active = false, lastFocus = -2;

  function measure() { vw = innerWidth; vh = innerHeight; }

  // A callout rides beside each part while that part is separating. They retire
  // once everything converges, so the assembled system isn't buried in chrome.
  var PREV_Z = [], PREV_V = [], PREV_LV = [];
  // Chips must not paint until the webfont has settled: showing them first and
  // letting the font swap resize them is a ~0.6 layout shift all by itself.
  var fontsReady = !(document.fonts && document.fonts.ready);
  if (!fontsReady) document.fonts.ready.then(function () { fontsReady = true; });
  var LAB_POS = [];
  var LAB_SIZE = [];
  function measureLabels() {
    for (var i = 0; i < labs.length; i++) {
      if (!labs[i]) continue;
      LAB_SIZE[i] = { w: labs[i].offsetWidth || 150, h: labs[i].offsetHeight || 42 };
    }
  }
  function placeLabels(mix, copyOn, stmt) {
    // The statement is a centred, full-bleed moment — a side guard can't dodge it,
    // so callouts retire while it is on screen instead of landing on the type.
    var fade = (1 - clamp((mix - 0.1) / 0.45, 0, 1)) * (1 - clamp(stmt * 4, 0, 1));
    // While an overlay headline is on screen it owns the left column; keep chips
    // out of it rather than letting them land on the type.
    var guard = copyOn ? vw * 0.47 : 12;
    var placed = [];
    for (var i = 0; i < labs.length; i++) {
      var el = labs[i], p = SEEN[i];
      if (!el) continue;
      if (!fontsReady || !p || p.o < 0.35 || fade <= 0.02) {
        if (PREV_LV[i] !== false) { el.style.opacity = "0"; el.style.visibility = "hidden"; PREV_LV[i] = false; }
        LAB_POS[i] = null; continue;
      }
      var side = LAB_SIDE[i] || 1;
      // Cached: reading offsetWidth here forced a synchronous layout on every
      // label, every frame, interleaved with writes — the main source of jank.
      var m = LAB_SIZE[i] || { w: 150, h: 42 };
      var w = m.w, h = m.h;
      var lx = p.x + side * (p.r * 0.72 + 46) - (side < 0 ? w : 0);
      var ly = p.y - p.r * 0.5 - h * 0.5;
      lx = clamp(lx, guard, Math.max(guard, vw - w - 12));
      ly = clamp(ly, 86, vh - h - 24);
      placed.push({ i: i, el: el, p: p, side: side, w: w, h: h, x: lx, y: ly,
                    o: clamp((p.o - 0.35) / 0.45, 0, 1) * fade });
    }

    // Chips were landing on top of each other and clipping their own text.
    // Resolve top-down: anything overlapping a already-placed chip slides below it.
    placed.sort(function (a, b) { return a.y - b.y; });
    for (var n = 0; n < placed.length; n++) {
      for (var m = 0; m < n; m++) {
        var a2 = placed[n], b2 = placed[m];
        var overlapX = a2.x < b2.x + b2.w + 10 && b2.x < a2.x + a2.w + 10;
        var overlapY = a2.y < b2.y + b2.h + 8 && b2.y < a2.y + a2.h + 8;
        if (overlapX && overlapY) a2.y = b2.y + b2.h + 10;
      }
      placed[n].y = clamp(placed[n].y, 86, vh - placed[n].h - 16);
    }

    for (var q = 0; q < placed.length; q++) {
      var L2 = placed[q];
      L2.el.style.transform = "translate(" + L2.x.toFixed(1) + "px," + L2.y.toFixed(1) + "px)";
      L2.el.style.opacity = L2.o.toFixed(3);
      if (PREV_LV[L2.i] !== true) { L2.el.style.visibility = "visible"; PREV_LV[L2.i] = true; }
      LAB_POS[L2.i] = L2.o > 0.05
        ? { x: L2.side < 0 ? L2.x + L2.w : L2.x, y: L2.y + L2.h / 2,
            px: L2.p.x - L2.side * L2.p.r * 0.45, py: L2.p.y, o: L2.o }
        : null;
    }
  }

  // Links are drawn only once the parts have converged, and draw themselves on
  // so the connection reads as being made rather than simply being there.
  function drawWires(mix) {
    // vw/vh are 0 until measure() runs; sizing the canvas to 0px collapses it
    // and registers as a large layout shift.
    if (!wctx || !vw || !vh) return;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    if (wires.width !== Math.round(vw * dpr) || wires.height !== Math.round(vh * dpr)) {
      wires.width = Math.round(vw * dpr); wires.height = Math.round(vh * dpr);
      wires.style.width = vw + "px"; wires.style.height = vh + "px";
    }
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wctx.clearRect(0, 0, vw, vh);

    // Leader lines from each callout chip back to its part.
    wctx.setLineDash([4, 5]);
    wctx.lineWidth = 1.25;
    for (var L = 0; L < LAB_POS.length; L++) {
      var lp = LAB_POS[L];
      if (!lp) continue;
      wctx.strokeStyle = "rgba(20,20,15," + (0.5 * lp.o).toFixed(3) + ")";
      wctx.beginPath();
      wctx.moveTo(lp.x, lp.y);
      wctx.lineTo(lp.px, lp.py);
      wctx.stroke();
      wctx.setLineDash([]);
      wctx.fillStyle = "rgba(20,20,15," + (0.75 * lp.o).toFixed(3) + ")";
      wctx.beginPath(); wctx.arc(lp.px, lp.py, 3, 0, Math.PI * 2); wctx.fill();
      wctx.setLineDash([4, 5]);
    }
    wctx.setLineDash([]);

    var on = clamp((mix - 0.45) / 0.5, 0, 1);
    if (on <= 0) return;

    wctx.lineCap = "round";
    for (var n = 0; n < LINKS.length; n++) {
      var L = LINKS[n], p = SEEN[L.a], q = SEEN[L.b];
      if (!p || !q || p.o < 0.1 || q.o < 0.1) continue;
      // Stagger each link so they connect in sequence, not all at once.
      var t = clamp(on * LINKS.length - n, 0, 1);
      t = t * t * (3 - 2 * t);
      if (t <= 0) continue;

      var mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2 + Math.min(90, Math.abs(q.x - p.x) * 0.22);
      wctx.strokeStyle = "rgba(46,45,41," + (0.5 * t).toFixed(3) + ")";
      wctx.lineWidth = 1.5;
      wctx.setLineDash([5, 7]);
      wctx.lineDashOffset = -performance.now() * 0.02;
      wctx.beginPath();
      wctx.moveTo(p.x, p.y);
      // Partial quadratic: de Casteljau at t so the line grows toward its target.
      var ex = lerp(lerp(p.x, mx, t), lerp(mx, q.x, t), t);
      var ey = lerp(lerp(p.y, my, t), lerp(my, q.y, t), t);
      wctx.quadraticCurveTo(lerp(p.x, mx, t), lerp(p.y, my, t), ex, ey);
      wctx.stroke();
      wctx.setLineDash([]);

      if (t > 0.97) {
        wctx.fillStyle = "rgba(190,255,80,0.95)";
        wctx.beginPath(); wctx.arc(q.x, q.y, 4, 0, Math.PI * 2); wctx.fill();
        wctx.strokeStyle = "rgba(46,45,41,0.65)"; wctx.lineWidth = 1; wctx.stroke();
      }
    }
  }

  // Reuse the MediaQueryList declared at the top so the two can't disagree.
  var reduced = reduce.matches;
  var now = 0;

  function frame() {
    now = performance.now();
    var r = track.getBoundingClientRect();
    var total = track.offsetHeight - vh;
    var p = clamp(-r.top / total, 0, 1);
    bar.style.transform = "scaleX(" + p + ")";
    bar.parentNode.style.opacity = p > 0.995 ? "0" : "1";

    var t = p * SEG, k = Math.min(Math.floor(t), SEG - 1), fr = t - k;
    var e = smooth(clamp((fr - 0.18) / 0.64, 0, 1)); // dwell at each stop, mechanical travel between
    var a = K[k], b = K[k + 1];

    // camera
    var cx = lerp(a.cam.x, b.cam.x, e), cy = lerp(a.cam.y, b.cam.y, e);
    var cw = Math.exp(lerp(Math.log(a.cam.w), Math.log(b.cam.w), e));
    var ch = Math.exp(lerp(Math.log(a.cam.h), Math.log(b.cam.h), e));
    var fitW = vw < 1024 ? 0.96 : 0.86, fitH = 0.72;
    var s = Math.min(vw * fitW / (cw * U), vh * fitH / (ch * U));
    var oy = vh * 0.47;

    var mix = lerp(a.mix, b.mix, e);
    var hm = lerp(a.hero || 0, b.hero || 0, e);
    var tuck = lerp(a.tuck || 0, b.tuck || 0, e);
    var HERO = vw < 1024 ? HERO_TAB : HERO_DESK;
    for (var i = 0; i < N; i++) {
      var pa = A[i], pb = B[i];
      var x = lerp(pa.x, pb.x, mix), y = lerp(pa.y, pb.y + B_DY, mix), sc = lerp(pa.s, pb.s, mix);
      var lag = 0;
      if (tuck > 0 && i !== 0 && ORDER[i] !== undefined) {
        // Each part gets its own window of the unpack, so the kit leaves the box
        // one piece at a time as you scroll instead of all at once.
        var u = 1 - tuck;
        lag = 1 - clamp((u - ORDER[i] * 0.175) / 0.25, 0, 1);
        x = lerp(x, Z.x, lag); y = lerp(y, Z.y, lag); sc = lerp(sc, pa.s * Z.s, lag);
      }
      var X = vw / 2 + (x - cx) * U * s, Y = oy + (y - cy) * U * s, S = sc * s;
      if (hm > 0 && HERO[i]) {
        var h = HERO[i], nat = NAT[i];
        var dw = nat[0] >= nat[1] ? U : U * nat[0] / nat[1];
        var W = h.w * vw / 100;
        X = lerp(X, h.l * vw / 100 + W / 2, hm);
        Y = lerp(Y, h.t * vh / 100 + W * nat[1] / nat[0] / 2, hm);
        S = lerp(S, W / dw, hm);
      }
      // Idle drift so the hero composition breathes before you start scrolling —
      // the page otherwise sits dead still until the pinned track engages.
      if (hm > 0 && !reduced) {
        var tt = now * 0.001;
        X += Math.sin(tt * 0.55 + i * 1.7) * 9 * hm;
        Y += Math.cos(tt * 0.44 + i * 1.1) * 11 * hm;
        S *= 1 + Math.sin(tt * 0.5 + i * 2.1) * 0.012 * hm;
      }
      var o = lerp(a.op[i], b.op[i], e);
      // Hide anything still folded inside the carton — otherwise the kit reads as
      // a shrunken pile sitting on top of the box before it has opened.
      if (lag > 0) o *= clamp((1 - lag) * 3.2, 0, 1);
      var el = parts[i];
      el.style.transform = "translate(" + X.toFixed(1) + "px," + Y.toFixed(1) + "px) scale(" + S.toFixed(4) + ")";
      el.style.opacity = o.toFixed(3);
      // z-index and visibility force style recalc / recompositing, so only write
      // them when the value actually changes rather than on every frame.
      var zi = Math.round((Y + (i === 9 ? -60 : 0)) / 8);
      if (PREV_Z[i] !== zi) { el.style.zIndex = String(zi); PREV_Z[i] = zi; }
      var vis = o < 0.01;
      if (PREV_V[i] !== vis) { el.style.visibility = vis ? "hidden" : "visible"; PREV_V[i] = vis; }
      SEEN[i] = { x: X, y: Y, r: S * U * 0.5, o: o };
    }
    var stmtOn = b.statement ? e : a.statement ? 1 - e : 0;
    placeLabels(mix, (a.intro || b.intro || a.fin || b.fin) ? 1 : 0, stmtOn);
    drawWires(mix);

    // hero copy recedes over the first segment (it also scrolls away naturally)
    if (heroCopy) {
      var hc = k === 0 ? clamp(fr / 0.4, 0, 1) : 1;
      heroCopy.style.opacity = (1 - hc).toFixed(3);
      heroCopy.style.transform = "translateY(" + (-hc * 40).toFixed(1) + "px)";
    }
    // The framed stage belongs to the hero; it retires once the kit leaves it,
    // otherwise parts fly outside a border that is still drawn.
    if (heroPanel) {
      var hpn = k === 0 ? clamp(fr / 0.55, 0, 1) : 1;
      heroPanel.style.opacity = (1 - hpn).toFixed(3);
    }

    // overlays
    // Overlays travel as they fade. Opacity alone reads as a pop; a short rise
    // on the way in and a drift on the way out makes the copy arrive and leave.
    function place(el, o, dir) {
      el.style.opacity = o.toFixed(3);
      el.style.transform = "translateY(" + ((1 - o) * 26 * dir).toFixed(1) + "px)";
    }
    var io_ = k === 0 ? clamp((fr - 0.55) / 0.35, 0, 1) * (b.intro || 0) : lerp(a.intro || 0, b.intro || 0, e);
    place(intro, io_, 1);
    place(statement, b.statement ? e : a.statement ? 1 - e : 0, a.statement && !b.statement ? -1 : 1);
    place(finalTxt, b.fin ? (a.fin ? 1 : e) : 0, 1);

    // label only near a focused stop
    var near = fr < 0.5 ? a : b, dist = fr < 0.5 ? fr : 1 - fr;
    var lo = near.focus >= 0 ? clamp(1 - (dist - 0.12) / 0.2, 0, 1) : 0;
    label.style.opacity = lo.toFixed(3);
    if (near.focus !== lastFocus && near.focus >= 0) {
      lastFocus = near.focus;
      nameEl.textContent = NAMES[near.focus];
      countEl.textContent = String(near.focus + 1).padStart(2, "0") + " / " + String(N).padStart(2, "0");
      tagEl.hidden = near.focus < 6;
    }
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (nav) nav.classList.toggle("is-scrolled", scrollY > vh * 0.85);
      if (active) {
        var r = track.getBoundingClientRect();
        if (r.bottom > -vh && r.top < vh * 2) frame();
      }
      if (!active && heroCopy && !reduce.matches) {
        // story mode (phones): copy clears fast, the hardware separates as it leaves
        var hp = clamp(scrollY / (vh * 0.32), 0, 1);
        heroCopy.style.opacity = (1 - hp).toFixed(3);
        var sp = clamp(scrollY / (vh * 0.8), 0, 1), y0 = Math.min(scrollY, vh);
        if (artDish) artDish.style.transform = "translate(" + (sp * 10).toFixed(2) + "vw," + (y0 * 0.45).toFixed(1) + "px) scale(" + (1 - sp * 0.12).toFixed(3) + ")";
        if (artRouter) artRouter.style.transform = "translate(" + (-sp * 22).toFixed(2) + "vw," + (y0 * 0.3).toFixed(1) + "px)";
        if (artCable) artCable.style.transform = "translate(" + (sp * 18).toFixed(2) + "vw," + (y0 * 0.55).toFixed(1) + "px)";
      }
    });
  }

  // ---------------- Story (mobile / reduced motion) ----------------
  var io = null;
  function enableStory() {
    var items = section.querySelectorAll(".story__item");
    if (reduce.matches || !("IntersectionObserver" in window)) {
      items.forEach(function (n) { n.classList.remove("reveal"); });
      return;
    }
    if (io) return;
    io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.2 });
    items.forEach(function (n) { n.classList.add("reveal"); io.observe(n); });
  }

  function mode() {
    var story = narrow.matches || reduce.matches;
    section.classList.toggle("is-story", story);
    document.getElementById("story").setAttribute("aria-hidden", "true");
    active = !story;
    document.documentElement.classList.toggle("is-pinned", active);
    measure();
    if (heroCopy) { heroCopy.style.opacity = ""; heroCopy.style.transform = ""; }
    if (howAnchor) howAnchor.style.top = active ? ((track.offsetHeight - vh) / SEG * 1.0) + "px" : "0px";
    if (story) enableStory(); else frame();
  }

  narrow.addEventListener("change", mode);
  reduce.addEventListener("change", mode);
  // Keep painting while the track is on screen, so the idle drift actually runs.
  // Scroll alone only repaints when you move.
  var idleOn = false, idleRaf = null;
  function idleTick() {
    if (!idleOn) { idleRaf = null; return; }
    frame();
    idleRaf = requestAnimationFrame(idleTick);
  }
  if (window.IntersectionObserver && !reduced) {
    new IntersectionObserver(function (es) {
      idleOn = es[0].isIntersecting;
      if (idleOn && !idleRaf) idleRaf = requestAnimationFrame(idleTick);
    }, { rootMargin: "0px" }).observe(track);
  }

  measure();        // must precede anything that reads vw/vh
  measureLabels();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureLabels);
  addEventListener("resize", function () { measure(); measureLabels(); onScroll(); });
  addEventListener("scroll", onScroll, { passive: true });
  mode();
  onScroll();
})();
