/* LAVAALL OS Build: one place to ask the team for work (project manager or one builder), the month's budget, which
   agents are working (and why one is not), and every project as a pipeline of steps. The build-log feed sits in a
   drawer at the bottom: lanes in the order Osman acts on them, nothing invented, https links only. */
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

  // ---- Build: one place to ask the team for work ----
  // Project manager mode splits each goal into steps and gives each step to the agent best at it; One builder mode sends
  // the task straight to Codex, Claude Sonnet or Claude Opus. Everything opens draft PRs only. One same-origin fetch.
  var BUILDERS = [
    { v: 'codex|', label: 'Codex', cost: '$2' },
    { v: 'claude|sonnet', label: 'Claude Sonnet', cost: '$2' },
    { v: 'claude|opus', label: 'Claude Opus', cost: '$6' }
  ];
  var TEAM = [
    { id: 'grok', label: 'Grok', role: 'Research' },
    { id: 'deepseek', label: 'DeepSeek', role: 'Specs and writing' },
    { id: 'codex-chat', label: 'Codex chat', role: 'Specs (backup)' },
    { id: 'codex', label: 'Codex', role: 'Small code changes', box: true },
    { id: 'claude-sonnet', label: 'Claude Sonnet', role: 'Everyday code', box: true },
    { id: 'claude-opus', label: 'Claude Opus', role: 'Big builds', box: true }
  ];
  var KIND = { research: 'Research', design: 'Design', draft: 'Write', build: 'Build' };
  var STATE = { waiting: 'Waiting', running: 'Working', done: 'Done', failed: 'Failed', blocked: 'Blocked', queued: 'Queued for the box', held: 'Waiting', cancelled: 'Cancelled' };
  var mode = 'team';
  var jobs = null;
  var budget = null;
  var pmPlans = null;
  var pmPreview = null;
  var pmTimer = null;
  var check = null;
  var runnerSeenAt = null;

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
  function money(n) { return '$' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
  function ago(iso) {
    var t = Date.parse(iso || ''); if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';
  }
  function say(root, text) { var m = root.querySelector('#pm-msg'); if (m) m.textContent = text; }

  // ---- side panel: budget, team, box runner ----
  function budgetHtml() {
    if (budget === 'unavailable') return '<div class="bx-k">This month</div><p class="note">Budget not available right now.</p>';
    if (!budget || budget.allowance === null || budget.allowance === undefined) return '<div class="bx-k">This month</div><p class="note">Loading…</p>';
    var pct = Math.min(100, Math.round(Number(budget.spent || 0) * 100 / Number(budget.allowance || 1)));
    var html = '<div class="bx-k">This month</div><div class="bx-money"><b>' + money(budget.spent) + '</b><span>of ' + money(budget.allowance) + '</span></div>' +
      '<div class="bx-bar' + (budget.hold ? ' hold' : budget.warn ? ' warn' : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Budget used"><i style="width:' + pct + '%"></i></div>';
    if (budget.hold) {
      html += '<div class="bx-hold" role="alert"><b>Paused at the budget.</b> Waiting: ' + esc(budget.hold.what) + '.' +
        '<button class="btn pri" type="button" data-budget="50">Continue: add $50</button></div>';
    } else if (budget.warn) {
      html += '<p class="note bx-warn">Over 80% used. I will ask before going past it.</p>';
    }
    return html;
  }
  function teamHtml() {
    var rows = TEAM.map(function (a) {
      var st, why = '';
      if (a.box) {
        var seen = runnerSeenAt ? ago(runnerSeenAt) : '';
        st = seen ? 'ok' : 'off'; why = seen ? 'box seen ' + seen : 'needs the box runner';
      } else if (!check) { st = 'unk'; why = 'not checked yet'; }
      else if (check[a.id] && check[a.id].ok) { st = 'ok'; why = 'working · ' + check[a.id].model; }
      else if (check[a.id]) { st = 'bad'; why = check[a.id].why; }
      else { st = 'unk'; why = 'could not check; press Check now'; }
      return '<li class="bx-agent"><i class="dot ' + st + '" aria-hidden="true"></i><div><b>' + esc(a.label) + ' <span>· ' + esc(a.role) + '</span></b>' +
        '<small class="' + (st === 'bad' ? 'pm-why' : 'dim') + '">' + esc(why) + '</small></div></li>';
    }).join('');
    return '<div class="bx-k">Team <button class="linkbtn" type="button" data-check="1">Check now</button></div><ul class="bx-team">' + rows + '</ul>';
  }
  function paintSide(root) {
    var b = root.querySelector('#bd-budget'); if (b) b.innerHTML = budgetHtml();
    var t = root.querySelector('#bx-team'); if (t) t.innerHTML = teamHtml();
  }

  // ---- live progress: the short lines the box runner writes while a build runs (newest last) ----
  var PROGRESS_SHOWN = 6;
  function jobById(id) {
    for (var i = 0; i < (jobs || []).length; i++) if (jobs[i].id === id) return jobs[i];
    return null;
  }
  function progressRow(p) {
    var k = /^(stage|edit|read|search|plan|tool|note|warn|error|done)$/.test(p.kind) ? p.kind : 'note';
    return '<li class="lp-row k-' + k + '"><i class="dot" aria-hidden="true"></i><span>' + esc(p.text) + '</span><time class="num dim" datetime="' + esc(p.at) + '">' + esc(ago(p.at)) + '</time></li>';
  }
  function progressHtml(j) {
    if (!j) return '';
    var rows = Array.isArray(j.progress) ? j.progress : [];
    var live = j.state === 'running';
    if (!rows.length) return live ? '<div class="lp live"><div class="lp-h"><i class="lp-pulse" aria-hidden="true"></i>Working. The first update shows here in a few seconds.</div></div>' : '';
    var recent = rows.slice(-PROGRESS_SHOWN);
    var older = rows.slice(0, -PROGRESS_SHOWN);
    return '<div class="lp' + (live ? ' live' : '') + '">' +
      '<div class="lp-h">' + (live ? '<i class="lp-pulse" aria-hidden="true"></i>Live' : 'What happened') + '<span class="dim">· ' + rows.length + (rows.length === 1 ? ' update' : ' updates') + '</span></div>' +
      (older.length ? '<details class="lp-more" data-lp="' + esc(j.id) + '"><summary>Show ' + older.length + ' earlier</summary><ol class="lp-list">' + older.map(progressRow).join('') + '</ol></details>' : '') +
      '<ol class="lp-list"' + (live ? ' aria-live="polite"' : '') + '>' + recent.map(progressRow).join('') + '</ol></div>';
  }
  function anyJobMoving() {
    return (jobs || []).some(function (j) { return j.state === 'queued' || j.state === 'running'; });
  }

  // ---- projects: one card per plan, steps as a pipeline ----
  function stepHtml(st) {
    var bad = st.state === 'failed' || st.state === 'blocked' || /^Paused:/.test(String(st.output || ''));
    var pr = /Draft PR: (https:\/\/github\.com\/\S+)/.exec(String(st.output || ''));
    var out = !st.output ? '' : bad ? '<div class="pm-why">' + esc(String(st.output).slice(0, 300)) + '</div>'
      : pr ? '<a class="bx-pr" href="' + esc(pr[1]) + '" target="_blank" rel="noopener">Open draft PR</a>'
      : '<details><summary>Read output</summary><pre class="sm-text">' + esc(String(st.output).slice(0, 4000)) + '</pre></details>';
    return '<li class="px-step s-' + esc(st.state) + '"><div class="px-top"><i class="dot" aria-hidden="true"></i><b>' + esc(KIND[st.kind] || st.kind) + '</b><span class="px-who">' + esc(st.label) + '</span></div>' +
      '<div class="px-st">' + esc(STATE[st.state] || st.state) + '</div><p class="px-why dim">' + esc(st.why) + '</p>' + out +
      (st.kind === 'build' && st.jobId ? progressHtml(jobById(st.jobId)) : '') + '</li>';
  }
  function planHtml(p, preview) {
    var label = preview ? 'Preview' : p.state === 'approved' ? 'Running' : p.state === 'done' ? 'Done' : p.state === 'stopped' ? 'Stopped' : p.state;
    return '<article class="card px s-' + esc(p.state) + '"><header class="px-h"><span class="px-badge">' + esc(label) + '</span><h3>' + esc(p.goal) + '</h3>' +
      (p.state === 'stopped' ? '<button class="btn" type="button" data-pm-retry="' + esc(p.id) + '">Retry</button>' : '') + '</header>' +
      '<ol class="px-steps">' + p.steps.map(stepHtml).join('') + '</ol>' +
      '<footer class="note">' + esc(OS.businessLabel ? OS.businessLabel(p.business) || p.business : p.business) + ' · ' + esc(p.repo) + ' · <code>' + esc(p.branch) + '</code></footer></article>';
  }
  function jobHtml(j) {
    var who = j.executor === 'claude' ? 'Claude ' + (j.model === 'opus' ? 'Opus' : 'Sonnet') : 'Codex';
    var pr = j.result && j.result.prUrl ? '<a class="bx-pr" href="' + esc(j.result.prUrl) + '" target="_blank" rel="noopener">Open draft PR</a>' : '';
    var err = j.result && j.result.error ? '<div class="pm-why">' + esc(j.result.error) + '</div>' : '';
    return '<article class="card px"><header class="px-h"><span class="px-badge">' + esc(STATE[j.state] || j.state) + '</span><h3>' + esc(String(j.objective || '').slice(0, 140)) + '</h3></header>' +
      '<p class="note">' + esc(who) + ' · ' + esc(j.repo) + ' · <code>' + esc(j.branch) + '</code></p>' + pr + err + progressHtml(j) + '</article>';
  }
  function projectsHtml() {
    if (pmPlans === null) return '<p class="note">Loading…</p>';
    var single = (jobs || []).filter(function (j) { return !j.planId; });
    if (!pmPlans.length && !single.length) return '<div class="empty bx-empty"><b>Nothing yet.</b><span>Type a goal above and press Run.</span></div>';
    return pmPlans.map(function (p) { return planHtml(p, false); }).join('') + single.map(jobHtml).join('');
  }
  function paintProjects(root) {
    var a = root.querySelector('#pm-plans');
    if (a) {
      // A repaint every few seconds must not close an "earlier updates" list Osman opened.
      var opened = Array.prototype.map.call(a.querySelectorAll('details[data-lp][open]'), function (d) { return d.getAttribute('data-lp'); });
      a.innerHTML = projectsHtml();
      opened.forEach(function (id) { var d = a.querySelector('details[data-lp="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'); if (d) d.open = true; });
    }
    var b = root.querySelector('#pm-preview'); if (b) b.innerHTML = pmPreview ? pmPreview.map(function (p) { return planHtml(p, true); }).join('') : '';
  }

  // ---- loading and moving plans forward ----
  function loadAll(root) {
    return Promise.all([
      builderApi('GET', '/pm').then(function (d) { pmPlans = Array.isArray(d.plans) ? d.plans : []; }).catch(function () { pmPlans = []; }),
      builderApi('GET', '').then(function (d) { jobs = Array.isArray(d.jobs) ? d.jobs : []; budget = d.budget || 'unavailable'; }).catch(function () { jobs = []; budget = 'unavailable'; })
    ]).then(function () { paintProjects(root); paintSide(root); });
  }
  function runCheck(root) {
    var t = root.querySelector('#bx-team'); if (t) t.classList.add('busy');
    return builderApi('POST', '/pm/check', {}).then(function (d) { check = d.agents || {}; runnerSeenAt = d.runnerSeenAt || null; })
      .catch(function () { check = {}; }).then(function () { if (t) t.classList.remove('busy'); paintSide(root); });
  }
  // While the page is open, every running plan moves one step forward at the same time, every few seconds. A queued or
  // running box build with no open plan still refreshes, so its live progress keeps moving.
  function tickPlans(root) {
    if (!document.body.contains(root)) { clearInterval(pmTimer); pmTimer = null; return; }
    var open = (pmPlans || []).filter(function (p) { return p.state === 'approved'; });
    if (!open.length) { if (anyJobMoving() && !document.hidden) loadAll(root); return; }
    Promise.all(open.map(function (p) { return builderApi('POST', '/pm/advance', { id: p.id }).catch(function () { return null; }); }))
      .then(function () { return loadAll(root); });
  }
  function goals(root) { return root.querySelector('#pm-goals').value.split('\n').map(function (g) { return g.trim(); }).filter(Boolean); }
  function repoFor(text) { return /salone ?hire|saloneworks|salone works|salon hire/i.test(text) ? 'osman-jalloh-lab/saloneworks' : 'osman-jalloh-lab/Lavaal-'; }

  function composerHtml() {
    return '<section class="card bx-compose" id="pm-form"><label class="bx-ask" for="pm-goals">What should the team build?</label>' +
      '<textarea id="pm-goals" rows="5" maxlength="3000" placeholder="One goal per line, up to 5. For example:&#10;Build a landing page for SaloneHire employers&#10;Research 3 competitors for SaloneHire in Sierra Leone&#10;Fix the footer typo on lavaall.com"></textarea>' +
      '<div class="bx-row"><div class="bx-seg" role="radiogroup" aria-label="Who does the work">' +
          '<button type="button" role="radio" aria-checked="true" data-mode="team" class="on">Project manager</button>' +
          '<button type="button" role="radio" aria-checked="false" data-mode="one">One builder</button></div>' +
        '<label class="bx-pick" hidden><span class="sr">Builder</span><select id="bd-builder">' + BUILDERS.map(function (b) { return '<option value="' + b.v + '">' + esc(b.label) + ' · ' + b.cost + '</option>'; }).join('') + '</select></label>' +
        '<span class="bx-grow"></span>' +
        '<button class="btn" type="button" data-pm="plan">Preview</button>' +
        '<button class="btn pri bx-go" type="button" data-pm="approve">Run</button></div>' +
      '<p class="bx-msg" id="pm-msg" role="status" aria-live="polite"></p>' +
      '<div id="pm-preview"></div></section>';
  }

  function mountBuilder(root) {
    loadAll(root).then(function () { if (!check) runCheck(root); });
    if (pmTimer) clearInterval(pmTimer);
    pmTimer = setInterval(function () { tickPlans(root); }, 6000);
    root.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null; if (!t) return;
      var modeBtn = t.closest('[data-mode]');
      if (modeBtn) {
        mode = modeBtn.getAttribute('data-mode');
        Array.prototype.forEach.call(root.querySelectorAll('[data-mode]'), function (b) { var on = b === modeBtn; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        root.querySelector('.bx-pick').hidden = mode !== 'one';
        root.querySelector('[data-pm="plan"]').hidden = mode === 'one';
        return;
      }
      if (t.closest('[data-check]')) { runCheck(root); return; }
      var retry = t.closest('[data-pm-retry]');
      if (retry) {
        builderApi('POST', '/pm/retry', { id: retry.getAttribute('data-pm-retry') })
          .then(function () { say(root, 'Retrying. Keep this page open while it runs.'); return loadAll(root); })
          .then(function () { tickPlans(root); })
          .catch(function (err) { say(root, 'Could not retry: ' + err.message.replace(/_/g, ' ') + '.'); });
        return;
      }
      var bud = t.closest('[data-budget]');
      if (bud) {
        if (!window.confirm('Add $' + bud.getAttribute('data-budget') + ' to this month and continue? Top up your API credits if needed.')) return;
        builderApi('POST', '/budget', { add: bud.getAttribute('data-budget') }).then(function () { return loadAll(root); })
          .catch(function (err) { say(root, 'Could not continue: ' + err.message.replace(/_/g, ' ') + '.'); });
        return;
      }
      var act = t.closest('[data-pm]');
      if (!act) return;
      var g = goals(root);
      if (!g.length) { say(root, 'Type at least one goal first.'); return; }
      if (act.getAttribute('data-pm') === 'plan') {
        builderApi('POST', '/pm/plan', { goals: g }).then(function (d) { pmPreview = d.plans || []; paintProjects(root); say(root, 'Preview only: nothing is saved or spent. Press Run to start.'); })
          .catch(function (err) { say(root, 'Could not plan: ' + err.message.replace(/_/g, ' ') + '.'); });
        return;
      }
      if (mode === 'one') {
        var pick = root.querySelector('#bd-builder').value.split('|');
        var task = g.join('. ');
        if (pick[1] === 'opus' && !window.confirm('Claude Opus counts $6 toward this month. Run it?')) return;
        builderApi('POST', '/approve', { repo: repoFor(task), branch: 'os-build/' + slug(task), objective: task, executor: pick[0], model: pick[1] })
          .then(function () { root.querySelector('#pm-goals').value = ''; say(root, 'Queued. It runs on the box and opens a draft PR.'); return loadAll(root); })
          .catch(function (err) { say(root, 'Not queued: ' + err.message.replace(/_/g, ' ') + '.'); });
        return;
      }
      if (!window.confirm('Run ' + g.length + (g.length === 1 ? ' goal' : ' goals') + '? Research and design start now; code goes to the box and opens draft PRs.')) return;
      builderApi('POST', '/pm/approve', { goals: g }).then(function () {
        pmPreview = null; root.querySelector('#pm-goals').value = '';
        say(root, 'Running. Keep this page open; steps move forward on their own.');
        return loadAll(root);
      }).then(function () { tickPlans(root); })
        .catch(function (err) { say(root, 'Not started: ' + err.message.replace(/_/g, ' ') + '.'); });
    });
  }

  function logHtml(log, items) {
    var waiting = items.filter(function (i) { return i.status === 'waiting'; }).length;
    var tiles = '<div class="grid g4">' + LANES.map(function (l) {
      var n = items.filter(function (i) { return i.status === l.key; }).length;
      return '<div class="card kpi t-' + l.tint + '"><span>' + esc(l.label) + '</span><b class="num">' + (log ? n : '—') + '</b><i>' + (log ? 'items' : 'no build log yet') + '</i></div>';
    }).join('') + '</div>';
    var body = !log ? '<section class="card mt">' + OS.empty('No build log has been received yet.', 'build') + '</section>'
      : LANES.map(function (l) {
        var rows = items.filter(function (i) { return i.status === l.key; });
        return '<section class="card mt bl-lane' + (l.key === 'waiting' && rows.length ? ' wait' : '') + '"><div class="ch"><h3>' + esc(l.label) + '</h3><div class="r"><span class="num">' + rows.length + '</span></div></div>' +
          (rows.length ? rows.map(item).join('') : '<div class="empty"><b>' + esc(l.empty) + '</b></div>') + '</section>';
      }).join('');
    return '<details class="bx-log"' + (waiting ? ' open' : '') + '><summary>Build log' + (log ? ' · ' + items.length + ' items' + (waiting ? ' · ' + waiting + ' waiting on you' : '') + ' · updated ' + esc(OS.fmtTime(log.receivedAt)) : '') + '</summary>' + tiles + body + '</details>';
  }

  OS.buildPlanHtml = planHtml;
  OS.registerView('build', {
    render: function (ctx) {
      var log = ctx.data.build;
      var items = log && Array.isArray(log.items) ? log.items.filter(function (i) { return !OS.inBusiness || OS.inBusiness(i.project); }) : [];
      var head = '<div class="ph"><div><h1>Build</h1><p>Tell the team what to build' + (OS.business && OS.business() !== 'all' ? ' for ' + esc(OS.businessLabel()) : '') + '. Research, design and code run side by side and come back as draft PRs.</p></div></div>';
      return head +
        '<div class="bx">' + composerHtml() +
          '<aside class="card bx-side"><div id="bd-budget">' + budgetHtml() + '</div><div id="bx-team">' + teamHtml() + '</div></aside></div>' +
        '<div class="sect">Projects</div><div id="pm-plans" class="bx-projects">' + projectsHtml() + '</div>' +
        logHtml(log, items);
    },
    mount: function (root) { mountBuilder(root); }
  });
})();
