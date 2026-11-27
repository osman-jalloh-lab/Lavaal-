/* The public sitekey falls back to Cloudflare's always-pass visible test key. */
(function () {
  var config = { siteKey: '1x00000000000000000000AA', enforced: false };
  var ready = fetch('/api/turnstile-config').then(function (r) { return r.ok ? r.json() : {}; }).then(function (data) {
    if (data.siteKey) config.siteKey = data.siteKey;
    config.enforced = data.enforced === true;
  }).catch(function () {});
  var widgets = new WeakMap();
  function mount(element) {
    if (!element || widgets.has(element)) return;
    ready.then(function () {
      function render() {
        if (!window.turnstile) { setTimeout(render, 200); return; }
        if (widgets.has(element)) return;
        widgets.set(element, window.turnstile.render(element, { sitekey: config.siteKey }));
      }
      render();
    });
  }
  window.LavaallTurnstile = {
    mount: mount,
    current: function (element) {
      var id = widgets.get(element);
      var token = id !== undefined && window.turnstile ? window.turnstile.getResponse(id) : '';
      return { value: token || '', required: config.enforced };
    },
    token: async function (element) {
      await ready;
      var id = widgets.get(element);
      var token = id !== undefined && window.turnstile ? window.turnstile.getResponse(id) : '';
      return { value: token || '', required: config.enforced };
    },
    reset: function (element) {
      var id = widgets.get(element);
      if (id !== undefined && window.turnstile) window.turnstile.reset(id);
    }
  };
  function init() { document.querySelectorAll('[data-turnstile]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
