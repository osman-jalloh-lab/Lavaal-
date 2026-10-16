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
