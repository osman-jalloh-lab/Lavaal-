/* Dotted globe with traveling arcs. Canvas 2D, no dependencies.
   Palette is REFERENCE-LOCK-v3 (#000 canvas, white land, #8052FF arcs, #FFB829 endpoints). */
(function (global) {
  "use strict";

  /* Coarse 5deg equirectangular land mask: LAND[row] = [[colStart, colEnd], ...]
     row r spans lat 90-5r .. 85-5r; col c spans lng -180+5c .. -175+5c.
     Approximate by design - it reads as Earth at dot scale, not a survey. */
  var LAND = [
    [], [[28, 31]], [[12, 22], [24, 32], [39, 42]], [[10, 24], [25, 32], [47, 49], [54, 58]],
    [[3, 23], [26, 32], [37, 71]], [[2, 24], [27, 33], [36, 71]], [[2, 25], [28, 32], [36, 71]],
    [[3, 25], [34, 71]], [[7, 24], [34, 71]], [[8, 22], [35, 71]], [[9, 22], [35, 71]],
    [[10, 21], [34, 66]], [[11, 20], [33, 65]], [[13, 19], [32, 64]],
    [[14, 19], [20, 21], [31, 47], [50, 62]], [[16, 20], [32, 48], [51, 61]],
    [[17, 20], [21, 24], [33, 48], [51, 62]], [[20, 26], [34, 47], [56, 64]],
    [[20, 28], [34, 45], [56, 66]], [[20, 29], [35, 45], [57, 67]], [[21, 29], [36, 44], [58, 68]],
    [[21, 29], [37, 44], [60, 67]], [[22, 29], [38, 44], [59, 67]], [[23, 29], [38, 44], [59, 67]],
    [[24, 29], [39, 43], [60, 66]], [[25, 28], [40, 42], [61, 65]], [[25, 28], [69, 71]],
    [[25, 28], [69, 71]], [[26, 28]], [[26, 27]], [], [[26, 31]],
    [[0, 71]], [[0, 71]], [[0, 71]], [[0, 71]]
  ];

  var RAD = Math.PI / 180;

  function isLand(lat, lng) {
    var r = Math.floor((90 - lat) / 5);
    if (r < 0 || r >= LAND.length) return false;
    var c = Math.floor((lng + 180) / 5);
    var spans = LAND[r];
    for (var i = 0; i < spans.length; i++) {
      if (c >= spans[i][0] && c <= spans[i][1]) return true;
    }
    return false;
  }

  /* Even-ish surface sampling: shrink the lng step by cos(lat) so dots don't crowd the poles. */
  function buildDots(step) {
    var dots = [];
    for (var lat = -88; lat <= 88; lat += step) {
      var cos = Math.cos(lat * RAD);
      if (cos < 0.08) continue;
      var lngStep = step / cos;
      for (var lng = -180; lng < 180; lng += lngStep) {
        if (!isLand(lat, lng)) continue;
        var la = lat * RAD, lo = lng * RAD;
        dots.push([Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]);
      }
    }
    return dots;
  }

  function toVec(lat, lng) {
    var la = lat * RAD, lo = lng * RAD;
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  }

  /* Great-circle interpolation, lifted off the surface so the arc bows toward the viewer. */
  function arcPoint(a, b, t, lift) {
    var dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    var omega = Math.acos(dot);
    var sin = Math.sin(omega);
    var wa, wb;
    if (sin < 1e-6) { wa = 1 - t; wb = t; }
    else { wa = Math.sin((1 - t) * omega) / sin; wb = Math.sin(t * omega) / sin; }
    var h = 1 + lift * Math.sin(Math.PI * t) * (omega / Math.PI);
    return [(a[0] * wa + b[0] * wb) * h, (a[1] * wa + b[1] * wb) * h, (a[2] * wa + b[2] * wb) * h];
  }

  function mount(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext("2d");
    var dots = buildDots(opts.density || 2.6);
    var routes = (opts.routes || []).map(function (r) {
      return { a: toVec(r.from[0], r.from[1]), b: toVec(r.to[0], r.to[1]), delay: r.delay || 0 };
    });

    /* Ash dots were invisible on the light-green field. Ink line-work on a pale
       ground needs near-full contrast, not a tint. */
    var landColor = opts.landColor || "20,20,15";     /* ink */
    var arcColor = opts.arcColor || "46,45,41";       /* charcoal */
    var endColor = opts.endColor || "20,20,15";       /* ink */
    var ambient = !!opts.ambient;
    var spin = opts.spin == null ? 0.045 : opts.spin;
    var lift = opts.lift || 0.42;
    var cycle = opts.cycle || 5200;

    var w = 0, h = 0, R = 0, cx = 0, cy = 0, dpr = 1;
    var rot = opts.rotation || 0;
    var scrollRot = 0;
    var raf = null, last = 0, t0 = 0;
    var reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(w, h) * (opts.fill || 0.42);
      cx = w / 2; cy = h / 2;
    }

    function project(v, r) {
      var s = Math.sin(r), c = Math.cos(r);
      var x = v[0] * c - v[2] * s;
      var z = v[0] * s + v[2] * c;
      return [cx + x * R, cy - v[1] * R, z];
    }

    function drawArc(route, phase) {
      /* phase 0..1: head draws out, then the whole arc fades as the head completes. */
      var head = Math.min(1, phase / 0.55);
      var fade = phase < 0.72 ? 1 : 1 - (phase - 0.72) / 0.28;
      if (head <= 0 || fade <= 0) return;
      var ease = head * head * (3 - 2 * head);
      var steps = 54;
      var r = rot + scrollRot;
      var prev = null, started = false;

      ctx.lineWidth = ambient ? 1 : 1.5;
      ctx.lineCap = "round";
      for (var i = 0; i <= steps; i++) {
        var t = (i / steps) * ease;
        var p = project(arcPoint(route.a, route.b, t, lift), r);
        if (p[2] < -0.12) { prev = null; started = false; continue; }
        if (prev) {
          var depth = Math.max(0, Math.min(1, (p[2] + 0.3) / 1.3));
          ctx.strokeStyle = "rgba(" + arcColor + "," + (fade * (0.22 + 0.68 * depth)).toFixed(3) + ")";
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(p[0], p[1]);
          ctx.stroke();
        }
        prev = p; started = true;
      }
      if (!started) return;

      /* Endpoints: origin persists, destination lands when the head arrives. */
      var ends = [[route.a, 1], [route.b, ease > 0.985 ? 1 : 0]];
      for (var e = 0; e < ends.length; e++) {
        if (!ends[e][1]) continue;
        var q = project(ends[e][0], r);
        if (q[2] < 0) continue;
        var rad = ambient ? 1.6 : 2.4;
        ctx.fillStyle = "rgba(" + endColor + "," + (fade * 0.9).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(q[0], q[1], rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame(now) {
      if (!w) resize();
      if (!last) last = now;
      var dt = Math.min(now - last, 64);
      last = now;
      if (!reduced) rot += spin * dt * 0.001;

      ctx.clearRect(0, 0, w, h);
      var r = rot + scrollRot;

      var baseAlpha = ambient ? 0.3 : 0.8;
      var size = ambient ? 1 : 1.7;
      for (var i = 0; i < dots.length; i++) {
        var p = project(dots[i], r);
        if (p[2] <= 0.02) continue;
        var a = baseAlpha * (0.3 + 0.7 * p[2]);
        ctx.fillStyle = "rgba(" + landColor + "," + a.toFixed(3) + ")";
        ctx.fillRect(p[0] - size / 2, p[1] - size / 2, size, size);
      }

      if (!t0) t0 = now;
      var elapsed = now - t0;
      for (var k = 0; k < routes.length; k++) {
        var span = cycle;
        var phase = ((elapsed - routes[k].delay) % (span * routes.length)) / span;
        if (phase < 0 || phase > 1) continue;
        drawArc(routes[k], reduced ? 0.6 : phase);
      }

      raf = global.requestAnimationFrame(frame);
    }

    resize();
    global.addEventListener("resize", resize);
    raf = global.requestAnimationFrame(frame);

    return {
      setScrollRotation: function (v) { scrollRot = v; },
      destroy: function () {
        if (raf) global.cancelAnimationFrame(raf);
        global.removeEventListener("resize", resize);
      }
    };
  }

  /* Anchored on the market named in ASSET-NEEDS: Freetown (SL) and Monrovia (LR).
     Arcs read as "connected outward", not as a coverage claim — confirm before shipping. */
  var DEFAULT_ROUTES = [
    { from: [8.48, -13.23], to: [51.5, -0.13], delay: 0 },     // Freetown - London
    { from: [6.31, -10.80], to: [8.48, -13.23], delay: 900 },  // Monrovia - Freetown
    { from: [8.48, -13.23], to: [40.71, -74.01], delay: 1800 },// Freetown - New York
    { from: [6.31, -10.80], to: [25.2, 55.27], delay: 2700 }   // Monrovia - Dubai
  ];

  function autoMount() {
    var nodes = document.querySelectorAll("canvas[data-globe]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var ambient = el.getAttribute("data-globe") === "ambient";
      mount(el, {
        ambient: ambient,
        routes: ambient ? DEFAULT_ROUTES.slice(0, 2) : DEFAULT_ROUTES,
        density: ambient ? 3.2 : 2.4,
        fill: ambient ? 0.46 : 0.42,
        spin: ambient ? 0.03 : 0.05,
        rotation: -1.1
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoMount);
  } else {
    autoMount();
  }

  global.LavaGlobe = { mount: mount, routes: DEFAULT_ROUTES };
})(window);
