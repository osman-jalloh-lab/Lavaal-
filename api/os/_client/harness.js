/* LAVAALL OS Harness: founder-only switcher for Codex, Claude, DeepSeek and Gemini.
   The page only shows projects, status (key presence or local CLI) and recent handoff
   lines, and copies a lavaall-ai command. It does not call models or the server. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var icon = OS.icon;

  var HARNESS_ORDER = ['codex', 'claude', 'deepseek', 'gemini'];

  function pack(data) {
    return data && data.harness ? data.harness : { projects: [], status: [], note: '' };
  }

  function projectsOf(data) {
    return pack(data).projects || [];
  }

  function projectByName(data, name) {
    var list = projectsOf(data);
    var i;
    for (i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return list[0] || null;
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

  function commandOf(harness, project, task) {
    var cmd = 'lavaall-ai ' + harness + ' ' + project;
    var t = String(task || '').trim();
    if (t) cmd += ' "' + t.replace(/"/g, '\\"') + '"';
    else cmd += ' "your task"';
    return cmd;
  }

  function logLines(project) {
    var lines = (project && project.logLines) || [];
    return lines.slice(-10);
  }

  OS.registerView('harness', {
    render: function (ctx) {
      var data = ctx.data || {};
      var list = projectsOf(data);
      var head = '<div class="ph"><div><h1>Harness</h1><p>Pick a project and a harness, then copy the command. This page does not call models. Run <code class="mono">lavaall-ai status</code> on your machine for live CLI versions.</p></div></div>';
      if (!list.length) {
        return head + '<div class="card">' + OS.empty('No projects are listed.', 'harness') + '</div>';
      }
      var first = list[0];
      var opts = list.map(function (p) {
        return '<option value="' + esc(p.name) + '">' + esc(p.label || p.name) + '</option>';
      }).join('');
      var st = statusById(data);
      var buttons = HARNESS_ORDER.map(function (id) {
        var s = st[id] || { id: id, label: id, detail: '', state: 'local' };
        var on = id === 'codex' ? ' on' : '';
        return '<button type="button" class="btn harness-pick' + on + '" data-harness="' + esc(id) + '" aria-pressed="' + (id === 'codex' ? 'true' : 'false') + '">' +
          '<span class="dot ' + tone(s.state) + '"></span>' +
          '<span>' + esc(s.label || id) + '</span>' +
          '<small class="dim">' + esc(s.detail || '') + '</small>' +
          '</button>';
      }).join('');
      var cmd = commandOf('codex', first.name, '');
      var logs = logLines(first);
      var logHtml = logs.length
        ? '<ol class="harness-log">' + logs.map(function (ln) { return '<li>' + esc(ln) + '</li>'; }).join('') + '</ol>'
        : OS.empty('No handoff log lines yet.', 'harness');
      var note = pack(data).note ? '<p class="note foot">' + esc(pack(data).note) + '</p>' : '';
      return head +
        '<div class="card harness-card">' +
          '<div class="ch">' + icon('harness') + '<h3>Run a harness</h3></div>' +
          '<label class="harness-field">Project' +
            '<select class="harness-sel" id="harness-project" aria-label="Project">' + opts + '</select>' +
          '</label>' +
          '<p class="harness-meta dim" id="harness-meta">' + esc(metaLine(first)) + '</p>' +
          '<div class="harness-picks" role="group" aria-label="Harness">' + buttons + '</div>' +
          '<label class="harness-field">Task' +
            '<input class="harness-task" id="harness-task" type="text" maxlength="200" placeholder="your task" autocomplete="off"/>' +
          '</label>' +
          '<div class="harness-cmdrow">' +
            '<code class="mono harness-cmd" id="harness-cmd">' + esc(cmd) + '</code>' +
            '<button type="button" class="btn pri" id="harness-copy">Copy command</button>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="ch">' + icon('notes') + '<h3>Latest handoff</h3><div class="r"><span class="num" id="harness-log-count">' + logs.length + '</span></div></div>' +
          '<div id="harness-log">' + logHtml + '</div>' +
        '</div>' +
        note;
    },
    mount: function (root, ctx) {
      var data = ctx.data || {};
      var selectedHarness = 'codex';
      var sel = root.querySelector('#harness-project');
      var task = root.querySelector('#harness-task');
      var cmdEl = root.querySelector('#harness-cmd');
      var meta = root.querySelector('#harness-meta');
      var logEl = root.querySelector('#harness-log');
      var countEl = root.querySelector('#harness-log-count');
      var copy = root.querySelector('#harness-copy');
      if (!sel || !cmdEl) return;

      function currentProject() {
        return projectByName(data, sel.value);
      }

      function refresh() {
        var proj = currentProject();
        if (!proj) return;
        var text = task && task.value ? task.value : '';
        cmdEl.textContent = commandOf(selectedHarness, proj.name, text);
        if (meta) meta.textContent = metaLine(proj);
        var logs = logLines(proj);
        if (logEl) {
          logEl.innerHTML = logs.length
            ? '<ol class="harness-log">' + logs.map(function (ln) { return '<li>' + esc(ln) + '</li>'; }).join('') + '</ol>'
            : OS.empty('No handoff log lines yet.', 'harness');
        }
        if (countEl) countEl.textContent = String(logs.length);
      }

      root.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-harness]') : null;
        if (!btn) return;
        selectedHarness = btn.getAttribute('data-harness') || 'codex';
        var picks = root.querySelectorAll('.harness-pick');
        for (var i = 0; i < picks.length; i++) {
          var on = picks[i].getAttribute('data-harness') === selectedHarness;
          if (on) picks[i].classList.add('on'); else picks[i].classList.remove('on');
          picks[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        refresh();
      });
      sel.addEventListener('change', refresh);
      if (task) {
        task.addEventListener('input', refresh);
      }
      if (copy) {
        copy.addEventListener('click', function () {
          var value = cmdEl.textContent || '';
          function ok() { if (OS.toast) OS.toast('Command copied. Nothing was sent.'); }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(ok).catch(function () {
              fallbackCopy(value); ok();
            });
          } else {
            fallbackCopy(value); ok();
          }
        });
      }
    }
  });

  function metaLine(proj) {
    if (!proj) return '';
    var bits = [];
    if (proj.repo) bits.push(proj.repo);
    if (proj.branch) bits.push(proj.branch);
    return bits.join(' · ');
  }

  function fallbackCopy(value) {
    var ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }
})();
