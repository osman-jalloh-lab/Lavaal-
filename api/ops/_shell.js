// Logged-in LAVAALL OS shell + dashboard + ticket stubs.
// Dark operational navy/cyan/lime. Underscore prefix: not a Vercel function.

const { escapeHtml } = require('./_lib');

const NAV = Object.freeze([
  { id: 'dashboard', href: '/ops', label: 'Dashboard' },
  { id: 'profile', href: '/ops/profile', label: 'Profile & goals' },
  { id: 'chat', href: '/ops/chat', label: 'Contextual chat' },
  { id: 'memory', href: '/ops/memory', label: 'Memory' },
  { id: 'inbox', href: '/ops/inbox', label: 'Inbox' },
  { id: 'calendar', href: '/ops/calendar', label: 'Calendar' },
  { id: 'kits', href: '/ops/kits', label: 'Kits' },
  { id: 'tasks', href: '/ops/tasks', label: 'Projects & tasks' },
  { id: 'routines', href: '/ops/routines', label: 'Saved routines' },
]);

function areaInfo(area) {
  const id = NAV.some((item) => item.id === area) ? area : 'dashboard';
  switch (id) {
    case 'dashboard':
    case 'profile':
    case 'chat':
    case 'memory':
    case 'inbox':
    case 'calendar':
    case 'kits':
    case 'tasks':
    case 'routines':
      return NAV.find((item) => item.id === id);
    default: {
      const _never = id;
      return NAV[0];
    }
  }
}

