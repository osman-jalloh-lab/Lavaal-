// Shared reveal-on-scroll and in-view video play for sample templates.
  if (window.top !== window.self) document.documentElement.classList.add("in-frame");
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = document.querySelectorAll('.rv');
  // Inside a preview frame, show everything at once: scroll-reveal triggers are unreliable in scaled iframes.
  if (reduce || window.top !== window.self || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); }
  else {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.15 });
    els.forEach(function (e) { io.observe(e); });
  }
  document.querySelectorAll('video[data-auto]').forEach(function (v) {
    if (reduce) return;
    v.muted = true; v.play().catch(function () {});
  });
})();
