(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Page root for asset paths built in script ("" on /web/, "../" on /web/work/).
  var ROOT = document.documentElement.getAttribute('data-root') || '';
  var CFG = window.LV_WEB || {};

  // Reveal on scroll
  var items = document.querySelectorAll('.rv');
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) {
      // Stagger siblings that reveal together (cap so long lists don't lag).
      var sib = 0, n = el.previousElementSibling;
      while (n && sib < 4) { if (n.classList.contains('rv')) sib++; n = n.previousElementSibling; }
      if (sib) el.style.setProperty('--rv-d', (sib * 0.08).toFixed(2) + 's');
      io.observe(el);
    });
  }

  // Lazy posters: below-the-fold videos carry data-poster and get it only near the screen.
  var lazy = document.querySelectorAll('video[data-poster]');
  function poster(v) { if (!v.getAttribute('poster')) v.setAttribute('poster', v.getAttribute('data-poster')); }
  if (!('IntersectionObserver' in window)) { lazy.forEach(poster); } else if (lazy.length) {
    var pio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { poster(e.target); pio.unobserve(e.target); } });
    }, { rootMargin: '600px 0px' });
    lazy.forEach(function (v) { pio.observe(v); });
  }

  // WhatsApp buttons (top and bottom) stay hidden until content/en.json whatsapp.number is filled in.
  // The server passes that number to the page as window.LV_WEB.whatsapp (digits only).
  var WHATSAPP_NUMBER = String(CFG.whatsapp || '').replace(/\D/g, '');
  if (WHATSAPP_NUMBER) {
    document.querySelectorAll('[data-wa]').forEach(function (a) {
      a.href = 'https://wa.me/' + WHATSAPP_NUMBER;
      a.target = '_blank'; a.rel = 'noopener';
      a.hidden = false;
    });
  }

  // Inquiry form: posts to /web/api/inquiry, which hands it to the main site's email router (support@lavaall.com).
  var form = document.getElementById('web-inquiry');
  if (!form) return;
  var status = document.getElementById('form-status');
  var btn = form.querySelector('button[type="submit"]');
  var API = (CFG.api || '/web/api') + '/inquiry';
  var SUPPORT = 'support@lavaall.com';
  var busy = false;
  function compose() {
    return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(SUPPORT) + '&su=' + encodeURIComponent('LAVAALL Web inquiry');
  }
  function say(text, state, link) {
    status.setAttribute('data-state', state || '');
    status.textContent = text;
    if (link) {
      status.appendChild(document.createTextNode(' '));
      var a = document.createElement('a');
      a.href = compose(); a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Email ' + SUPPORT;
      status.appendChild(a);
    }
  }
  // Prefill from "Use this look" on the Our work page (?look=...&type=...).
  try {
    var q = new URLSearchParams(location.search);
    var look = (q.get('look') || '').slice(0, 60), ltype = q.get('type') || '';
    if (ltype && form.elements.type) {
      Array.prototype.forEach.call(form.elements.type.options, function (o) { if (o.value === ltype) form.elements.type.value = ltype; });
    }
    if (look && form.elements.message && !form.elements.message.value) form.elements.message.value = 'I like the "' + look + '" template.';
  } catch (e) {}
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var bad = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (f) { return !f.value.trim(); });
    form.querySelectorAll('[aria-invalid]').forEach(function (f) { f.removeAttribute('aria-invalid'); });
    if (bad.length) {
      bad.forEach(function (f) { f.setAttribute('aria-invalid', 'true'); });
      say('Please add your name and a way to reach you.', 'error');
      bad[0].focus();
      return;
    }
    var data = {};
    ['name', 'business', 'type', 'country', 'need', 'contact', 'message', 'website'].forEach(function (k) {
      if (form.elements[k]) data[k] = form.elements[k].value;
    });
    busy = true; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    say('Sending...', 'busy');
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (r) {
        if (r.status >= 200 && r.status < 300 && r.body && r.body.ok) {
          form.reset();
          say(r.body.mode === 'mock'
            ? 'Test mode: your inquiry was checked and recorded, but no email was sent.'
            : 'Thank you. Your inquiry was sent to our team at ' + SUPPORT + '. We will reply to the contact you gave us.', 'ok');
          return;
        }
        if (r.status === 400 && r.body && r.body.fields) {
          r.body.fields.forEach(function (k) { if (form.elements[k]) form.elements[k].setAttribute('aria-invalid', 'true'); });
          say(r.body.message || 'Please check the highlighted fields.', 'error');
          return;
        }
        var msg = r.body && r.body.message ? r.body.message : 'Your inquiry could not be sent.';
        say(msg + ' Nothing was sent. You can also', 'error', true);
      })
      .catch(function () {
        say('We could not reach our server, so nothing was sent. Please try again, or', 'error', true);
      })
      .then(function () { clearTimeout(timer); busy = false; btn.disabled = false; btn.removeAttribute('aria-busy'); });
  });
})();


// ---- Automation demos ----
(function () {
  var root = document.getElementById('demos');
  if (!root) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wide = window.matchMedia('(min-width: 960px)');
  var live = root.querySelector('.dm-live');
  var tabs = Array.prototype.slice.call(root.querySelectorAll('.dm-tabs button'));
  var DWELL = 1300, TRAVEL = 500;
  var STAT = { idle: 'Waiting', active: 'Running', done: 'Done', need: 'Needs you' };
  var visible = false, needsRun = true, current = null;

  root.classList.add('dm-js');

  function Demo(el) {
    var self = this;
    this.el = el;
    this.nodes = Array.prototype.slice.call(el.querySelectorAll('.dm-node'));
    this.wires = Array.prototype.slice.call(el.querySelectorAll('.dm-wire'));
    this.flow = el.querySelector('.dm-flow');
    this.payload = el.querySelector('.dm-payload');
    this.btn = el.querySelector('.dm-approve');
    this.ap = parseInt(el.getAttribute('data-approve'), 10);
    this.timer = null; this.fn = null; this.left = 0; this.t0 = 0; this.paused = false;
    this.waiting = false; this.i = -1;
    el.querySelector('.dm-replay').addEventListener('click', function () { self.reset(); self.run(); });
    if (this.btn) this.btn.addEventListener('click', function () { self.approve(); });
  }
  var P = Demo.prototype;

  P.setNode = function (i, st) {
    var n = this.nodes[i];
    n.setAttribute('data-state', st);
    n.querySelector('.dm-stat').textContent = STAT[st];
  };
  P.clear = function () { clearTimeout(this.timer); this.timer = null; this.fn = null; this.waiting = false; };
  P.schedule = function (fn, ms) {
    this.clear();
    if (reduce || ms === 0) { fn(); return; }
    this.fn = fn; this.left = ms;
    if (!this.paused) this.arm();
  };
  P.arm = function () {
    var self = this;
    this.t0 = Date.now();
    this.timer = setTimeout(function () { var f = self.fn; self.fn = null; self.timer = null; if (f) f(); }, this.left);
  };
  P.pause = function () {
    this.paused = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; this.left = Math.max(0, this.left - (Date.now() - this.t0)); }
  };
  P.resume = function () {
    this.paused = false;
    if (this.fn && !this.timer) this.arm();
  };
  P.place = function (x, y, animate) {
    var p = this.payload;
    if (!animate) p.style.transition = 'none';
    p.style.transform = 'translate3d(' + (x - 6) + 'px,' + (y - 6) + 'px,0)';
    if (!animate) { void p.offsetWidth; p.style.transition = ''; }
  };
  // entry and exit ports of a node, in .dm-flow coordinates
  P.port = function (i, exit) {
    var n = this.nodes[i];
    if (wide.matches) return [n.offsetLeft + (exit ? n.offsetWidth : 0), n.offsetTop + n.offsetHeight / 2];
    return [n.offsetLeft + n.offsetWidth / 2, n.offsetTop + (exit ? n.offsetHeight : 0)];
  };
  P.reset = function () {
    this.clear();
    this.i = -1;
    for (var k = 0; k < this.nodes.length; k++) this.setNode(k, 'idle');
    this.wires.forEach(function (w) { w.removeAttribute('data-on'); });
    this.el.removeAttribute('data-complete');
    this.payload.style.opacity = 0;
    if (this.btn) { this.btn.disabled = true; this.btn.textContent = 'Approve'; this.btn.removeAttribute('data-approved'); }
  };
  P.complete = function () {
    this.clear();
    for (var k = 0; k < this.nodes.length; k++) this.setNode(k, 'done');
    this.wires.forEach(function (w) { w.setAttribute('data-on', ''); });
    this.el.setAttribute('data-complete', '');
    this.payload.style.opacity = 0;
    if (this.btn) { this.btn.disabled = true; this.btn.textContent = 'Approved'; this.btn.setAttribute('data-approved', ''); }
  };
  P.run = function () {
    var p = this.port(0, false);
    this.place(p[0], p[1], false);
    this.payload.style.opacity = reduce ? 0 : 1;
    this.enter(0);
  };
  P.enter = function (i) {
    var self = this;
    this.i = i;
    var need = i === this.ap;
    this.setNode(i, 'active');
    if (need) this.nodes[i].querySelector('.dm-stat').textContent = STAT.need;
    say('Step ' + (i + 1) + ' of ' + this.nodes.length + ': ' + this.nodes[i].querySelector('.dm-text').textContent + (need ? '. Waiting for you to press Approve.' : ''));
    if (need) {
      this.btn.disabled = false;
      this.waiting = true;
      return;
    }
    this.schedule(function () { self.finish(i); }, DWELL);
  };
  P.approve = function () {
    var self = this;
    if (!this.waiting || this.btn.disabled) return;
    this.waiting = false;
    this.btn.disabled = true;
    this.btn.textContent = 'Approved';
    this.btn.setAttribute('data-approved', '');
    this.schedule(function () { self.finish(self.i); }, reduce ? 0 : 450);
  };
  P.finish = function (i) {
    var self = this;
    this.setNode(i, 'done');
    if (i === this.nodes.length - 1) {
      this.el.setAttribute('data-complete', '');
      this.payload.style.opacity = 0;
      say('Done. ' + this.nodes[i].querySelector('.dm-result').textContent);
      return;
    }
    if (!reduce) {
      var a = this.port(i, true), b = this.port(i + 1, false);
      this.place(a[0], a[1], false);
      this.payload.style.opacity = 1;
      this.wires[i].setAttribute('data-on', '');
      this.place(b[0], b[1], true);
    } else {
      this.wires[i].setAttribute('data-on', '');
    }
    this.schedule(function () { self.enter(i + 1); }, TRAVEL);
  };

  function say(t) { if (live) live.textContent = t; }

  var demos = {};
  Array.prototype.forEach.call(root.querySelectorAll('.dm-panel'), function (el) { demos[el.getAttribute('data-demo')] = new Demo(el); });

  function startCurrent() {
    needsRun = false;
    var d = demos[current];
    d.reset();
    d.run();
  }

  function show(name) {
    if (current && demos[current]) { demos[current].clear(); demos[current].paused = false; }
    current = name;
    tabs.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-demo') === name)); });
    Object.keys(demos).forEach(function (k) { demos[k].el.hidden = k !== name; });
    var d = demos[name];
    if (reduce) { d.complete(); return; }
    d.reset();
    if (visible) { startCurrent(); } else { needsRun = true; }
  }

  tabs.forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-demo')); });
  });

  // Reduced motion: completed state, static, no looping. Replay steps through without animation.
  show('poster');

  if ('IntersectionObserver' in window && !reduce) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      var d = demos[current];
      if (visible) { if (needsRun) startCurrent(); else d.resume(); }
      else d.pause();
    }, { threshold: 0.25 }).observe(root);
  } else if (!reduce) {
    visible = true; startCurrent();
  }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var d = demos[current];
      if (d && d.i >= 0 && !d.el.hasAttribute('data-complete') && d.i < d.nodes.length) {
        var p = d.port(d.i, false); d.place(p[0], p[1], false);
      }
    }, 120);
  });
})();