function shellStyles() {
  return `
:root{--sky:#00C2FF;--lime:#00F5A0;--ink:#0A0A14;--navy:#0B1424;--panel:#121C2E;--line:rgba(0,194,255,.28);--text:#E8F1FF;--muted:#8AA0B8;--coral:#FF5C5C;}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{min-height:100%;}
body{font-family:'Bricolage Grotesque',sans-serif;background:radial-gradient(900px 420px at 0% 0%,rgba(0,194,255,.14),transparent 42%),var(--ink);color:var(--text);}
a{color:var(--sky);text-decoration:none;}
a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--lime);outline-offset:2px;}
.ops-wrap{width:min(1100px,100%);margin:0 auto;padding:18px 16px 40px;}
.ops-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;}
.brand{font-family:'Clash Display',sans-serif;font-size:22px;letter-spacing:-.03em;}
.who{font-size:13px;color:var(--muted);}
.who span{color:var(--lime);}
.signout{border:1px solid var(--line);background:transparent;color:var(--text);border-radius:999px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;}
.ops-nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;}
.ops-nav a{display:inline-flex;align-items:center;padding:8px 12px;border:1px solid var(--line);border-radius:999px;color:var(--text);font-size:13px;font-weight:600;background:var(--navy);}
.ops-nav a[aria-current=page]{background:var(--sky);color:var(--ink);border-color:var(--sky);}
.banner{margin:0 0 16px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,224,61,.28);background:rgba(255,224,61,.08);color:#ffe9a8;font-size:13px;}
.grid{display:grid;gap:14px;}
@media (min-width:800px){.grid.two{grid-template-columns:1fr 1fr;} .grid.forms{grid-template-columns:1fr 1fr;}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;}
.kicker{color:var(--sky);font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;}
h1{font-family:'Clash Display',sans-serif;font-size:clamp(26px,5vw,34px);letter-spacing:-.03em;margin-bottom:8px;}
h2{font-family:'Clash Display',sans-serif;font-size:20px;margin-bottom:8px;}
p,li{color:var(--muted);line-height:1.55;font-size:15px;}
.empty{padding:12px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);}
.list{list-style:none;display:grid;gap:8px;}
.list li{padding:10px 12px;border-radius:10px;background:var(--navy);border:1px solid var(--line);color:var(--text);}
.tag{display:inline-block;margin-right:8px;color:var(--lime);font-size:12px;font-weight:600;text-transform:uppercase;}
.tag.overlap{color:#ffe9a8;}
label{display:block;margin:12px 0 6px;font-size:13px;font-weight:600;}
input,textarea,select{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--navy);color:var(--text);font:inherit;}
textarea{min-height:88px;resize:vertical;}
.btn{margin-top:14px;width:100%;padding:12px 14px;border:0;border-radius:999px;background:var(--sky);color:var(--ink);font:inherit;font-weight:600;cursor:pointer;}
.btn-sm{width:auto;margin-top:10px;padding:8px 14px;}
.btn-danger{background:transparent;color:var(--coral);border:1px solid rgba(255,92,92,.45);}
.task-row label{margin-top:8px;}
.check{display:flex;align-items:flex-start;gap:8px;font-weight:500;}
.check input{width:auto;margin-top:3px;}
.ctx{margin:14px 0;padding:12px;border:1px solid var(--line);border-radius:12px;}
.ctx legend{color:var(--sky);font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;}
.thread{list-style:none;display:grid;gap:10px;margin-bottom:16px;}
.bubble{padding:12px;border-radius:12px;background:var(--navy);border:1px solid var(--line);}
.bubble p{color:var(--text);}
.bubble.user{border-color:rgba(0,194,255,.4);}
.bubble.assistant{border-color:rgba(0,245,160,.28);}
.ok{margin-bottom:12px;color:#c8ffe8;background:rgba(0,245,160,.1);border:1px solid rgba(0,245,160,.32);border-radius:10px;padding:10px 12px;font-size:14px;}
.err{margin-bottom:12px;color:#ffc4c4;background:rgba(255,92,92,.12);border:1px solid rgba(255,92,92,.35);border-radius:10px;padding:10px 12px;font-size:14px;}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
.kits-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:10px;}
.kits-head .btn,.kits-banner .btn{width:auto;margin-top:0;}
.kits-sub{color:var(--muted);font-size:13px;}
.kits-banner{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin:0 0 12px;padding:8px 12px;border-radius:8px;border:1px solid rgba(0,245,160,.22);background:rgba(0,245,160,.07);color:#c8ffe8;font-size:12px;}
.kits-banner form{margin-left:auto;}
.kits-tools{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;align-items:center;}
.kits-tools input,.kits-tools select{width:auto;min-width:200px;flex:1;padding:8px 10px;font-size:13px;}
.kits-chips{display:flex;flex-wrap:wrap;gap:4px;}
.kits-chips button{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:6px;padding:4px 8px;font:inherit;font-size:11px;font-weight:600;cursor:pointer;}
.kits-chips button.is-on{background:var(--sky);color:var(--ink);border-color:var(--sky);}
.kits-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px;background:#0c121c;}
.kits-table{width:100%;border-collapse:collapse;font-size:13px;}
.kits-table th{position:sticky;top:0;background:#101826;text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:7px 12px;border-bottom:1px solid var(--line);font-weight:600;}
.kits-table td{padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.05);color:var(--text);vertical-align:middle;}
.kits-table tbody tr{cursor:pointer;}
.kits-table tbody tr:hover,.kits-table tbody tr.is-open{background:rgba(0,194,255,.08);}
.kit-no{font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:.02em;}
.kit-status{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(138,160,184,.14);color:var(--muted);}
.kit-status.is-active{background:rgba(0,194,255,.16);color:var(--sky);}
.kit-status.is-inactive{background:rgba(138,160,184,.16);color:#9eb2c6;}
.kit-status.is-returned{background:rgba(0,245,160,.14);color:var(--lime);}
.kit-status.is-lost{background:rgba(255,92,92,.16);color:#ff9b9b;}
.kit-status.is-unknown{background:rgba(255,224,61,.12);color:#ffe9a8;}
.kits-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:8px;color:var(--muted);font-size:12px;}
.kits-skel{height:28px;margin:6px 12px;border-radius:4px;background:linear-gradient(90deg,rgba(18,28,46,.4),rgba(0,194,255,.08),rgba(18,28,46,.4));}
.kits-layout{display:grid;gap:12px;}
@media (min-width:960px){.kits-layout.has-drawer{grid-template-columns:minmax(0,1fr) 340px;}}
.kit-drawer{background:#0e1624;border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-height:280px;}
.kit-drawer[hidden]{display:none;}
.kit-drawer-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
.kit-drawer-close{border:0;background:transparent;color:var(--muted);font:inherit;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;}
.kit-drawer h2{font-size:18px;margin-bottom:2px;}
.kit-drawer .kit-drawer-name{color:var(--text);font-size:14px;margin-bottom:8px;}
.kit-drawer dt{color:var(--muted);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);}
.kit-drawer dd{color:var(--text);margin:4px 0 0;word-break:break-word;font-size:13px;}
.kit-drawer .btn{width:auto;}
@media (max-width:700px){
  .kits-table thead{display:none;}
  .kits-table,.kits-table tbody,.kits-table tr,.kits-table td{display:block;width:100%;}
  .kits-table tr{padding:8px 12px;border-bottom:1px solid var(--line);}
  .kits-table td{border:0;padding:2px 0;}
  .kits-table td.kit-no{font-size:15px;}
}
`;
}

