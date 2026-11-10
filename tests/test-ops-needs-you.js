// Stage 1 Needs You: plain Node, no network or persisted writes.
const path = require('path');
const dir = path.join(__dirname, '../api/ops');
const lib = require(path.join(dir, '_lib'));
const store = require(path.join(dir, '_store'));
const shell = require(path.join(dir, '_shell'));
const osData = require(path.join(dir, '_os_data'));
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const originals = {};
const calls = { read: 0, write: 0, os: 0, fetch: 0 };
let forbidReads = false;
for (const key of Object.keys(store)) {
  if (typeof store[key] !== 'function') continue;
  if (key !== 'readStore' && !/^(add|save|update|delete|confirm|dismiss)/.test(key)) continue;
  originals[key] = store[key];
  store[key] = async (...args) => {
    if (key === 'readStore') {
      calls.read++;
      if (forbidReads) throw new Error('Unexpected store read');
      return originals[key](...args);
    }
    calls.write++;
    throw new Error('Unexpected store write');
  };
}
const originalLoad = osData.loadOsData;
osData.loadOsData = async () => { calls.os++; throw new Error('Unexpected OS data read'); };
global.fetch = async () => { calls.fetch++; throw new Error('Unexpected network call'); };
const ops = require(path.join(dir, 'index'));
const { needsYouEnabled, needsYouPage } = require(path.join(dir, '_needs_you'));
const { needsYouFixture } = require(path.join(dir, '_needs_you_fixture'));
const results = [];
function check(name, condition) { results.push({ name, pass: Boolean(condition) }); }
const email = lib.ALLOWLIST[0];
const identityEmail = `${lib.escapeHtml(email.slice(0, email.lastIndexOf('@')))}<wbr>@${lib.escapeHtml(email.slice(email.lastIndexOf('@') + 1))}`;
function response() {
  const res = { statusCode: 200, headers: {}, raw: '' };
  res.status = code => { res.statusCode = code; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; return res; };
  res.send = value => { res.raw = value; try { res.body = JSON.parse(value); } catch { res.body = value; } return res; };
  res.end = value => { res.raw = value || ''; return res; };
  return res;
}
async function request({ method = 'GET', query = {}, body, json = false, anonymous = false, headers = {}, url = '/ops' } = {}) {
  const req = { method, url, query, body, headers: {
    host: 'preview.example.test', accept: json ? 'application/json' : 'text/html',
    'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded',
    ...(!anonymous ? { cookie: `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(email))}` } : {}),
    ...headers,
  } };
  const res = response();
  await ops(req, res);
  return res;
}
function text(res) { return String(res.raw); }
function resetCalls() { Object.keys(calls).forEach(key => { calls[key] = 0; }); }
function untouched() { return Object.values(calls).every(value => value === 0); }
function statusLine(html) { return (html.match(/<header><h1>[^<]*<\/h1><p>([^<]*)<\/p><\/header>/) || [])[1] || ''; }
function chipCopy(html) { return (html.match(/<div class="chips">([\s\S]*?)<\/div>/) || [])[1] || ''; }
const ctTimestamp = '(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) (?:[1-9]|[12][0-9]|3[01]) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec), (?:[1-9]|1[0-2]):[0-5][0-9] (?:AM|PM) CT';
async function run() {
  process.env.OPS_AUTH_SECRET = 'needs-you-test-secret-at-least-32-characters';
  for (const key of ['OPS_NEEDS_YOU_ENABLED', 'OPS_SIGNIN_HARDENING_ENABLED', 'FOUNDERS_DM_ENABLED', 'ROUTINE_HEALTH_ENABLED', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[key];
  process.env.VERCEL_ENV = 'preview';
  store.resetStore();
  for (const value of ['1', 'true', 'on', 'TRUE', 'On', ' true ']) check(`flag enables ${JSON.stringify(value)}`, needsYouEnabled({ OPS_NEEDS_YOU_ENABLED: value }));
  for (const value of [undefined, '', '0', 'false', 'off', 'yes', '2', 'trueish']) check(`flag rejects ${JSON.stringify(value)}`, !needsYouEnabled({ OPS_NEEDS_YOU_ENABLED: value }));
  const snapshot = store.dashboardSnapshot(await originals.readStore());
  const baseline = shell.dashboardPage({ email, snapshot });
  check('flag off matches existing dashboardPage byte for byte', text(await request()) === baseline);
  for (const action of ['needs-you-mock-confirm', 'needs-you-mock-dismiss', 'needs-you-mock-add-task', 'needs-you-mock-add-note']) {
    const res = await request({ method: 'POST', json: true, body: { action } });
    check(`flag off ${action} remains unknown_action`, res.statusCode === 400 && res.body.error === 'unknown_action');
  }
  check('query cannot enable feature', text(await request({ query: { OPS_NEEDS_YOU_ENABLED: 'on', mock: 'empty' } })) === baseline);
  check('cookie cannot enable feature', text(await request({ headers: { cookie: `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(email))}; OPS_NEEDS_YOU_ENABLED=on` } })) === baseline);
  check('header cannot enable feature', text(await request({ headers: { 'ops-needs-you-enabled': 'on', OPS_NEEDS_YOU_ENABLED: 'on' } })) === baseline);
  process.env.OPS_NEEDS_YOU_ENABLED = 'on';
  forbidReads = true;
  resetCalls();
  const guest = await request({ anonymous: true });
  check('flag on anonymous GET keeps login 401', guest.statusCode === 401 && /Sign in with Google/.test(text(guest)));
  const guestPost = await request({ anonymous: true, method: 'POST', json: true, body: { action: 'needs-you-mock-confirm' } });
  check('flag on anonymous POST keeps 401', guestPost.statusCode === 401 && guestPost.body.error === 'sign_in_required');
  const outsider = await request({ query: { mock: 'empty' }, headers: { cookie: `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken('outsider@example.test'))}` } });
  check('non-allowlisted identity cannot reach synthetic fixtures', outsider.statusCode === 401 && /Sign in with Google/.test(text(outsider)));
  const agent = await request({ json: true, query: { mock: 'empty' }, headers: { 'x-lavaall-agent': 'sample-agent' } });
  check('agent request cannot reach founder fixtures', agent.statusCode === 403 && agent.body.error === 'agent_denied');
  const page = await request();
  const html = text(page);
  const style = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';
  const fontSizes = [...style.matchAll(/font-size\s*:\s*([0-9]*\.?[0-9]+)px\b/gi)].map(match => Number(match[1]));
  check('page CSS has no font-size declaration below 16px', style.length > 0 && fontSizes.length > 0 && fontSizes.every(size => size >= 16));
  check('plural status includes a complete CT date and time', new RegExp(`^6 things need you · ${ctTimestamp}$`).test(statusLine(html)));
  const singleFixture = needsYouFixture();
  singleFixture.proposals = singleFixture.proposals.slice(0, 1);
  singleFixture.decisions = [];
  singleFixture.routines = [];
  const single = needsYouPage({ session: { email }, fixture: singleFixture });
  check('singular status says one thing needs you with CT date and time', new RegExp(`^1 thing needs you · ${ctTimestamp}$`).test(statusLine(single)));
  const chips = chipCopy(html);
  check('sample chips use clear brief, spend and bounce copy', chips === '<span>Morning brief: sample</span><span>Spend this month: sample, no real figure</span><span>Bounce: sample, no real figure</span>');
  check('sample chips contain no bare dash placeholder', !/>\s*—\s*</.test(chips) && !chips.includes('Sample date'));
  check('authenticated dashboard renders Needs You and synthetic banner', page.statusCode === 200 && /Needs You/i.test(html) && html.includes('Sample data — nothing here is real yet.'));
  check('shell retains email, navigation and sign out', html.includes(identityEmail) && shell.NAV.every(item => html.includes(`href="${item.href}"`)) && /Sign out/.test(html));
  const identities = html.match(/<p class="identity">[\s\S]*?<\/p>/g) || [];
  check('sidebar and phone identities put email in its own span with a break before @', identities.length === 2 && identities.every(identity => identity === `<p class="identity">Signed in as <span class="email">${identityEmail}</span></p>`));
  check('identity email uses a separate line and only normal word wrapping', /\.identity \.email\s*\{[^}]*display:block[^}]*overflow-wrap:normal[^}]*word-break:normal/.test(style));
  const escapedIdentityPage = needsYouPage({ session: { email: `<script>&"'@<img>&"'.test` } });
  const escapedIdentity = `<span class="email">&lt;script&gt;&amp;&quot;&#39;<wbr>@&lt;img&gt;&amp;&quot;&#39;.test</span>`;
  check('email local part and domain retain complete HTML escaping around the break', escapedIdentityPage.split(escapedIdentity).length === 3);
  check('escaped identity adds no scripts or inline event handlers', !/<script\b|\son[a-z]+\s*=/i.test(escapedIdentityPage));
  const mobileMenu = (html.match(/<details class="mnav"[^>]*>([\s\S]*?)<\/details>/) || [])[1] || '';
  check('phone menu uses native details and a visible Menu summary', /<header class="mbar"[\s\S]*?<details class="mnav"/.test(html) && /<summary\b[^>]*>Menu<\/summary>/.test(mobileMenu));
  check('phone menu contains every navigation link and current Dashboard', shell.NAV.every(item => mobileMenu.includes(`href="${item.href}"`)) && /<nav\b[^>]*aria-label="LAVAALL OS \(menu\)"/.test(mobileMenu) && /<a href="\/ops" aria-current="page">Dashboard<\/a>/.test(mobileMenu));
  const mobileSignout = (mobileMenu.match(/<form\b[^>]*action="\/api\/ops\/auth"[^>]*>[\s\S]*?<\/form>/) || [])[0] || '';
  check('phone menu includes signed-in identity and POST sign out with valid hidden CSRF', mobileMenu.includes(`Signed in as <span class="email">${identityEmail}</span>`) && /method="post"/.test(mobileSignout) && /name="action" value="logout"/.test(mobileSignout) && />Sign out<\/button>/.test(mobileSignout) && (() => { const token = mobileSignout.match(/<input type="hidden" name="csrf" value="([^"]+)"/); return token && lib.readCsrfToken(token[1], email); })());
  check('open phone menu summary visibly presses with ink and surface colors', /\.mnav\[open\] summary\s*\{[^}]*background:var\(--ink\)[^}]*color:var\(--surface\)/.test(style));
  check('open phone menu summary keeps a solid 3px sky focus ring', /\.mnav\[open\] summary:focus-visible\s*\{[^}]*outline:3px solid var\(--sky\)/.test(style));
  check('open phone menu panel has its overlay shadow without transitions', /\.mnav\[open\] \.mnav-panel\s*\{[^}]*box-shadow:0 8px 16px rgba\(20,20,20,\.12\)/.test(style) && !/\btransition(?:-[a-z]+)?\s*:/.test(style));
  const logos = html.match(/<picture\b[^>]*>[\s\S]*?<\/picture>/g) || [];
  check('desktop and phone logos use repository WebP and PNG pictures with accessible square dimensions', logos.length === 2 && logos.every(logo => /<source\b[^>]*srcset="\/images\/logo.webp"[^>]*type="image\/webp"/.test(logo) && /<img\b[^>]*class="brand-logo"[^>]*src="\/images\/logo.png"[^>]*alt="LAVAALL"/.test(logo)) && [96, 44].every(size => logos.some(logo => logo.includes(`width="${size}" height="${size}"`))));
  const googleFont = (html.match(/<link\b[^>]*href="(https:\/\/fonts.googleapis.com\/css2[^\"]*)"[^>]*>/) || [])[1] || '';
  check('Google Fonts requests only Bricolage Grotesque', googleFont === 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600&display=swap' && !googleFont.includes('Clash'));
  check('Clash Display loads weight 600 from the Fontshare API', /<link\b[^>]*rel="stylesheet"[^>]*href="https:\/\/api.fontshare.com\/v2\/css\?f\[\]=clash-display@600&display=swap"/.test(html));
  check('Fontshare API and CDN are preconnected', ['api.fontshare.com', 'cdn.fontshare.com'].every(host => html.includes(`<link rel="preconnect" href="https://${host}" crossorigin>`)));
  const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  check('CSP permits Fontshare stylesheet and CDN fonts while retaining same-origin boundaries', /(?:^|;)\s*style-src[^;]*https:\/\/api.fontshare.com(?:\s|;)/.test(csp) && /(?:^|;)\s*font-src[^;]*https:\/\/cdn.fontshare.com(?:\s|;)/.test(csp) && ["default-src 'self'", "form-action 'self'", "base-uri 'self'"].every(value => csp.includes(value)));
  check('Clash Display has a metric-matched local fallback face and heading stack', /@font-face\s*\{[^}]*font-family:'Clash Display Fallback'[^}]*size-adjust:99\.8%[^}]*ascent-override:89\.1%[^}]*descent-override:25%[^}]*line-gap-override:9%/.test(style) && /h1,h2\s*\{[^}]*font-family:'Clash Display','Clash Display Fallback',sans-serif[^}]*font-weight:600[^}]*line-height:1\.2/.test(style));
  const forms = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) || [];
  check('every form includes valid CSRF', forms.length > 0 && forms.every(form => { const token = form.match(/name="csrf" value="([^"]+)"/); return token && lib.readCsrfToken(token[1], email); }));
  const postForms = forms.filter(form => /action="\/ops"/.test(form));
  check('proposal and capture forms all use POST and valid CSRF', postForms.length === 6 && postForms.every(form => /method="post"/i.test(form) && /name="returnTo" value="\/ops"/.test(form) && (() => { const token = form.match(/name="csrf" value="([^"]+)"/); return token && lib.readCsrfToken(token[1], email); })()));
  for (const level of ['L4', 'L3']) {
    const rows = html.match(/<(article|li)\b[^>]*>[\s\S]*?<\/\1>/g) || [];
    const row = rows.find(value => value.includes(`Decision · ${level}`));
    check(`${level} decision is view only`, row && !/<form\b|>Approve<|>Dismiss</.test(row) && row.includes('Decide in Decisions') && row.includes('href="/os#decisions"'));
  }
  const positions = ['Sample proposal: add a task', 'Sample proposal: add a note', 'Decision · L4', 'Decision · L3', 'Routine failed', 'Routine late'].map(label => html.indexOf(label));
  check('all six inbox rows appear in priority order', html.includes('6 things need you') && positions.every((position, i) => position >= 0 && (i === 0 || position > positions[i - 1])));
  check('routine rows link to Routines', html.includes('Routine failed') && html.includes('Routine late') && html.includes('href="/ops/routines"'));
  check('no client scripts or inline event handlers', !/<script\b|\son[a-z]+\s*=/i.test(html));
  const forbidden = ['lavaall-ops-v2', 'chats[].proposals', 'KV_REST_API', 'store could not be read', 'Vercel KV', ...Object.keys(process.env).filter(key => /^(OPS_|VERCEL_ENV$)/.test(key))];
  check('page contains no forbidden implementation strings', forbidden.every(value => !html.includes(value)));
  const empty = text(await request({ query: { mock: 'empty' } }));
  check('empty status says All clear with CT date and time', new RegExp(`^All clear · ${ctTimestamp}$`).test(statusLine(empty)));
  check('empty status does not repeat empty-state copy', !statusLine(empty).includes('Nothing is waiting on you right now.'));
  check('empty chips show only exact missing brief copy', chipCopy(empty) === '<span>No morning brief yet.</span>');
  for (const copy of ['Nothing is waiting on you right now.', 'No proposals need approval.', 'No high-level decisions are waiting.', "Routine health hasn't reported yet.", 'No morning brief yet.']) check(`empty copy: ${copy}`, empty.includes(copy));
  const error = text(await request({ query: { mock: 'error' } }));
  check('error status says Can\'t check right now with CT date and time', new RegExp(`^Can't check right now · ${ctTimestamp}$`).test(statusLine(error)));
  check('error status never claims All clear', !statusLine(error).includes('All clear'));
  check('error chips show only exact missing brief copy', chipCopy(error) === '<span>No morning brief yet.</span>');
  for (const copy of ["Approvals aren't available right now. Try again shortly.", "Saved goals and tasks aren't available right now. Check back in a few minutes."]) check(`error copy: ${copy}`, error.includes(copy));
  check('saved goals and tasks error is inside a titled card with spacing before capture cards', /<div class="grid"><section class="card"><h2>Goal and tasks<\/h2><p role="alert">Saved goals and tasks aren't available right now\. Check back in a few minutes\.<\/p><\/section><\/div><div class="grid"><section class="card"><h2>Add a task<\/h2>/.test(error));
  process.env.VERCEL_ENV = 'production';
  for (const mock of ['empty', 'error']) {
    const production = text(await request({ query: { mock } }));
    check(`production ignores mock=${mock}`, production.includes("Sample proposal: add a task") && production.includes('6 things need you') && !production.includes("Approvals aren't available right now. Try again shortly."));
  }
  process.env.VERCEL_ENV = 'preview';
  for (const action of ['needs-you-mock-confirm', 'needs-you-mock-dismiss', 'needs-you-mock-add-task', 'needs-you-mock-add-note']) {
    for (const csrf of [undefined, 'bad-token']) {
      const res = await request({ method: 'POST', json: true, body: { action, id: 'sample-task', csrf } });
      check(`${action} rejects ${csrf ? 'invalid' : 'missing'} CSRF`, res.statusCode === 403 && res.body.error === 'csrf');
    }
    const res = await request({ method: 'POST', body: { action, id: 'sample-task', csrf: lib.createCsrfToken(email), returnTo: '/ops' } });
    const notice = /add-(task|note)$/.test(action) ? 'Sample only — nothing was saved.' : 'Sample only — nothing was changed.';
    const validJson = await request({ method: 'POST', json: true, body: { action, id: 'sample-task', csrf: lib.createCsrfToken(email), returnTo: '/ops' } });
    check(`${action} returns sample notice in JSON`, validJson.statusCode === 200 && validJson.body.ok === true && validJson.body.notice === notice);
    check(`${action} succeeds without mutation`, (res.statusCode === 200 && text(res).includes(notice)) || ([302, 303].includes(res.statusCode) && String(res.headers.Location || res.headers.location || '').startsWith('/ops')));
  }
  const handled = await request({ method: 'POST', body: { action: 'needs-you-mock-confirm', id: 'already-handled', csrf: lib.createCsrfToken(email) } });
  check('unknown sample proposal shows already handled copy', text(handled).includes('That item was already handled.'));
  const csrfPage = await request({ method: 'POST', body: { action: 'needs-you-mock-confirm' } });
  check('HTML CSRF failure returns 403 and reload copy', csrfPage.statusCode === 403 && text(csrfPage).includes('Please reload the page and try again.'));
  const jsonPage = await request({ json: true });
  check('mock JSON dashboard responds successfully', jsonPage.statusCode === 200 && typeof jsonPage.body === 'object');
  const oversized = await request({ method: 'POST', body: { action: 'needs-you-mock-add-task', title: 'x'.repeat(5000), csrf: lib.createCsrfToken(email) } });
  check('oversized mock POST HTML returns 413 without a store read', oversized.statusCode === 413 && text(oversized).includes('Request is too large.') && untouched());
  const otherArea = await request({ method: 'POST', url: '/ops/tasks', query: { area: 'tasks' }, body: { action: 'needs-you-mock-add-task', title: 'Sample', csrf: lib.createCsrfToken(email) } });
  check('mock action with area=tasks stays synthetic without a store read', otherArea.statusCode === 200 && text(otherArea).includes('Sample only — nothing was saved.') && untouched());
  check('all flag-on dashboard and action requests avoid store, OS loader, writes and fetch', untouched());
  forbidReads = false;
  resetCalls();
  const unknown = await request({ method: 'POST', body: { action: 'unknown-action' } });
  const legacyUnknown = shell.dashboardPage({ email, snapshot: store.dashboardSnapshot(await originals.readStore()), error: 'Unknown action.' });
  check('flag-on unknown-action HTML remains the legacy dashboard byte for byte', unknown.statusCode === 200 && text(unknown) === legacyUnknown && calls.read === 1 && calls.write === 0 && calls.fetch === 0 && calls.os === 0);
  resetCalls();

}
run().catch(error => { console.error(error); check('test run completes', false); }).finally(() => {
  global.fetch = originalFetch;
  osData.loadOsData = originalLoad;
  for (const [key, value] of Object.entries(originals)) store[key] = value;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} - ${result.name}`);
  const passed = results.filter(result => result.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exitCode = passed === results.length ? 0 : 1;
});