// ---- Capabilities ----
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


// ---- Business OS ----
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


// Templates gallery: prev/next, position count, "Use this look" prefills the inquiry form
(function () {
  var strip = document.getElementById('tp-strip');
  if (!strip) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cards = strip.querySelectorAll('.tp-card');
  var prev = document.querySelector('[data-tp-prev]');
  var next = document.querySelector('[data-tp-next]');
  var count = document.querySelector('[data-tp-count]');

  function current() {
    var left = strip.getBoundingClientRect().left + parseFloat(getComputedStyle(strip).scrollPaddingLeft || 0);
    var best = 0, dist = Infinity;
    cards.forEach(function (c, i) {
      var d = Math.abs(c.getBoundingClientRect().left - left);
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  }
  function update() {
    var i = current();
    var atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4;
    if (count) count.textContent = (atEnd ? cards.length : i + 1) + ' of ' + cards.length;
    prev.disabled = strip.scrollLeft <= 4;
    next.disabled = atEnd;
  }
  function go(dir) {
    var i = Math.max(0, Math.min(cards.length - 1, current() + dir));
    strip.scrollTo({ left: cards[i].offsetLeft - cards[0].offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
  }
  prev.addEventListener('click', function () { go(-1); });
  next.addEventListener('click', function () { go(1); });
  strip.addEventListener('keydown', function (e) {
    if (e.target !== strip) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });
  var t;
  strip.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(update, 80); }, { passive: true });
  window.addEventListener('resize', update);
  update();

  var form = document.getElementById('web-inquiry');
  document.querySelectorAll('[data-tp-use]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!form) {
        var root = document.documentElement.getAttribute('data-root') || '';
        location.href = root + '?look=' + encodeURIComponent(btn.getAttribute('data-name')) + '&type=' + encodeURIComponent(btn.getAttribute('data-type')) + '#contact';
        return;
      }
      var type = form.elements.type, msg = form.elements.message;
      if (type) type.value = btn.getAttribute('data-type');
      var line = 'I like the "' + btn.getAttribute('data-name') + '" template.';
      if (msg && msg.value.indexOf(line) === -1) msg.value = msg.value ? line + '\n' + msg.value : line;
      document.getElementById('contact').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      form.elements.name.focus({ preventScroll: true });
    });
  });
})();

// Golden hour: hero film, in-view video tiles, Lava chat demo
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || {};
  var lowData = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');

  // Hero film: never blocks first paint. Starts after load + idle, only on a good connection,
  // and is skipped on reduced motion, data saver and slow links (2g/3g, or under 0.7 Mbps). The poster stays.
  var slow = /(^|-)(2g|3g)$/.test(conn.effectiveType || '') || (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 0.7);
  var hv = document.querySelector('.hero-video');
  var pause = document.querySelector('.hero-pause');
  if (hv && !reduce && !lowData && !slow) {
    var startFilm = function () {
      var small = window.matchMedia('(max-width: 760px)').matches && hv.getAttribute('data-src-sm');
      hv.src = small || hv.getAttribute('data-src');
      hv.addEventListener('playing', function () { hv.classList.add('on'); }, { once: true });
      hv.play().then(function () { pause.hidden = false; }).catch(function () {});
    };
    var afterPaint = function () {
      var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1200); };
      setTimeout(function () { idle(startFilm, { timeout: 3000 }); }, 600);
    };
    if (document.readyState === 'complete') afterPaint(); else window.addEventListener('load', afterPaint, { once: true });
    pause.addEventListener('click', function () {
      var paused = pause.getAttribute('aria-pressed') === 'true';
      if (paused) { hv.play(); } else { hv.pause(); }
      pause.setAttribute('aria-pressed', String(!paused));
      pause.querySelector('.hp-t').textContent = paused ? 'Pause film' : 'Play film';
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (pause.getAttribute('aria-pressed') === 'true' || !hv.src) return;
          if (e.isIntersecting) { hv.play().catch(function () {}); } else { hv.pause(); }
        });
      }).observe(hv);
    }
  }

  // Business tiles: play only while on screen.
  var tiles = document.querySelectorAll('.biz-card video');
  if (tiles.length && !reduce && !lowData && 'IntersectionObserver' in window) {
    var tio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        v.parentNode.classList.toggle('play', e.isIntersecting);
        if (e.isIntersecting) {
          if (!v.src) v.src = v.getAttribute('data-src');
          v.play().catch(function () {});
        } else { v.pause(); }
      });
    }, { threshold: 0.35 });
    tiles.forEach(function (v) { tio.observe(v); });
  }

  // Lava: scripted chat. Customer taps a reply, Lava answers, the owner approves before anything is confirmed.
  var log = document.querySelector('[data-lava-log]');
  if (!log) return;
  var LR = document.documentElement.getAttribute('data-root') || '';
  var replies = document.querySelector('[data-lava-replies]');
  var bizEl = document.querySelector('[data-lava-biz]');
  var phone = document.getElementById('lava-phone');
  var stage = document.querySelector('.lava-stage');
  var tabs = document.querySelectorAll('[data-lava]');

  var S = {
    restaurant: {
      biz: 'Sample restaurant', bg: LR + 'assets/photo/restaurant.webp',
      start: 'open',
      steps: {
        open: { me: 'Hi, are you open tonight?', bot: ['Hi! Yes, we are open until 11pm tonight. Would you like the menu or a table?'], next: [['See the menu', 'menu'], ['Book a table', 'book']] },
        menu: { me: 'See the menu', bot: ['Tonight we have grilled fish, jollof rice, and cassava leaf with rice.', 'Shall I book you a table?'], next: [['Book a table', 'book']] },
        book: { me: 'Book a table', bot: ['Lovely. How many people, and what time?'], next: [['4 people at 7pm', 'conf']] },
        conf: { me: '4 people at 7pm', owner: 'New booking: table for 4 at 7pm tonight. Send the confirmation?', ok: 'You are booked: a table for 4 at 7pm. See you tonight!', sys: 'Owner approved. Booking added to your sheet.' }
      }
    },
    hotel: {
      biz: 'Sample guesthouse', bg: LR + 'assets/photo/hotel.webp',
      start: 'open',
      steps: {
        open: { me: 'Do you have a room this Friday?', bot: ['Hello! Yes, a sea view double is free on Friday. Shall I hold it for you?'], next: [['Is breakfast included?', 'bf'], ['Yes, hold it', 'name']] },
        bf: { me: 'Is breakfast included?', bot: ['Yes, breakfast is served from 7 to 10am.', 'Would you like me to hold the room?'], next: [['Yes, hold it', 'name']] },
        name: { me: 'Yes, hold it', bot: ['Great. What name should I put it under?'], next: [['Fatmata', 'conf']] },
        conf: { me: 'Fatmata', owner: 'Hold the sea view double for Fatmata this Friday?', ok: 'Done, Fatmata. Your room is held for Friday. We will message you the day before.', sys: 'Owner approved. Room held in your calendar.' }
      }
    },
    shop: {
      biz: 'Sample phone shop', bg: LR + 'assets/photo/shopfront.webp',
      start: 'open',
      steps: {
        open: { me: 'Do you have phone chargers?', bot: ['Yes, we have USB-C and iPhone chargers in stock. Which one do you need?'], next: [['USB-C', 'how'], ['iPhone', 'how']] },
        how: { me: null, bot: ['Got it. Pick up at the shop, or delivery in town?'], next: [['Delivery', 'area'], ['Pick up', 'pick']] },
        pick: { me: 'Pick up', owner: 'Hold 1 charger for pickup today?', ok: 'It is ready for you at the counter. See you soon!', sys: 'Owner approved. Item set aside.' },
        area: { me: 'Delivery', bot: ['No problem. Which area are you in?'], next: [['Lumley', 'conf']] },
        conf: { me: 'Lumley', owner: 'New order: 1 charger, delivery to Lumley. Confirm and send?', ok: 'Order confirmed! We will call you when it is on the way.', sys: 'Owner approved. Order added to today’s deliveries.' }
      }
    }
  };

  var cur = 'restaurant', timers = [], lastPick = '';
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { timers.push(setTimeout(fn, reduce ? 0 : ms)); }
  function scroll() { log.scrollTop = log.scrollHeight; }
  function add(cls, html) { var li = document.createElement('li'); li.className = cls; li.innerHTML = html; log.appendChild(li); scroll(); return li; }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function setReplies(list) {
    replies.innerHTML = '';
    list.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = r[0];
      if (r[1] === '__restart') b.className = 'restart';
      b.addEventListener('click', function () { r[1] === '__restart' ? reset() : go(r[1], r[0]); });
      replies.appendChild(b);
    });
  }
  function botSay(lines, done) {
    var i = 0;
    (function nextLine() {
      if (i >= lines.length) { done && done(); return; }
      var t = add('lp-typing', '<i></i><i></i><i></i>');
      t.setAttribute('aria-label', 'Lava is typing');
      later(function () { t.remove(); add('lp-msg bot', '<span class="lp-who-s">Lava</span>' + esc(lines[i])); i++; later(nextLine, 350); }, 700);
    })();
  }
  function go(key, picked) {
    var step = S[cur].steps[key];
    setReplies([]);
    var me = step.me === null ? picked : step.me;
    if (me) add('lp-msg me', esc(me));
    lastPick = picked || lastPick;
    later(function () {
      if (step.owner) { ownerCard(step); return; }
      botSay(step.bot, function () { setReplies(step.next); });
    }, 300);
  }
  function ownerCard(step) {
    var c = add('lp-owner', '<span class="lp-o-k">Owner check · only you see this</span><p>' + esc(step.owner) + '</p><div class="lp-owner-btns"><button type="button" class="ok">Approve</button><button type="button" class="no">Not now</button></div>');
    var ok = c.querySelector('.ok'), no = c.querySelector('.no');
    if (!auto.on) ok.focus({ preventScroll: true });
    ok.addEventListener('click', function () {
      c.querySelector('.lp-owner-btns').remove();
      c.insertAdjacentHTML('beforeend', '<p>You approved this.</p>');
      botSay([step.ok], function () { add('lp-sys', esc(step.sys)); setReplies([['Start again', '__restart']]); });
    });
    no.addEventListener('click', function () {
      c.querySelector('.lp-owner-btns').remove();
      c.insertAdjacentHTML('beforeend', '<p>Held for you. Nothing was sent.</p>');
      botSay(['Thanks! The owner will get back to you shortly.'], function () { setReplies([['Start again', '__restart']]); });
    });
  }
  function reset() {
    clearTimers(); log.innerHTML = '';
    var sc = S[cur];
    bizEl.textContent = sc.biz;
    stage.style.backgroundImage = 'url(' + sc.bg + ')';
    add('lp-sys', 'Today');
    add('lp-msg bot', '<span class="lp-who-s">Lava</span>Hi! I am Lava, the assistant for this ' + esc(sc.biz.toLowerCase()) + '. Tap a message below to try me.');
    var first = sc.steps[sc.start];
    setReplies([[first.me, sc.start]]);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(i); });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return;
      e.preventDefault();
      var j = (i + n + tabs.length) % tabs.length;
      select(j); tabs[j].focus();
    });
  });
  // Autoplay: when the chat is on screen it plays the conversation itself, step by step,
  // then moves to the next business and loops. Any real tap or key in the demo hands
  // control to the visitor. Reduced motion: no autoplay, the visitor taps through.
  var auto = { on: !reduce && 'IntersectionObserver' in window, seen: false, tick: null };
  function autoStep() {
    if (!auto.on || !auto.seen || document.hidden) return;
    var okBtn = log.querySelector('.lp-owner-btns .ok');
    var r = replies.querySelector('button');
    if (okBtn) okBtn.click();
    else if (r && r.className === 'restart') select((Array.prototype.indexOf.call(tabs, document.querySelector('[data-lava="' + cur + '"]')) + 1) % tabs.length, true);
    else if (r) r.click();
  }
  if (auto.on) {
    var sec = document.getElementById('lava') || stage;
    sec.addEventListener('click', function (e) { if (e.isTrusted) { auto.on = false; clearInterval(auto.tick); } }, true);
    sec.addEventListener('keydown', function () { auto.on = false; clearInterval(auto.tick); }, true);
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        auto.seen = e.isIntersecting;
        clearInterval(auto.tick);
        if (auto.seen && auto.on) auto.tick = setInterval(autoStep, 1900);
      });
    }, { threshold: 0.35 }).observe(phone);
  }
  function select(i) {
    tabs.forEach(function (t, k) {
      t.setAttribute('aria-selected', String(k === i));
      t.tabIndex = k === i ? 0 : -1;
    });
    phone.setAttribute('aria-labelledby', tabs[i].id);
    cur = tabs[i].getAttribute('data-lava');
    reset();
  }
  reset();
})();

