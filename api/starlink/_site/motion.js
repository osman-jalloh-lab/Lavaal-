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
  var HERO_DESK = { 1: { l: 42.5, t: 16, w: 55 }, 3: { l: 42, t: 47, w: 12.5 }, 4: { l: 64, t: 75, w: 23 } };
  var HERO_TAB  = { 1: { l: 40, t: 20, w: 64 },   3: { l: 50, t: 46, w: 19 },   4: { l: 72, t: 64, w: 30 } };
  var heroCopy = document.querySelector(".hero__copy");
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
  var wires = document.getElementById("wires");
  var wctx = wires && wires.getContext ? wires.getContext("2d") : null;
  var SEEN = [];  // per-part screen centre + on-screen size, filled each frame

  var kitCx = 0.1;

  // Keyframes: camera rect (units) + per-part opacity + overlays
  function op(fn) { return parts.map(function (_, i) { return fn(i); }); }
  var K = [];
  var KIT_CAM = { x: kitCx, y: -0.22, w: 5.0, h: 2.45 };
  var BOX_CAM  = { x: A[0].x, y: A[0].y, w: 1.55, h: 0.82 };
  var LAVA_CAM = { x: 0.2, y: 2.95, w: 5.0, h: 2.45 };
  var SYS_CAM  = { x: -0.45, y: -0.12 + B_DY, w: 4.9, h: 2.15 };

  // One continuous dive: in to the box, it opens, the kit unpacks, the system assembles.
  // No per-part tour — every product is seen once, in motion, never twice.
  // 1 — hand off from the hero composition
  K.push({ cam: KIT_CAM, op: op(function (i) { return i === 1 || i === 3 || i === 4 ? 1 : 0; }), mix: 0, tuck: 1, hero: 1, focus: -1 });
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

  // Links are drawn only once the parts have converged, and draw themselves on
  // so the connection reads as being made rather than simply being there.
  function drawWires(mix) {
    if (!wctx) return;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    if (wires.width !== Math.round(vw * dpr) || wires.height !== Math.round(vh * dpr)) {
      wires.width = Math.round(vw * dpr); wires.height = Math.round(vh * dpr);
      wires.style.width = vw + "px"; wires.style.height = vh + "px";
    }
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wctx.clearRect(0, 0, vw, vh);
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

  function frame() {
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
      var o = lerp(a.op[i], b.op[i], e);
      // Hide anything still folded inside the carton — otherwise the kit reads as
      // a shrunken pile sitting on top of the box before it has opened.
      if (lag > 0) o *= clamp((1 - lag) * 3.2, 0, 1);
      var el = parts[i];
      el.style.transform = "translate(" + X.toFixed(1) + "px," + Y.toFixed(1) + "px) scale(" + S.toFixed(4) + ")";
      el.style.opacity = o.toFixed(3);
      el.style.zIndex = String(Math.round(Y + (i === 9 ? -60 : 0)));
      el.style.visibility = o < 0.01 ? "hidden" : "visible";
      SEEN[i] = { x: X, y: Y, r: S * U * 0.5, o: o };
    }
    drawWires(mix);

    // hero copy recedes over the first segment (it also scrolls away naturally)
    if (heroCopy) {
      var hc = k === 0 ? clamp(fr / 0.4, 0, 1) : 1;
      heroCopy.style.opacity = (1 - hc).toFixed(3);
      heroCopy.style.transform = "translateY(" + (-hc * 40).toFixed(1) + "px)";
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
  addEventListener("resize", function () { measure(); onScroll(); });
  addEventListener("scroll", onScroll, { passive: true });
  mode();
  onScroll();
})();
