(function () {
  'use strict';
  var root = document.getElementById('capabilities');
  if (!root) return;
  root.classList.add('cp-js');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var conn = navigator.connection || {};
  var figs = Array.prototype.slice.call(root.querySelectorAll('.cp-vid'));
  var state = [];

  figs.forEach(function (fig) {
    var v = fig.querySelector('video'), btn = fig.querySelector('.cp-play');
    var s = { fig: fig, v: v, pinned: false, visible: false, name: fig.closest('.cp-item').querySelector('.cp-t').textContent };
    state.push(s);
    v.removeAttribute('controls');
    v.muted = true;
    v.loop = !mqReduce.matches;

    function sync() {
      var playing = !v.paused && !v.ended;
      fig.classList.toggle('is-playing', playing);
      btn.querySelector('.cp-pt').textContent = playing ? 'Pause' : 'Play';
      btn.setAttribute('aria-label', (playing ? 'Pause demo: ' : 'Play demo: ') + s.name);
    }
    function play() {
      state.forEach(function (o) { if (o !== s && !o.v.paused) { o.pinned = false; o.v.pause(); } });
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      sync();
    }
    function pause() { v.pause(); sync(); }
    s.pause = pause;
    function canAuto() { return !mqReduce.matches && !conn.saveData && s.visible; }

    v.addEventListener('play', sync);
    v.addEventListener('pause', sync);
    v.addEventListener('ended', sync);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (v.paused || v.ended) { s.pinned = true; if (v.ended) v.currentTime = 0; play(); }
      else { s.pinned = false; pause(); }
    });
    // A tap on the picture toggles it too (touch). Mouse hover plays while hovering.
    v.addEventListener('click', function () { btn.click(); });
    // Real mouse only (touch taps also fire emulated mouse events, so use pointer events)
    fig.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse' && canAuto() && v.paused) play();
    });
    fig.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse' && !s.pinned && !v.paused) pause();
    });
    fig.addEventListener('focusin', function () {
      if (canAuto() && v.paused && btn.matches(':focus-visible')) play();
    });
    fig.addEventListener('focusout', function (e) {
      if (!fig.contains(e.relatedTarget) && !s.pinned && !v.paused) pause();
    });
    sync();
  });

  // Pause anything that scrolls off-screen
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var s = state.filter(function (o) { return o.fig === en.target; })[0];
        s.visible = en.isIntersecting;
        if (!en.isIntersecting && !s.v.paused) { s.pinned = false; s.pause(); }
      });
    }, { threshold: 0.25 });
    figs.forEach(function (f) { io.observe(f); });
  } else {
    state.forEach(function (s) { s.visible = true; });
  }

  // Reduced motion: no looping, and stop anything playing
  function onMotion() {
    state.forEach(function (s) {
      s.v.loop = !mqReduce.matches;
      if (mqReduce.matches && !s.v.paused) { s.pinned = false; s.pause(); }
    });
  }
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMotion);
  else if (mqReduce.addListener) mqReduce.addListener(onMotion);
})();
