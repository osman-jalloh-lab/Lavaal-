/* Shared navigation for static buying guides. */
(function () {
  'use strict';
  var button = document.getElementById('nav-hamburger');
  var drawer = document.getElementById('nav-mobile-drawer');
  if (!button || !drawer) return;
  function setOpen(open) {
    button.classList.toggle('open', open);
    drawer.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    drawer.setAttribute('aria-hidden', String(!open));
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
  button.addEventListener('click', function () {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });
  drawer.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () { setOpen(false); });
  });
  document.addEventListener('click', function (event) {
    if (!drawer.contains(event.target) && !button.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) setOpen(false);
  });
})();
