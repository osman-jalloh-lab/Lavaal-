// Logged-in LAVAALL OS shell + dashboard + ticket stubs.
// Option I — Aboard blush workspace, improved with LAVAALL cyan/emerald.
// Preview only. Underscore prefix: not a Vercel function.

const { escapeHtml } = require('./_lib');

const NAV = Object.freeze([
  { id: 'dashboard', href: '/ops', label: 'Dashboard' },
  { id: 'office', href: '/ops/office', label: 'Office' },
  { id: 'profile', href: '/ops/profile', label: 'You' },
  { id: 'chat', href: '/ops/chat', label: 'Chat' },
  { id: 'memory', href: '/ops/memory', label: 'Memory' },
  { id: 'inbox', href: '/ops/inbox', label: 'Inbox' },
  { id: 'calendar', href: '/ops/calendar', label: 'Calendar' },
  { id: 'kits', href: '/ops/kits', label: 'Kits' },
  { id: 'map', href: '/ops/map', label: 'Map' },
  { id: 'tasks', href: '/ops/tasks', label: 'Tasks' },
  { id: 'routines', href: '/ops/routines', label: 'Routines' },
]);

function areaInfo(area) {
  const id = NAV.some((item) => item.id === area) ? area : 'dashboard';
  switch (id) {
    case 'dashboard':
    case 'office':
    case 'profile':
    case 'chat':
    case 'memory':
    case 'inbox':
    case 'calendar':
    case 'kits':
    case 'map':
    case 'tasks':
    case 'routines':
      return NAV.find((item) => item.id === id);
    default: {
      const _never = id;
      return NAV[0];
    }
  }
}

function opsThemeVars() {
  return `:root{--sky:#2EC4FF;--sky-deep:#0891B2;--lime:#00F5A0;--emerald:#10B981;--emerald-deep:#047857;--emerald-wash:#D1FAE5;--ink:#141414;--text:#141414;--muted:#57534E;--canvas:#EDE7E0;--side:#E6DFD7;--blush:#E9D8D0;--blush-deep:#DCC4B8;--surface:#F3EEE7;--surface-2:#EBE4DC;--line:#CFC7BC;--chip-idle:#F3EFE8;--chip-idle-fg:#78716C;--chip-dot:#D97706;--coral:#E11D48;--amber:#B45309;--sun:#FFE03D;}`;
}

