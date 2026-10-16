(function () {
  var root = document.querySelector('[data-os]');
  if (!root) return;
  var rail = root.querySelector('.os-rail');
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
  var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
  var countEl = root.querySelector('[data-os-count]');
  var tourTimer = null, tourDone = false;

  function select(i, focus) {
    tabs.forEach(function (t, k) {
      var on = k === i;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    });
    if (focus) tabs[i].focus();
    // keep the active tab visible in the phone tab strip (scrolls the strip only, never the page)
    if (rail.scrollWidth > rail.clientWidth) rail.scrollLeft = Math.max(0, tabs[i].offsetLeft - 16);
  }
  function current() { return tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; }); }

  function stopTour() { tourDone = true; if (tourTimer) { clearTimeout(tourTimer); tourTimer = null; } }
  ['pointerdown', 'keydown', 'focusin', 'touchstart'].forEach(function (ev) { root.addEventListener(ev, stopTour, { passive: true }); });

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(i, false); });
    t.addEventListener('keydown', function (e) {
      var n = tabs.length, k = i;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') k = (i + 1) % n;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') k = (i - 1 + n) % n;
      else if (e.key === 'Home') k = 0;
      else if (e.key === 'End') k = n - 1;
      else return;
      e.preventDefault();
      select(k, true);
    });
  });

  function pending() {
    var n = 0;
    root.querySelectorAll('[data-approval]').forEach(function (d) { if (!d.getAttribute('data-state')) n++; });
    countEl.textContent = n === 0 ? 'All clear' : n + ' waiting';
    ['inbox', 'builder'].forEach(function (k) {
      var d = root.querySelector('[data-approval="' + k + '"]');
      var s = root.querySelector('#os-tab-' + k + ' .os-tab-s');
      var dot = root.querySelector('#os-tab-' + k + ' .os-dot');
      var done = !!d.getAttribute('data-state');
      s.textContent = done ? 'Resolved' : 'Needs you';
      dot.classList.toggle('os-dot-warn', !done);
    });
  }
  root.querySelectorAll('[data-approval]').forEach(function (box) {
    var actions = box.querySelector('.os-actions');
    var result = box.querySelector('.os-result');
    var kind = box.getAttribute('data-approval');
    actions.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      box.setAttribute('data-state', act);
      actions.hidden = true;
      result.hidden = false;
      result.textContent = act === 'approve'
        ? (kind === 'inbox' ? 'Approved. In the real system the reply would now be sent.' : 'Approved. In the real system the promotion would now be posted.')
        : 'Declined. Nothing was sent.';
      var undo = document.createElement('button');
      undo.type = 'button'; undo.className = 'os-btn'; undo.textContent = 'Reset demo';
      undo.addEventListener('click', function () {
        box.removeAttribute('data-state'); actions.hidden = false; result.hidden = true; result.textContent = '';
        pending(); actions.querySelector('button').focus();
      });
      result.appendChild(undo);
      pending();
    });
  });
  pending();

  // First-view tour: once, about 3s per module, stops on any interaction. Skipped with reduced motion.
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  function step() {
    tourTimer = null;
    if (tourDone) return;
    var i = current() + 1;
    if (i >= tabs.length) { tourDone = true; return; }
    select(i, false);
    tourTimer = setTimeout(step, 3000);
  }
  var io = new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting && !tourDone && !tourTimer) {
      tourTimer = setTimeout(step, 3000);
      io.disconnect();
    }
  }, { threshold: 0.4 });
  io.observe(root);
})();