// Generic in-view videos (real-site recordings): load on approach, play on screen, user can pause.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var vids = document.querySelectorAll('video[data-inview]');
  var c = navigator.connection || {};
  if (!vids.length || reduce || c.saveData || /(^|-)2g$/.test(c.effectiveType || '') || !('IntersectionObserver' in window)) return;
  vids.forEach(function (v) {
    var btn = v.parentNode.querySelector('.live-toggle');
    if (btn) btn.addEventListener('click', function () {
      var paused = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!paused));
      btn.querySelector('.lt-t').textContent = paused ? 'Pause' : 'Play';
      if (paused) { v.play().catch(function () {}); } else { v.pause(); }
    });
  });
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target, btn = v.parentNode.querySelector('.live-toggle');
      if (e.isIntersecting) {
        if (!v.src) v.src = v.getAttribute('data-src');
        if (!btn || btn.getAttribute('aria-pressed') !== 'true') v.play().then(function () { if (btn) btn.hidden = false; }).catch(function () {});
      } else { v.pause(); }
    });
  }, { threshold: 0.3 });
  vids.forEach(function (v) { io.observe(v); });
})();

// Templates: live previews. Load near view, scale 390px pages to the card, auto-scroll while visible.
(function () {
  var frames = document.querySelectorAll('[data-tp-live]');
  if (!frames.length) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fit(box) { box.style.setProperty('--tp-s', (box.clientWidth / 390).toFixed(4)); }
  if ('ResizeObserver' in window) { var ro = new ResizeObserver(function (es) { es.forEach(function (e) { fit(e.target); }); }); frames.forEach(function (f) { ro.observe(f); }); }
  else { frames.forEach(fit); window.addEventListener('resize', function () { frames.forEach(fit); }); }

  function runner(box) {
    var ifr = box.querySelector('iframe'), on = false, raf = 0, t0 = 0, phase = 0;
    var ease = function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
    function tick(now) {
      if (!on) return;
      var w = ifr.contentWindow; if (!w || !w.document || !w.document.body) { raf = requestAnimationFrame(tick); return; }
      var max = Math.min(w.document.documentElement.scrollHeight - w.innerHeight, 2600);
      if (!t0) t0 = now;
      var el = now - t0;
      if (phase === 0 && el > 1500) { phase = 1; t0 = now; el = 0; }
      if (phase === 1) { var d = 14000, t = Math.min(1, el / d); w.scrollTo(0, max * ease(t)); if (t >= 1) { phase = 2; t0 = now; } }
      else if (phase === 2 && el > 1500) { phase = 3; t0 = now; }
      else if (phase === 3) { var d2 = 2500, t2 = Math.min(1, el / d2); w.scrollTo(0, max * (1 - ease(t2))); if (t2 >= 1) { phase = 0; t0 = now; } }
      raf = requestAnimationFrame(tick);
    }
    return {
      start: function () { if (reduce || on) return; on = true; t0 = 0; raf = requestAnimationFrame(tick); },
      stop: function () { on = false; cancelAnimationFrame(raf); }
    };
  }
  var runs = new Map();
  frames.forEach(function (f) { runs.set(f, runner(f)); });
  if (!('IntersectionObserver' in window)) { frames.forEach(function (f) { var i = f.querySelector('iframe'); i.src = i.getAttribute('data-src'); }); return; }
  // Load every preview in a group as soon as the group nears the screen (cards hidden in a sideways strip never 'intersect').
  function loadAll(scope) { scope.querySelectorAll('[data-tp-live] iframe').forEach(function (i) { if (i.getAttribute('src') === 'about:blank') i.src = i.getAttribute('data-src'); }); }
  var near = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { loadAll(e.target.closest('section') || document); near.unobserve(e.target); } });
  }, { rootMargin: '400px 0px' });
  var vis = new IntersectionObserver(function (es) {
    es.forEach(function (e) { var r = runs.get(e.target); if (e.isIntersecting) { r.start(); } else { r.stop(); } });
  }, { threshold: 0.6 });
  frames.forEach(function (f) { near.observe(f); vis.observe(f); });
})();

