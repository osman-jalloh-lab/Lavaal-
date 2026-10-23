/* LAVAALL OS AI Council: each stored council record is one chat thread, one lane and colour per role:
   Claude (builds) blue, Codex (reviews) violet, Jev (scores) amber, Osman (approves) green.
   Round by round: Claude's draft, Codex's review, Claude's revision (a diff against the last draft), Jev's score,
   then Osman's gate ("Waiting for L3 OK" with typing dots). A role legend sits at the top.
   It shows stored records only: it runs no model and has no actions. Reads data.council (messages[] in the
   council shape, docs/os/SCHEMA.md), which is null until council records exist. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var STATUS = { waiting_l3: 'Waiting', approved: 'Approved', changes_requested: 'Changes requested', flagged: 'Flagged', held: 'Held' };
  var LANES = {
    builder: { agent: 'Claude', verb: 'builds', ln: 0 },
    reviewer: { agent: 'Codex', verb: 'reviews', ln: 1 },
    scorer: { agent: 'Jev', verb: 'scores', ln: 2 },
    approver: { agent: 'Osman', verb: 'approves', ln: 3 }
  };

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

  function legend() {
    return '<div class="clegend" role="group" aria-label="Who is who">' + ['builder', 'reviewer', 'scorer', 'approver'].map(function (role) {
      var l = LANES[role];
      return '<span class="lg lane-' + role + '"><i class="ld" aria-hidden="true"></i><b>' + esc(l.agent) + '</b> ' + esc(l.verb) + '</span>';
    }).join('') + '</div>';
  }

  // One chat message in its lane. `head` is the small label next to the name, `body` is already-built HTML.
  function bubble(role, head, when, body) {
    var l = LANES[role];
    return '<div class="cmsg lane-' + role + '"><div class="av" aria-hidden="true">' + esc(l.agent.charAt(0)) + '</div><div class="cbub"><div class="hd"><b>' + esc(l.agent) + '</b>' +
      '<span>' + esc(head) + '</span>' + (when ? '<span class="num stamp">' + esc(when) + '</span>' : '') + '</div><div class="bd">' + body + '</div></div></div>';
  }

  function scoreBody(score, text) {
    var pass = score >= 0.75;
    return '<div class="score"><b class="num big">' + score.toFixed(2) + '</b><div class="bar"><i style="width:' + Math.round(score * 100) + '%;background:var(--' + (pass ? 'ok' : 'warn') + ')"></i><u></u></div>' + OS.jev(score) + '</div>' +
      (text ? '<p class="pre">' + esc(text) + '</p>' : '');
  }

  function messageHtml(m, prevDraft) {
    var when = OS.fmtDate(m.at);
    if (m.role === 'builder') {
      var draft = m.draft || m.text;
      if (prevDraft === null) return bubble('builder', 'draft', when, '<div class="diff plain">' + esc(draft) + '</div>');
      return bubble('builder', 'revision', when, '<p class="note">Changes since the last draft</p>' + diffHtml(prevDraft, draft) +
        '<details class="full"><summary>Full draft</summary><div class="diff plain">' + esc(draft) + '</div></details>');
    }
    if (m.role === 'reviewer') return bubble('reviewer', 'review', when, '<p class="pre">' + esc(m.text) + '</p>');
    if (m.role === 'scorer') return bubble('scorer', 'score', when, m.score !== undefined ? scoreBody(m.score, m.text) : '<p class="pre">' + esc(m.text) + '</p>');
    return bubble('approver', 'decision', when, '<p class="pre">' + esc(m.text) + '</p>');
  }

  function gate(rec) {
    var lvl = rec.level || 'L3';
    if (rec.status === 'waiting_l3') {
      return bubble('approver', lvl + ' gate', '', '<div class="gate">Waiting for ' + esc(lvl) + ' OK <span class="typing" aria-hidden="true"><i></i><i></i><i></i></span></div>');
    }
    var label = STATUS[rec.status];
    return bubble('approver', lvl + ' gate', '', label ? '<div>' + esc(label) + '</div>' : '<span class="note">No gate status is stored for this run.</span>');
  }

  function thread(rec) {
    var html = rec.messages.length ? '' : '<div class="empty tight"><b>No rounds are stored for this run.</b></div>';
    var round = 0;
    var lastDraft = null;
    var hasScore = false;
    var hasDecision = false;
    rec.messages.forEach(function (m) {
      if (m.round !== round) { round = m.round; html += '<div class="rnd">Round ' + round + '</div>'; }
      html += messageHtml(m, m.role === 'builder' ? lastDraft : null);
      if (m.role === 'builder') lastDraft = m.draft || m.text;
      if (m.role === 'scorer') hasScore = true;
      if (m.role === 'approver') hasDecision = true;
    });
    html += '<div class="rnd">Score + gate</div>';
    if (!hasScore) {
      html += bubble('scorer', 'score', '', rec.jev === null
        ? '<div class="score"><span>' + OS.jev(null) + '</span><small class="note">No Jev score is stored for this run.</small></div>'
        : scoreBody(rec.jev, ''));
    }
    return html + (hasDecision && rec.status !== 'waiting_l3' ? '' : gate(rec));
  }

  function runCard(rec) {
    var meta = [OS.deskShort(rec.desk), rec.level].filter(Boolean).join(' · ');
    return '<section class="card"><div class="ch">' + icon('council') + '<h3>Run · ' + esc(rec.title) + '</h3><div class="r">' +
      (meta ? '<span class="pill">' + esc(meta) + '</span>' : '') + (rec.date ? '<span class="num">' + esc(OS.fmtDate(rec.date)) + '</span>' : '') + '</div></div>' +
      '<div class="cv">' + legend() + '<dl class="kv tightkv"><dt>Round</dt><dd class="num">' + (rec.round ? rec.round + ' of ' + rec.maxRounds : '—') + '</dd>' +
      '<dt>Status</dt><dd>' + (STATUS[rec.status] ? esc(STATUS[rec.status]) : '—') + '</dd></dl>' + thread(rec) + '</div></section>';
  }

  function historyTable(list, current) {
    return '<section class="card tablewrap mt"><div class="ch">' + icon('timer') + '<h3>Run history</h3></div><table><thead><tr><th>Task</th><th>Desk</th><th>Round</th><th>Status</th><th class="n">Jev</th></tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr class="row' + (r === current ? ' sel' : '') + '" tabindex="0" data-go="council/' + esc(r.id) + '"><td class="wrap">' + esc(r.title) + '</td><td class="dim">' + esc(OS.deskShort(r.desk) || '—') + '</td>' +
          '<td class="num">' + (r.round ? r.round + ' of ' + r.maxRounds : '—') + '</td><td>' + (STATUS[r.status] ? '<span class="pill">' + esc(STATUS[r.status]) + '</span>' : '<span class="dim">—</span>') +
          '</td><td class="n">' + OS.jev(r.jev) + '</td></tr>';
      }).join('') + '</tbody></table></section>';
  }

  OS.registerView('council', {
    render: function (ctx) {
      var list = ctx.data.council;
      var head = '<div class="ph"><div><h1>AI Council</h1><p>Each run as one conversation: Claude builds, Codex reviews, Jev scores, Osman approves. Read from stored records. This view runs no model.</p></div></div>';
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