function shellStyles() {
  return `
${opsThemeVars()}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{min-height:100%;}
body{font-family:'Bricolage Grotesque',sans-serif;background:radial-gradient(920px 480px at -8% -10%,var(--blush) 0%,transparent 54%),radial-gradient(720px 380px at 108% -8%,rgba(46,196,255,.10),transparent 46%),var(--canvas);color:var(--text);}
a{color:var(--sky-deep);text-decoration:none;}
a:hover{color:var(--emerald);}
a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid var(--emerald);outline-offset:2px;}
.ops-app{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh;}
.ops-side{display:flex;flex-direction:column;gap:18px;padding:22px 16px 18px;background:var(--side);border-right:1px solid var(--line);}
.ops-side .brand{font-family:'Clash Display',sans-serif;font-size:22px;letter-spacing:-.03em;color:var(--ink);}
.ops-brand-logo{display:block;height:28px;width:auto;max-width:168px;object-fit:contain;}
.ops-side-kicker{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--sky-deep);}
.ops-nav{display:flex;flex-direction:column;gap:4px;flex:1;}
.ops-nav a{display:flex;align-items:center;padding:9px 12px;border-radius:12px;color:var(--text);font-size:13px;font-weight:600;background:transparent;border:1px solid transparent;}
.ops-nav a:hover{background:rgba(255,255,255,.55);}
.ops-nav a[aria-current=page]{background:linear-gradient(90deg,rgba(46,196,255,.18),rgba(16,185,129,.12));color:var(--sky-deep);border-color:rgba(46,196,255,.28);}
.ops-side-foot{display:grid;gap:10px;padding-top:12px;border-top:1px solid rgba(228,216,208,.9);}
.ops-top{display:none;}
.brand{font-family:'Clash Display',sans-serif;font-size:22px;letter-spacing:-.03em;}
.who{font-size:12px;color:var(--muted);line-height:1.4;word-break:break-word;}
.who span{color:var(--emerald);font-weight:600;}
.signout{border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:999px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;}
.ops-main{min-width:0;padding:28px 32px 48px;}
.ops-wrap{width:min(1100px,100%);margin:0 auto;}
.banner{margin:0 0 16px;padding:10px 12px;border-radius:12px;border:1px solid #F3D19A;background:#FFF6E0;color:var(--amber);font-size:13px;}
.grid{display:grid;gap:16px;}
@media (min-width:800px){.grid.two{grid-template-columns:1fr 1fr;} .grid.forms{grid-template-columns:1fr 1fr;}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:0 10px 28px rgba(28,20,16,.04);}
.kicker{color:var(--sky-deep);font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;}
h1{font-family:'Clash Display',sans-serif;font-size:clamp(26px,5vw,34px);letter-spacing:-.03em;margin-bottom:8px;color:var(--ink);}
h2{font-family:'Clash Display',sans-serif;font-size:20px;margin-bottom:8px;color:var(--ink);}
.lead{color:var(--muted);font-size:16px;line-height:1.5;max-width:40rem;margin:0 0 18px;}
details.soft{margin-top:16px;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:var(--surface);}
details.soft summary{cursor:pointer;font-weight:600;color:var(--text);}
p,li{color:var(--text);line-height:1.55;font-size:15px;}
.empty{padding:12px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);background:var(--surface-2);}
.list{list-style:none;display:grid;gap:8px;}
.list li{padding:10px 12px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line);color:var(--text);}
.tag{display:inline-block;margin-right:8px;color:var(--emerald);font-size:12px;font-weight:600;text-transform:uppercase;}
.tag.overlap{color:var(--amber);}
label{display:block;margin:12px 0 6px;font-size:13px;font-weight:600;color:var(--ink);}
input,textarea,select{width:100%;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--text);font:inherit;}
input:focus,textarea:focus,select:focus{border-color:var(--sky);box-shadow:0 0 0 3px rgba(46,196,255,.16);}
textarea{min-height:88px;resize:vertical;}
.btn{margin-top:14px;width:100%;padding:12px 14px;border:0;border-radius:999px;background:var(--sky);color:var(--ink);font:inherit;font-weight:600;cursor:pointer;}
.btn:hover{filter:brightness(.97);}
.btn-sm{width:auto;margin-top:10px;padding:8px 14px;}
.btn-danger{background:transparent;color:var(--coral);border:1px solid rgba(225,29,72,.35);}
.talk-actions{display:grid;gap:10px;margin-top:14px;}
.talk-actions .btn{width:100%;margin-top:0;}
.btn-assign{background:var(--emerald-wash);color:var(--ink);border:1px solid rgba(16,185,129,.45);}
.task-row label{margin-top:8px;}
.check{display:flex;align-items:flex-start;gap:8px;font-weight:500;}
.check input{width:auto;margin-top:3px;}
.ctx{margin:14px 0;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2);}
.ctx legend{color:var(--sky-deep);font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;}
.thread{list-style:none;display:grid;gap:10px;margin-bottom:16px;}
.bubble{padding:12px;border-radius:16px;background:var(--surface-2);border:1px solid var(--line);}
.bubble p{color:var(--text);}
.bubble.user{border-color:rgba(46,196,255,.35);background:rgba(46,196,255,.08);}
.bubble.assistant{border-color:rgba(16,185,129,.28);background:var(--emerald-wash);}
.ok{margin-bottom:12px;color:var(--emerald);background:var(--emerald-wash);border:1px solid #A7E9CF;border-radius:12px;padding:10px 12px;font-size:14px;}
.err{margin-bottom:12px;color:#BE123C;background:#FDE8EA;border:1px solid #F9C5CB;border-radius:12px;padding:10px 12px;font-size:14px;}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
.kits-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px;}
.kits-head .btn,.kits-banner .btn{width:auto;margin-top:0;}
.kits-sub{color:var(--muted);font-size:13px;}
.kits-banner{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin:0 0 14px;padding:10px 14px;border-radius:14px;border:1px solid #A7E9CF;background:var(--emerald-wash);color:var(--emerald);font-size:13px;font-weight:600;}
.kits-banner a{color:var(--sky-deep);}
.kits-banner form{margin-left:auto;}
.kits-board{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:14px 14px 10px;box-shadow:0 10px 28px rgba(28,20,16,.04);}
.kits-tools{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;align-items:center;}
.kits-tools input,.kits-tools select{width:auto;min-width:220px;flex:1;padding:10px 14px;font-size:14px;border-radius:999px;background:var(--surface-2);}
.kits-chips{display:flex;flex-wrap:wrap;gap:6px;}
.kits-chips button{border:1px solid var(--line);background:var(--surface-2);color:var(--muted);border-radius:999px;padding:6px 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;}
.kits-chips button.is-on{background:rgba(46,196,255,.16);color:var(--sky-deep);border-color:transparent;}
.kits-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px;background:var(--surface);}
.kits-table{width:100%;border-collapse:collapse;font-size:14px;}
.kits-table th{position:sticky;top:0;background:var(--surface-2);text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 14px;border-bottom:1px solid var(--line);font-weight:700;}
.kits-table td{padding:12px 14px;border-bottom:1px solid var(--line);color:var(--text);vertical-align:middle;}
.kits-table tbody tr{cursor:pointer;}
.kits-table tbody tr:hover,.kits-table tbody tr.is-open{background:rgba(46,196,255,.08);}
.kit-no{font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:.02em;color:var(--ink);}
.kit-status{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid transparent;background:var(--chip-idle);color:var(--chip-idle-fg);}
.kit-status.is-active{background:var(--emerald-wash);color:var(--emerald-deep);border-color:#A7F3D0;}
.kit-status.is-inactive{background:var(--chip-idle);color:var(--chip-idle-fg);border-color:var(--line);}
.kit-status.is-inactive::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--chip-dot);flex-shrink:0;}
.kit-status.is-returned{background:#D7F4FF;color:var(--sky-deep);border-color:#A8E4F7;}
.kit-status.is-lost{background:#FDE8EA;color:#BE123C;border-color:#F9C5CB;}
.kit-status.is-unknown{background:#FFF3C4;color:var(--amber);border-color:#F3D19A;}
.kits-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:10px;color:var(--muted);font-size:12px;}
.kits-skel{height:28px;margin:8px 12px;border-radius:8px;background:linear-gradient(90deg,var(--blush),rgba(46,196,255,.12),var(--blush));}
.kits-layout{display:grid;gap:14px;}
@media (min-width:960px){.kits-layout.has-drawer{grid-template-columns:minmax(0,1fr) 340px;}}
.kit-drawer{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:16px 18px;min-height:280px;box-shadow:0 10px 28px rgba(28,20,16,.04);}
.kit-drawer[hidden]{display:none;}
.kit-drawer-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
.kit-drawer-close{border:0;background:transparent;color:var(--muted);font:inherit;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;}
.kit-drawer h2{font-size:18px;margin-bottom:2px;}
.kit-drawer .kit-drawer-name{color:var(--text);font-size:14px;margin-bottom:8px;}
.kit-drawer dt{color:var(--muted);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);}
.kit-drawer dd{color:var(--text);margin:4px 0 0;word-break:break-word;font-size:13px;}
.kit-drawer .btn{width:auto;}
.kit-drawer .kit-status-form{margin:12px 0 4px;}
.kit-drawer .kit-status-form .btn{display:block;width:100%;margin-top:0;padding:12px 16px;}
.map-lead{color:var(--muted);margin:.35rem 0 12px;max-width:36rem;font-size:15px;}
.map-legend{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}
.map-chip{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;border:1px solid var(--line);}
.map-chip.kit{background:#E6F7FF;color:var(--sky-deep);}
.map-chip.person{background:var(--emerald-wash);color:var(--emerald-deep);}
.map-chip.task{background:#FEF3C7;color:var(--amber);}
.map-chip.decision{background:#EDE9FE;color:#5B21B6;}
.map-tools{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center;}
.map-tools input[type=search]{flex:1;min-width:140px;width:auto;padding:10px 12px;border-radius:12px;font-size:14px;}
.map-filters{display:flex;flex-wrap:wrap;gap:6px;}
.map-filters button{font-size:12px;font-weight:600;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--muted);cursor:pointer;}
.map-filters button.is-on{background:#E6F7FF;color:var(--sky-deep);border-color:transparent;}
.map-opt{font-size:11px;color:var(--muted);display:flex;align-items:center;gap:6px;margin-left:auto;}
.map-opt input{width:auto;accent-color:var(--sky);}
.map-stage-wrap{display:flex;flex-direction:column;gap:14px;}
@media(min-width:900px){.map-stage-wrap{display:grid;grid-template-columns:1fr 300px;align-items:start;}}
.map-stage{background:var(--surface);border:1px solid var(--line);border-radius:18px;position:relative;overflow:hidden;min-height:340px;touch-action:manipulation;}
.map-stage.is-wash{background:linear-gradient(165deg,var(--surface) 0%,#FFF7ED 45%,var(--blush) 100%);}
@media(min-width:900px){.map-stage{min-height:420px;}}
.map-stage svg{width:100%;height:340px;display:block;}
@media(min-width:900px){.map-stage svg{height:420px;}}
.map-edge{stroke:#E5E0D8;stroke-width:1.15;opacity:.62;}
.map-edge.is-on{stroke:var(--sky-deep);stroke-width:1.85;opacity:.95;}
.map-node{cursor:pointer;}
.map-node circle{stroke:#fff;stroke-width:2;filter:drop-shadow(0 3px 8px rgba(28,25,23,.08));}
.map-node text{font-size:9px;font-weight:650;fill:var(--text);pointer-events:none;}
.map-kit circle{fill:var(--sky);}
.map-person circle{fill:var(--emerald);}
.map-task circle{fill:#F59E0B;}
.map-decision circle{fill:#8B5CF6;}
.map-node.is-on circle{stroke:var(--sky-deep);stroke-width:2.6;}
.map-node.is-related circle{stroke:var(--sky-deep);stroke-width:2.2;}
.map-node.is-hit circle{stroke:var(--sky-deep);stroke-width:2.4;}
.map-node.is-dim,.map-node.is-idle{opacity:.32;}
@keyframes mapDriftA{0%,100%{transform:translate(0,0)}50%{transform:translate(4px,-5px)}}
@keyframes mapDriftB{0%,100%{transform:translate(0,0)}50%{transform:translate(-5px,3px)}}
@keyframes mapDriftC{0%,100%{transform:translate(0,0)}50%{transform:translate(3px,4px)}}
.float-a{animation:mapDriftA 7s ease-in-out infinite;}
.float-b{animation:mapDriftB 8.5s ease-in-out infinite;}
.float-c{animation:mapDriftC 9s ease-in-out infinite;}
@media(prefers-reduced-motion:reduce){.float-a,.float-b,.float-c{animation:none;}}
.map-empty{position:absolute;left:12px;right:12px;bottom:12px;text-align:center;pointer-events:none;}
.map-empty strong{display:block;font-size:14px;margin-bottom:4px;color:var(--ink);}
.map-empty span{color:var(--muted);font-size:12px;display:block;max-width:22rem;margin:0 auto;}
.map-detail{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 8px 28px rgba(28,25,23,.06);min-height:160px;}
.map-type{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--sky-deep);margin-bottom:4px;}
.map-detail h2{font-size:1.1rem;margin-bottom:6px;letter-spacing:-.02em;}
.map-working{font-size:14px;color:var(--muted);margin-bottom:14px;}
.map-actions{display:flex;flex-wrap:wrap;gap:8px;}
.map-detail .btn{width:auto;margin-top:0;padding:10px 16px;}
.map-btn-ghost{background:#E6F7FF;color:var(--sky-deep);}
.map-placeholder{color:var(--muted);font-size:14px;}
.map-cap{margin-top:10px;font-size:12px;color:var(--muted);}
@media (max-width:860px){
  .ops-app{grid-template-columns:1fr;}
  .ops-side{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line);padding:14px 16px;}
  .ops-nav{flex-direction:row;flex-wrap:wrap;gap:6px;}
  .ops-nav a{padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.55);border-color:var(--line);}
  .ops-side-foot{grid-template-columns:1fr auto;align-items:center;border-top:0;padding-top:0;}
  .ops-main{padding:18px 16px 36px;}
  .ops-top{display:none;}
}
@media (max-width:700px){
  .kits-table thead{display:none;}
  .kits-table,.kits-table tbody,.kits-table tr,.kits-table td{display:block;width:100%;}
  .kits-table tr{padding:10px 14px;border-bottom:1px solid var(--line);}
  .kits-table td{border:0;padding:2px 0;}
  .kits-table td.kit-no{font-size:15px;}
}
`;
}

