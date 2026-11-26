/* LAVAALL OS Harness: founder chat for building. Pick a project and a harness,
   type a request, and send it. Gemini is off. This page talks only to /ops/harness
   on this site. It cannot run the Codex or Claude CLIs or edit files on the box. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var HARNESSES = [
    { id: 'codex', label: 'ChatGPT (Codex)' },
    { id: 'claude', label: 'Claude' },
    { id: 'deepseek', label: 'DeepSeek' },
    { id: 'grok', label: 'Grok' }
  ];
  var CLAUDE_MODELS = [
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'haiku', label: 'Haiku' }
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
      return '<div class="hx-top">' +
          '<div class="harness-tabs" role="tablist">' +
            '<button type="button" class="btn harness-tab on" data-harness-tab="chat" role="tab" aria-selected="true">Chat</button>' +
            '<button type="button" class="btn harness-tab" data-harness-tab="home" role="tab" aria-selected="false">Usage</button>' +
          '</div>' +
          '<div class="harness-picks" role="group" aria-label="Model provider">' + buttons + '</div>' +
        '</div>' +
        '<section class="card harness-home hidden" id="harness-home">' +
          '<div class="ch">' + icon('spend') + '<h3>Usage and credit</h3></div>' +
          '<p class="dim" id="harness-usage-note">Loading usage from each provider’s free balance or usage endpoint. Totals are shown only when the provider returns them.</p>' +
          '<div class="harness-usage" id="harness-usage"><div class="empty"><b>Loading usage…</b></div></div>' +
        '</section>' +
        '<section class="harness-chat hx" id="harness-chat">' +
          '<aside class="hx-side card" aria-label="Your chats">' +
            '<div class="hx-sh"><b>Your chats</b></div>' +
            '<button type="button" class="btn hx-new" id="hx-new">+ New chat</button>' +
            '<label class="harness-field">Business' +
              '<select class="harness-sel" id="harness-group" aria-label="Project group">' + groupOpts + '</select>' +
            '</label>' +
            '<label class="sr" for="harness-project">Project</label><select class="harness-sel sr" id="harness-project" aria-label="Project">' + projOpts + '</select>' +
            '<div class="hx-list" id="hx-list" role="list"></div>' +
          '</aside>' +
          '<div class="hx-main">' +
            '<div class="hx-voice">' +
              '<button type="button" class="hx-orb" id="hx-orb" aria-label="Start voice mode with Jarvis"></button>' +
              '<div class="hx-vt"><span class="hx-k">Voice mode</span><b>Tap the orb and talk.</b><span class="dim">Jarvis answers, saves memories and opens any page for you.</span></div>' +
              '<label class="harness-field harness-modelwrap hx-model" id="harness-modelwrap">Model' +
                '<select class="harness-sel" id="harness-model" aria-label="Model">' + models + '</select>' +
                '<small class="dim" id="harness-model-note"></small>' +
              '</label>' +
            '</div>' +
            '<p class="harness-meta dim" id="harness-meta"></p>' +
            '<div class="harness-setup" id="harness-setup"></div>' +
            '<div class="harness-thread" id="harness-thread" aria-live="polite"></div>' +
            '<form class="harness-composer hx-comp" id="harness-form">' +
              '<label class="sr" for="harness-input">Request</label>' +
              '<textarea class="harness-input" id="harness-input" rows="2" maxlength="8000" placeholder="Ask anything. Ctrl+Enter to send." required></textarea>' +
              '<button type="submit" class="btn pri" id="harness-send">Send</button>' +
            '</form>' +
            '<p class="note hx-cap">Connected provider APIs can answer here; repository edits need the separately approved coding runner below. Gemini is off.</p>' +
            '<details class="harness-execution" id="harness-execution"><summary>Run a code task in GitHub</summary>' +
              '<p class="dim">Runs a separate Codex coding agent on the LAVAALL repository. It writes a reviewable patch and runs tests in GitHub Actions. It does not merge or deploy code, and API usage may be billed.</p>' +
              '<label><input type="checkbox" id="harness-execute-confirm"/> I approve a coding run that may incur API charges.</label>' +
              '<button type="button" class="btn" id="harness-execute">Run code task</button>' +
              '<div class="note" id="harness-execute-result" role="status" aria-live="polite"></div>' +
            '</details>' +
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
      var usageEl = root.querySelector('#harness-usage');
      var usageNote = root.querySelector('#harness-usage-note');
      var home = root.querySelector('#harness-home');
      var chat = root.querySelector('#harness-chat');
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

      // Every model each provider offers, read live by the server (/ops/harness/models). Until it answers, Claude
      // shows Sonnet and Haiku and the others their configured default. The pick is remembered per provider.
      var modelLists = null;
      function savedModel(h) { try { return localStorage.getItem('os-model-' + h) || ''; } catch (e) { return ''; } }
      function fillModels() {
        var sel = root.querySelector('#harness-model'), note = root.querySelector('#harness-model-note');
        if (!sel) return;
        var info = modelLists && modelLists[selectedHarness];
        var ids = info ? info.models : (selectedHarness === 'claude' ? CLAUDE_MODELS.map(function (m) { return m.id; }) : []);
        var want = savedModel(selectedHarness) || (info && info.default) || ids[0] || '';
        if (want && ids.indexOf(want) === -1) want = (info && info.default) || ids[0] || '';
        sel.innerHTML = ids.length ? ids.map(function (id) {
          var label = { sonnet: 'Sonnet', haiku: 'Haiku' }[id] || id;
          return '<option value="' + esc(id) + '"' + (id === want ? ' selected' : '') + '>' + esc(label) + (info && id === info.default ? ' (default)' : '') + '</option>';
        }).join('') : '<option value="">Default model</option>';
        if (note) note.textContent = !modelLists ? 'Loading every model…' : info && info.live ? info.models.length + ' models available' : 'Model list unavailable; using the default.';
      }
      api('models', { method: 'GET' }).then(function (res) {
        if (res.ok && res.body.harnesses) { modelLists = res.body.harnesses; fillModels(); }
        else { modelLists = {}; fillModels(); }
      }).catch(function () { modelLists = {}; fillModels(); });
      root.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'harness-model') { try { localStorage.setItem('os-model-' + selectedHarness, e.target.value); } catch (err) { /* per browser */ } }
      });

      function renderSetup() {
        fillModels();
        if (!setup) return;
        var html = setupHtml();
        setup.innerHTML = html;
        setup.classList.toggle('hidden', !html);
      }

      function labelOf(h) { for (var i = 0; i < HARNESSES.length; i++) if (HARNESSES[i].id === h) return HARNESSES[i].label; return h; }
      // The left list mirrors the (visually hidden) project select: one row per project in the business.
      function drawList() {
        var host = root.querySelector('#hx-list');
        if (!host) return;
        var cur = currentProject();
        host.innerHTML = (currentGroup().projects || []).map(function (p) {
          var on = cur && cur.name === p.name;
          return '<button type="button" role="listitem" class="hx-row' + (on ? ' on' : '') + '" data-proj="' + esc(p.name) + '" aria-current="' + (on ? 'true' : 'false') + '">' +
            '<b>' + esc(p.label || p.name) + '</b><small>' + esc(String(p.status || '').slice(0, 60)) + '</small></button>';
        }).join('') || '<p class="note">No projects in this business.</p>';
      }

      function bubble(msg) {
        var who = msg.role === 'user' ? 'You' : (msg.harness === 'codex' ? 'ChatGPT' : (msg.harness || 'Assistant'));
        var u = msg.role !== 'user' && msg.usage;
        var count = u && (u.inputTokens != null || u.outputTokens != null)
          ? '<small class="dim">Reported tokens: ' + esc(u.inputTokens == null ? '?' : u.inputTokens) + ' in / ' + esc(u.outputTokens == null ? '?' : u.outputTokens) + ' out · Cost not available</small>'
          : '';
        if (msg.role !== 'user' && typeof msg.model === 'string' && msg.model) who += ' · ' + msg.model;
        return '<div class="harness-msg harness-msg-' + esc(msg.role) + '"><small class="dim">' + esc(who) + '</small><div>' + esc(msg.text || '') + '</div>' + count + '</div>';
      }

      function drawThread(messages, pending) {
        if (!thread) return;
        var rows = (messages || []).map(bubble).join('');
        if (pending) rows += '<div class="harness-msg harness-msg-assistant" id="harness-pending"><small class="dim">Working…</small><div>Sending your request.</div></div>';
        if (!rows) rows = '<div class="hx-hero"><div class="hx-glyph" aria-hidden="true"></div><h2>Ask anything.</h2>' +
          '<p class="dim">Chat with ' + esc(labelOf(selectedHarness)) + ' about ' + esc((currentProject() || {}).label || 'this project') + '. It knows the project, its rules and its recent work.</p>' +
          '<div class="hx-chips">' + ['Plan my day', 'What is left before launch?', 'Find something in my memory', 'Work through an idea'].map(function (t) {
            return '<button type="button" class="chip" data-suggest="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div></div>';
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
        if (tab === 'chat') loadHistory();
        if (tab === 'home') loadUsage();
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

      function refresh() {
        drawList();
        if (meta) meta.textContent = metaLine(currentProject());
        if (executeBtn) executeBtn.disabled = !currentProject() || currentProject().name !== 'lavaall';
        renderSetup();
        if (tab === 'chat') loadHistory();
      }

      root.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target : null;
        if (!t) return;
        var sug = t.closest('[data-suggest]');
        if (sug && input) { input.value = sug.getAttribute('data-suggest'); input.focus(); return; }
        var row = t.closest('[data-proj]');
        if (row && projEl) { projEl.value = row.getAttribute('data-proj'); refresh(); return; }
        if (t.closest('#hx-new')) { if (input) { input.value = ''; input.focus(); } return; }
        if (t.closest('#hx-orb')) { if (OS.jarvis && OS.jarvis.start) OS.jarvis.start(); return; }
      });
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
          if (send) send.disabled = true;
          var existing = [];
          drawThread(existing, true);
          // Keep already-rendered history by re-reading the thread after history load? Send with optimistic user bubble.
          api('history?project=' + encodeURIComponent(proj.name), { method: 'GET' }).then(function (hist) {
            var messages = (hist.ok && hist.body.messages) ? hist.body.messages.slice() : [];
            messages.push({ role: 'user', text: text, harness: selectedHarness });
            drawThread(messages, true);
            var payload = { project: proj.name, harness: selectedHarness, message: text };
            var modelEl = root.querySelector('#harness-model');
            if (modelEl && modelEl.value) payload.model = modelEl.value;
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
      // Open on the selected business's project group.
      var biz = OS.business ? OS.business() : 'all';
      if (biz !== 'all' && groupEl.querySelector('option[value="' + biz + '"]')) { groupEl.value = biz; fillProjects(); }
      renderSetup();
      drawList();
      if (meta) meta.textContent = metaLine(currentProject());
      loadHistory();
      // A question from Home's "Ask anything": open Chat, pick the routed model, fill the request. Sending stays a click.
      var ask = OS.takeAsk ? OS.takeAsk() : null;
      if (ask) {
        showTab('chat');
        var pickBtn = root.querySelector('.harness-pick[data-harness="' + ask.harness + '"]');
        if (pickBtn) pickBtn.click();
        if (input) { input.value = ask.text; input.focus(); }
      }
    }
  });
})();
