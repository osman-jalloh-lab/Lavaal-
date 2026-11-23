/* LAVAALL OS Harness: founder chat for building. Pick a project and a harness,
   type a request, and send it. Gemini is off. This page talks only to /ops/harness
   on this site. It cannot run the Codex or Claude CLIs or edit files on the box. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var HARNESSES = [
    { id: 'codex', label: 'OpenAI API' },
    { id: 'claude', label: 'Claude' },
    { id: 'deepseek', label: 'DeepSeek' },
    { id: 'grok', label: 'Grok' }
  ];
  var CLAUDE_MODELS = [
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'haiku', label: 'Haiku' },
    { id: 'opus', label: 'Opus' }
  ];

  function pack(data) {
    return data && data.harness ? data.harness : { projects: [], groups: [], status: [], note: '' };
  }

  function groupsOf(data) {
    var groups = pack(data).groups || [];
    if (groups.length) return groups;
    return [{ id: 'all', label: 'Projects', projects: pack(data).projects || [] }];
  }

  function statusById(data) {
    var map = {};
    (pack(data).status || []).forEach(function (s) { map[s.id] = s; });
    return map;
  }

  function tone(state) {
    if (state === 'ready') return 'ok';
    if (state === 'missing') return 'wait';
    return '';
  }

  function defaultGroup(data) {
    var groups = groupsOf(data);
    var hire = groups.filter(function (g) { return g.id === 'salonehire'; })[0];
    if (hire && hire.projects && hire.projects.length) return hire;
    return groups[0] || { id: '', label: '', projects: [] };
  }

  OS.registerView('harness', {
    render: function (ctx) {
      var data = ctx.data || {};
      var groups = groupsOf(data);
      var first = defaultGroup(data);
      var firstProj = (first.projects || [])[0];
      var st = statusById(data);
      var groupOpts = groups.map(function (g) {
        return '<option value="' + esc(g.id) + '"' + (g.id === first.id ? ' selected' : '') + '>' + esc(g.label) + '</option>';
      }).join('');
      var projOpts = (first.projects || []).map(function (p, i) {
        return '<option value="' + esc(p.name) + '"' + (i === 0 ? ' selected' : '') + '>' + esc(p.label || p.name) + '</option>';
      }).join('');
      var buttons = HARNESSES.map(function (h, i) {
        var s = st[h.id] || { detail: '', state: 'missing' };
        var on = i === 0 ? ' on' : '';
        return '<button type="button" class="btn harness-pick' + on + '" data-harness="' + esc(h.id) + '" aria-pressed="' + (i === 0 ? 'true' : 'false') + '">' +
          '<span class="dot ' + tone(s.state) + '"></span>' +
          '<span>' + esc(h.label) + '</span>' +
          '<small class="dim">' + esc(s.detail || '') + '</small>' +
          '</button>';
      }).join('');
      var models = CLAUDE_MODELS.map(function (m, i) {
        return '<option value="' + esc(m.id) + '"' + (i === 0 ? ' selected' : '') + '>' + esc(m.label) + '</option>';
      }).join('');
      var head = '<div class="ph"><div><h1>Harness</h1><p>Choose a project and send a message. Connected provider APIs can answer here; repository edits and CLI execution require a separately approved coding runner. Gemini is off.</p></div></div>';
      var projectCount = groups.reduce(function (n, g) { return n + ((g.projects || []).length); }, 0);
      if (!projectCount) {
        var src = (data.sources && data.sources.harness && data.sources.harness.from) || 'tools/lavaall-ai/projects.json';
        return head + '<section class="card"><div class="empty"><b>No projects are listed.</b><small>Source: ' + esc(src) + '</small></div></section>';
      }
      return head +
        '<div class="harness-tabs" role="tablist">' +
          '<button type="button" class="btn harness-tab" data-harness-tab="home" role="tab" aria-selected="false">Usage</button>' +
          '<button type="button" class="btn harness-tab on" data-harness-tab="chat" role="tab" aria-selected="true">Chat</button>' +
          '<button type="button" class="btn harness-tab" data-harness-tab="registry" role="tab" aria-selected="false">Agents &amp; skills</button>' +
        '</div>' +
        '<section class="card harness-home hidden" id="harness-home">' +
          '<div class="ch">' + icon('spend') + '<h3>Usage and credit</h3></div>' +
          '<p class="dim" id="harness-usage-note">Loading usage from each provider’s free balance or usage endpoint. Totals are shown only when the provider returns them.</p>' +
          '<div class="harness-usage" id="harness-usage"><div class="empty"><b>Loading usage…</b></div></div>' +
        '</section>' +
        '<section class="harness-registry hidden" id="harness-registry" aria-live="polite"><div class="empty"><b>Registry not loaded.</b></div></section>' +
        '<section class="harness-chat" id="harness-chat">' +
          '<div class="card harness-card">' +
            '<div class="harness-pickers">' +
              '<label class="harness-field">Group' +
                '<select class="harness-sel" id="harness-group" aria-label="Project group">' + groupOpts + '</select>' +
              '</label>' +
              '<label class="harness-field">Project' +
                '<select class="harness-sel" id="harness-project" aria-label="Project">' + projOpts + '</select>' +
              '</label>' +
            '</div>' +
            '<p class="harness-meta dim" id="harness-meta"></p>' +
            '<div class="harness-picks" role="group" aria-label="Harness">' + buttons + '</div>' +
            '<label class="harness-field harness-modelwrap hidden" id="harness-modelwrap">Claude model' +
              '<select class="harness-sel" id="harness-model" aria-label="Claude model">' + models + '</select>' +
            '</label>' +
            '<div class="harness-setup" id="harness-setup"><p>To chat with Codex from this page, add <code class="mono">OPENAI_API_KEY</code> in Vercel project settings (Preview and Production). This site cannot open the ChatGPT login. For the Codex CLI with your ChatGPT account, run <code class="mono">codex login</code> on your computer.</p></div>' +
            '<div class="harness-thread" id="harness-thread" aria-live="polite"></div>' +
            '<form class="harness-composer" id="harness-form">' +
              '<label class="harness-field" for="harness-input">Request</label>' +
              '<textarea class="harness-input" id="harness-input" rows="3" maxlength="8000" placeholder="Type what you want done, for example: add a receipt hold for hired applicants." required></textarea>' +
              '<button type="submit" class="btn pri" id="harness-send">Send</button>' +
            '</form>' +
            '<section class="harness-execution" id="harness-goals">' +
              '<h3>Goals & handoffs</h3>' +
              '<p class="dim">Type <code class="mono">/goal your objective</code> in the Request box and press Send. Select a saved goal to share its checkpoints with any chat provider. No code runs automatically.</p>' +
              '<div id="harness-goal-status" role="status" aria-live="polite"></div>' +
              '<div id="harness-goal-list"></div>' +
              '<label class="harness-field" for="harness-goal-note">Checkpoint note (optional)</label>' +
              '<textarea id="harness-goal-note" class="harness-input" maxlength="3000" rows="2" placeholder="What changed, what remains, and evidence URL"></textarea>' +
              '<label class="harness-field" for="harness-goal-evidence">Evidence link (optional)</label>' +
              '<input type="url" id="harness-goal-evidence" class="harness-input" maxlength="500" placeholder="GitHub PR, commit or Actions run link (optional)">' +
              '<label class="harness-field" for="harness-goal-state">Goal state</label>' +
              '<select id="harness-goal-state" class="harness-sel"><option value="planned">planned</option><option value="in_progress" selected>in_progress</option><option value="blocked">blocked</option><option value="awaiting_approval">awaiting_approval</option><option value="completed">completed</option></select>' +
              '<button type="button" class="btn" id="harness-goal-save">Save checkpoint</button>' +
            '</section>' +
            '<div class="harness-execution" id="harness-execution">' +
              '<h3>Execute code in GitHub</h3>' +
              '<p class="dim">Runs a separate Codex coding agent on the LAVAALL repository. It writes a reviewable patch and runs tests in GitHub Actions. It does not merge or deploy code, and API usage may be billed.</p>' +
              '<label><input type="checkbox" id="harness-execute-confirm"/> I approve a coding run that may incur API charges.</label>' +
              '<button type="button" class="btn" id="harness-execute">Run code task</button>' +
              '<div class="note" id="harness-execute-result" role="status" aria-live="polite"></div>' +
            '</div>' +
          '</div>' +
        '</section>';
    },
    mount: function (root, ctx) {
      var data = ctx.data || {};
      var groups = groupsOf(data);
      var st = statusById(data);
      var selectedHarness = 'codex';
      var tab = 'chat';
      var groupEl = root.querySelector('#harness-group');
      var projEl = root.querySelector('#harness-project');
      var meta = root.querySelector('#harness-meta');
      var modelWrap = root.querySelector('#harness-modelwrap');
      var setup = root.querySelector('#harness-setup');
      var thread = root.querySelector('#harness-thread');
      var form = root.querySelector('#harness-form');
      var input = root.querySelector('#harness-input');
      var send = root.querySelector('#harness-send');
      var executeBtn = root.querySelector('#harness-execute');
      var executeConfirm = root.querySelector('#harness-execute-confirm');
      var executeResult = root.querySelector('#harness-execute-result');
      var goalList = root.querySelector('#harness-goal-list');
      var goalStatus = root.querySelector('#harness-goal-status');
      var goalNote = root.querySelector('#harness-goal-note');
      var goalEvidence = root.querySelector('#harness-goal-evidence');
      var goalState = root.querySelector('#harness-goal-state');
      var goalSave = root.querySelector('#harness-goal-save');
      var selectedGoal = '';
      var usageEl = root.querySelector('#harness-usage');
      var usageNote = root.querySelector('#harness-usage-note');
      var home = root.querySelector('#harness-home');
      var chat = root.querySelector('#harness-chat');
      var registryEl = root.querySelector('#harness-registry');
      if (!groupEl || !projEl) return;

      function currentGroup() {
        var id = groupEl.value;
        for (var i = 0; i < groups.length; i++) if (groups[i].id === id) return groups[i];
        return groups[0] || { projects: [] };
      }

      function currentProject() {
        var name = projEl.value;
        var list = currentGroup().projects || [];
        for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
        return list[0] || null;
      }

      function fillProjects() {
        var list = currentGroup().projects || [];
        projEl.innerHTML = list.map(function (p, i) {
          return '<option value="' + esc(p.name) + '"' + (i === 0 ? ' selected' : '') + '>' + esc(p.label || p.name) + '</option>';
        }).join('');
      }

      function metaLine(proj) {
        if (!proj) return 'No project in this group.';
        var bits = [];
        if (proj.summary) bits.push(proj.summary);
        else if (proj.status) bits.push(proj.status);
        return bits.join(' ');
      }

      function setupHtml() {
        if (selectedHarness !== 'codex') return '';
        var s = st.codex || {};
        if (s.state === 'ready') {
          return '<p>Codex chat on this page uses the <code class="mono">OPENAI_API_KEY</code> set in Vercel. To use the Codex CLI with your ChatGPT account instead, sign in on your computer with <code class="mono">codex login</code>.</p>';
        }
        return '<p>To chat with Codex from this page, add <code class="mono">OPENAI_API_KEY</code> in Vercel project settings (Preview and Production). This site cannot open the ChatGPT login. For the Codex CLI with your ChatGPT account, run <code class="mono">codex login</code> on your computer.</p>';
      }

      function renderSetup() {
        if (modelWrap) modelWrap.classList.toggle('hidden', selectedHarness !== 'claude');
        if (!setup) return;
        var html = setupHtml();
        setup.innerHTML = html;
        setup.classList.toggle('hidden', !html);
      }

      function bubble(msg) {
        var who = msg.role === 'user' ? 'You' : (msg.harness === 'codex' ? 'OpenAI API' : (msg.harness || 'Assistant'));
        var u = msg.role !== 'user' && msg.usage;
        var count = u && (u.inputTokens != null || u.outputTokens != null)
          ? '<small class="dim">Reported tokens: ' + esc(u.inputTokens == null ? '?' : u.inputTokens) + ' in / ' + esc(u.outputTokens == null ? '?' : u.outputTokens) + ' out · Cost not available</small>'
          : '';
        return '<div class="harness-msg harness-msg-' + esc(msg.role) + '"><small class="dim">' + esc(who) + '</small><div>' + esc(msg.text || '') + '</div>' + count + '</div>';
      }

      function drawThread(messages, pending) {
        if (!thread) return;
        var rows = (messages || []).map(bubble).join('');
        if (pending) rows += '<div class="harness-msg harness-msg-assistant" id="harness-pending"><small class="dim">Working…</small><div>Sending your request.</div></div>';
        if (!rows) rows = '<div class="empty"><b>No messages yet for this project.</b><small>Type a request and press Send.</small></div>';
        thread.innerHTML = rows;
        thread.scrollTop = thread.scrollHeight;
      }

      function api(path, init) {
        var opts = init || {};
        opts.credentials = 'same-origin';
        opts.headers = opts.headers || {};
        if (opts.body && !opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
        return window.fetch('/ops/harness/' + path, opts).then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, status: res.status, body: body || {} };
          }).catch(function () {
            return { ok: false, status: res.status, body: { error: 'bad_response' } };
          });
        });
      }

      function loadHistory() {
        var proj = currentProject();
        if (!proj || !thread) return;
        drawThread([], false);
        api('history?project=' + encodeURIComponent(proj.name), { method: 'GET' }).then(function (res) {
          if (!res.ok) {
            if (res.status === 401) {
              drawThread([], false);
              thread.innerHTML = '<div class="empty"><b>Sign in required.</b></div>';
              return;
            }
            return;
          }
          drawThread(res.body.messages || [], false);
        }).catch(function () {
          drawThread([], false);
        });
      }

      function showTab(next) {
        tab = next;
        var tabs = root.querySelectorAll('.harness-tab');
        for (var i = 0; i < tabs.length; i++) {
          var on = tabs[i].getAttribute('data-harness-tab') === tab;
          tabs[i].classList.toggle('on', on);
          tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
        }
        if (home) home.classList.toggle('hidden', tab !== 'home');
        if (chat) chat.classList.toggle('hidden', tab !== 'chat');
        if (registryEl) registryEl.classList.toggle('hidden', tab !== 'registry');
        if (tab === 'chat') loadHistory();
        if (tab === 'home') loadUsage();
        if (tab === 'registry') loadRegistry();
      }

      function registryList(values) {
        return (values || []).map(function (value) { return esc(value); }).join(', ') || 'None';
      }

      function registrySection(title, rows) {
        return '<section class="card harness-registry-section"><div class="ch"><h3>' + title + '</h3></div>' +
          (rows || '<div class="empty"><b>None reported.</b></div>') + '</section>';
      }

      function loadRegistry() {
        if (!registryEl) return;
        registryEl.innerHTML = '<div class="empty"><b>Loading registry…</b></div>';
        api('providers', { method: 'GET' }).then(function (res) {
          if (!res.ok) {
            registryEl.innerHTML = '<div class="empty"><b>Registry could not be loaded.</b><small>' + esc(res.body.error || ('HTTP ' + res.status)) + '</small></div>';
            return;
          }
          var agents = res.body.agents || [];
          var providers = res.body.providers || [];
          var skills = res.body.skills || [];
          var agentRows = agents.map(function (a) {
            var approval = a.approval_requirements || {};
            return '<div class="li static harness-registry-row"><div><b>' + esc(a.label) + '</b> <span class="mono">' + esc(a.id) + '</span>' +
              (approval.cost_approval_models && approval.cost_approval_models.length ? ' <span class="pill flag">Cost approval</span>' : '') +
              '<p>Role: ' + esc(a.role) + ' · Cost class: ' + esc(a.cost_class) + '</p>' +
              '<p>Providers: ' + registryList(a.providers) + '<br>Models: ' + registryList(a.models) +
              '<br>Tools: ' + registryList(a.tools) + '<br>Skills: ' + registryList(a.skills) + '</p>' +
              '<p>Hosted chat approval: ' + esc(String(approval.hosted_chat)) + ' · Coding agent approval: ' + esc(String(approval.coding_agent)) +
              '<br>Cost approval models: ' + registryList(approval.cost_approval_models) + '</p></div></div>';
          }).join('');
          var modelRows = providers.map(function (p) {
            var rows = (p.models || []).map(function (m) {
              var costApproval = agents.some(function (a) {
                return (a.approval_requirements && a.approval_requirements.cost_approval_models || []).indexOf(m.id) !== -1;
              });
              return '<div class="li static harness-registry-row"><div><b>' + esc(m.label || m.id) + '</b> <span class="mono">' + esc(m.id) + '</span>' +
                (costApproval ? ' <span class="pill flag">Cost approval</span>' : '') +
                '<p>Cost tier: ' + esc(m.cost_tier) + ' · Requires approval: ' + esc(String(m.requires_approval)) + '</p>' +
                (m.notes ? '<p>' + esc(m.notes) + '</p>' : '') + '</div></div>';
            }).join('');
            return '<div class="harness-registry-provider"><h4>' + esc(p.label || p.id) + '</h4>' + (rows || '<div class="empty"><b>No models reported.</b></div>') + '</div>';
          }).join('');
          var skillRows = skills.map(function (s) {
            return '<div class="li static harness-registry-row"><div><b>' + esc(s.name) + '</b> <span class="pill flag">Unreviewed</span>' +
              '<p>' + esc(s.purpose) + '</p><p>Class: ' + esc(s.class) + ' · Reviewed: ' + esc(String(s.reviewed)) +
              '<br>Source: <span class="mono">' + esc(s.source_path) + '</span><br>Pinned SHA: <span class="mono">' + esc(s.source_sha) + '</span></p></div></div>';
          }).join('');
          registryEl.innerHTML = registrySection('Agents', agentRows) + registrySection('Models', modelRows) +
            '<p class="dim">Skills are unreviewed instructions only and are never executed from this page.</p>' + registrySection('Skills', skillRows);
        }).catch(function () {
          registryEl.innerHTML = '<div class="empty"><b>Registry could not be loaded.</b></div>';
        });
      }

      function usageCard(p) {
        var body;
        if (p.available && p.total != null) {
          body = '<b class="num">' + esc(p.currency ? p.currency + ' ' + p.total : String(p.total)) + '</b>' +
            (p.granted ? '<i>Granted ' + esc(p.granted) + '</i>' : '') +
            (p.toppedUp ? '<i>Topped up ' + esc(p.toppedUp) + '</i>' : '');
        } else {
          body = '<b>Not available</b><i>' + esc(p.reason || 'not available') + '</i>';
        }
        return '<div class="card kpi"><span>' + esc(p.label || p.id) + '</span>' + body + '</div>';
      }

      function loadUsage() {
        if (!usageEl) return;
        api('usage', { method: 'GET' }).then(function (res) {
          if (!res.ok) {
            usageEl.innerHTML = '<div class="empty"><b>Usage could not be loaded.</b><small>' + esc(res.body.error || ('HTTP ' + res.status)) + '</small></div>';
            return;
          }
          var providers = res.body.providers || [];
          usageEl.innerHTML = providers.map(usageCard).join('') || '<div class="empty"><b>No providers reported.</b></div>';
          if (usageNote && res.body.note) usageNote.textContent = res.body.note;
        }).catch(function () {
          usageEl.innerHTML = '<div class="empty"><b>Usage could not be loaded.</b></div>';
        });
      }

      function loadGoals() {
        if (!goalList) return;
        var p = currentProject();
        if (!p) return;
        api('goals?project=' + encodeURIComponent(p.name), { method: 'GET' }).then(function (res) {
          if (!res.ok) {
            goalList.textContent = 'Goals unavailable: ' + (res.body.error || res.status);
            return;
          }
          var rows = res.body.goals || [];
          goalList.innerHTML = rows.length ? rows.map(function (g) {
            return '<button type="button" class="btn" data-goal-id="' + esc(g.id) +
              '" aria-pressed="' + (selectedGoal === g.id ? 'true' : 'false') +
              '">' + esc(g.objective + ' (' + g.state + ')') + '</button>';
          }).join(' ') : '<p class="dim">No saved goals for this project yet.</p>';
          if (goalStatus) goalStatus.textContent = selectedGoal
            ? 'Active goal: ' + selectedGoal : 'Select a goal to include its handoff in provider chat.';
        }).catch(function () {
          goalList.textContent = 'Unable to load goals.';
        });
      }
      if (goalList) goalList.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-goal-id]') : null;
        if (!btn) return;
        selectedGoal = btn.getAttribute('data-goal-id') || '';
        loadGoals();
      });
      if (goalSave) goalSave.addEventListener('click', function () {
        var note = goalNote && goalNote.value ? goalNote.value.trim() : '';
        if (!selectedGoal || !note) {
          if (goalStatus) goalStatus.textContent = 'Select a goal and type a checkpoint first.';
          return;
        }
        var evidenceUrl = goalEvidence && goalEvidence.value ? goalEvidence.value.trim() : '';
        var checkpoint = { action: 'checkpoint', id: selectedGoal, provider: 'human',
          state: goalState ? goalState.value : 'in_progress', note: note };
        if (evidenceUrl) checkpoint.evidenceUrl = evidenceUrl;
        goalSave.disabled = true;
        api('goals', { method: 'POST', body: JSON.stringify(checkpoint) }).then(function (res) {
          if (goalStatus) goalStatus.textContent = res.ok
            ? 'Checkpoint saved. It is not automatically verified against GitHub.'
            : 'Checkpoint not saved: ' + (res.body.error || res.status);
          if (res.ok) {
            if (goalNote) goalNote.value = '';
            if (goalEvidence) goalEvidence.value = '';
            loadGoals();
          }
        }).catch(function () {
          if (goalStatus) goalStatus.textContent = 'Checkpoint request failed.';
        }).then(function () { goalSave.disabled = false; });
      });

      function refresh() {
        selectedGoal = '';
        loadGoals();
        if (meta) meta.textContent = metaLine(currentProject());
        if (executeBtn) executeBtn.disabled = !currentProject() || currentProject().name !== 'lavaall';
        renderSetup();
        if (tab === 'chat') loadHistory();
      }

      root.addEventListener('click', function (e) {
        var tabBtn = e.target.closest ? e.target.closest('[data-harness-tab]') : null;
        if (tabBtn) {
          showTab(tabBtn.getAttribute('data-harness-tab') || 'home');
          return;
        }
        var btn = e.target.closest ? e.target.closest('[data-harness]') : null;
        if (!btn) return;
        selectedHarness = btn.getAttribute('data-harness') || 'codex';
        var picks = root.querySelectorAll('.harness-pick');
        for (var i = 0; i < picks.length; i++) {
          var on = picks[i].getAttribute('data-harness') === selectedHarness;
          picks[i].classList.toggle('on', on);
          picks[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        renderSetup();
      });

      groupEl.addEventListener('change', function () {
        fillProjects();
        refresh();
      });
      projEl.addEventListener('change', refresh);

      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var proj = currentProject();
          var text = input && input.value ? input.value.trim() : '';
          if (!proj || !text) return;
          if (/^\/goal(?:\s|$)/i.test(text)) {
            var objective = text.replace(/^\/goal\s*/i, '').trim();
            if (!objective) {
              if (goalStatus) goalStatus.textContent = 'Type /goal followed by an objective.';
              return;
            }
            if (send) send.disabled = true;
            api('goals', { method: 'POST', body: JSON.stringify({
              action: 'create', project: proj.name, objective: objective
            }) }).then(function (res) {
              if (res.ok && res.body.goal) {
                selectedGoal = res.body.goal.id;
                if (input) input.value = '';
                if (goalStatus) goalStatus.textContent = 'Goal saved: ' + selectedGoal;
                loadGoals();
              } else if (goalStatus) {
                goalStatus.textContent = 'Goal not saved: ' + (res.body.error || res.status);
              }
            }).catch(function () {
              if (goalStatus) goalStatus.textContent = 'Goal request failed.';
            }).then(function () { if (send) send.disabled = false; });
            return;
          }
          if (send) send.disabled = true;
          var existing = [];
          drawThread(existing, true);
          // Keep already-rendered history by re-reading the thread after history load? Send with optimistic user bubble.
          api('history?project=' + encodeURIComponent(proj.name), { method: 'GET' }).then(function (hist) {
            var messages = (hist.ok && hist.body.messages) ? hist.body.messages.slice() : [];
            messages.push({ role: 'user', text: text, harness: selectedHarness });
            drawThread(messages, true);
            var payload = { project: proj.name, harness: selectedHarness, message: text };
            if (selectedGoal) payload.goalId = selectedGoal;
            if (selectedHarness === 'claude') {
              var modelEl = root.querySelector('#harness-model');
              payload.model = modelEl ? modelEl.value : 'sonnet';
            }
            return api('chat', { method: 'POST', body: JSON.stringify(payload) }).then(function (res) {
              if (res.ok && res.body.messages) {
                drawThread(res.body.messages, false);
                if (input) input.value = '';
              } else {
                var err = res.body.message || res.body.detail || res.body.error || ('HTTP ' + res.status);
                messages.push({ role: 'assistant', text: err, harness: selectedHarness });
                drawThread(messages, false);
                if (OS.toast) OS.toast('The request did not complete.');
              }
            });
          }).catch(function () {
            if (OS.toast) OS.toast('The request did not complete.');
          }).then(function () {
            if (send) send.disabled = false;
          });
        });
      }

      if (input && form) {
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
            event.preventDefault();
            if (form.requestSubmit) form.requestSubmit();
          }
        });
      }
      if (executeBtn) executeBtn.disabled = !currentProject() || currentProject().name !== 'lavaall';
      if (executeBtn && executeResult) {
        executeBtn.addEventListener('click', function () {
          var proj = currentProject();
          var task = input && input.value ? input.value.trim() : '';
          if (!proj || proj.name !== 'lavaall') {
            executeResult.textContent = 'Code execution currently supports only the LAVAALL repository.';
            return;
          }
          if (!task || task.length > 2000) {
            executeResult.textContent = 'Enter a code task of up to 2,000 characters in the chat composer.';
            return;
          }
          if (!executeConfirm || !executeConfirm.checked) {
            executeResult.textContent = 'Confirm the possible API charge before starting a coding run.';
            return;
          }
          executeBtn.disabled = true;
          executeResult.textContent = 'Requesting a GitHub coding run…';
          api('execute', { method: 'POST',
            body: JSON.stringify({ project: 'lavaall', task: task, confirm: true }) })
            .then(function (res) {
              if (!res.ok) {
                executeResult.textContent = res.body.error || 'Could not start the coding run.';
                return;
              }
              var runId = res.body.requestId || '';
              executeResult.innerHTML = 'GitHub accepted this request. <a target="_blank" rel="noopener noreferrer" href="' +
                esc(res.body.runsUrl || '') + '">Open GitHub Actions</a>' +
                ' <button type="button" class="btn" id="harness-check-run">Check status</button>' +
                '<small class="dim">Request ' + esc(runId) + '</small>';
              var checker = root.querySelector('#harness-check-run');
              if (checker) checker.addEventListener('click', function () {
                checker.disabled = true;
                api('runs?request_id=' + encodeURIComponent(runId), { method: 'GET' })
                  .then(function (state) {
                    if (!state.ok) executeResult.textContent = state.body.error || 'Status unavailable';
                    else {
                      executeResult.innerHTML = '<b>Status: ' + esc(state.body.status || 'unknown') +
                        (state.body.conclusion ? ' / ' + esc(state.body.conclusion) : '') + '</b>' +
                        (state.body.runUrl ? ' <a target="_blank" rel="noopener noreferrer" href="' +
                        esc(state.body.runUrl) + '">Open run and patch</a>' : '');
                    }
                  }).catch(function () { executeResult.textContent = 'Status request failed.'; })
                  .then(function () { checker.disabled = false; });
              });
            }).catch(function () { executeResult.textContent = 'Coding request failed.'; })
            .then(function () { executeBtn.disabled = false; executeConfirm.checked = false; });
        });
      }
      renderSetup();
      if (meta) meta.textContent = metaLine(currentProject());
      loadHistory();
      loadGoals();
    }
  });
})();
