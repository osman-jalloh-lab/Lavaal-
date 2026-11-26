/* LAVAALL OS End of day: every agent's daily recap (the daily-recap feed, posted by Grok, Claude, Codex, DeepSeek and
   the desks with the bridge secret) plus Osman's own end-of-day note (saved as a memory tagged "recap").
   Also the launch countdowns for businesses with a go-live date. Filtered by the business switch. All text escaped. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var DAY = 86400000;
  var AGENTS = { grok: 'Grok (xAI)', claude: 'Claude', codex: 'Codex', chatgpt: 'ChatGPT', deepseek: 'DeepSeek', jarvis: 'Jarvis' };

  function agentName(id) { return AGENTS[id] || String(id || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function todayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dayTitle(key, now) {
    if (key === todayKey(now)) return 'Today';
    if (key === todayKey(now - DAY)) return 'Yesterday';
    try { return new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); } catch (e) { return key; }
  }

  // ---- Launch countdowns: project groups with a go-live date (from the server's project pack) ----
  function launches(now) {
    var groups = (OS.data.harness && OS.data.harness.groups) || [];
    return groups.filter(function (g) { return /^\d{4}-\d{2}-\d{2}$/.test(g.launch || '') && (OS.business() === 'all' || OS.business() === g.id); })
      .map(function (g) {
        var at = new Date(g.launch + 'T00:00:00').getTime();
        return { id: g.id, label: g.label || g.id, goal: g.goal || '', launch: g.launch, days: Math.ceil((at - dayStartOf(now)) / DAY) };
      }).sort(function (a, b) { return a.days - b.days; });
  }
  function dayStartOf(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function launchesHtml(now) {
    var list = launches(now || Date.now());
    if (!list.length) return '';
    return '<div class="launches">' + list.map(function (l) {
      var big = l.days > 1 ? l.days + ' days' : l.days === 1 ? 'Tomorrow' : l.days === 0 ? 'Today' : 'Live';
      var sub = l.days > 0 ? 'to go live' : l.days === 0 ? 'launch day' : 'since ' + l.launch;
      var date = '';
      try { date = new Date(l.launch + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { date = l.launch; }
      return '<section class="card launch' + (l.days <= 7 && l.days >= 0 ? ' soon' : '') + '"><span class="tag">' + esc(l.label) + '</span>' +
        '<b class="launch-n num">' + esc(big) + '</b><span class="launch-s">' + esc(sub) + ' · ' + esc(date) + '</span>' +
        (l.goal ? '<p class="note">' + esc(l.goal) + '</p>' : '') + '</section>';
    }).join('') + '</div>';
  }
  OS.launches = launches;
  OS.launchesHtml = launchesHtml;

  // ---- Recap entries: feed + Osman's own notes ----
  function entries() {
    var feed = (OS.data.recap && OS.data.recap.entries) || [];
    var mine = ((OS.saved && OS.saved.get() && OS.saved.get().memories) || []).filter(function (m) { return m.tags.indexOf('recap') !== -1; })
      .map(function (m) {
        var biz = m.tags.filter(function (t) { return t !== 'recap' && t !== 'jarvis'; })[0] || 'all';
        return { id: m.id, agent: 'osman', project: biz, date: todayKey(m.createdAt), happened: m.text, built: '', blocked: '', next: '', updatedAt: m.createdAt, mine: true };
      });
    return feed.concat(mine).filter(function (e) {
      if (OS.business() === 'all') return true;
      return e.mine ? (e.project === OS.business() || e.project === 'all') : OS.inBusiness(e.project);
    });
  }

  function entryHtml(e) {
    var who = e.mine ? 'You' : agentName(e.agent);
    var biz = e.project === 'all' ? '' : OS.businessLabel(OS.businessOf(e.project));
    var part = function (k, label, cls) { return e[k] ? '<div class="rc-part ' + cls + '"><span>' + label + '</span><p>' + esc(e[k]) + '</p></div>' : ''; };
    return '<article class="card rc' + (e.mine ? ' mine' : '') + (e.blocked ? ' blocked' : '') + '">' +
      '<div class="rc-h"><b>' + esc(who) + '</b>' + (biz ? '<span class="tag">' + esc(biz) + '</span>' : '') +
      '<span class="rc-t num">' + esc(e.updatedAt ? OS.fmtTime(e.updatedAt) : '') + '</span></div>' +
      part('happened', 'What happened', 'h') + part('built', 'Built', 'b') + part('blocked', 'Blocked', 'x') + part('next', 'Next', 'n') + '</article>';
  }

  function recapBody(now) {
    now = now || Date.now();
    var list = entries();
    if (!list.length) {
      return '<div class="card empty mt"><b>No recaps yet' + (OS.business() === 'all' ? '' : ' for ' + esc(OS.businessLabel()) ) + '.</b>' +
        '<small>At the end of the day each agent posts to the daily-recap feed (Grok can do it from xAI), and you can add your own above. Source: ' +
        esc((OS.data.sources && OS.data.sources.recap && OS.data.sources.recap.from) || 'the daily-recap feed') + '</small></div>';
    }
    var days = {};
    list.forEach(function (e) { (days[e.date] = days[e.date] || []).push(e); });
    return Object.keys(days).sort().reverse().map(function (k) {
      var rows = days[k].sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      var blocked = rows.filter(function (e) { return e.blocked; }).length;
      var agents = {}; rows.forEach(function (e) { agents[e.agent] = true; });
      return '<div class="sect rc-day">' + esc(dayTitle(k, now)) + '<span class="note"> · ' + Object.keys(agents).length + ' reporting' + (blocked ? ' · ' + blocked + ' blocked' : '') + '</span></div>' +
        '<div class="grid g2 rc-grid">' + rows.map(entryHtml).join('') + '</div>';
    }).join('');
  }
  OS.recapBody = recapBody;

  // Home: who reported today and what is blocked.
  OS.recapHomeHtml = function (now) {
    now = now || Date.now();
    var today = entries().filter(function (e) { return e.date === todayKey(now); });
    var head = '<div class="ch"><h3>End of day</h3><div class="r"><span class="link" data-go="recap">Open</span></div></div>';
    if (!today.length) return head + '<div class="empty"><b>No recaps yet today.</b><small>Agents report at the end of the day. Add yours on the End of day page.</small></div>';
    var blocked = today.filter(function (e) { return e.blocked; });
    return head + today.slice(0, 4).map(function (e) {
      return '<div class="li static"><div class="t"><div>' + esc(e.mine ? 'You' : agentName(e.agent)) + '</div><small>' + esc(String(e.happened).slice(0, 140)) + '</small></div>' +
        (e.blocked ? '<span class="pill bad">blocked</span>' : '') + '</div>';
    }).join('') + (blocked.length ? '<p class="note foot">' + blocked.length + ' blocked today. Open End of day to see what they need.</p>' : '');
  };

  OS.registerView('recap', {
    render: function () {
      return '<div class="ph"><div><h1>End of day</h1><p>What every agent did today, what is blocked, and your own note. Your second brain for the day.</p></div></div>' +
        launchesHtml() +
        '<form class="card mt rc-form" id="rc-form" autocomplete="off"><label for="rc-text"><b>How did today go?</b></label>' +
          '<textarea id="rc-text" rows="3" maxlength="2000" placeholder="What happened, what you decided, what is next…" required></textarea>' +
          '<div class="rc-fa"><span class="note">Saved to Memory as a recap' + (OS.business() === 'all' ? '' : ' for ' + esc(OS.businessLabel())) + '.</span>' +
          '<button class="btn pri" type="submit">Save my recap</button></div><p class="note" id="rc-msg" role="status" aria-live="polite"></p></form>' +
        '<div id="rc-body">' + recapBody() + '</div>';
    },
    mount: function (root) {
      var host = root.querySelector('#rc-body');
      function paint() { if (host) host.innerHTML = recapBody(); }
      if (OS.saved) { OS.saved.on(paint); OS.saved.load().catch(function () {}); }
      var f = root.querySelector('#rc-form');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var msg = root.querySelector('#rc-msg');
        var b = OS.business();
        OS.saved.op({ op: 'memory.add', text: root.querySelector('#rc-text').value, tags: b === 'all' ? ['recap'] : ['recap', b] })
          .then(function (d) { msg.textContent = d.persist === false ? 'Saved for now (storage is not connected).' : 'Saved.'; f.reset(); })
          .catch(function (err) { msg.textContent = err.message; });
      });
    }
  });
})();