// Automations player: data-driven pipelines with real wording, a run log, and an owner approval step.
(function () {
  var app = document.querySelector('[data-au]');
  if (!app) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var listEl = app.querySelector('[data-au-list]'), pipe = app.querySelector('[data-au-pipe]');
  var screen = app.querySelector('[data-au-screen]'), logEl = app.querySelector('[data-au-log]');
  var titleEl = app.querySelector('[data-au-title]'), trigEl = app.querySelector('[data-au-trig]');
  var statusEl = app.querySelector('[data-au-status]'), panel = app.querySelector('[data-au-panel]');
  var IMG = (document.documentElement.getAttribute('data-root') || '') + 'assets/photo/';
  var A = {
    lava: ['L', '#F7E04A', '#0B252A'], you: ['You', '#0B252A', '#F7E04A'], ig: ['IG', 'linear-gradient(135deg,#F58529,#DD2A7B 60%,#8134AF)', '#fff'],
    fb: ['f', '#1877F2', '#fff'], wa: ['WA', '#25D366', '#fff'], g: ['G', '#fff', '#4285F4'], sheet: ['Sh', '#0F9D58', '#fff'],
    folder: ['Dr', '#FFC107', '#3A2A00'], mail: ['M', '#EA4335', '#fff'], web: ['Web', '#3B4446', '#fff'], shop: ['Shop', '#0B6B5C', '#fff'], clock: ['9:00', '#E7D3BF', '#0B252A']
  };
  var D = [
    { id: 'posts', name: 'Social posts', who: 'Restaurants, hotels, marketers', trig: 'When 3 new photos land in "Friday shoot"',
      nodes: [['folder', 'Photos folder'], ['lava', 'Writes captions'], ['you', 'You approve'], ['ig', 'Instagram'], ['fb', 'Facebook Page']],
      steps: [
        { n: 0, log: 'Trigger: 3 new photos added to "Friday shoot"', v: { t: 'photos', imgs: ['restaurant.webp', 'shopfront.webp', 'hotel.webp'], cap: 'Friday shoot / 3 new photos' } },
        { n: 1, log: 'Lava is writing captions in your voice', v: { t: 'doc', h: 'Caption draft 1 of 3', body: 'Friday nights at the grill. Fresh snapper, smoky jollof and ice cold ginger beer. Tables fill fast, so book yours on WhatsApp.' } },
        { n: 2, log: 'Waiting for your approval', approve: true, v: { t: 'post', img: 'restaurant.webp', body: 'Friday nights at the grill. Fresh snapper, smoky jollof and ice cold ginger beer. Tables fill fast, so book yours on WhatsApp.', when: 'Friday, 6pm' } },
        { n: 3, log: 'Scheduled on Instagram for Friday 6pm', v: { t: 'chips', items: [['ig', 'Instagram', 'Friday 6pm'], ['fb', 'Facebook Page', 'Waiting']] } },
        { n: 4, log: 'Scheduled on your Facebook Page', v: { t: 'result', h: 'Done', body: '3 posts scheduled for this week. You approved each one.', items: [['ig', 'Instagram', 'Scheduled'], ['fb', 'Facebook Page', 'Scheduled']] } }
      ] },
    { id: 'reviews', name: 'Review replies', who: 'Restaurants, hotels', trig: 'When a new review arrives on Google',
      nodes: [['g', 'New review'], ['lava', 'Reads and drafts'], ['you', 'You approve'], ['g', 'Reply posted'], ['sheet', 'Logged']],
      steps: [
        { n: 0, log: 'Trigger: new 2 star review on Google', v: { t: 'review', name: 'Aminata K.', stars: 2, body: 'Food was really good but we waited 40 minutes for our table on Friday.' } },
        { n: 1, log: 'Lava drafts a calm, personal reply', v: { t: 'doc', h: 'Reply draft', body: 'Thank you for telling us, Aminata. A 40 minute wait is too long, and we are sorry. We have added a second host on Fridays. Your next starter is on us.' } },
        { n: 2, log: 'Waiting for your approval', approve: true, v: { t: 'review', name: 'Aminata K.', stars: 2, body: 'Food was really good but we waited 40 minutes for our table on Friday.', reply: 'Thank you for telling us, Aminata. A 40 minute wait is too long, and we are sorry. We have added a second host on Fridays. Your next starter is on us.' } },
        { n: 3, log: 'Reply posted on Google', v: { t: 'chips', items: [['g', 'Google', 'Reply live']] } },
        { n: 4, log: 'Logged: complaint about wait time', v: { t: 'sheet', h: 'Reviews log', cols: ['Review', 'Topic', 'Status'], rows: [['2 stars, Aminata', 'Wait time', 'Replied'], ['5 stars, Musa', 'Jollof', 'Thanked'], ['4 stars, Grace', 'Service', 'Thanked']], hl: 0 } }
      ] },
    { id: 'listings', name: 'New stock listings', who: 'Shops', trig: 'When you photograph a new product',
      nodes: [['folder', 'Product photo'], ['lava', 'Writes listing'], ['you', 'You approve'], ['shop', 'Shop catalogue'], ['ig', 'Instagram Shop']],
      steps: [
        { n: 0, log: 'Trigger: new photo "solar-lamp.jpg"', v: { t: 'photos', imgs: ['ecommerce.webp'], cap: 'New product photo' } },
        { n: 1, log: 'Lava writes the title and description', v: { t: 'doc', h: 'Rechargeable solar lamp', body: 'Charges in the sun, lights a room all evening. Three brightness levels, a USB port to top up your phone, and a handle for carrying. In stock in Lumley today.' } },
        { n: 2, log: 'Waiting for your approval', approve: true, v: { t: 'listing', img: 'ecommerce.webp', title: 'Rechargeable solar lamp', body: 'Charges in the sun, lights a room all evening. Three brightness levels and a USB port.' } },
        { n: 3, log: 'Added to your shop catalogue', v: { t: 'sheet', h: 'Shop catalogue', cols: ['Item', 'Stock', 'Status'], rows: [['Rechargeable solar lamp', 'In stock', 'Added'], ['USB-C charger', 'In stock', 'Live'], ['Phone cable, 2m', 'Low', 'Live']], hl: 0 } },
        { n: 4, log: 'Shared to Instagram Shop', v: { t: 'result', h: 'Done', body: 'New stock is online the same day you photograph it.', items: [['shop', 'Catalogue', 'Added'], ['ig', 'Instagram Shop', 'Shared']] } }
      ] },
    { id: 'invoices', name: 'Invoice chasing', who: 'Any business that sends invoices', trig: 'Every Monday at 9am',
      nodes: [['clock', 'Monday 9am'], ['sheet', 'Invoices sheet'], ['lava', 'Drafts reminders'], ['you', 'You approve'], ['wa', 'Sent on WhatsApp']],
      steps: [
        { n: 0, log: 'Trigger: weekly schedule, Monday 9am', v: { t: 'doc', h: 'Weekly money check', body: 'Checking which invoices are overdue.' } },
        { n: 1, log: 'Found 2 overdue invoices', v: { t: 'sheet', h: 'Invoices', cols: ['Invoice', 'Client', 'Status'], rows: [['031', 'Kofi’s Bar', '12 days late'], ['034', 'Seaside Lodge', 'Paid'], ['036', 'Mama Fatu Catering', '5 days late']], hl: [0, 2] } },
        { n: 2, log: 'Lava drafts friendly reminders', v: { t: 'doc', h: 'Reminder to Kofi’s Bar', body: 'Hi Kofi, a friendly reminder that invoice 031 is now 12 days overdue. Reply here if you have any questions. Thank you for your business!' } },
        { n: 3, log: 'Waiting for your approval', approve: true, v: { t: 'chat', who: 'Kofi’s Bar', msgs: [['out', 'Hi Kofi, a friendly reminder that invoice 031 is now 12 days overdue. Reply here if you have any questions. Thank you for your business!']] } },
        { n: 4, log: 'Sent 2 reminders on WhatsApp', v: { t: 'result', h: 'Done', body: '2 reminders sent after your OK. Lava never moves money.', items: [['wa', 'Kofi’s Bar', 'Sent'], ['wa', 'Mama Fatu Catering', 'Sent']] } }
      ] },
    { id: 'leads', name: 'Lead finder', who: 'Marketers, agencies, suppliers', trig: 'Find: guesthouses in Freetown with no website',
      nodes: [['web', 'Web search'], ['lava', 'Checks each one'], ['sheet', 'Leads sheet'], ['lava', 'Drafts intros'], ['you', 'You approve']],
      steps: [
        { n: 0, log: 'Searching maps and directories', v: { t: 'doc', h: 'Search', body: 'Guesthouses in Freetown with no website, or only a Facebook page.' } },
        { n: 1, log: 'Checking websites and pages for each result', v: { t: 'sheet', h: 'Checking', cols: ['Business', 'Area', 'Online today'], rows: [['Sample Lodge', 'Aberdeen', 'No website'], ['Sample Guesthouse', 'Lumley', 'Facebook only'], ['Sample Inn', 'Hill Station', 'No website']] } },
        { n: 2, log: 'Saved to your leads sheet', v: { t: 'sheet', h: 'Leads sheet', cols: ['Business', 'Area', 'Next step'], rows: [['Sample Lodge', 'Aberdeen', 'Intro ready'], ['Sample Guesthouse', 'Lumley', 'Intro ready'], ['Sample Inn', 'Hill Station', 'Intro ready']], hl: [0, 1, 2] } },
        { n: 3, log: 'Lava writes a personal first message for each', v: { t: 'doc', h: 'Intro to Sample Lodge', body: 'Hello! I saw Sample Lodge has great reviews on Google but no website yet. Guests often book where they can see the rooms. Could I show you a quick example?' } },
        { n: 4, log: 'Waiting for your approval before anything is sent', approve: true, v: { t: 'result', h: 'Ready', body: '3 leads with a personal first message each. Nothing is sent until you approve.', items: [['sheet', 'Leads sheet', 'Updated'], ['you', 'Your OK', 'Needed']] } }
      ] },
    { id: 'prices', name: 'Price watch', who: 'Shops', trig: 'Every morning at 7am',
      nodes: [['clock', '7am'], ['web', 'Rival shops'], ['lava', 'Compares'], ['sheet', 'Price sheet'], ['wa', 'Summary to you']],
      steps: [
        { n: 0, log: 'Trigger: daily schedule, 7am', v: { t: 'doc', h: 'Morning price check', body: 'Checking 3 rival shops for your top 10 items.' } },
        { n: 1, log: 'Read prices from 3 rival shop pages', v: { t: 'sheet', h: 'Rival prices', cols: ['Item', 'Rivals', 'Change'], rows: [['USB-C charger', '2 cheaper', 'Dropped'], ['Solar lamp', 'All higher', 'No change'], ['Phone cable', 'Same', 'No change']] } },
        { n: 2, log: 'Compared with your prices', v: { t: 'sheet', h: 'You vs rivals', cols: ['Item', 'You', 'Advice'], rows: [['USB-C charger', 'Higher', 'Review price'], ['Solar lamp', 'Lowest', 'Promote it'], ['Phone cable', 'Same', 'Keep']], hl: [0, 1] } },
        { n: 3, log: 'Price sheet updated', v: { t: 'chips', items: [['sheet', 'Price sheet', 'Updated 7:02am']] } },
        { n: 4, log: 'Sent you a one line summary', v: { t: 'chat', who: 'Lava', msgs: [['in', 'Morning! 2 shops dropped charger prices yesterday. Your solar lamps are still the best deal in Lumley, worth a post today.']] } }
      ] },
    { id: 'checkup', name: 'Weekly sales check-up', who: 'Owners', trig: 'Every Sunday at 8pm',
      nodes: [['clock', 'Sunday 8pm'], ['sheet', 'Sales sheet'], ['lava', 'Finds trends'], ['lava', 'Suggests a promo'], ['wa', 'Summary to you']],
      steps: [
        { n: 0, log: 'Trigger: weekly schedule, Sunday 8pm', v: { t: 'doc', h: 'Weekly check-up', body: 'Reading this week’s sales.' } },
        { n: 1, log: 'Read 7 days of sales', v: { t: 'bars', h: 'Dishes this week', rows: [['Jollof rice', 92], ['Grilled fish', 70], ['Cassava leaf', 24]] } },
        { n: 2, log: 'Cassava leaf is selling slowly', v: { t: 'bars', h: 'Slow this week', rows: [['Jollof rice', 92], ['Grilled fish', 70], ['Cassava leaf', 24]], hl: 2 } },
        { n: 3, log: 'Lava suggests a midweek special', v: { t: 'doc', h: 'Suggestion', body: 'Run a Wednesday lunch special on cassava leaf, and post it on Tuesday evening when your followers are most active.' } },
        { n: 4, log: 'Sent you the summary', v: { t: 'chat', who: 'Lava', msgs: [['in', 'Good week! Jollof is your star. Cassava leaf is slow, so I drafted a Wednesday lunch special post for you to approve.']] } }
      ] },
    { id: 'inbox', name: 'Inbox sorting', who: 'Hotels, suppliers, agencies', trig: 'When new emails arrive',
      nodes: [['mail', 'Inbox'], ['lava', 'Sorts'], ['lava', 'Drafts reply'], ['you', 'You approve'], ['mail', 'Sent']],
      steps: [
        { n: 0, log: 'Trigger: 4 new emails', v: { t: 'mails', rows: [['Booking request, 3 nights', ''], ['Supplier invoice', ''], ['Newsletter', ''], ['Job application', '']] } },
        { n: 1, log: 'Sorted by what needs you first', v: { t: 'mails', rows: [['Booking request, 3 nights', 'Urgent'], ['Supplier invoice', 'Money'], ['Job application', 'Hiring'], ['Newsletter', 'Later']] } },
        { n: 2, log: 'Lava drafts a reply to the booking', v: { t: 'doc', h: 'Reply to booking request', body: 'Hello, thank you for choosing Harbour House. The sea view double is free for those 3 nights. Shall I hold it for you while you confirm?' } },
        { n: 3, log: 'Waiting for your approval', approve: true, v: { t: 'doc', h: 'Reply to booking request', body: 'Hello, thank you for choosing Harbour House. The sea view double is free for those 3 nights. Shall I hold it for you while you confirm?' } },
        { n: 4, log: 'Reply sent. 3 emails left for later', v: { t: 'result', h: 'Done', body: 'Your inbox is sorted. The urgent one is answered, the rest are labelled.', items: [['mail', 'Booking', 'Replied'], ['mail', 'Invoice', 'Labelled']] } }
      ] }
  ];

  var cur = 0, timers = [], t0 = 0, clock = 0, running = false;
  function later(fn, ms) { timers.push(setTimeout(fn, reduce ? 0 : ms)); }
  function clear() { timers.forEach(clearTimeout); timers = []; clearInterval(clock); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ic(k, small) { var a = A[k]; return '<span class="au-ic' + (small ? ' sm' : '') + '" style="background:' + a[1] + ';color:' + a[2] + '">' + a[0] + '</span>'; }
  function status(txt, state) { statusEl.setAttribute('data-state', state); statusEl.querySelector('span').textContent = txt; }
  function stamp() { var s = Math.floor((Date.now() - t0) / 1000); return '00:' + (s < 10 ? '0' : '') + s; }

  // list
  D.forEach(function (d, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'au-t-' + d.id;
    b.setAttribute('aria-selected', String(i === 0)); b.tabIndex = i === 0 ? 0 : -1;
    b.innerHTML = '<span class="au-li-n">' + esc(d.name) + '</span><span class="au-li-w">' + esc(d.who) + '</span>';
    b.addEventListener('click', function () { select(i); });
    b.addEventListener('keydown', function (e) {
      var k = e.key, n = (k === 'ArrowDown' || k === 'ArrowRight') ? 1 : (k === 'ArrowUp' || k === 'ArrowLeft') ? -1 : 0;
      if (!n) return; e.preventDefault(); var j = (i + n + D.length) % D.length; select(j); listEl.children[j].focus();
    });
    listEl.appendChild(b);
  });

  function views(v) {
    var h = '';
    if (v.t === 'photos') {
      h = '<p class="au-k">' + esc(v.cap) + '</p><div class="au-photos">' + v.imgs.map(function (s) { return '<img src="' + IMG + s + '" alt="" loading="lazy">'; }).join('') + '</div>';
    } else if (v.t === 'doc') {
      h = '<p class="au-k">' + esc(v.h) + '</p><p class="au-doc" data-type="' + esc(v.body) + '"></p>';
    } else if (v.t === 'post') {
      h = '<div class="au-post"><img src="' + IMG + v.img + '" alt="" loading="lazy"><div><p class="au-k">Instagram post &middot; ' + esc(v.when) + '</p><p class="au-post-t">' + esc(v.body) + '</p></div></div>';
    } else if (v.t === 'listing') {
      h = '<div class="au-post"><img src="' + IMG + v.img + '" alt="" loading="lazy"><div><p class="au-k">New listing</p><p class="au-post-h">' + esc(v.title) + '</p><p class="au-post-t">' + esc(v.body) + '</p></div></div>';
    } else if (v.t === 'review') {
      var st = ''; for (var i = 0; i < 5; i++) st += i < v.stars ? '★' : '☆';
      h = '<div class="au-review"><p class="au-rv-h"><b>' + esc(v.name) + '</b><span class="au-stars" aria-label="' + v.stars + ' of 5 stars">' + st + '</span></p><p>' + esc(v.body) + '</p></div>' + (v.reply ? '<div class="au-reply"><p class="au-k">Your reply (draft)</p><p>' + esc(v.reply) + '</p></div>' : '');
    } else if (v.t === 'sheet') {
      var hl = [].concat(v.hl === undefined ? [] : v.hl);
      h = '<p class="au-k">' + esc(v.h) + '</p><table class="au-sheet"><thead><tr>' + v.cols.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + v.rows.map(function (r, i) { return '<tr' + (hl.indexOf(i) > -1 ? ' class="hl"' : '') + ' style="--d:' + (i * 140) + 'ms">' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    } else if (v.t === 'bars') {
      h = '<p class="au-k">' + esc(v.h) + '</p><div class="au-bars">' + v.rows.map(function (r, i) { return '<div class="au-bar-r' + (v.hl === i ? ' hl' : '') + '"><span>' + esc(r[0]) + (v.hl === i ? ' <em>Slow</em>' : '') + '</span><b style="--w:' + r[1] + '%"></b></div>'; }).join('') + '</div>';
    } else if (v.t === 'chat') {
      h = '<p class="au-k">WhatsApp &middot; ' + esc(v.who) + '</p><div class="au-chat">' + v.msgs.map(function (m) { return '<p class="au-msg ' + m[0] + '">' + esc(m[1]) + '</p>'; }).join('') + '</div>';
    } else if (v.t === 'mails') {
      h = '<p class="au-k">Inbox</p><ul class="au-mails">' + v.rows.map(function (r, i) { return '<li style="--d:' + (i * 120) + 'ms">' + ic('mail', true) + '<span>' + esc(r[0]) + '</span>' + (r[1] ? '<em class="t-' + r[1].toLowerCase() + '">' + esc(r[1]) + '</em>' : '') + '</li>'; }).join('') + '</ul>';
    } else if (v.t === 'chips' || v.t === 'result') {
      h = (v.t === 'result' ? '<p class="au-done-h">' + esc(v.h) + '</p><p class="au-done-b">' + esc(v.body) + '</p>' : '') + '<ul class="au-chips">' + v.items.map(function (c) { return '<li>' + ic(c[0], true) + '<span>' + esc(c[1]) + '</span><em>' + esc(c[2]) + '</em></li>'; }).join('') + '</ul>';
    }
    return h;
  }
  function typeIn(el) {
    if (!el) return;
    var txt = el.getAttribute('data-type');
    if (reduce) { el.textContent = txt; return; }
    var i = 0; el.classList.add('typing');
    (function step() { i += 2; el.textContent = txt.slice(0, i); if (i < txt.length) { timers.push(setTimeout(step, 22)); } else { el.classList.remove('typing'); } })();
  }
  function show(v, approve, onApprove) {
    screen.innerHTML = '<div class="au-view">' + views(v) + '</div>';
    typeIn(screen.querySelector('.au-doc'));
    if (approve) {
      var bar = document.createElement('div');
      bar.className = 'au-approve';
      bar.innerHTML = '<span><b>Your approval needed.</b> Nothing goes out until you tap.</span><button type="button" class="ok">Approve</button>';
      screen.firstChild.appendChild(bar);
      var b = bar.querySelector('button');
      var done = false;
      function go(auto) { if (done) return; done = true; bar.innerHTML = '<span class="au-approved">✓ ' + (auto ? 'Approved by the owner' : 'You approved this') + '</span>'; onApprove(); }
      b.addEventListener('click', function () { go(false); });
      later(function () { go(true); }, 5200);
    }
  }
  function addLog(txt, cls) {
    var li = document.createElement('li');
    if (cls) li.className = cls;
    li.innerHTML = '<time>' + stamp() + '</time><span>' + esc(txt) + '</span>';
    logEl.appendChild(li); logEl.scrollTop = logEl.scrollHeight;
  }
  function setNode(i, state) {
    var n = pipe.children[i]; if (!n) return;
    n.setAttribute('data-state', state);
  }
  function render(d) {
    titleEl.textContent = d.name; trigEl.textContent = d.trig;
    pipe.innerHTML = d.nodes.map(function (n, i) { return '<li class="au-node" data-state="idle">' + (i ? '<span class="au-wire" aria-hidden="true"><i></i></span>' : '') + ic(n[0]) + '<span class="au-nl">' + esc(n[1]) + '</span></li>'; }).join('');
    logEl.innerHTML = ''; screen.innerHTML = '';
  }
  function run() {
    clear(); var d = D[cur]; render(d); running = true;
    t0 = Date.now(); status('Running 00:00', 'run');
    clock = setInterval(function () { status('Running ' + stamp(), 'run'); }, 500);
    var k = 0;
    (function next() {
      if (k >= d.steps.length) {
        clearInterval(clock); status('Finished in ' + stamp().slice(3) + 's', 'done');
        addLog('Finished. Every step above is logged for you.', 'end'); running = false; return;
      }
      var s = d.steps[k];
      for (var j = 0; j < d.nodes.length; j++) if (j < s.n) setNode(j, 'done');
      setNode(s.n, s.approve ? 'wait' : 'run');
      addLog(s.log, s.approve ? 'wait' : '');
      var proceed = function () { setNode(s.n, 'done'); k++; later(next, 900); };
      if (s.approve) { status('Waiting for you', 'wait'); clearInterval(clock); show(s.v, true, function () { addLog('Approved', 'ok'); clock = setInterval(function () { status('Running ' + stamp(), 'run'); }, 500); proceed(); }); }
      else { show(s.v, false); later(proceed, s.v.t === 'doc' ? 3200 : 2400); }
    })();
  }
  function select(i) {
    Array.prototype.forEach.call(listEl.children, function (b, k) { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    panel.setAttribute('aria-labelledby', listEl.children[i].id);
    cur = i; run();
  }
  app.querySelector('[data-au-replay]').addEventListener('click', run);
  panel.setAttribute('aria-labelledby', listEl.children[0].id);
  render(D[0]); status('Ready', 'idle');
  // Start the first run when the player is seen.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); run(); } }, { threshold: 0.35 });
    io.observe(app);
  } else { run(); }
})();

// Business OS: an office of agents at their desks, feeding an approval queue.
(function () {
  var root = document.querySelector('[data-of]');
  if (!root) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var floor = root.querySelector('[data-of-floor]'), queue = root.querySelector('[data-of-queue]');
  var empty = root.querySelector('[data-of-empty]'), waitEl = root.querySelector('[data-of-wait]'), doneEl = root.querySelector('[data-of-done]');
  var AG = [
    { n: 'Lava', r: 'Front desk', c: '#F7E04A', skin: '#7A4A2E', acts: ['Answering 3 WhatsApp chats', 'Booked a table for 4 at 7pm', 'Told a guest the kitchen closes at 11pm'], q: ['New booking: table for 4 at 7pm. Confirm?', 'Hold the sea view double for Friday?'] },
    { n: 'Iris', r: 'Inbox', c: '#8BB8FF', skin: '#5C3A24', acts: ['Sorting 6 new emails', 'Labelled a supplier invoice', 'Drafting a reply to a booking request'], q: ['Reply to the 3 night booking request?'] },
    { n: 'Kairos', r: 'Schedule', c: '#B5E3C8', skin: '#8D5A3B', acts: ['Checking tomorrow’s staff rota', 'Found a clash at 2pm', 'Moved a delivery to 10am'], q: ['Move Friday’s delivery to 10am?'] },
    { n: 'Argus', r: 'Daily brief', c: '#FFB38A', skin: '#4A2E1E', acts: ['Writing your morning brief', 'Spotted slow sales on cassava leaf', 'Brief ready for 7am'], q: [] },
    { n: 'Plutus', r: 'Money', c: '#E7D3BF', skin: '#6B4128', acts: ['Matching payments to invoices', 'Invoice 034 marked paid', 'Drafting 2 friendly reminders'], q: ['Send 2 payment reminders on WhatsApp?'] },
    { n: 'Mnemo', r: 'Memory', c: '#D7C2FF', skin: '#9A6744', acts: ['Remembering a regular’s order', 'Updated tonight’s menu', 'Saved a new supplier contact'], q: [] },
    { n: 'Mercury', r: 'Market watch', c: '#9FE3FF', skin: '#5A3725', acts: ['Checking 3 rival shops', 'Charger prices dropped nearby', 'Price sheet updated'], q: ['Lower the USB-C charger price to match?'] },
    { n: 'Prometheus', r: 'Builder', c: '#FF9FB0', skin: '#7E4E30', acts: ['Drafting a weekend promo post', 'Designing a lunch special poster', 'Post ready with 3 photo options'], q: ['Post the weekend promo on Instagram?'] }
  ];
  function desk(a, i) {
    return '<article class="of-desk" data-i="' + i + '" style="--c:' + a.c + ';--skin:' + a.skin + '">' +
      '<svg class="of-scene" viewBox="0 0 200 130" aria-hidden="true" focusable="false">' +
      '<ellipse cx="100" cy="122" rx="78" ry="6" fill="rgba(0,0,0,.25)"/>' +
      '<rect x="62" y="40" width="76" height="62" rx="16" fill="#1C3A40"/>' +                     // chair back
      '<g class="of-body"><rect x="72" y="64" width="56" height="44" rx="18" fill="var(--c)"/>' +  // torso
      '<circle cx="100" cy="46" r="15" fill="var(--skin)"/>' +                                      // head
      '<path d="M86 40 Q100 22 114 40 Q108 33 100 33 Q92 33 86 40Z" fill="#141414"/></g>' +           // hair
      '<g class="of-arm l"><rect x="66" y="80" width="14" height="26" rx="7" fill="var(--c)"/></g>' +
      '<g class="of-arm r"><rect x="120" y="80" width="14" height="26" rx="7" fill="var(--c)"/></g>' +
      '<rect x="20" y="96" width="160" height="10" rx="5" fill="#C9A27A"/>' +                         // desk top
      '<rect x="30" y="106" width="8" height="18" fill="#9C7A57"/><rect x="162" y="106" width="8" height="18" fill="#9C7A57"/>' +
      '<path d="M74 96 L80 72 H120 L126 96Z" fill="#E9EEF0"/>' +                                      // laptop back
      '<circle class="of-led" cx="100" cy="84" r="3.5" fill="var(--c)"/>' +
      '<rect x="146" y="84" width="12" height="12" rx="3" fill="#F5ECE5"/><path d="M158 87 q5 3 0 6" stroke="#F5ECE5" stroke-width="2" fill="none"/>' + // mug
      '<g class="of-steam"><path d="M150 80 q-3 -5 0 -10" stroke="rgba(255,255,255,.5)" stroke-width="1.5" fill="none"/><path d="M154 80 q3 -5 0 -10" stroke="rgba(255,255,255,.4)" stroke-width="1.5" fill="none"/></g>' +
      '<rect x="34" y="78" width="16" height="18" rx="3" fill="#2E6B4F"/><path d="M42 78 q-8 -14 -2 -22 q6 8 2 22 q2 -12 10 -16 q0 10 -10 16" fill="#3D8B5F"/>' + // plant
      '</svg>' +
      '<div class="of-meta"><b>' + a.n + '</b><span>' + a.r + '</span><i class="of-dot" aria-hidden="true"></i></div>' +
      '<p class="of-act" data-act>' + a.acts[0] + '</p>' +
      '<button type="button" class="of-how" data-agent="' + a.n + '">See how ' + a.n + ' works<span aria-hidden="true"> &rarr;</span></button></article>';
  }
  floor.innerHTML = AG.map(desk).join('');
  var desks = floor.querySelectorAll('.of-desk');
  var done = 0, waiting = 0, step = [0, 0, 0, 0, 0, 0, 0, 0], qi = [0, 0, 0, 0, 0, 0, 0, 0], timer = null, tick = 0;
  function counts() { waitEl.textContent = waiting; doneEl.textContent = done; empty.hidden = waiting > 0; }
  function addQueue(i) {
    var a = AG[i]; if (!a.q.length || waiting >= 3) return;
    var text = a.q[qi[i]++ % a.q.length];
    var li = document.createElement('li');
    li.className = 'of-q';
    li.style.setProperty('--c', a.c);
    li.innerHTML = '<p class="of-q-h"><i></i>' + a.n + ' &middot; ' + a.r + '</p><p class="of-q-t">' + text + '</p><div class="of-q-b"><button type="button" class="ok">Approve</button><button type="button" class="no">Not now</button></div>';
    queue.appendChild(li); waiting++; counts();
    function resolve(ok) {
      li.querySelector('.of-q-b').outerHTML = '<p class="of-q-r">' + (ok ? '✓ Approved. ' + a.n + ' is on it.' : 'Held. Nothing was sent.') + '</p>';
      if (ok) done++;
      waiting--; counts();
      setTimeout(function () { li.classList.add('out'); setTimeout(function () { li.remove(); }, reduce ? 0 : 400); }, reduce ? 1500 : 1600);
    }
    li.querySelector('.ok').addEventListener('click', function () { resolve(true); });
    li.querySelector('.no').addEventListener('click', function () { resolve(false); });
  }
  function beat() {
    tick++;
    var i = Math.floor(Math.random() * AG.length);
    desks.forEach(function (d) { d.classList.remove('busy'); });
    var pick = [i, (i + 3) % AG.length, (i + 5) % AG.length];
    pick.forEach(function (k) { desks[k].classList.add('busy'); });
    var a = AG[i], d = desks[i];
    step[i] = (step[i] + 1) % a.acts.length;
    var act = d.querySelector('[data-act]');
    act.classList.remove('show'); void act.offsetWidth;
    act.textContent = a.acts[step[i]]; act.classList.add('show');
    if (step[i] === a.acts.length - 1) { done++; counts(); }
    if (tick % 2 === 1) { var withQ = pick.filter(function (k) { return AG[k].q.length; }); addQueue(withQ.length ? withQ[0] : 0); }
  }
  counts();
  if (reduce) { addQueue(0); addQueue(4); return; }
  function start() { if (!timer) { beat(); timer = setInterval(beat, 2600); } }
  function stop() { clearInterval(timer); timer = null; desks.forEach(function (d) { d.classList.remove('busy'); }); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }, { threshold: 0.2 }).observe(root);
  } else { start(); }
})();

// Workflow films: switch business (restaurant / guesthouse / shop).
(function () {
  var tabs = document.querySelectorAll('[data-wf]');
  if (!tabs.length) return;
  var WR = document.documentElement.getAttribute('data-root') || '';
  var v = document.querySelector('[data-wf-video]'), h = document.querySelector('[data-wf-h]'), p = document.querySelector('[data-wf-p]'), dl = document.querySelector('[data-wf-dl]'), fig = document.getElementById('wf-film');
  var D = {
    rest: { f: 'restaurant', h: 'Friday, 7:42pm. The kitchen is full.', p: 'Watch two customers get answered while the owner keeps cooking. Lava handles the easy question, and the booking waits for one tap.', a: 'Illustrative demo: on a busy Friday night two customers message a restaurant on WhatsApp. Lava answers that jollof is available, drafts a booking for 4 at 8:30, the owner taps Approve, and the booking is added to the table sheet.' },
    hotel: { f: 'hotel', h: 'Tuesday, 2:14am. Everyone is asleep.', p: 'A guest abroad asks about rooms in the middle of the night. Lava answers straight away, and the room is held with one tap in the morning.', a: 'Illustrative demo: at 2am a guest messages a guesthouse asking for a sea view room for 3 nights and whether breakfast is included. Lava answers, and at 7am the owner taps Approve to hold the room, which appears in the room calendar.' },
    shop: { f: 'shop', h: 'Monday, 10:05am. New stock just landed.', p: 'Customers ask about the new solar lamps while you serve the counter. Lava checks stock, answers, and the order waits for your tap.', a: 'Illustrative demo: customers message a shop asking about new solar lamps and delivery to Lumley. Lava checks stock and answers, the owner taps Approve, and the order is added to today\u2019s deliveries.' }
  };
  function select(i) {
    tabs.forEach(function (t, k) { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    var d = D[tabs[i].getAttribute('data-wf')];
    fig.setAttribute('aria-labelledby', tabs[i].id);
    h.textContent = d.h; p.textContent = d.p; dl.href = WR + 'assets/video/workflows/' + d.f + '-9x16.mp4';
    v.setAttribute('aria-label', d.a); v.poster = WR + 'assets/video/workflows/' + d.f + '-16x9.webp';
    var src = WR + 'assets/video/workflows/' + d.f + '-16x9-lite.mp4';
    v.setAttribute('data-src', src);
    if (v.getAttribute('src')) { v.src = src; v.play().catch(function () {}); }
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(i); });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!n) return;
      e.preventDefault(); var j = (i + n + tabs.length) % tabs.length; select(j); tabs[j].focus();
    });
  });
})();

