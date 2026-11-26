/* LAVAALL OS Progress and saved Memory. Goals (week, month, quarter) and memories Osman saves himself,
   kept by /ops/os/saved behind the founder sign-in. All text is escaped. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var HORIZONS = [{ id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }, { id: 'quarter', label: 'This quarter' }];
  var PROJECTS = { lavaall: 'LAVAALL', saloneworks: 'SaloneWorks', salonehire: 'SaloneHire' };
  // Other businesses come from the server's project groups (OS.businesses); then Personal and Other.
  (OS.businesses || []).forEach(function (b) { if (b.id !== 'all' && !PROJECTS[b.id]) PROJECTS[b.id] = b.label; });
  PROJECTS.personal = 'Personal';
  PROJECTS.other = 'Other';
  // Personal and Other goals belong to no business, so they show only under All businesses.
  function goalShown(g) { var b = OS.business ? OS.business() : 'all'; return b === 'all' || g.project === b; }
  function memoryShown(m) { var b = OS.business ? OS.business() : 'all'; return b === 'all' || m.tags.indexOf(b) !== -1; }
  var state = null;
  var listeners = [];

  function api(method, body) {
    return window.fetch('/ops/os/saved', {
      method: method, credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.message || d.error || ('HTTP ' + res.status));
        return d;
      });
    });
  }
  function set(d) { state = { goals: d.goals || [], memories: d.memories || [], persist: d.persist !== false }; listeners.forEach(function (fn) { fn(); }); }
  OS.saved = {
    load: function () { return api('GET').then(set); },
    op: function (body) { return api('POST', body).then(function (d) { set(d); return d; }); },
    get: function () { return state; },
    on: function (fn) { listeners = [fn]; }
  };

  // ---- Progress ----
  function bar(p) { return '<div class="pg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i style="width:' + p + '%"></i></div>'; }
  function goalRow(g) {
    return '<div class="pg-goal' + (g.done ? ' done' : '') + '" data-id="' + esc(g.id) + '">' +
      '<div class="pg-top"><span class="tag">' + esc(PROJECTS[g.project] || g.project) + '</span><span class="pg-title">' + esc(g.title) + '</span><span class="pg-pct num">' + g.progress + '%</span></div>' +
      bar(g.progress) +
      '<div class="pg-acts"><button type="button" class="btn" data-step="-10" aria-label="Less progress">−10</button><button type="button" class="btn" data-step="10" aria-label="More progress">+10</button>' +
      '<button type="button" class="btn" data-done="1">' + (g.done ? 'Reopen' : 'Done') + '</button><button type="button" class="btn" data-del="1" aria-label="Delete goal">Delete</button></div></div>';
  }
  function progressBody() {
    if (!state) return '<div class="card empty"><b>Loading your goals…</b></div>';
    return '<div class="grid g3 pg-cols">' + HORIZONS.map(function (h) {
      var goals = state.goals.filter(function (g) { return g.horizon === h.id && goalShown(g); });
      var avg = goals.length ? Math.round(goals.reduce(function (n, g) { return n + g.progress; }, 0) / goals.length) : null;
      return '<section class="card"><div class="ch"><h3>' + esc(h.label) + '</h3><div class="r"><span class="num">' + (avg == null ? '—' : avg + '%') + '</span></div></div>' +
        (goals.length ? goals.map(goalRow).join('') : '<div class="empty"><b>No goals yet.</b></div>') + '</section>';
    }).join('') + '</div>' + (state.persist ? '' : '<p class="note mt">Saving is in memory only on this deployment (no KV store), so goals reset when it restarts.</p>');
  }
  OS.registerView('progress', {
    render: function () {
      return '<div class="ph"><div><h1>Progress</h1><p>Your goals for the week, month and quarter. Ask anything and Jarvis can steer toward them.</p></div></div>' +
        (OS.launchesHtml ? OS.launchesHtml() : '') +
        '<form class="card pg-add" id="pg-add" autocomplete="off">' +
          '<label class="sr" for="pg-title">New goal</label><input id="pg-title" maxlength="160" placeholder="Add a goal, for example: launch SaloneHire in Freetown" required />' +
          '<label class="sr" for="pg-horizon">When</label><select id="pg-horizon">' + HORIZONS.map(function (h) { return '<option value="' + h.id + '">' + esc(h.label) + '</option>'; }).join('') + '</select>' +
          '<label class="sr" for="pg-project">Project</label><select id="pg-project">' + Object.keys(PROJECTS).map(function (k) { return '<option value="' + k + '"' + (OS.business && OS.business() === k ? ' selected' : '') + '>' + esc(PROJECTS[k]) + '</option>'; }).join('') + '</select>' +
          '<button class="btn pri" type="submit">Add goal</button></form>' +
        '<div id="pg-body" class="mt">' + progressBody() + '</div>' +
        '<p class="note" id="pg-msg" role="status" aria-live="polite"></p>';
    },
    mount: function (root) {
      var host = root.querySelector('#pg-body'), msg = root.querySelector('#pg-msg');
      function paint() { if (host) host.innerHTML = progressBody(); }
      function fail(e) { if (msg) msg.textContent = e.message || 'Could not save.'; }
      OS.saved.on(paint);
      OS.saved.load().catch(fail);
      root.querySelector('#pg-add').addEventListener('submit', function (e) {
        e.preventDefault();
        var t = root.querySelector('#pg-title');
        OS.saved.op({ op: 'goal.upsert', goal: { title: t.value, horizon: root.querySelector('#pg-horizon').value, project: root.querySelector('#pg-project').value, progress: 0 } })
          .then(function () { t.value = ''; if (msg) msg.textContent = 'Goal added.'; }).catch(fail);
      });
      host.addEventListener('click', function (e) {
        var row = e.target.closest ? e.target.closest('.pg-goal') : null;
        var s = OS.saved.get();
        if (!row || !s) return;
        var g = s.goals.filter(function (x) { return x.id === row.getAttribute('data-id'); })[0];
        if (!g) return;
        var b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-del')) { OS.saved.op({ op: 'goal.delete', id: g.id }).catch(fail); return; }
        var next = Object.assign({}, g);
        if (b.hasAttribute('data-step')) next.progress = Math.max(0, Math.min(100, g.progress + Number(b.getAttribute('data-step'))));
        if (b.hasAttribute('data-done')) { next.done = !g.done; next.progress = next.done ? 100 : Math.min(g.progress, 90); }
        if (next.progress < 100) next.done = b.hasAttribute('data-done') ? next.done : false;
        OS.saved.op({ op: 'goal.upsert', goal: next }).catch(fail);
      });
    }
  });

  // ---- Memory: saved ----
  var query = '';
  function memoryBody() {
    if (!state) return '<div class="card empty"><b>Loading your memories…</b></div>';
    var q = query.toLowerCase();
    var list = state.memories.filter(function (m) { return memoryShown(m) && (!q || (m.text + ' ' + m.tags.join(' ')).toLowerCase().indexOf(q) !== -1); });
    return '<section class="card">' + (list.length ? list.map(function (m) {
      return '<div class="mem-row" data-id="' + esc(m.id) + '"><p class="mem-text">' + esc(m.text) + '</p><div class="mem-meta"><span class="num">' + esc(OS.fmtTime(m.createdAt)) + '</span>' +
        m.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') +
        '<button type="button" class="btn" data-del="1" aria-label="Delete memory">Delete</button></div></div>';
    }).join('') : '<div class="empty"><b>' + (q ? 'No memory matches that.' : 'Nothing saved yet. Write something above, or tell Jarvis to remember it.') + '</b></div>') + '</section>';
  }
  OS.registerView('saved', {
    render: function () {
      return '<div class="ph"><div><h1>Saved memory</h1><p>Things you want the OS to remember. Jarvis can save here too: just say "remember that…".</p></div></div>' +
        '<form class="card mem-add" id="mem-add" autocomplete="off">' +
          '<label class="sr" for="mem-text">Remember</label><textarea id="mem-text" rows="3" maxlength="2000" placeholder="Remember that…" required></textarea>' +
          '<div class="mem-add-r"><label class="sr" for="mem-tags">Tags</label><input id="mem-tags" maxlength="120" placeholder="Tags, comma separated (optional)" />' +
          '<button class="btn pri" type="submit">Save memory</button></div></form>' +
        '<div class="mem-search mt"><label class="sr" for="mem-q">Search memories</label><input id="mem-q" placeholder="Search memories" /></div>' +
        '<div id="mem-body" class="mt">' + memoryBody() + '</div><p class="note" id="mem-msg" role="status" aria-live="polite"></p>';
    },
    mount: function (root) {
      var host = root.querySelector('#mem-body'), msg = root.querySelector('#mem-msg');
      function paint() { if (host) host.innerHTML = memoryBody(); }
      function fail(e) { if (msg) msg.textContent = e.message || 'Could not save.'; }
      OS.saved.on(paint);
      OS.saved.load().catch(fail);
      root.querySelector('#mem-add').addEventListener('submit', function (e) {
        e.preventDefault();
        var t = root.querySelector('#mem-text'), tags = root.querySelector('#mem-tags');
        var tagList = tags.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        var b = OS.business ? OS.business() : 'all';
        if (b !== 'all' && tagList.indexOf(b) === -1) tagList.unshift(b);
        OS.saved.op({ op: 'memory.add', text: t.value, tags: tagList })
          .then(function () { t.value = ''; tags.value = ''; if (msg) msg.textContent = 'Saved.'; }).catch(fail);
      });
      root.querySelector('#mem-q').addEventListener('input', function (e) { query = e.target.value; paint(); });
      host.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-del]') : null;
        var row = b && b.closest('.mem-row');
        if (row) OS.saved.op({ op: 'memory.delete', id: row.getAttribute('data-id') }).catch(fail);
      });
    }
  });
  OS.progressBody = progressBody;
  OS.memoryBody = memoryBody;
  OS.setSavedState = set;
})();