function shellPage({ title, email, area, body, notice, error, scripts, head }) {
  const current = areaInfo(area).id;
  const nav = NAV.map((item) => (
    `<a href="${item.href}"${item.id === current ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`
  )).join('');
  const alert = error
    ? `<p class="err" role="alert">${escapeHtml(error)}</p>`
    : notice
      ? `<p class="ok" role="status">${escapeHtml(notice)}</p>`
      : '';
  const officeDesktop = current === 'office';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex,nofollow"/>
${typeof head === 'string' ? head : ''}
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self';"/>
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Clash+Display:wght@600;700&family=Bricolage+Grotesque:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>${shellStyles()}</style>
</head>
<body>
<div class="ops-app${officeDesktop ? ' is-office' : ''}">
  <aside class="ops-side">
    <div>
      <div class="ops-side-kicker">Internal</div>
      <div class="brand">
        <picture>
          <source srcset="/images/logo.webp" type="image/webp"/>
          <img class="ops-brand-logo" src="/images/logo.png" alt="LAVAALL" width="140" height="36"/>
        </picture>
      </div>
    </div>
    <nav class="ops-nav" aria-label="LAVAALL OS">${nav}</nav>
    <div class="ops-side-foot">
      <p class="who">signed in as <span>${escapeHtml(email)}</span></p>
      <form method="POST" action="/api/ops/auth">
        <input type="hidden" name="action" value="logout"/>
        <button class="signout" type="submit">Sign out</button>
      </form>
    </div>
  </aside>
  <div class="ops-main">
    <div class="ops-wrap">
      ${alert}
      ${body}
    </div>
  </div>
</div>
${typeof scripts === 'string' ? scripts : ''}
</body>
</html>`;
}

function persistenceBanner(durable) {
  if (durable) return '';
  return '<p class="banner">Demo store — not durable until Vercel KV is bound (KV_REST_API_URL + KV_REST_API_TOKEN). Goals, tasks, notes, inbox, calendar, routines, kits, and CEO Talk may reset on a cold start until KV is on.</p>';
}

function dashboardSections({ snapshot, returnTo }) {
  const data = snapshot || {};
  const back = returnTo === '/ops/office' ? '/ops/office' : '/ops';
  const goal = data.goal
    ? `<p><strong>${escapeHtml(data.goal.title)}</strong></p>
       ${data.goal.definitionOfDone ? `<p>Done when: ${escapeHtml(data.goal.definitionOfDone)}</p>` : ''}
       ${data.goal.nextStep ? `<p>Next step: ${escapeHtml(data.goal.nextStep)}</p>` : ''}
       ${data.goal.targetDate ? `<p>Target: ${escapeHtml(data.goal.targetDate)}</p>` : ''}`
    : '<p class="empty">No current goal saved yet. Add one under You.</p>';

  const unfinished = Array.isArray(data.unfinished) ? data.unfinished : [];
  const tasks = unfinished.length
    ? `<ul class="list">${unfinished.map((task) => (
      `<li><span class="tag">${escapeHtml(task.status === 'doing' ? 'Doing' : 'To do')}</span>${escapeHtml(task.title)}${task.nextAction ? ` — ${escapeHtml(task.nextAction)}` : ''}${task.due ? ` · due ${escapeHtml(task.due)}` : ''}</li>`
    )).join('')}</ul>`
    : '<p class="empty">No unfinished tasks. Add one below.</p>';

  const next = data.nextAction
    ? `<p><strong>${escapeHtml(data.nextAction.detail)}</strong></p><p>${escapeHtml(data.nextAction.title)}</p>`
    : '<p class="empty">No next action yet. Add a task with an optional next step.</p>';

  const recent = Array.isArray(data.notes) ? data.notes : [];
  const notes = recent.length
    ? `<ul class="list">${recent.map((note) => (
      `<li><strong>${escapeHtml(note.title)}</strong>${note.body ? ` — ${escapeHtml(note.body)}` : ''}${note.source ? ` · ${escapeHtml(note.source)}` : ''}</li>`
    )).join('')}</ul>`
    : '<p class="empty">No notes yet. Add one below or open Memory.</p>';

  const emptyLead = data.empty
    ? '<p class="empty">Nothing saved yet. Add a task or a note below.</p>'
    : '';
  const returnField = back === '/ops' ? '' : `<input type="hidden" name="returnTo" value="${escapeHtml(back)}"/>`;

  return `
      ${emptyLead}
      <div class="grid two">
        <section class="card"><div class="kicker">Now</div><h2>Goal</h2>${goal}</section>
        <section class="card"><div class="kicker">Next</div><h2>Do this next</h2>${next}</section>
        <section class="card"><div class="kicker">Open</div><h2>Unfinished tasks</h2>${tasks}</section>
        <section class="card"><div class="kicker">People notes</div><h2>Recent notes</h2>${notes}<p><a href="/ops/memory">Open Memory</a></p></section>
      </div>
      <div class="grid forms" style="margin-top:14px">
        <section class="card" id="add-task">
          <div class="kicker">Capture</div>
          <h2>Add a task</h2>
          <form method="POST" action="/ops">
            <input type="hidden" name="action" value="add-task"/>
            ${returnField}
            <label for="task-title">What to do</label>
            <input id="task-title" name="title" required maxlength="160" placeholder="Follow up on SL quote pack"/>
            <label for="task-next">Next step (optional)</label>
            <input id="task-next" name="nextAction" maxlength="200" placeholder="Email Abdulhamid the open items"/>
            <button class="btn" type="submit">Save task</button>
          </form>
        </section>
        <section class="card" id="add-note">
          <div class="kicker">Capture</div>
          <h2>Add a note</h2>
          <form method="POST" action="/ops">
            <input type="hidden" name="action" value="add-note"/>
            ${returnField}
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
    `;
}

function dashboardPage({ email, snapshot, notice, error }) {
  return shellPage({
    title: 'LAVAALL OS — Dashboard',
    email,
    area: 'dashboard',
    notice,
    error,
    body: `
      ${persistenceBanner(snapshot.durable)}
      <h1>Dashboard</h1>
      <p class="lead">What we are finishing, and the next thing to do. Add a task or a note below.</p>
      ${dashboardSections({ snapshot, returnTo: '/ops' })}
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
  dashboardSections,
  opsThemeVars,
  persistenceBanner,
  shellPage,
  stubPage,
};
