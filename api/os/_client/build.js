/* LAVAALL OS Build: what Claude and the agents are building, from the build-log feed only.
   Lanes in the order Osman acts on them: Waiting on you, In progress, Done, Up next. Nothing here is
   invented: with no feed every lane is empty and names its source. Links open only https URLs. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;

  var LANES = [
    { key: 'waiting', label: 'Waiting on you', tint: 'o', empty: 'Nothing is waiting on you.' },
    { key: 'active', label: 'In progress', tint: 'b', empty: 'Nothing is in progress.' },
    { key: 'done', label: 'Done', tint: 'g', empty: 'Nothing finished yet.' },
    { key: 'next', label: 'Up next', tint: 'v', empty: 'Nothing queued.' }
  ];
  var PROJECTS = { 'lavaall-os': 'LAVAALL OS', salonehire: 'SaloneHire', saloneworks: 'SaloneWorks', agents: 'Agents', website: 'Website' };

  function safeUrl(u) { return typeof u === 'string' && /^https:\/\/[^\s@]+$/.test(u) ? u : ''; }

  function item(it) {
    var url = safeUrl(it.url);
    return '<div class="bl-item">' +
      '<div class="bl-top"><span class="tag">' + esc(PROJECTS[it.project] || (OS.businessLabel ? OS.businessLabel(it.project) : it.project)) + '</span><span class="bl-title">' + esc(it.title) + '</span></div>' +
      (it.detail ? '<p class="bl-detail">' + esc(it.detail) + '</p>' : '') +
      '<div class="bl-meta"><span class="num">' + esc(OS.fmtTime(it.updatedAt)) + '</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open</a>' : '') + '</div>' +
      '</div>';
  }

  // ---- Business overview: one card per business with progress, launch countdown and what is left ----
  function groupOf(id) {
    var gs = (OS.data.harness && OS.data.harness.groups) || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].id === id) return gs[i];
    return null;
  }
  function daysTo(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.ceil((new Date(day + 'T00:00:00').getTime() - t.getTime()) / 86400000);
  }
  function overviewCard(b, items) {
    var mine = items.filter(function (i) { return OS.businessOf(i.project) === b.id; });
    var count = function (k) { return mine.filter(function (i) { return i.status === k; }).length; };
    var done = count('done'), total = mine.length, left = total - done;
    var pct = total ? Math.round(done * 100 / total) : 0;
    var g = groupOf(b.id) || {};
    var lead = (g.projects || [])[0] || {};
    var d = daysTo(g.launch);
    var launch = d == null ? '' : '<span class="pill ' + (d <= 7 ? 'flag' : '') + '">' + (d > 1 ? d + ' days to launch' : d === 1 ? 'Launches tomorrow' : d === 0 ? 'Launch day' : 'Launched') + '</span>';
    var remaining = mine.filter(function (i) { return i.status !== 'done'; })
      .sort(function (x, y) { var o = { waiting: 0, active: 1, next: 2 }; return o[x.status] - o[y.status]; }).slice(0, 4);
    var LBL = { waiting: 'Needs you', active: 'In progress', next: 'Up next' };
    return '<section class="card bz" data-biz="' + esc(b.id) + '">' +
      '<div class="bz-h"><b>' + esc(b.label) + '</b>' + launch + '</div>' +
      (lead.status ? '<p class="note bz-s">' + esc(String(lead.status).slice(0, 140)) + '</p>' : '') +
      '<div class="bz-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + esc(b.label) + ' done"><i style="width:' + pct + '%"></i></div>' +
      '<div class="bz-n"><span><b class="num">' + done + '</b> done</span><span><b class="num">' + count('active') + '</b> in progress</span><span><b class="num">' + count('next') + '</b> up next</span>' +
        (count('waiting') ? '<span class="bz-w"><b class="num">' + count('waiting') + '</b> need you</span>' : '') + '</div>' +
      (remaining.length ? '<ul class="bz-left">' + remaining.map(function (i) { return '<li><span class="bz-k ' + i.status + '">' + LBL[i.status] + '</span>' + esc(i.title) + '</li>'; }).join('') +
        (left > remaining.length ? '<li class="note">+' + (left - remaining.length) + ' more</li>' : '') + '</ul>'
        : '<p class="note">' + (total ? 'Everything logged is done.' : 'Nothing logged for this business yet.') + '</p>') +
    '</section>';
  }
  function overviewHtml(items) {
    var list = (OS.businesses || []).filter(function (b) { return b.id !== 'all' && (OS.business() === 'all' || OS.business() === b.id); });
    return '<div class="sect">Businesses</div><div class="bz-grid">' + list.map(function (b) { return overviewCard(b, items); }).join('') + '</div>';
  }
  OS.businessOverviewHtml = function (data) {
    var log = data && data.build;
    return overviewHtml(log && Array.isArray(log.items) ? log.items : []);
  };

  // ---- Start a build (Phase 4 builder) ----
  // Osman approves one job: repo, feature branch, task, builder. The server mints a single-use approval and queues it;
  // the box runner (off by default) picks it up and opens a DRAFT PR. Nothing here runs code or merges.
  var BUILDERS = [
    { v: 'codex|', label: 'Codex', cost: '$2' },
    { v: 'claude|sonnet', label: 'Claude Sonnet', cost: '$2' },
    { v: 'claude|opus', label: 'Claude Opus', cost: '$6' }
  ];
  var jobs = null;
  function builderApi(method, path, body) {
    return window.fetch('/ops/os/builder' + path, {
      method: method, credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
        return d;
      });
    });
  }
  function slug(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'task'; }
  function jobRow(j) {
    var who = j.executor === 'claude' ? 'Claude ' + (j.model === 'opus' ? 'Opus' : 'Sonnet') : 'Codex';
    var pr = j.result && j.result.prUrl ? ' · <a href="' + esc(j.result.prUrl) + '" target="_blank" rel="noopener">draft PR</a>' : '';
    var err = j.result && j.result.error ? ' · <span class="dim">' + esc(j.result.error) + '</span>' : '';
    return '<div class="bl-item"><div class="bl-top"><span class="tag">' + esc(j.state) + '</span><span class="bl-title">' + esc(String(j.objective || '').slice(0, 90)) + '</span></div>' +
      '<p class="note">' + esc(who) + ' · ' + esc(j.repo) + ' · <code>' + esc(j.branch) + '</code>' + pr + err + '</p></div>';
  }
  function jobsHtml() {
    if (jobs === null) return '<p class="note">Loading builds…</p>';
    return jobs.length ? jobs.map(jobRow).join('') : '<div class="empty"><b>No builds yet.</b></div>';
  }
  function builderCard() {
    return '<section class="card mt bd-start"><div class="ch"><h3>Start a build</h3><div class="r"><span class="pill">Draft PR only</span></div></div>' +
      '<form id="bd-form" autocomplete="off">' +
        '<label class="sr" for="bd-task">Task</label><textarea id="bd-task" rows="3" maxlength="2000" required placeholder="What should the builder change? Be specific."></textarea>' +
        '<div class="bd-row">' +
          '<label>Builder <select id="bd-builder">' + BUILDERS.map(function (b) { return '<option value="' + b.v + '">' + esc(b.label) + ' (' + b.cost + ' of the cap)</option>'; }).join('') + '</select></label>' +
          '<label>Repo <select id="bd-repo"><option>osman-jalloh-lab/Lavaal-</option><option>osman-jalloh-lab/saloneworks</option></select></label>' +
          '<label>Branch <input id="bd-branch" maxlength="100" placeholder="os-build/…" /></label>' +
          '<button class="btn pri" type="submit">Approve and queue</button>' +
        '</div></form>' +
      '<p class="note">Your approval works once, for exactly this task, builder and branch. The box runner picks it up only when it is turned on and opens a draft PR. If a run would pass this month\'s budget, it pauses and asks you first. It never merges or deploys.</p>' +
      '<p class="note" id="bd-msg" role="status" aria-live="polite"></p>' +
      '<div id="bd-budget">' + budgetHtml() + '</div>' +
      '<div class="sect">Recent builds</div><div id="bd-jobs">' + jobsHtml() + '</div></section>';
  }
  // This month's budget: spend vs allowance, a warning at 80%, and when work is paused, a Continue button.
  // Continue adds $50 to this month's allowance (Osman tops up his API credits himself) and lets the work go on.
  var budget = null;
  function money(n) { return '$' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
  function budgetHtml() {
    if (!budget || budget.allowance === null || budget.allowance === undefined) return '';
    var line = 'This month: <b>' + money(budget.spent) + '</b> of ' + money(budget.allowance) + ' used' + (budget.extra ? ' (' + money(budget.cap) + ' budget + ' + money(budget.extra) + ' you added)' : '') + '.';
    if (budget.hold) {
      return '<div class="card mt bd-budget wait" role="alert"><b>Paused: budget reached.</b> ' + line + ' Waiting: ' + esc(budget.hold.what) + ' (next step ' + money(budget.hold.next) + ').' +
        '<div class="bd-row"><button class="btn pri" type="button" data-budget="50">Continue: add $50 this month</button></div>' +
        '<p class="note">Top up your API credits if needed. Nothing was dropped; the paused work runs once you continue.</p></div>';
    }
    return '<p class="note bd-budget' + (budget.warn ? ' warn' : '') + '">' + line + (budget.warn ? ' Heads up: over 80% of this month\'s budget. I will ask before going past it.' : '') + '</p>';
  }
  function loadJobs(root) {
    builderApi('GET', '').then(function (d) { jobs = Array.isArray(d.jobs) ? d.jobs : []; budget = d.budget || null; var h = root.querySelector('#bd-budget'); if (h) h.innerHTML = budgetHtml(); })
      .catch(function () { jobs = []; })
      .then(function () { var host = root.querySelector('#bd-jobs'); if (host) host.innerHTML = jobsHtml(); });
  }
  // ---- Project manager (Phase 6) ----
  // Up to five goals at once. The PM splits each into steps and gives each step to the agent best at it; steps of
  // different goals run side by side. Plan is a free preview; Approve saves it and holds the builds; the page then
  // moves each plan forward while it is open.
  var pmPlans = null;
  var pmPreview = null;
  var pmTimer = null;
  function stepHtml(st) {
    var out = st.output ? '<details><summary class="dim">output</summary><pre class="sm-text">' + esc(String(st.output).slice(0, 1500)) + '</pre></details>' : '';
    return '<li><span class="tag">' + esc(st.state) + '</span> <b>' + esc(st.kind) + '</b> → ' + esc(st.label) + ' <span class="dim">(' + esc(st.why) + ')</span>' + out + '</li>';
  }
  function planHtml(p) {
    return '<div class="bl-item"><div class="bl-top"><span class="tag">' + esc(p.state) + '</span><span class="bl-title">' + esc(p.goal) + '</span></div>' +
      '<p class="note">' + esc(p.business) + ' · ' + esc(p.repo) + ' · <code>' + esc(p.branch) + '</code></p><ol class="pm-steps">' + p.steps.map(stepHtml).join('') + '</ol></div>';
  }
  function pmCard() {
    return '<section class="card mt bd-start"><div class="ch"><h3>Project manager</h3><div class="r"><span class="pill">Up to 5 goals</span></div></div>' +
      '<form id="pm-form" autocomplete="off"><label class="sr" for="pm-goals">Goals</label>' +
        '<textarea id="pm-goals" rows="4" maxlength="3000" placeholder="One goal per line, e.g.&#10;Build a landing page for SaloneHire employers&#10;Research competitors for LAVAALL Web in Freetown&#10;Fix the footer typo on lavaall.com"></textarea>' +
        '<div class="bd-row"><button class="btn" type="submit" data-pm="plan">Plan</button><button class="btn pri" type="button" data-pm="approve">Approve and run</button></div></form>' +
      '<p class="note">Research goes to Grok, specs and drafts to DeepSeek, and code to Codex, Claude Sonnet or Claude Opus, whichever fits and is free. Plan is a free preview. Approve and run starts the research and design steps here and queues the builds for the box runner. Everything counts toward this month\'s $50 budget; past it, work pauses and asks you to continue. Builds open draft PRs only.</p>' +
      '<p class="note" id="pm-msg" role="status" aria-live="polite"></p>' +
      '<div id="pm-preview">' + (pmPreview ? '<div class="sect">Preview</div>' + pmPreview.map(planHtml).join('') : '') + '</div>' +
      '<div class="sect">Plans</div><div id="pm-plans">' + (pmPlans === null ? '<p class="note">Loading plans…</p>' : pmPlans.length ? pmPlans.map(planHtml).join('') : '<div class="empty"><b>No plans yet.</b></div>') + '</div></section>';
  }
  function paintPm(root) {
    var a = root.querySelector('#pm-plans'); var b = root.querySelector('#pm-preview');
    if (a) a.innerHTML = pmPlans && pmPlans.length ? pmPlans.map(planHtml).join('') : '<div class="empty"><b>No plans yet.</b></div>';
    if (b) b.innerHTML = pmPreview ? '<div class="sect">Preview</div>' + pmPreview.map(planHtml).join('') : '';
  }
  function loadPlans(root) {
    return builderApi('GET', '/pm').then(function (d) { pmPlans = Array.isArray(d.plans) ? d.plans : []; })
      .catch(function () { pmPlans = []; }).then(function () { paintPm(root); });
  }
  // While the page is open, move every unfinished plan one step forward at the same time, every few seconds.
  function tickPlans(root) {
    if (!document.body.contains(root)) { clearInterval(pmTimer); pmTimer = null; return; }
    var open = (pmPlans || []).filter(function (p) { return p.state === 'approved'; });
    if (!open.length) return;
    Promise.all(open.map(function (p) { return builderApi('POST', '/pm/advance', { id: p.id }).catch(function () { return null; }); }))
      .then(function () { return loadPlans(root); }).then(function () { loadJobs(root); });
  }
  function mountPm(root) {
    var form = root.querySelector('#pm-form');
    if (!form) return;
    var msg = root.querySelector('#pm-msg');
    loadPlans(root);
    if (pmTimer) clearInterval(pmTimer);
    pmTimer = setInterval(function () { tickPlans(root); }, 6000);
    function goals() { return root.querySelector('#pm-goals').value.split('\n').map(function (g) { return g.trim(); }).filter(Boolean); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!goals().length) return;
      builderApi('POST', '/pm/plan', { goals: goals() }).then(function (d) { pmPreview = d.plans || []; paintPm(root); if (msg) msg.textContent = 'Preview only. Nothing is saved or spent yet.'; })
        .catch(function (err) { if (msg) msg.textContent = 'Could not plan: ' + err.message.replace(/_/g, ' ') + '.'; });
    });
    root.querySelector('[data-pm="approve"]').addEventListener('click', function () {
      var g = goals();
      if (!g.length) return;
      if (!window.confirm('Approve ' + g.length + (g.length === 1 ? ' goal' : ' goals') + '? Research and design run now; builds queue for the box runner and open draft PRs. All of it counts toward this month\'s budget, and I will ask before going past it.')) return;
      builderApi('POST', '/pm/approve', { goals: g }).then(function () {
        pmPreview = null; root.querySelector('#pm-goals').value = '';
        if (msg) msg.textContent = 'Approved. The plans below move forward while this page is open.';
        return loadPlans(root);
      }).then(function () { tickPlans(root); })
        .catch(function (err) { if (msg) msg.textContent = 'Not approved: ' + err.message.replace(/_/g, ' ') + '.'; });
    });
  }

  function mountBuilder(root) {
    mountPm(root);
    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-budget]') : null;
      if (!b) return;
      var add = b.getAttribute('data-budget');
      if (!window.confirm('Add $' + add + ' to this month\'s budget and continue the paused work? Make sure your API credits are topped up.')) return;
      builderApi('POST', '/budget', { add: add }).then(function () { loadJobs(root); }).catch(function (err) { var m = root.querySelector('#bd-msg'); if (m) m.textContent = 'Could not continue: ' + err.message.replace(/_/g, ' ') + '.'; });
    });
    var form = root.querySelector('#bd-form');
    if (!form) return;
    loadJobs(root);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var task = root.querySelector('#bd-task').value.trim();
      var pick = root.querySelector('#bd-builder').value.split('|');
      var branch = root.querySelector('#bd-branch').value.trim() || ('os-build/' + slug(task));
      var msg = root.querySelector('#bd-msg');
      if (!task) return;
      if (pick[1] === 'opus' && !window.confirm('Claude Opus counts $6 toward this month\'s budget per run. Queue it?')) return;
      builderApi('POST', '/approve', { repo: root.querySelector('#bd-repo').value, branch: branch, objective: task, executor: pick[0], model: pick[1] })
        .then(function (d) { if (msg) msg.textContent = 'Queued ' + d.job_id + ' on ' + branch + '. It runs when the box runner is on.'; root.querySelector('#bd-task').value = ''; loadJobs(root); })
        .catch(function (err) { if (msg) msg.textContent = 'Not queued: ' + err.message.replace(/_/g, ' ') + '.'; });
    });
  }

  OS.registerView('build', {
    render: function (ctx) {
      var log = ctx.data.build;
      var items = log && Array.isArray(log.items) ? log.items.filter(function (i) { return !OS.inBusiness || OS.inBusiness(i.project); }) : [];
      var head = '<div class="ph"><div><h1>Build</h1><p>What Claude and the agents are building' + (OS.business && OS.business() !== 'all' ? ' for ' + esc(OS.businessLabel()) : '') + ', and what is waiting on your yes.</p></div>' +
        (log ? '<div class="r"><span class="dim">Updated ' + esc(OS.fmtTime(log.receivedAt)) + '</span></div>' : '') + '</div>';
      var tiles = '<div class="grid g4">' + LANES.map(function (l) {
        var n = items.filter(function (i) { return i.status === l.key; }).length;
        return '<div class="card kpi t-' + l.tint + '"><span>' + esc(l.label) + '</span><b class="num">' + (log ? n : '—') + '</b><i>' + (log ? 'items' : 'no build log yet') + '</i></div>';
      }).join('') + '</div>';
      if (!log) return head + pmCard() + builderCard() + overviewHtml([]) + tiles + '<section class="card mt">' + OS.empty('No build log has been received yet.', 'build') + '</section>';
      var lanes = LANES.map(function (l) {
        var rows = items.filter(function (i) { return i.status === l.key; });
        return '<section class="card mt bl-lane' + (l.key === 'waiting' && rows.length ? ' wait' : '') + '"><div class="ch"><h3>' + esc(l.label) + '</h3><div class="r"><span class="num">' + rows.length + '</span></div></div>' +
          (rows.length ? rows.map(item).join('') : '<div class="empty"><b>' + esc(l.empty) + '</b></div>') + '</section>';
      }).join('');
      return head + pmCard() + builderCard() + overviewHtml(items) + '<div class="sect">All work</div>' + tiles + lanes;
    },
    mount: function (root) {
      mountBuilder(root);
      root.addEventListener('click', function (e) {
        var card = e.target.closest ? e.target.closest('[data-biz]') : null;
        if (card && OS.business() === 'all' && OS.setBusiness) OS.setBusiness(card.getAttribute('data-biz'));
      });
    }
  });
})();
