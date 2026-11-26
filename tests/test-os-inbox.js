// LAVAALL OS Inbox: founder-only, read-only business Gmail sorted into piles. Gmail is mocked; no network.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const inbox = require(path.join(root, 'api/ops/_os_inbox.js'));
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }
const SESSION = { email: 'founder@example.com' };

function mockRes() {
  const res = { statusCode: 200, raw: '' };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = () => res;
  res.send = (b) => { res.raw = String(b); try { res.body = JSON.parse(b); } catch { res.body = b; } return res; };
  return res;
}
async function call(req, opts) {
  inbox.resetOsInbox();
  const res = mockRes();
  const handled = await inbox.handleOsInbox(Object.assign({ method: 'GET', url: '/ops/os/inbox', headers: {}, query: { area: 'os/inbox' } }, req), res, opts);
  return { handled, res };
}

const T = (o) => Object.assign({ gmailThreadId: 'abc123', gmailMessageId: 'm1', from: 'Ada <ada@example.com>', to: '', subject: 'Hello', snippet: '', unread: false, receivedAt: 1790000000000 }, o);

(async () => {
  check('the pile rules', inbox.pileFor(T({ subject: 'Security alert: new sign-in' })) === 'security'
    && inbox.pileFor(T({ subject: 'RFQ for 10 Dell laptops' })) === 'sales'
    && inbox.pileFor(T({ subject: 'Application for the driver job' })) === 'hiring'
    && inbox.pileFor(T({ from: 'Vercel <no-reply@vercel.com>', subject: 'Your deploy finished' })) === 'updates'
    && inbox.pileFor(T({ unread: true, subject: 'Can we meet Friday?' })) === 'reply'
    && inbox.pileFor(T({ unread: false, subject: 'Thanks!' })) === 'other');
  check('mail text is clipped and control characters removed', inbox.toItem(T({ subject: 'a\u0000b'.repeat(200) })).subject.length <= 200 && !/\u0000/.test(inbox.toItem(T({ subject: 'a\u0000b' })).subject));

  check('other routes fall through', (await call({ url: '/ops/harness/chat', query: { area: 'harness/chat' } }, { session: SESSION })).handled === false);
  check('agent-looking requests are refused', (await call({ headers: { authorization: 'Bearer x' } }, { session: SESSION })).res.statusCode === 403);
  check('without the founder sign-in: 401', (await call({}, { session: null })).res.statusCode === 401);
  check('POST is refused (read-only)', (await call({ method: 'POST' }, { session: SESSION })).res.statusCode === 405);
  const off = await call({}, { session: SESSION, configured: false });
  check('Gmail not connected: says so, lists nothing', off.res.statusCode === 200 && off.res.body.connected === false && off.res.body.items.length === 0);
  let asked = null;
  const acct = await call({}, { session: SESSION, configured: true, readProfile: async () => ({ emailAddress: 'support@lavaall.com' }), listThreads: async () => [] });
  check('the inbox reports the account Google says the key reads', acct.res.body.mailbox === 'support@lavaall.com' && acct.res.body.mailboxVerified === true);
  const noProf = await call({}, { session: SESSION, configured: true, readProfile: async () => { throw new Error('x'); }, listThreads: async () => [] });
  check('if Google does not confirm the account, it says so', noProf.res.body.mailboxVerified === false);
  const ok = await call({}, { session: SESSION, configured: true, readProfile: async () => ({ emailAddress: 'a@b.co' }), listThreads: async (o) => { asked = o; return [T({ gmailThreadId: 'old', receivedAt: 1 }), T({ gmailThreadId: 'new', receivedAt: 2, subject: 'Quote please' })]; } });
  check('lists up to 20 threads, newest first, each with a pile', ok.res.statusCode === 200 && asked.max === 20 && ok.res.body.items.map((i) => i.id).join() === 'new,old' && ok.res.body.items[0].pile === 'sales');
  const down = await call({}, { session: SESSION, configured: true, listThreads: async () => { throw new Error('token ya29.secret'); } });
  check('a Gmail failure is a plain 502 that leaks nothing', down.res.statusCode === 502 && !/ya29/.test(down.res.raw));
  check('the module never sends or changes mail', !/sendGmailMessage|modify|trash|batchModify|messages\/send/.test(fs.readFileSync(path.join(root, 'api/ops/_os_inbox.js'), 'utf8')));

  // ---- client ----
  const win = {};
  const sandbox = { window: win, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } }, location: { hash: '' }, navigator: {}, setTimeout: () => 0, setInterval: () => 0, Intl };
  vm.createContext(sandbox);
  ['core.js', 'inbox.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  const OS = win.OS;
  check('Inbox is a section under Work, reachable on a phone', OS.sectionOf('inbox').id === 'inbox' && OS.sectionOf('inbox').group === 'Work' && OS.mobile.MORE.includes('inbox'));
  const html = OS.inboxBody({ connected: true, piles: inbox.PILES, items: [{ id: 'abc_123', from: '"Ev<il>" <x@y.z>', subject: '<img src=x onerror=alert(1)>', snippet: '<script>alert(2)</script>', unread: true, receivedAt: 1790000000000, pile: 'reply' }] });
  check('mail is escaped and opens in Gmail', !/<img src=x/.test(html) && !/<script>alert/.test(html) && /href="https:\/\/mail\.google\.com\/mail\/u\/0\/#inbox\/abc_123"/.test(html));
  check('a thread id with odd characters gets no link', !/mail\.google\.com/.test(OS.inboxBody({ connected: true, piles: inbox.PILES, items: [{ id: 'x"onclick', from: '', subject: 's', snippet: '', unread: false, receivedAt: 0, pile: 'other' }] })));
  check('the page names the account and whether Google confirmed it', /Reading <b>support@lavaall\.com<\/b> \(confirmed by Google\)/.test(OS.inboxBody({ connected: true, mailbox: 'support@lavaall.com', mailboxVerified: true, piles: inbox.PILES, items: [] })));
  check('not connected shows a plain message', /Gmail is not connected/.test(OS.inboxBody({ connected: false, message: 'm' })));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