function shellPage({ title, email, area, body, notice, error, scripts }) {
  const current = areaInfo(area).id;
  const nav = NAV.map((item) => (
    `<a href="${item.href}"${item.id === current ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`
  )).join('');
  const alert = error
    ? `<p class="err" role="alert">${escapeHtml(error)}</p>`
    : notice
      ? `<p class="ok" role="status">${escapeHtml(notice)}</p>`
      : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex,nofollow"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self';"/>
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Clash+Display:wght@600;700&family=Bricolage+Grotesque:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>${shellStyles()}</style>
</head>
<body>
<div class="ops-wrap">
  <header class="ops-top">
    <div>
      <div class="brand">LAVAALL OS</div>
      <p class="who">signed in as <span>${escapeHtml(email)}</span></p>
    </div>
    <form method="POST" action="/api/ops/auth">
      <input type="hidden" name="action" value="logout"/>
      <button class="signout" type="submit">Sign out</button>
    </form>
  </header>
  <nav class="ops-nav" aria-label="LAVAALL OS">${nav}</nav>
  ${alert}
  ${body}
</div>
${typeof scripts === 'string' ? scripts : ''}
</body>
</html>`;
}

function persistenceBanner(durable) {
  if (durable) return '';
  return '<p class="banner">Demo store — not durable until Vercel KV is bound (KV_REST_API_URL + KV_REST_API_TOKEN). Goals, tasks, notes, inbox, calendar, routines, and kits may reset on a cold start until KV is on.</p>';
}

function dashboardPage({ email, snapshot, notice, error }) {
  const goal = snapshot.goal
    ? `<p><strong>${escapeHtml(snapshot.goal.title)}</strong></p>
       ${snapshot.goal.definitionOfDone ? `<p>Done when: ${escapeHtml(snapshot.goal.definitionOfDone)}</p>` : ''}
       ${snapshot.goal.nextStep ? `<p>Next step: ${escapeHtml(snapshot.goal.nextStep)}</p>` : ''}
       ${snapshot.goal.targetDate ? `<p>Target: ${escapeHtml(snapshot.goal.targetDate)}</p>` : ''}`
    : '<p class="empty">No current goal saved yet. Add one under Profile &amp; goals.</p>';

  const tasks = snapshot.unfinished.length
    ? `<ul class="list">${snapshot.unfinished.map((task) => (
      `<li><span class="tag">${escapeHtml(task.status === 'doing' ? 'Doing' : 'To do')}</span>${escapeHtml(task.title)}${task.nextAction ? ` — ${escapeHtml(task.nextAction)}` : ''}${task.due ? ` · due ${escapeHtml(task.due)}` : ''}</li>`
    )).join('')}</ul>`
    : '<p class="empty">No unfinished tasks. Add one below.</p>';

  const next = snapshot.nextAction
    ? `<p><strong>${escapeHtml(snapshot.nextAction.detail)}</strong></p><p>${escapeHtml(snapshot.nextAction.title)}</p>`
    : '<p class="empty">No next action yet. Add a task with an optional next step.</p>';

  const notes = snapshot.notes.length
    ? `<ul class="list">${snapshot.notes.map((note) => (
      `<li><strong>${escapeHtml(note.title)}</strong>${note.body ? ` — ${escapeHtml(note.body)}` : ''}${note.source ? ` · ${escapeHtml(note.source)}` : ''}</li>`
    )).join('')}</ul>`
    : '<p class="empty">No notes yet. Add one below or open Memory.</p>';

  const emptyLead = snapshot.empty
    ? '<p class="empty">Nothing saved yet. Add a task or note to start the operating floor.</p>'
    : '';

  return shellPage({
    title: 'LAVAALL OS — Dashboard',
    email,
    area: 'dashboard',
    notice,
    error,
    body: `
      ${persistenceBanner(snapshot.durable)}
      <h1>Dashboard</h1>
      <p>Current goal, unfinished work, and one next action. No activity scores.</p>
      ${emptyLead}
      <div class="grid two">
        <section class="card"><div class="kicker">Current goal</div><h2>Goal</h2>${goal}</section>
        <section class="card"><div class="kicker">Do this next</div><h2>Next action</h2>${next}</section>
        <section class="card"><div class="kicker">Open work</div><h2>Unfinished tasks</h2>${tasks}</section>
        <section class="card"><div class="kicker">Memory</div><h2>Recent notes</h2>${notes}<p><a href="/ops/memory">Open Memory</a></p></section>
      </div>
      <div class="grid forms" style="margin-top:14px">
        <section class="card" id="add-task">
          <div class="kicker">Capture</div>
          <h2>Add a task</h2>
          <form method="POST" action="/ops">
            <input type="hidden" name="action" value="add-task"/>
            <label for="task-title">Task title</label>
            <input id="task-title" name="title" required maxlength="160" placeholder="Follow up on SL quote pack"/>
            <label for="task-next">Next action (optional)</label>
            <input id="task-next" name="nextAction" maxlength="200" placeholder="Email Abdulhamid the open items"/>
            <button class="btn" type="submit">Save task</button>
          </form>
        </section>
        <section class="card" id="add-note">
          <div class="kicker">Capture</div>
          <h2>Add a note</h2>
          <form method="POST" action="/ops">
            <input type="hidden" name="action" value="add-note"/>
            <label for="note-title">Note title</label>
            <input id="note-title" name="title" required maxlength="160" placeholder="Supplier call"/>
            <label for="note-body">Body (optional)</label>
            <textarea id="note-body" name="body" maxlength="4000" placeholder="Facts only — no invented metrics."></textarea>
            <label for="note-source">Source (optional)</label>
            <input id="note-source" name="source" maxlength="240" placeholder="Call, email, or page"/>
            <button class="btn" type="submit">Save note</button>
          </form>
        </section>
      </div>
    `,
  });
}

function stubPage({ email, area, notice, error }) {
  const item = areaInfo(area);
  const ticket = item.ticket || '03';
  return shellPage({
    title: `LAVAALL OS — ${item.label}`,
    email,
    area: item.id,
    notice,
    error,
    body: `
      <section class="card">
        <div class="kicker">Coming later</div>
        <h1>${escapeHtml(item.label)}</h1>
        <p>coming in ticket ${escapeHtml(ticket)}. This route is signed-in only. Use Dashboard to add a task or note until the full store lands.</p>
        <p><a href="/ops">Back to dashboard</a></p>
      </section>
    `,
  });
}

module.exports = {
  NAV,
  areaInfo,
  dashboardPage,
  persistenceBanner,
  shellPage,
  stubPage,
};
