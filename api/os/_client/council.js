/* LAVAALL OS AI Council: shows stored council records only. It runs no model and has no actions.
   For each run: the drafter and reviewer, "Round n of 3", a diff of the draft between rounds, the Jev score
   and a "waiting for L3 OK" state. Reads data.council, which is null until council records exist. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var STATUS = { waiting_l3: 'Waiting', approved: 'Approved', changes_requested: 'Changes requested', flagged: 'Flagged', held: 'Held' };

  // Line diff by longest common subsequence: [{t: 'same'|'del'|'add', s}]
  function lineDiff(before, after) {
    var a = String(before || '').split('\n');
    var b = String(after || '').split('\n');
    var n = a.length, m = b.length, i, j;
    var L = [];
    for (i = 0; i <= n; i++) { L.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
    var out = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push({ t: 'same', s: a[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ t: 'del', s: a[i] }); i++; }
      else { out.push({ t: 'add', s: b[j] }); j++; }
    }
    while (i < n) out.push({ t: 'del', s: a[i++] });
    while (j < m) out.push({ t: 'add', s: b[j++] });
    return out;
  }
  OS.lineDiff = lineDiff;

  function diffHtml(before, after) {
    var changed = lineDiff(before, after).filter(function (l) { return l.t !== 'same'; });
    if (!changed.length) return '<p class="note">The draft did not change from the previous round.</p>';
    return '<div class="diff">' + changed.map(function (l) {
      return '<div class="' + (l.t === 'del' ? 'd' : 'a') + '">' + (l.t === 'del' ? '- ' : '+ ') + esc(l.s) + '</div>';
    }).join('') + '</div>';
  }

  function who(p) { return p && p.name ? p.name : 'Not recorded'; }
  function initial(p) { return esc(((p && p.name) || '?').charAt(0).toUpperCase()); }

  function message(person, role, when, bodyHtml) {
    return '<div class="cm"><div class="av" aria-hidden="true">' + initial(person) + '</div><div><div class="hd"><b>' + esc(who(person)) + '</b>' +
      (person && person.role ? esc(person.role) : esc(role)) + (when ? '<span class="num stamp">' + esc(when) + '</span>' : '') + '</div><div class="bd">' + bodyHtml + '</div></div></div>';
  }

  function roundBlock(rec, r, prev) {
    var draft = '';
    if (r.draft) {
      draft = message(rec.drafter, 'drafter', OS.fmtDate(r.at),
        (prev && prev.draft ? '<p class="note">Changes since round ' + prev.n + '</p>' + diffHtml(prev.draft, r.draft) +
          '<details class="full"><summary>Full draft</summary><div class="diff plain">' + esc(r.draft) + '</div></details>'
          : '<div class="diff plain">' + esc(r.draft) + '</div>'));
    }
    var review = r.review ? message(rec.reviewer, 'reviewer', '', '<p class="pre">' + esc(r.review) + '</p>') : '';
    return '<div class="rnd">Round ' + r.n + '</div>' + draft + review;
  }

  function scoreBlock(rec) {
    if (rec.jev === null) return '<div class="score"><span>' + OS.jev(null) + '</span><small class="note">No Jev score is stored for this run.</small></div>';
    var pass = rec.jev >= 0.75;
    return '<div class="score"><b class="num big">' + rec.jev.toFixed(2) + '</b><div class="bar"><i style="width:' + Math.round(rec.jev * 100) + '%;background:var(--' + (pass ? 'ok' : 'warn') + ')"></i><u></u></div>' + OS.jev(rec.jev) + '</div>';
  }

  function gate(rec) {
    var lvl = rec.level || 'L3';
    if (rec.status === 'waiting_l3') {
      return '<div class="cm"><div class="av" aria-hidden="true">?</div><div><div class="hd"><b>Founder gate</b>' + esc(lvl) + '</div><div class="bd gate">Waiting for ' + esc(lvl) +
        ' OK <span class="typing" aria-hidden="true"><i></i><i></i><i></i></span></div></div></div>';
    }
    var label = STATUS[rec.status];
    return '<div class="cm"><div class="av" aria-hidden="true">?</div><div><div class="hd"><b>Founder gate</b>' + esc(lvl) + '</div><div class="bd">' +
      (label ? esc(label) : '<span class="note">No gate status is stored for this run.</span>') + '</div></div></div>';
  }

  function runCard(rec) {
    var meta = [rec.desk, rec.level].filter(Boolean).join(' · ');
    var rounds = rec.rounds.length
      ? rec.rounds.map(function (r, i) { return roundBlock(rec, r, rec.rounds[i - 1]); }).join('')
      : '<div class="empty tight"><b>No rounds are stored for this run.</b></div>';
    return '<section class="card"><div class="ch">' + icon('council') + '<h3>Run · ' + esc(rec.title) + '</h3><div class="r">' +
      (meta ? '<span class="pill">' + esc(meta) + '</span>' : '') + (rec.date ? '<span class="num">' + esc(OS.fmtDate(rec.date)) + '</span>' : '') + '</div></div>' +
      '<div class="cv"><dl class="kv tightkv"><dt>Drafter</dt><dd>' + esc(who(rec.drafter)) + (rec.drafter.role ? ' <span class="dim">· ' + esc(rec.drafter.role) + '</span>' : '') + '</dd>' +
      '<dt>Reviewer</dt><dd>' + esc(who(rec.reviewer)) + (rec.reviewer.role ? ' <span class="dim">· ' + esc(rec.reviewer.role) + '</span>' : '') + '</dd>' +
      '<dt>Round</dt><dd class="num">' + (rec.round ? rec.round + ' of ' + rec.maxRounds : '—') + '</dd></dl>' +
      rounds + '<div class="rnd">Score + gate</div>' + scoreBlock(rec) + gate(rec) + '</div></section>';
  }

  function historyTable(list, current) {
    return '<section class="card tablewrap mt"><div class="ch">' + icon('timer') + '<h3>Run history</h3></div><table><thead><tr><th>Task</th><th>Desk</th><th>Round</th><th>Status</th><th class="n">Jev</th></tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr class="row' + (r === current ? ' sel' : '') + '" tabindex="0" data-go="council/' + esc(r.id) + '"><td class="wrap">' + esc(r.title) + '</td><td class="dim">' + esc(r.desk || '—') + '</td>' +
          '<td class="num">' + (r.round ? r.round + ' of ' + r.maxRounds : '—') + '</td><td>' + (STATUS[r.status] ? '<span class="pill">' + esc(STATUS[r.status]) + '</span>' : '<span class="dim">—</span>') +
          '</td><td class="n">' + OS.jev(r.jev) + '</td></tr>';
      }).join('') + '</tbody></table></section>';
  }

  OS.registerView('council', {
    render: function (ctx) {
      var list = ctx.data.council;
      var head = '<div class="ph"><div><h1>AI Council</h1><p>Drafter and reviewer rounds, the Jev score and the founder gate, read from stored records. This view runs no model.</p></div></div>';
      if (list === null) return head + '<div class="card">' + OS.empty('No council records yet.', 'council') + '</div>';
      if (!list.length) return head + '<div class="card">' + OS.empty('The council record list is empty.', 'council') + '</div>';
      var current = list.filter(function (r) { return r.id === ctx.sub; })[0] || list[0];
      return head + runCard(current) + historyTable(list, current);
    },
    mount: function (root) {
      root.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var row = e.target.closest ? e.target.closest('tr[data-go]') : null;
        if (row) OS.go('council', row.getAttribute('data-go').split('/')[1]);
      });
    }
  });
})();