// Follow one request: illustrated stations, pinned horizontal scroll, a packet that travels desk to desk.
(function () {
  var root = document.querySelector('[data-fx]');
  if (!root) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var track = root.querySelector('[data-fx-track]'), packet = root.querySelector('[data-fx-packet]'), pk = root.querySelector('[data-fx-pk]'), bar = root.querySelector('[data-fx-bar]');
  var section = root.parentNode;

  // Shared character at a desk; each station adds its own props.
  function person(c, skin, x) {
    x = x || 0;
    return '<g transform="translate(' + x + ',0)">' +
      '<rect x="128" y="104" width="64" height="70" rx="18" fill="#1C3A40"/>' +
      '<rect x="134" y="130" width="52" height="44" rx="16" fill="' + c + '"/>' +
      '<circle cx="160" cy="114" r="15" fill="' + skin + '"/>' +
      '<path d="M146 108 Q160 90 174 108 Q168 101 160 101 Q152 101 146 108Z" fill="#141414"/>' +
      '<g class="arm l"><rect x="128" y="146" width="13" height="26" rx="6.5" fill="' + c + '"/></g>' +
      '<g class="arm r"><rect x="179" y="146" width="13" height="26" rx="6.5" fill="' + c + '"/></g></g>';
  }
  var desk = '<ellipse cx="160" cy="226" rx="128" ry="8" fill="rgba(0,0,0,.25)"/><rect x="40" y="170" width="240" height="12" rx="6" fill="#C9A27A"/><rect x="54" y="182" width="9" height="40" fill="#9C7A57"/><rect x="257" y="182" width="9" height="40" fill="#9C7A57"/>';
  var laptop = '<path d="M134 170 L141 146 H179 L186 170Z" fill="#E9EEF0"/>';
  var S = [
    { a: 'Customer', r: 'WhatsApp', c: '#25D366', k: 'New WhatsApp message', t: 'Aminata messages the restaurant', p: 'It is 7:42pm on a busy Friday.', q: 'Hi! Table for 4 at 8:30 tonight?',
      art: '<rect x="118" y="40" width="84" height="150" rx="16" fill="#0B0F10"/><rect x="124" y="50" width="72" height="130" rx="10" fill="#ECE5DD"/>' +
           '<rect class="pop" x="140" y="70" width="52" height="20" rx="8" fill="#D9FDD3"/><rect class="pop d2" x="130" y="98" width="46" height="16" rx="7" fill="#fff"/>' +
           '<g class="pop d3"><circle cx="232" cy="62" r="20" fill="#25D366"/><path d="M224 62 l6 6 l11 -12" stroke="#fff" stroke-width="4" fill="none"/></g>' +
           '<rect x="40" y="196" width="240" height="10" rx="5" fill="#C9A27A"/>' },
    { a: 'Lava', r: 'Front desk', c: '#F7E04A', k: 'Read by Lava', t: 'Lava reads it and understands it', p: 'A booking: 4 people, tonight, 8:30. Not a question it can answer alone.', q: 'Intent: table booking',
      art: desk + person('#F7E04A', '#7A4A2E') + laptop + '<rect class="pop" x="208" y="58" width="78" height="34" rx="10" fill="#fff"/><path class="pop" d="M222 92 l-6 12 l14 -12z" fill="#fff"/><rect class="pop d2" x="216" y="68" width="50" height="5" rx="2.5" fill="#0B252A"/><rect class="pop d2" x="216" y="78" width="34" height="5" rx="2.5" fill="#C9A27A"/>' },
    { a: 'Mnemo', r: 'Memory', c: '#D7C2FF', k: 'Regular guest found', t: 'Mnemo remembers her', p: 'Aminata has booked three times. She likes the window table.', q: 'Regular: Aminata, window seat',
      art: desk + person('#D7C2FF', '#9A6744', -40) + '<rect x="196" y="96" width="70" height="74" rx="6" fill="#4C6E73"/><rect x="202" y="104" width="58" height="18" rx="3" fill="#5E8288"/><rect x="202" y="128" width="58" height="18" rx="3" fill="#5E8288"/><g class="pop"><rect x="214" y="70" width="44" height="34" rx="4" fill="#fff"/><rect x="220" y="78" width="30" height="4" rx="2" fill="#D7C2FF"/><rect x="220" y="87" width="22" height="4" rx="2" fill="#C9A27A"/></g>' },
    { a: 'Kairos', r: 'Schedule', c: '#B5E3C8', k: '8:30 is free', t: 'Kairos checks the tables', p: 'The window table is free at 8:30, before the 9:15 booking.', q: 'Window table, 8:30 to 9:10: free',
      art: desk + person('#B5E3C8', '#8D5A3B', -40) + '<rect x="190" y="52" width="96" height="92" rx="8" fill="#F5ECE5"/><rect x="190" y="52" width="96" height="16" rx="8" fill="#0B6B5C"/>' +
           [0,1,2,3].map(function (r) { return [0,1,2,3].map(function (q) { return '<rect x="' + (198 + q * 21) + '" y="' + (74 + r * 16) + '" width="16" height="11" rx="2" fill="#E3DED7"/>'; }).join(''); }).join('') +
           '<rect class="pop" x="240" y="106" width="16" height="11" rx="2" fill="#F7E04A"/>' },
    { a: 'Plutus', r: 'Money', c: '#E7D3BF', k: 'No deposit needed', t: 'Plutus checks the money rules', p: 'Tables under 6 need no deposit. Plutus never moves money.', q: 'Deposit: not required',
      art: desk + person('#E7D3BF', '#6B4128', -40) + '<rect x="196" y="140" width="74" height="30" rx="4" fill="#8A4B2A"/><rect x="200" y="136" width="66" height="8" rx="2" fill="#F5ECE5"/><g class="pop"><path d="M232 66 l26 10 v18 c0 16 -12 26 -26 30 c-14 -4 -26 -14 -26 -30 v-18z" fill="#0B6B5C"/><path d="M222 94 l7 7 l13 -14" stroke="#fff" stroke-width="4" fill="none"/></g>' },
    { a: 'Lava', r: 'Front desk', c: '#F7E04A', k: 'Reply drafted', t: 'Lava writes the reply', p: 'A friendly confirmation, saved as a draft. Nothing is sent yet.', q: 'You are booked: window table for 4 at 8:30. See you soon!',
      art: desk + person('#F7E04A', '#7A4A2E') + laptop + '<rect x="200" y="54" width="90" height="72" rx="10" fill="#fff"/><rect class="pop" x="210" y="66" width="68" height="6" rx="3" fill="#0B252A"/><rect class="pop d2" x="210" y="80" width="56" height="6" rx="3" fill="#0B252A"/><rect class="pop d3" x="210" y="94" width="42" height="6" rx="3" fill="#0B252A"/><rect x="210" y="108" width="34" height="10" rx="5" fill="#E3DED7"/>' },
    { a: 'You', r: 'At the stove', c: '#F7E04A', k: 'Approved by you', t: 'One tap from you', p: 'Your phone buzzes at the stove. You check it and tap Approve.', q: 'New booking: window table for 4 at 8:30, Aminata. [Approve]',
      art: '<ellipse cx="160" cy="226" rx="128" ry="8" fill="rgba(0,0,0,.25)"/><rect x="40" y="150" width="130" height="76" rx="6" fill="#3A4446"/><rect x="48" y="140" width="114" height="12" rx="4" fill="#59656A"/><rect x="66" y="112" width="60" height="30" rx="6" fill="#8A4B2A"/>' +
           '<g class="steam"><path d="M84 106 q-4 -8 0 -16" stroke="rgba(255,255,255,.55)" stroke-width="3" fill="none"/><path d="M100 106 q4 -8 0 -16" stroke="rgba(255,255,255,.45)" stroke-width="3" fill="none"/></g>' +
           person('#0B6B5C', '#5C3A24', 40) + '<g class="pop"><rect x="226" y="58" width="58" height="96" rx="10" fill="#0B0F10"/><rect x="231" y="66" width="48" height="80" rx="6" fill="#0B252A"/><rect x="237" y="76" width="36" height="5" rx="2.5" fill="#fff"/><rect x="237" y="86" width="28" height="5" rx="2.5" fill="#fff"/><rect x="237" y="118" width="36" height="14" rx="7" fill="#F7E04A"/></g>' },
    { a: 'Done', r: 'Everyone', c: '#9BE7C4', k: 'Booked', t: 'Aminata is booked', p: 'She gets the confirmation. The table sheet updates. Argus adds it to tomorrow\u2019s brief.', q: 'Booked: Aminata, 4, 8:30, window. Sent 7:44pm.',
      art: '<rect x="40" y="196" width="240" height="10" rx="5" fill="#C9A27A"/><rect x="70" y="60" width="180" height="120" rx="12" fill="#F5ECE5"/><rect x="70" y="60" width="180" height="22" rx="12" fill="#0B6B5C"/>' +
           '<rect x="84" y="94" width="152" height="14" rx="3" fill="#E3DED7"/><rect class="pop" x="84" y="114" width="152" height="14" rx="3" fill="#FFF6C7"/><rect x="84" y="134" width="152" height="14" rx="3" fill="#E3DED7"/><rect x="84" y="154" width="152" height="14" rx="3" fill="#E3DED7"/>' +
           '<g class="pop d2"><circle cx="246" cy="64" r="22" fill="#18A957"/><path d="M236 64 l7 7 l13 -14" stroke="#fff" stroke-width="4.5" fill="none"/></g>' }
  ];
  track.innerHTML = S.map(function (d, i) {
    return '<li class="fx-st" style="--c:' + d.c + '"><svg class="fx-scene" viewBox="0 0 320 240" role="img" aria-label="' + d.a + ': ' + d.t + '">' + d.art + '</svg>' +
      '<div class="fx-cap"><span class="n"><i></i>Step ' + (i + 1) + ' of ' + S.length + ' &middot; ' + d.a + ' &middot; ' + d.r + '</span><b>' + d.t + '</b><p>' + d.p + '</p><q>' + d.q + '</q></div></li>';
  }).join('');
  var st = [].slice.call(track.children);
  if (reduce) { st.forEach(function (s) { s.classList.add('on'); }); return; }

  var centers = [], maxX = 0;
  function measure() {
    var base = track.getBoundingClientRect().left - (parseFloat(track.style.getPropertyValue('--x')) || 0);
    centers = st.map(function (s) { var r = s.getBoundingClientRect(); return r.left - track.getBoundingClientRect().left + r.width / 2; });
    maxX = Math.max(0, track.scrollWidth - root.clientWidth + parseFloat(getComputedStyle(track).paddingLeft));
  }
  function tick() {
    var r = section.getBoundingClientRect();
    var p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
    var f = p * (S.length - 1), i = Math.round(f);
    // keep the active station centred where possible
    var lo = Math.floor(f), hi = Math.min(S.length - 1, lo + 1), w = f - lo;
    var cx = centers[lo] + (centers[hi] - centers[lo]) * w;
    var x = Math.min(maxX, Math.max(0, cx - root.clientWidth / 2));
    track.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
    packet.style.left = (cx - x) + 'px';
    pk.textContent = S[i].k;
    st.forEach(function (s, k) { s.classList.toggle('on', k === i); s.classList.toggle('done', k < i); });
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
  }
  measure();
  addEventListener('resize', function () { measure(); tick(); });
  addEventListener('scroll', tick, { passive: true });
  tick();
})();

