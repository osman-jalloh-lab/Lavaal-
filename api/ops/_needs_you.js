// Stage 1: server-rendered synthetic UI, deliberately independent of live data.
const { NAV } = require('./_shell');
const { createCsrfToken, escapeHtml: esc, isAllowlisted, looksLikeAgentRequest, json, noStore, payloadTooLarge, queryOf, readCsrfToken, wantsJson } = require('./_lib');
const { needsYouFixture } = require('./_needs_you_fixture');

function needsYouEnabled(env = process.env) {
  return /^(1|true|on)$/i.test(String(env.OPS_NEEDS_YOU_ENABLED || '').trim());
}
function isMockAction(action) {
  return ['needs-you-mock-confirm', 'needs-you-mock-dismiss', 'needs-you-mock-add-task', 'needs-you-mock-add-note'].includes(String(action || ''));
}
function fixtureFor(req) {
  const value = queryOf(req).mock;
  const scenario = Array.isArray(value) ? value[0] : value;
  return needsYouFixture(process.env.VERCEL_ENV !== 'production' ? scenario : 'items');
}
function fields(action, csrf, id) {
  return `<input type="hidden" name="action" value="${esc(action)}"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="returnTo" value="/ops">${id ? `<input type="hidden" name="id" value="${esc(id)}">` : ''}`;
}
function proposalForm(action, label, csrf, id, primary) {
  return `<form method="post" action="/ops">${fields(action, csrf, id)}<button${primary ? ' class="primary"' : ''} type="submit">${label}</button></form>`;
}
function needsYouPage({ session, fixture = needsYouFixture(), notice, error }) {
  const csrf = createCsrfToken(session.email);
  const row = (kind, item, actions) => `<li class="inbox-row"><div><p class="meta">${esc(kind)} · Sample</p><h3>${esc(item.title)}</h3><p>${esc(item.detail)}</p></div><div class="actions">${actions}</div></li>`;
  const rows = [
    ...fixture.proposals.map((p, i) => row('Proposal', p, proposalForm('needs-you-mock-confirm', 'Approve', csrf, p.id, i === 0) + proposalForm('needs-you-mock-dismiss', 'Dismiss', csrf, p.id))),
    ...fixture.decisions.map(d => row(`Decision · ${d.level}`, d, '<span>Decide in Decisions</span><a href="/os#decisions">Open in Decisions</a>')),
    ...fixture.routines.map(r => row(`Routine ${r.status}`, r, '<a href="/ops/routines">Open Routines</a>')),
  ];
  const count = rows.length;
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
  const part = type => dateParts.find(value => value.type === type).value;
  const timestamp = `${part('weekday')} ${part('day')} ${part('month')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')} CT`;
  const status = fixture.scenario === 'error' ? "Can't check right now" : count ? `${count} ${count === 1 ? 'thing needs' : 'things need'} you` : 'All clear';
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(now));
  const greeting = hour < 5 || hour >= 18 ? 'Good evening' : hour < 12 ? 'Good morning' : 'Good afternoon';
  const card = (title, content) => `<section class="card"><h2>${title}</h2>${content}</section>`;
  const sample = value => `<p>Sample · ${esc(value)}</p>`;
  const list = values => values.length ? `<ul class="saved">${values.map(v => `<li>Sample · ${esc(v)}</li>`).join('')}</ul>` : '<p>Nothing saved here yet.</p>';
  const capture = fixture.scenario === 'error' ? `<div class="grid">${card('Goal and tasks', '<p role="alert">Saved goals and tasks aren\'t available right now. Check back in a few minutes.</p>')}</div>` : `<div class="grid">${card('Goal', fixture.goal ? sample(fixture.goal) : '<p>No goal yet.</p>')}${card('Do this next', fixture.nextAction ? sample(fixture.nextAction) : '<p>No next action yet.</p>')}${card('Unfinished tasks', list(fixture.tasks))}${card('Recent notes', list(fixture.notes))}</div>`;
  const navLinks = NAV.map(n => `<a href="${esc(n.href)}"${n.id === 'dashboard' ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
  const emailAddress = String(session.email);
  const emailAt = emailAddress.lastIndexOf('@');
  const identityEmail = emailAt < 0 ? esc(emailAddress) : `${esc(emailAddress.slice(0, emailAt))}<wbr>@${esc(emailAddress.slice(emailAt + 1))}`;
  const identity = `<p class="identity">Signed in as <span class="email">${identityEmail}</span></p><form method="post" action="/api/ops/auth"><input type="hidden" name="action" value="logout"><input type="hidden" name="csrf" value="${esc(csrf)}"><button type="submit">Sign out</button></form>`;
  const logo = size => `<picture><source srcset="/images/logo.webp" type="image/webp"><img class="brand-logo" src="/images/logo.png" alt="LAVAALL" width="${size}" height="${size}"></picture>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Needs You · LAVAALL</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com; font-src 'self' https://fonts.gstatic.com https://cdn.fontshare.com; base-uri 'self'; form-action 'self';">
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="preconnect" href="https://api.fontshare.com" crossorigin><link rel="preconnect" href="https://cdn.fontshare.com" crossorigin><link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=clash-display@600&display=swap">
<style>
@font-face{font-family:'Clash Display Fallback';src:local('Arial Bold'),local('Arial-BoldMT'),local('Arimo Bold'),local('Arimo'),local('Arial');font-weight:600;size-adjust:99.8%;ascent-override:89.1%;descent-override:25%;line-gap-override:9%}
:root{--canvas:#EDE7E0;--side:#E6DFD7;--surface:#F3EEE7;--ink:#141414;--sky:#2EC4FF;--emerald:#10B981;--muted:#57534E;--line:#CFC7BC}
*{box-sizing:border-box}html,body{overflow-x:clip;margin:0}body{background:var(--canvas);color:var(--ink);font:16px/1.45 'Bricolage Grotesque',sans-serif;overflow-wrap:anywhere}h1,h2,h3,p{margin:0}h1,h2{font-family:'Clash Display','Clash Display Fallback',sans-serif;font-weight:600;line-height:1.2}h1{font-size:32px}h2{font-size:23px;margin-bottom:12px}h3{font-size:17px}a{color:var(--ink);text-underline-offset:3px}a,button,input,textarea,summary{min-height:44px;min-width:44px}a{display:inline-flex;align-items:center}button,input,textarea{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--ink);border-radius:10px;padding:8px 14px}button{cursor:pointer;font-weight:600}button.primary{background:var(--sky)}:focus-visible{outline:3px solid var(--ink);outline-offset:2px}.app{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:100vh}aside{background:var(--side);padding:24px 16px;display:flex;flex-direction:column;gap:20px;border-right:1px solid var(--line)}.brand-logo{display:block;width:96px;height:96px;object-fit:contain}.mbar{display:none}.nav{display:grid;gap:2px}.nav a{padding:8px 12px;text-decoration:none;border-radius:10px}.nav a[aria-current]{background:var(--surface);font-weight:600}.identity{font-size:16px;color:var(--muted)}.identity .email{display:block;overflow-wrap:normal;word-break:normal}main{min-width:0;padding:28px 32px 48px}.wrap{max-width:1100px;margin:auto}.banner{padding:12px 16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;margin-bottom:16px}.meta{font-size:16px;color:var(--muted)}header{margin-bottom:20px}.inbox{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}.inbox h2{padding:16px 20px;margin:0}.inbox ul{list-style:none;padding:0;margin:0}.inbox-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:12px 20px;border-top:1px solid var(--line)}.inbox-row:first-child{border-left:5px solid var(--sky);padding-left:15px}.inbox-row p:last-child{color:var(--muted)}.actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;max-width:330px}.actions span{font-size:16px;color:var(--muted)}.empty{padding:16px 20px}.chips{display:flex;gap:12px 24px;flex-wrap:wrap;color:var(--muted);font-size:16px;padding:16px 0 28px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}.card{min-width:0;padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:16px}.saved{padding-left:20px}.saved li{margin:8px 0}.card label{display:block;margin:12px 0 6px}.card input,.card textarea{width:100%}.card button{margin-top:16px}textarea{min-height:100px}
@media(max-width:700px){.app{grid-template-columns:minmax(0,1fr)}aside{display:none}.mbar{display:flex;align-items:center;justify-content:space-between;position:relative;margin:0;padding:8px 16px;background:var(--side);border-bottom:1px solid var(--line)}.mbar .brand-logo{width:44px;height:44px}.mnav summary{display:flex;align-items:center;justify-content:center;list-style:none;border:1px solid var(--ink);border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:600;background:var(--surface)}.mnav summary::-webkit-details-marker{display:none}.mnav[open] summary{background:var(--ink);color:var(--surface)}.mnav[open] summary:focus-visible{outline:3px solid var(--sky);outline-offset:2px}.mnav[open] .mnav-panel{box-shadow:0 8px 16px rgba(20,20,20,.12)}.mnav-panel{position:absolute;top:100%;left:0;right:0;z-index:1;padding:12px 16px;background:var(--side);border-bottom:1px solid var(--line)}.mnav-panel .identity{margin:12px 0}.nav a{font-size:16px}.identity{margin:0}main{padding:12px 16px}.banner{padding:8px 12px;margin-bottom:12px}main header{margin-bottom:12px}h1{font-size:26px}.inbox h2{padding:12px 16px}.grid{grid-template-columns:minmax(0,1fr)}.inbox-row{grid-template-columns:minmax(0,1fr);gap:8px;padding:12px 16px}.inbox-row:first-child{padding-left:11px}.actions{justify-content:flex-start;max-width:none}}
</style></head><body><div class="app"><aside>${logo(96)}<nav class="nav" aria-label="LAVAALL OS">${navLinks}</nav>${identity}</aside><header class="mbar">${logo(44)}<details class="mnav"><summary>Menu</summary><div class="mnav-panel"><nav class="nav" aria-label="LAVAALL OS (menu)">${navLinks}</nav>${identity}</div></details></header><main><div class="wrap"><p class="banner">Sample data — nothing here is real yet.</p>${error ? `<p class="banner" role="alert">${esc(error)}</p>` : notice ? `<p class="banner" role="status">${esc(notice)}</p>` : ''}<header><h1>${greeting}</h1><p>${status} · ${timestamp}</p></header><section class="inbox" aria-labelledby="needs-title"><h2 id="needs-title">Needs You</h2>${fixture.scenario === 'error' ? '<p class="empty" role="alert">Approvals aren\'t available right now. Try again shortly.</p>' : count ? `<ul>${rows.join('')}</ul>` : '<div class="empty"><p>Nothing is waiting on you right now.</p><p>No proposals need approval.</p><p>No high-level decisions are waiting.</p><p>Routine health hasn\'t reported yet.</p></div>'}</section><div class="chips"><span>${fixture.brief ? 'Morning brief: sample' : 'No morning brief yet.'}</span>${fixture.brief && fixture.spend ? '<span>Spend this month: sample, no real figure</span>' : ''}${fixture.brief && fixture.bounce ? '<span>Bounce: sample, no real figure</span>' : ''}</div>${capture}<div class="grid">${card('Add a task', `<form method="post" action="/ops">${fields('needs-you-mock-add-task', csrf)}<label for="task-title">What to do</label><input id="task-title" name="title" required maxlength="160"><label for="task-next">Next step (optional)</label><input id="task-next" name="nextAction" maxlength="200"><button type="submit">Save sample task</button></form>`)}${card('Add a note', `<form method="post" action="/ops">${fields('needs-you-mock-add-note', csrf)}<label for="note-title">Note title</label><input id="note-title" name="title" required maxlength="160"><label for="note-body">Body (optional)</label><textarea id="note-body" name="body" maxlength="4000"></textarea><label for="note-source">Source (optional)</label><input id="note-source" name="source" maxlength="240"><button type="submit">Save sample note</button></form>`)}</div></div></main></div></body></html>`;
}
function sendPage(res, status, opts) {
  noStore(res, 'text/html; charset=utf-8');
  return res.status(status).send(needsYouPage(opts));
}
function allowed(req, res, session) {
  if (isAllowlisted(session.email) && !looksLikeAgentRequest(req)) return true;
  if (wantsJson(req)) json(res, 403, { error: 'agent_denied' });
  else { noStore(res, 'text/html; charset=utf-8'); res.status(403).send('Founder access required.'); }
  return false;
}
function renderNeedsYou(req, res, session, extra) {
  if (!allowed(req, res, session)) return;
  const fixture = fixtureFor(req);
  return wantsJson(req) ? json(res, 200, fixture) : sendPage(res, 200, { session, fixture, ...extra });
}
function handleMockAction(req, res, session, body) {
  if (!allowed(req, res, session)) return;
  if (payloadTooLarge(req)) {
    return wantsJson(req) ? json(res, 413, { error: 'payload_too_large' }) : sendPage(res, 413, { session, error: 'Request is too large.' });
  }
  if (!readCsrfToken(body.csrf, session.email)) {
    return wantsJson(req) ? json(res, 403, { error: 'csrf' }) : sendPage(res, 403, { session, error: 'Please reload the page and try again.' });
  }
  const proposalAction = body.action === 'needs-you-mock-confirm' || body.action === 'needs-you-mock-dismiss';
  const handled = proposalAction && !needsYouFixture().proposals.some(p => p.id === body.id);
  const notice = handled ? 'That item was already handled.' : proposalAction ? 'Sample only — nothing was changed.' : 'Sample only — nothing was saved.';
  return wantsJson(req) ? json(res, 200, { ok: true, notice }) : sendPage(res, 200, { session, notice });
}
module.exports = { needsYouEnabled, needsYouPage, renderNeedsYou, handleMockAction, isMockAction };
