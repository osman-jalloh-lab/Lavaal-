/* LAVAALL OS Routines: a table (name, desk, schedule in CT, last run, health, status) and, for #routines/<id>,
   an animated workflow: trigger -> steps -> outputs drawn in SVG, with a pulse that moves along the links one
   node at a time (about 600 ms per node, CSS animation), a Replay button, and the schedule, owner desk, last run
   and health under it. prefers-reduced-motion turns the pulse off. A routine whose steps are not written shows
   "Steps not written yet".
   Name, desk (owner), schedule, status and steps come from the static data pack's routines.json
   (docs/os/DECISIONS.md #20). The pack's own last-run fields are stale and ignored: "last run" and health
   come only from the live routine-health record, merged by id, and show a dash without one.
   Read only: no toggles, no runs. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var TONE = { ok: 'pass', warn: 'flag', bad: 'bad' };
  var KIND = { trigger: 'Trigger', step: 'Step', output: 'Output' };

  // Node box and spacing in SVG units. The layout snakes: row 1 runs left to right, row 2 right to left, and so
  // on, so every link is a straight line (across a row, or down at the turn).
  var W = 156, H = 92, GX = 44, GY = 40, PAD = 12, LINE = 19, MAX_LINES = 3;
  var STEP_MS = 600;
  var resizeBound = null;

  function human(status) { return String(status || '').replace(/_/g, ' '); }

  function healthCell(r) {
    if (!r.health) return '<span class="dim">—</span>';
    return '<span class="pill ' + (TONE[r.health.tone] || '') + '" title="' + esc(r.health.reason || '') + '">' + esc(r.health.status) + '</span>';
  }

  function statusCell(r) {
    if (!r.status) return '<span class="dim">—</span>';
    return '<span class="pill ' + (r.status === 'active' ? 'pass' : 'flag') + '">' + esc(human(r.status)) + '</span>';
  }

  function row(r) {
    var n = r.steps ? r.steps.length : 0;
    return '<tr class="row" tabindex="0" data-go="routines/' + esc(r.id) + '"><td class="wrap">' + esc(r.name) +
      '<div class="sub">' + (n ? n + ' nodes in the workflow' : 'Steps not written yet') + '</div>' +
      '<div class="sub m-only">' + esc(r.schedule || '—') + '</div></td>' +
      '<td>' + (r.owner ? '<span class="link" data-go="desks/' + esc(r.owner) + '">' + esc(OS.deskShort(r.owner)) + '</span>' : '<span class="dim">—</span>') + '</td>' +
      '<td class="wrap dim rt-sched">' + esc(r.schedule || '—') + '</td>' +
      '<td class="dim num rt-last">' + esc(r.lastRunLabel || '—') + '</td>' +
      '<td>' + healthCell(r) + '</td>' +
      '<td>' + statusCell(r) + '</td></tr>';
  }

  // ---- the workflow drawing ----------------------------------------------------------------------------

  function wrap(label) {
    var words = String(label).split(/\s+/);
    var lines = [''];
    words.forEach(function (w) {
      var cur = lines[lines.length - 1];
      if ((cur + ' ' + w).trim().length <= 21 || !cur) lines[lines.length - 1] = (cur + ' ' + w).trim();
      else lines.push(w);
    });
    if (lines.length > MAX_LINES) {
      lines = lines.slice(0, MAX_LINES);
      lines[MAX_LINES - 1] = lines[MAX_LINES - 1].replace(/.{0,2}$/, '') + '…';
    }
    return lines;
  }

  function place(i, cols) {
    var rowIx = Math.floor(i / cols);
    var inRow = i % cols;
    var col = rowIx % 2 === 0 ? inRow : cols - 1 - inRow;
    return { x: PAD + col * (W + GX), y: PAD + rowIx * (H + GY) };
  }

  function colsFor() {
    var w = window.innerWidth;
    return typeof w === 'number' && w > 0 && w < 760 ? 1 : 4;
  }

  function flowSvg(steps, cols) {
    var n = steps.length;
    var used = Math.min(cols, n);
    var rows = Math.ceil(n / cols);
    var width = PAD * 2 + used * W + (used - 1) * GX;
    var height = PAD * 2 + rows * H + (rows - 1) * GY;
    var pos = steps.map(function (_, i) { return place(i, cols); });
    var links = '';
    var nodes = '';
    steps.forEach(function (s, i) {
      var a = pos[i];
      var tool = s.tool ? '<text class="rtool" x="' + (a.x + 10) + '" y="' + (a.y + H - 9) + '">' + esc(s.tool) + '</text>' : '';
      var lines = wrap(s.label).map(function (l, k) {
        return '<tspan x="' + (a.x + 10) + '" dy="' + (k ? LINE - 4 : 0) + '">' + esc(l) + '</tspan>';
      }).join('');
      nodes += '<g class="rnode k-' + s.kind + '" style="--i:' + i + '"><rect x="' + a.x + '" y="' + a.y + '" width="' + W + '" height="' + H + '" rx="8"></rect>' +
        '<text class="rkind" x="' + (a.x + 10) + '" y="' + (a.y + 17) + '">' + esc(KIND[s.kind]) + '</text>' +
        '<text class="rlabel" x="' + (a.x + 10) + '" y="' + (a.y + 37) + '">' + lines + '</text>' + tool + '</g>';
      if (i < n - 1) {
        var b = pos[i + 1];
        var horiz = a.y === b.y;
        var x1 = horiz ? (b.x > a.x ? a.x + W : a.x) : a.x + W / 2;
        var y1 = horiz ? a.y + H / 2 : a.y + H;
        var x2 = horiz ? (b.x > a.x ? b.x : b.x + W) : b.x + W / 2;
        var y2 = horiz ? b.y + H / 2 : b.y;
        // Arrow head at the end of the link.
        var ang = Math.atan2(y2 - y1, x2 - x1);
        var hx = x2 - 9 * Math.cos(ang), hy = y2 - 9 * Math.sin(ang);
        var px = -Math.sin(ang) * 5, py = Math.cos(ang) * 5;
        links += '<g class="rlink"><line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"></line>' +
          '<polygon points="' + x2 + ',' + y2 + ' ' + (hx + px).toFixed(1) + ',' + (hy + py).toFixed(1) + ' ' + (hx - px).toFixed(1) + ',' + (hy - py).toFixed(1) + '"></polygon>' +
          '<circle class="rpulse" r="5" cx="' + x1 + '" cy="' + y1 + '" style="--i:' + i + ';--dx:' + (x2 - x1) + 'px;--dy:' + (y2 - y1) + 'px"></circle></g>';
      }
    });
    return '<svg class="rflowsvg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" role="img" aria-label="Workflow with ' + n + ' nodes: trigger, steps, outputs">' + links + nodes + '</svg>';
  }

  function detail(r, desks) {
    var head = '<div class="ph"><div><h1>' + esc(r.name) + '</h1><p><span class="link" data-go="routines">All routines</span> · Times are America/Chicago. View only.</p></div>' +
      (r.steps ? '<div class="r"><button class="btn" type="button" id="rt-replay">Replay</button></div>' : '') + '</div>';
    var flow;
    if (r.steps) {
      flow = '<div class="card rflow" id="rt-flow" data-nodes="' + r.steps.length + '"><div class="ch">' + icon('timer') + '<h3>Workflow</h3><div class="r"><span class="num">' + r.steps.length + ' nodes</span></div></div>' +
        '<div class="rflowwrap" id="rt-svg">' + flowSvg(r.steps, colsFor()) + '</div></div>';
    } else {
      flow = '<div class="card"><div class="empty"><b>Steps not written yet</b><small>Source: the steps field of this routine in routines.json in the LAVAALL OS data pack; it is null.</small></div></div>';
    }
    var kv = [
      ['Schedule (CT)', esc(r.schedule || '—')],
      ['Owner desk', r.owner ? OS.deskChip(r.owner) : '—'],
      ['Status', r.status ? statusCell(r) : '—'],
      ['Last run', esc(r.lastRunLabel || '—')],
      ['Health', healthCell(r)],
    ].map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd>'; }).join('');
    var note = r.health
      ? ''
      : '<p class="note">Last run and health come from the routine-health record, and there is none for this routine yet.</p>';
    return head + flow + '<div class="card" style="margin-top:16px"><div class="ch">' + icon('timer') + '<h3>Schedule and health</h3></div><div class="cv"><dl class="kv tightkv">' + kv + '</dl>' + note + '</div></div>';
  }

  function table(list, anyHealth) {
    var head = '<div class="ph"><div><h1>Routines</h1><p>Times are America/Chicago. Open a routine to see its workflow. View only.</p></div></div>';
    return head + '<div class="card tablewrap"><table><thead><tr><th>Routine</th><th>Desk</th><th class="rt-sched">Schedule (CT)</th><th class="rt-last">Last run</th><th>Health</th><th>Status</th></tr></thead><tbody>' +
      list.map(row).join('') + '</tbody></table></div>' +
      '<p class="note foot">Schedule, desk, status and steps are from the data pack. ' + (anyHealth ? 'Last run and health are from the routine-health record.' : 'Last run and health need a routine-health record, and there is none yet.') + '</p>';
  }

  function replay(root) {
    var flow = root.querySelector('#rt-flow');
    if (!flow) return;
    flow.classList.remove('play');
    void flow.offsetWidth; // restart the CSS animations
    flow.classList.add('play');
  }

  OS.registerView('routines', {
    render: function (ctx) {
      var list = ctx.data.routines;
      var head = '<div class="ph"><div><h1>Routines</h1><p>Times are America/Chicago. View only.</p></div></div>';
      if (list === null) return head + '<div class="card">' + OS.empty('Routines could not be loaded.', 'routines') + '</div>';
      if (!list.length) return head + '<div class="card">' + OS.empty('No routines are listed.', 'routines') + '</div>';
      var hit = ctx.sub ? list.filter(function (r) { return r.id === ctx.sub; })[0] : null;
      if (hit) return detail(hit, ctx.data.desks || []);
      return table(list, list.some(function (r) { return r.health; }));
    },
    mount: function (root, ctx) {
      var list = ctx.data.routines;
      if (!list || !list.length) return;
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var r = e.target.closest ? e.target.closest('tr.row[data-go]') : null;
        if (r) OS.go('routines', r.getAttribute('data-go').split('/')[1]);
      });
      var hit = ctx.sub ? list.filter(function (r) { return r.id === ctx.sub; })[0] : null;
      if (!hit || !hit.steps) return;
      var btn = root.querySelector('#rt-replay');
      if (btn) btn.addEventListener('click', function () { replay(root); });
      replay(root);
      // Redraw when the window crosses the phone breakpoint (horizontal on desktop, vertical on a phone).
      var last = colsFor();
      if (resizeBound) window.removeEventListener('resize', resizeBound);
      resizeBound = function () {
        var now = colsFor();
        var wrapEl = root.querySelector('#rt-svg');
        if (now === last || !wrapEl) return;
        last = now;
        wrapEl.innerHTML = flowSvg(hit.steps, now);
        replay(root);
      };
      if (window.addEventListener) window.addEventListener('resize', resizeBound);
    },
    unmount: function () {
      if (resizeBound && window.removeEventListener) window.removeEventListener('resize', resizeBound);
      resizeBound = null;
    }
  });
})();