// Agent demos: click a desk to watch that agent's automation run, step by step.
(function () {
  var dlg = document.getElementById('ad');
  if (!dlg) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s) { return dlg.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var IMG = (document.documentElement.getAttribute('data-root') || '') + 'assets/photo/';
  var A = {
    Lava: { c: '#F7E04A', r: 'Front desk', trig: 'Whenever a customer messages', steps: [
      { t: 'A customer messages on WhatsApp', v: { k: 'chat', who: 'Aminata', msgs: [['in', 'Hi! Table for 4 at 8:30 tonight?'], ['in', 'Do you still have jollof?']] } },
      { t: 'Lava checks your menu and tables', v: { k: 'sources', items: [['Menu', 'Jollof: available until 11pm', 1], ['Tables tonight', 'Window table free at 8:30', 1], ['Rules', 'Bookings need your OK', 0]] } },
      { t: 'It answers the easy question right away', v: { k: 'chat', who: 'Aminata', msgs: [['in', 'Do you still have jollof?'], ['out', 'Yes! Jollof is on until 11pm.']] } },
      { t: 'The booking waits for your tap', v: { k: 'approve', text: 'New booking: table for 4 at 8:30 tonight, Aminata.' } },
      { t: 'Booked, and your sheet is updated', v: { k: 'done', head: 'Aminata is booked', chips: [['WhatsApp', 'Confirmation sent'], ['Table sheet', '8:30 added']] } } ] },
    Iris: { c: '#8BB8FF', r: 'Inbox', trig: 'When new emails arrive', steps: [
      { t: 'Six emails land overnight', v: { k: 'mails', rows: [['Booking request, 12 people Saturday', ''], ['Invoice from Sunrise Rice', ''], ['Newsletter: food expo', ''], ['Job application: waiter', ''], ['Review alert: 5 stars', ''], ['Promo from a supplier', '']] } },
      { t: 'Iris sorts them by what needs you', v: { k: 'mails', rows: [['Booking request, 12 people Saturday', 'Needs you'], ['Invoice from Sunrise Rice', 'Money'], ['Job application: waiter', 'Hiring'], ['Review alert: 5 stars', 'Good news'], ['Newsletter: food expo', 'Later'], ['Promo from a supplier', 'Later']] } },
      { t: 'It drafts a reply to the big booking', v: { k: 'doc', head: 'Draft reply', body: 'Hello! We would love to host your group of 12 on Saturday. We can seat you from 7pm in the garden. Shall I hold it?' } },
      { t: 'You approve before it goes out', v: { k: 'approve', text: 'Send the reply to the Saturday group of 12?' } },
      { t: 'Reply sent, the rest labelled', v: { k: 'done', head: 'Inbox sorted', chips: [['Booking', 'Replied'], ['Invoice', 'Sent to Plutus'], ['Application', 'Saved for you']] } } ] },
    Kairos: { c: '#B5E3C8', r: 'Schedule', trig: 'Every evening at 9pm', steps: [
      { t: 'Kairos reads tomorrow\u2019s rota', v: { k: 'cal', rows: [['10am', 'Rice delivery', ''], ['2pm', 'Grace: lunch shift', ''], ['2pm', 'Grace: bank visit', 'Clash'], ['4pm', 'Musa: evening shift', '']] } },
      { t: 'It spots a clash at 2pm', v: { k: 'flags', items: [['Clash', 'Grace is on shift and at the bank at 2pm.']] } },
      { t: 'It proposes a fix', v: { k: 'doc', head: 'Suggestion', body: 'Move Grace\u2019s lunch shift to Fatu, who is free 12 to 4pm. Grace keeps her bank visit.' } },
      { t: 'You approve the swap', v: { k: 'approve', text: 'Swap tomorrow\u2019s lunch shift from Grace to Fatu?' } },
      { t: 'Rota updated, staff told', v: { k: 'done', head: 'No clash tomorrow', chips: [['Rota', 'Updated'], ['Fatu', 'WhatsApp sent'], ['Grace', 'WhatsApp sent']] } } ] },
    Argus: { c: '#FFB38A', r: 'Daily brief', trig: 'Every morning at 6:30am', steps: [
      { t: 'At 6:30am Argus gathers yesterday', v: { k: 'sources', items: [['Sales sheet', '82 plates sold', 1], ['Bookings', '3 tables tonight', 1], ['WhatsApp', '14 chats, all answered', 1], ['Email', '6 new, 1 needs you', 1]] } },
      { t: 'It reads what sold', v: { k: 'bars', head: 'Plates sold yesterday', rows: [['Jollof rice', 42], ['Grilled fish', 31], ['Cassava leaf', 9]], hl: 2 } },
      { t: 'It checks the inbox and today\u2019s bookings', v: { k: 'cal', rows: [['Today 1pm', 'Rice delivery moved to Thursday', 'Watch'], ['Today 7pm', 'Table for 4, Aminata', ''], ['Today 8pm', 'Group of 12', 'Big'], ['Email', 'Saturday group wants a reply', 'Needs you']] } },
      { t: 'It spots what needs you', v: { k: 'flags', items: [['Stock', 'Rice delivery is late. Buy 2 bags today for the group of 12.'], ['Slow seller', 'Cassava leaf is slow 3 days running.'], ['Reply', 'The Saturday group is waiting for an answer.']] } },
      { t: 'At 7am your brief arrives', v: { k: 'phone', text: 'Good morning! Yesterday: 82 plates, jollof was the star. Today: 3 tables, including 12 people at 8pm. Needs you: buy 2 bags of rice (delivery moved to Thursday) and answer the Saturday group. Idea: a cassava leaf lunch special.' } } ] },
    Plutus: { c: '#E7D3BF', r: 'Money', trig: 'Every Monday at 9am', steps: [
      { t: 'Plutus reads your invoices', v: { k: 'sheet', cols: ['Invoice', 'Client', 'Status'], rows: [['031', 'Kofi\u2019s Bar', '12 days late'], ['034', 'Seaside Lodge', 'Paid'], ['036', 'Mama Fatu Catering', '5 days late']], hl: [0, 2] } },
      { t: 'It drafts friendly reminders', v: { k: 'doc', head: 'Reminder to Kofi\u2019s Bar', body: 'Hi Kofi, a friendly reminder that invoice 031 is now 12 days overdue. Reply here with any questions. Thank you!' } },
      { t: 'You approve before anything is sent', v: { k: 'approve', text: 'Send 2 payment reminders on WhatsApp?' } },
      { t: 'Reminders sent. Plutus never moves money', v: { k: 'done', head: '2 reminders sent', chips: [['Kofi\u2019s Bar', 'Sent'], ['Mama Fatu Catering', 'Sent'], ['Money moved', 'Never']] } } ] },
    Mnemo: { c: '#D7C2FF', r: 'Memory', trig: 'After every conversation', steps: [
      { t: 'A regular orders again', v: { k: 'chat', who: 'Aminata', msgs: [['in', 'Same as last time please! No pepper on mine.']] } },
      { t: 'Mnemo saves what matters', v: { k: 'sources', items: [['Name', 'Aminata', 1], ['Usual', 'Grilled fish, window table', 1], ['Note', 'No pepper', 1], ['Visits', '4th visit this year', 1]] } },
      { t: 'Next time, Lava already knows', v: { k: 'chat', who: 'Aminata', msgs: [['in', 'Table for 2 on Friday?'], ['out', 'Of course, Aminata! Window table, and we will keep the pepper off your fish.']] } },
      { t: 'Regulars feel remembered', v: { k: 'done', head: 'Remembered, not repeated', chips: [['Customer file', 'Updated'], ['Lava', 'Uses it in replies']] } } ] },
    Mercury: { c: '#9FE3FF', r: 'Market watch', trig: 'Every morning at 7am', steps: [
      { t: 'Mercury checks 3 rival shops', v: { k: 'sources', items: [['Shop A', 'Prices read', 1], ['Shop B', 'Prices read', 1], ['Shop C', 'Prices read', 1]] } },
      { t: 'It compares with your prices', v: { k: 'sheet', cols: ['Item', 'Rivals', 'You'], rows: [['USB-C charger', '2 dropped', 'Higher'], ['Solar lamp', 'All higher', 'Lowest'], ['Phone cable', 'Same', 'Same']], hl: [0, 1] } },
      { t: 'It writes one line for you', v: { k: 'phone', text: 'Morning! 2 shops dropped charger prices yesterday. Your solar lamps are still the best deal in Lumley, worth a post today.' } },
      { t: 'You decide what to change', v: { k: 'done', head: 'You stay ahead', chips: [['Price sheet', 'Updated 7:02am'], ['Your prices', 'Only you change them']] } } ] },
    Prometheus: { c: '#FF9FB0', r: 'Builder', trig: 'When Argus flags a slow seller', steps: [
      { t: 'Argus flags cassava leaf as slow', v: { k: 'flags', items: [['Slow seller', 'Cassava leaf: 9 plates, down 3 days running.']] } },
      { t: 'Prometheus designs a promo', v: { k: 'post', img: 'restaurant.webp', when: 'Instagram \u00b7 Tuesday 6pm', body: 'Wednesday lunch special: cassava leaf with rice and a cold ginger beer. Book on WhatsApp.' } },
      { t: 'You approve the post', v: { k: 'approve', text: 'Schedule the Wednesday lunch special for Tuesday 6pm?' } },
      { t: 'Scheduled on Instagram and Facebook', v: { k: 'done', head: 'Promo scheduled', chips: [['Instagram', 'Tue 6pm'], ['Facebook Page', 'Tue 6pm'], ['WhatsApp list', 'Wed 11am']] } } ] }
  };

  function view(v) {
    if (v.k === 'chat') return '<div class="ad-chat"><p class="ad-k">WhatsApp &middot; ' + esc(v.who) + '</p>' + v.msgs.map(function (m, i) { return '<p class="ad-msg ' + m[0] + '" style="--d:' + (i * 450) + 'ms">' + esc(m[1]) + '</p>'; }).join('') + '</div>';
    if (v.k === 'sources') return '<ul class="ad-src">' + v.items.map(function (s, i) { return '<li style="--d:' + (i * 380) + 'ms"><span class="ad-ico">' + esc(s[0].slice(0, 2)) + '</span><div><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div><i class="' + (s[2] ? 'ok' : 'warn') + '">' + (s[2] ? '\u2713' : '!') + '</i></li>'; }).join('') + '</ul>';
    if (v.k === 'bars') { var mx = Math.max.apply(null, v.rows.map(function (r) { return r[1]; })); return '<p class="ad-k">' + esc(v.head) + '</p><div class="ad-bars">' + v.rows.map(function (r, i) { return '<div class="' + (v.hl === i ? 'hl' : '') + '" style="--d:' + (i * 250) + 'ms"><span>' + esc(r[0]) + (v.hl === i ? ' <em>Slow</em>' : '') + '</span><b style="--w:' + Math.round(r[1] / mx * 100) + '%"><i>' + r[1] + '</i></b></div>'; }).join('') + '</div>'; }
    if (v.k === 'mails') return '<ul class="ad-mails">' + v.rows.map(function (r, i) { return '<li style="--d:' + (i * 200) + 'ms"><span class="ad-ico">@</span><span>' + esc(r[0]) + '</span>' + (r[1] ? '<em class="t-' + r[1].split(' ')[0].toLowerCase() + '">' + esc(r[1]) + '</em>' : '') + '</li>'; }).join('') + '</ul>';
    if (v.k === 'cal') return '<ul class="ad-cal">' + v.rows.map(function (r, i) { return '<li style="--d:' + (i * 250) + 'ms" class="' + (r[2] ? 'flag' : '') + '"><time>' + esc(r[0]) + '</time><span>' + esc(r[1]) + '</span>' + (r[2] ? '<em>' + esc(r[2]) + '</em>' : '') + '</li>'; }).join('') + '</ul>';
    if (v.k === 'flags') return '<ul class="ad-flags">' + v.items.map(function (f, i) { return '<li style="--d:' + (i * 400) + 'ms"><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></li>'; }).join('') + '</ul>';
    if (v.k === 'doc') return '<div class="ad-doc"><p class="ad-k">' + esc(v.head) + '</p><p class="ad-type" data-type="' + esc(v.body) + '"></p></div>';
    if (v.k === 'sheet') return '<table class="ad-sheet"><thead><tr>' + v.cols.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + v.rows.map(function (r, i) { return '<tr class="' + ((v.hl || []).indexOf(i) > -1 ? 'hl' : '') + '" style="--d:' + (i * 220) + 'ms">' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    if (v.k === 'phone') return '<div class="ad-phone"><div class="ad-ph-top"><span class="ad-av">L</span><b>Lava &middot; your morning brief</b></div><div class="ad-ph-body"><p class="ad-msg in ad-type" data-type="' + esc(v.text) + '"></p></div></div>';
    if (v.k === 'approve') return '<div class="ad-phone own"><div class="ad-ph-top"><span class="ad-av">You</span><b>Owner alerts</b></div><div class="ad-ph-body"><div class="ad-ok"><span class="ad-k" style="color:#F7E04A">Needs your OK</span><p>' + esc(v.text) + '</p><div class="ad-btns"><button type="button" class="yes">Approve</button><span>Not now</span></div></div></div></div>';
    if (v.k === 'post') return '<div class="ad-post"><img src="' + IMG + v.img + '" alt="" loading="lazy"><div><p class="ad-k">' + esc(v.when) + '</p><p class="ad-type" data-type="' + esc(v.body) + '"></p></div></div>';
    if (v.k === 'done') return '<div class="ad-done"><span class="ad-tick">\u2713</span><b>' + esc(v.head) + '</b><ul>' + v.chips.map(function (c, i) { return '<li style="--d:' + (i * 200) + 'ms"><span>' + esc(c[0]) + '</span><em>' + esc(c[1]) + '</em></li>'; }).join('') + '</ul></div>';
    return '';
  }

  var cur = null, idx = 0, playing = true, timer = null, typer = null;
  function clear() { clearTimeout(timer); clearTimeout(typer); }
  function typeIn() {
    var el = $('.ad-stage .ad-type'); if (!el) return;
    var txt = el.getAttribute('data-type');
    if (reduce) { el.textContent = txt; return; }
    var i = 0; el.classList.add('typing');
    (function step() { i += 2; el.textContent = txt.slice(0, i); if (i < txt.length) typer = setTimeout(step, 20); else el.classList.remove('typing'); })();
  }
  function render() {
    clear();
    var a = A[cur], s = a.steps[idx];
    $('[data-ad-rail]').innerHTML = a.steps.map(function (st, i) { return '<li class="' + (i < idx ? 'ok' : i === idx ? 'on' : '') + '"><button type="button" data-go="' + i + '" aria-label="Step ' + (i + 1) + ': ' + esc(st.t) + '"' + (i === idx ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span></button></li>'; }).join('');
    $('[data-ad-fill]').style.transform = 'scaleX(' + (a.steps.length > 1 ? idx / (a.steps.length - 1) : 1) + ')';
    $('[data-ad-step]').textContent = 'Step ' + (idx + 1) + ' of ' + a.steps.length;
    $('[data-ad-t]').textContent = s.t;
    var stage = $('.ad-stage'); stage.innerHTML = '<div class="ad-view">' + view(s.v) + '</div>';
    typeIn();
    $('[data-ad-prev]').disabled = idx === 0;
    $('[data-ad-next]').textContent = idx === a.steps.length - 1 ? 'Watch again' : 'Next step';
    var yes = stage.querySelector('.yes');
    if (yes) {
      yes.addEventListener('click', approve);
      if (playing) timer = setTimeout(approve, 3600);
    } else if (playing && idx < a.steps.length - 1) {
      timer = setTimeout(next, s.v.k === 'doc' || s.v.k === 'phone' || s.v.k === 'post' ? 5200 : 3800);
    }
  }
  function approve() {
    var box = $('.ad-btns'); if (!box) return;
    box.outerHTML = '<p class="ad-approved">\u2713 You approved this</p>';
    clearTimeout(timer); timer = setTimeout(next, 1400);
  }
  function next() { var a = A[cur]; if (idx >= a.steps.length - 1) { idx = 0; } else { idx++; } render(); }
  function prev() { if (idx > 0) { idx--; render(); } }
  function setPlay(p) { playing = p; var b = $('[data-ad-play]'); b.setAttribute('aria-pressed', String(!p)); b.textContent = p ? 'Pause' : 'Play'; if (p) render(); else clear(); }

  function open(name, opener) {
    cur = name; idx = 0; playing = !reduce;
    var a = A[name];
    dlg.style.setProperty('--c', a.c);
    $('[data-ad-av]').textContent = name.slice(0, 1);
    $('[data-ad-name]').textContent = 'How ' + name + ' works';
    $('[data-ad-role]').textContent = a.r;
    $('[data-ad-trig]').textContent = a.trig;
    var pb = $('[data-ad-play]'); pb.setAttribute('aria-pressed', String(!playing)); pb.textContent = playing ? 'Pause' : 'Play';
    dlg._opener = opener;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    render();
    $('[data-ad-close]').focus();
  }
  function close() { clear(); if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', function () { clear(); if (dlg._opener) dlg._opener.focus(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  $('[data-ad-close]').addEventListener('click', close);
  $('[data-ad-next]').addEventListener('click', function () { clear(); next(); });
  $('[data-ad-prev]').addEventListener('click', function () { clear(); prev(); });
  $('[data-ad-play]').addEventListener('click', function () { setPlay(!playing); });
  $('[data-ad-rail]').addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) { clear(); idx = +b.getAttribute('data-go'); render(); } });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-agent]');
    if (b && A[b.getAttribute('data-agent')]) { open(b.getAttribute('data-agent'), b); return; }
    var d = e.target.closest('.of-desk');
    if (d && !e.target.closest('button')) { var hb = d.querySelector('[data-agent]'); if (hb) open(hb.getAttribute('data-agent'), hb); }
  });
})();
