// HTML shells for /ops login + signed-in placeholder.
// Dark operational UI using MAGNUM navy / cyan / lime. Not linked from public nav.
// Underscore prefix: not a Vercel function.

const { escapeHtml } = require('./_lib');
const { dashboardPage } = require('./_shell');
const { dashboardSnapshot, emptyStore } = require('./_store');

function layout({ title, body }) {
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
<style>
:root{--sky:#00C2FF;--lime:#00F5A0;--ink:#0A0A14;--navy:#0B1424;--panel:#121C2E;--line:rgba(0,194,255,.28);--text:#E8F1FF;--muted:#8AA0B8;--coral:#FF5C5C;}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{min-height:100%;}
body{font-family:'Bricolage Grotesque',sans-serif;background:radial-gradient(1200px 600px at 10% -10%,rgba(0,194,255,.16),transparent 50%),radial-gradient(900px 500px at 110% 10%,rgba(0,245,160,.1),transparent 46%),var(--ink);color:var(--text);display:flex;align-items:center;justify-content:center;padding:28px 16px;}
.card{width:min(440px,100%);background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:32px 28px 28px;box-shadow:0 18px 50px rgba(0,0,0,.35);}
.kicker{display:inline-flex;align-items:center;gap:8px;color:var(--sky);font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin-bottom:14px;}
.dot{width:8px;height:8px;border-radius:50%;background:var(--lime);box-shadow:0 0 0 4px rgba(0,245,160,.12);}
h1{font-family:'Clash Display',sans-serif;font-size:clamp(28px,6vw,36px);line-height:1.05;letter-spacing:-.03em;margin-bottom:10px;}
p{color:var(--muted);line-height:1.6;font-size:15px;}
label{display:block;margin:22px 0 8px;font-size:13px;font-weight:600;color:var(--text);}
input[type=email]{width:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--line);background:var(--navy);color:var(--text);font:inherit;}
input[type=email]:focus{outline:2px solid var(--sky);outline-offset:2px;}
.btn{display:inline-flex;align-items:center;justify-content:center;width:100%;margin-top:18px;padding:13px 16px;border:0;border-radius:999px;background:var(--sky);color:var(--ink);font:inherit;font-weight:600;cursor:pointer;}
.btn:focus-visible{outline:3px solid var(--lime);outline-offset:3px;}
.btn-ghost{background:transparent;color:var(--text);border:1px solid var(--line);}
.note{margin-top:16px;font-size:13px;}
.err{margin-top:14px;color:#ffc4c4;background:rgba(255,92,92,.12);border:1px solid rgba(255,92,92,.35);border-radius:10px;padding:10px 12px;font-size:14px;}
.ok{margin-top:14px;color:#c8ffe8;background:rgba(0,245,160,.1);border:1px solid rgba(0,245,160,.32);border-radius:10px;padding:10px 12px;font-size:14px;}
.who{margin:18px 0 8px;padding:12px 14px;border-radius:12px;background:var(--navy);border:1px solid var(--line);font-size:15px;color:var(--text);word-break:break-word;}
.who span{color:var(--lime);}
.preview-link{color:var(--sky);word-break:break-all;}
</style>
</head>
<body>
<main class="card">${body}</main>
</body>
</html>`;
}

function loginPage({ error, sent, previewLoginUrl } = {}) {
  const alert = previewLoginUrl
    ? `<p class="ok" role="status">${escapeHtml('Preview only — email delivery failed. Use this one-time link:')}</p>
      <p class="who"><a class="preview-link" href="${escapeHtml(previewLoginUrl)}">Open sign-in link</a></p>
      <p class="note">${escapeHtml('Shown only because OPS_PREVIEW_INLINE_LINK=1. Never shown for non-allowlisted addresses.')}</p>`
    : sent
      ? `<p class="ok" role="status">${escapeHtml('If that email is authorized, a sign-in link is on its way.')}</p>`
      : error
        ? `<p class="err" role="alert">${escapeHtml(error)}</p>`
        : '';
  return layout({
    title: 'LAVAALL OS — Sign in',
    body: `
      <div class="kicker"><span class="dot" aria-hidden="true"></span> Internal</div>
      <h1>LAVAALL OS</h1>
      <p>Private operating floor. Enter an authorized work email to receive a one-time sign-in link.</p>
      ${alert}
      <form method="POST" action="/api/ops/auth">
        <input type="hidden" name="action" value="request"/>
        <label for="email">Work email</label>
        <input id="email" name="email" type="email" autocomplete="username" required maxlength="120" placeholder="name@example.com"/>
        <button class="btn" type="submit">Email me a sign-in link</button>
      </form>
      <p class="note">No public signup. Access is allowlisted.</p>
    `,
  });
}

function signedInPage(email, snapshot) {
  return dashboardPage({
    email,
    snapshot: snapshot || dashboardSnapshot(emptyStore()),
  });
}

function kitsDeniedPage() {
  return layout({
    title: 'LAVAALL OS — Access denied',
    body: `
      <div class="kicker"><span class="dot" aria-hidden="true"></span> Internal</div>
      <h1>Access denied</h1>
      <p>Kit Registry is founder-only. Agents cannot read this mirror.</p>
    `,
  });
}

module.exports = { layout, loginPage, signedInPage, kitsDeniedPage };
