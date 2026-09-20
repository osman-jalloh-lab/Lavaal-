// Ticket 06 — Inbox paste, confirm-send gate, idempotency, no chat auto-send.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const inbox = require(path.join(opsDir, '_inbox.js'));
const chat = require(path.join(opsDir, '_chat.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const OSMAN = 'osmanjalloh104@gmail.com';
const ABDUL = 'abdulhbah55@gmail.com';

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.send = (b) => {
    res.raw = b;
    if (typeof b === 'string' && (b.startsWith('{') || b.startsWith('['))) {
      try { res.body = JSON.parse(b); } catch { res.body = b; }
    } else {
      res.body = b;
    }
    return res;
  };
  return res;
}

function cookieFor(email) {
  return `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(email))}`;
}

function authed(extra) {
  const asJson = extra && extra.json !== false;
  const email = extra && extra.email ? extra.email : OSMAN;
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: {
      cookie: cookieFor(email),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'text/html',
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/inbox',
    body: extra && extra.body,
  };
}

function setSupportEnv() {
  process.env.OPS_GMAIL_CLIENT_ID = 'client-id';
  process.env.OPS_GMAIL_CLIENT_SECRET = 'client-secret';
  process.env.OPS_GMAIL_REFRESH_TOKEN = 'refresh-token';
  process.env.OPS_GMAIL_FROM = 'support@lavaall.com';
}

function clearGmailEnv() {
  delete process.env.OPS_GMAIL_CLIENT_ID;
  delete process.env.OPS_GMAIL_CLIENT_SECRET;
  delete process.env.OPS_GMAIL_REFRESH_TOKEN;
  delete process.env.OPS_GMAIL_FROM;
}

function installGmailFetch() {
  const state = { sendCalls: 0, listCalls: 0 };
  global.fetch = async (url, opts) => {
    const href = String(url);
    if (href.includes('oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ access_token: 'ya29.test-access' }) };
    }
    if (href.includes('/messages/send')) {
      state.sendCalls += 1;
      return { ok: true, status: 200, json: async () => ({ id: `gmail-msg-${state.sendCalls}`, threadId: 'th-1' }) };
    }
    if (href.includes('/threads?')) {
      state.listCalls += 1;
      return { ok: true, json: async () => ({ threads: [{ id: 'th-1' }] }) };
    }
    if (href.includes('/threads/th-1')) {
      return {
        ok: true,
        json: async () => ({
          id: 'th-1',
          snippet: 'Need a ThinkPad quote',
          messages: [{
            id: 'gm-1',
            payload: {
              headers: [
                { name: 'From', value: 'Buyer <buyer@example.com>' },
                { name: 'To', value: 'support@lavaall.com' },
                { name: 'Subject', value: 'Quote for P14s' },
              ],
            },
          }],
        }),
      };
    }
    if (href.includes('/messages/gm-1')) {
      return {
        ok: true,
        json: async () => ({
          id: 'gm-1',
          threadId: 'th-1',
          snippet: 'Need a ThinkPad quote',
          payload: {
            mimeType: 'text/plain',
            body: { data: Buffer.from('Need a ThinkPad quote for Freetown.', 'utf8').toString('base64url') },
            headers: [
              { name: 'From', value: 'Buyer <buyer@example.com>' },
              { name: 'Subject', value: 'Quote for P14s' },
            ],
          },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({ error: href, method: opts && opts.method }) };
  };
  return state;
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  clearGmailEnv();
  store.resetStore();

  {
    const html = mockRes();
    await ops(authed({ json: false, url: '/ops/inbox', query: { area: 'inbox' } }), html);
    const page = String(html.raw);
    check('inbox page is real and names the paste path',
      page.includes('Paste a snapshot') && page.includes('Live support@ not connected') && !page.includes('coming in ticket 06'));
    check('unconfigured inbox does not invent live threads',
      page.includes('No snapshots or live threads yet') && !/Buyer@|ThinkPad quote pack #/.test(page));
  }

  {
    const pasted = await inbox.pasteSnapshot({
      from: 'customer@example.com',
      subject: 'Lead time for 10 laptops',
      body: 'Need delivery into Freetown.',
      createdBy: OSMAN,
    });
    const data = await store.readStore();
    check('paste snapshot is stored and marked not live',
      pasted.ok && pasted.item.source === 'paste' && pasted.item.live === false && data.inbox[0].subject === 'Lead time for 10 laptops');
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/inbox', query: { area: 'inbox', thread: pasted.item.id } }), page);
    check('open paste thread is labeled as a snapshot, not live mail',
      String(page.raw).includes('Paste snapshot') && String(page.raw).includes('Lead time for 10 laptops'));
  }

  {
    const item = (await store.readStore()).inbox[0];
    const gmail = installGmailFetch();
    const drafted = await inbox.saveInboxDraft(item.id, { draft: 'Thanks — we will confirm stock.', label: 'needs_reply' });
    check('save draft does not call Gmail send', drafted.ok && gmail.sendCalls === 0 && drafted.item.pendingConfirm === false);
    const blocked = await inbox.confirmInboxSend(item.id, { token: 'x', confirmedBy: OSMAN });
    check('confirm-send without support@ mailbox is support_not_connected', blocked.error === 'support_not_connected' && gmail.sendCalls === 0);
    global.fetch = origFetch;
  }

  {
    setSupportEnv();
    const gmail = installGmailFetch();
    const item = (await store.readStore()).inbox[0];
    await inbox.saveInboxDraft(item.id, { draft: 'Thanks — we will confirm stock.', label: 'needs_reply' });
    const skipped = await inbox.confirmInboxSend(item.id, { token: 'nope', confirmedBy: OSMAN });
    check('confirm-send without Ready to send is rejected', skipped.error === 'confirm_required' && gmail.sendCalls === 0);
    const ready = await inbox.readyInboxSend(item.id);
    check('Ready to send is the first step and still does not send',
      ready.ok && ready.item.pendingConfirm === true && Boolean(ready.item.confirmToken) && gmail.sendCalls === 0);
    const first = await inbox.confirmInboxSend(item.id, { token: ready.item.confirmToken, confirmedBy: ABDUL });
    const audit = store.listMailAudit(await store.readStore());
    check('either allowlisted founder may confirm-send once',
      first.ok && first.sent.id && audit[0].email === ABDUL && gmail.sendCalls === 1);
    const again = await inbox.confirmInboxSend(item.id, { token: ready.item.confirmToken, confirmedBy: OSMAN });
    check('second confirm-send is idempotent and does not send again',
      again.ok && again.idempotent === true && gmail.sendCalls === 1);
    global.fetch = origFetch;
    clearGmailEnv();
  }

  {
    store.resetStore();
    const before = store.listMailAudit(await store.readStore()).length;
    await chat.sendChatTurn({ question: 'Please email the customer now.', selection: {}, createdBy: OSMAN });
    const after = await store.readStore();
    check('chat does not auto-send mail or write a confirm-send audit',
      store.listMailAudit(after).length === before && after.inbox.length === 0);
    const src = fs.readFileSync(path.join(opsDir, '_chat.js'), 'utf8');
    check('chat module still does not import the inbox or gmail senders',
      !src.includes('_inbox') && !src.includes('_gmail') && !src.includes('confirmInboxSend'));
  }

  {
    setSupportEnv();
    const gmail = installGmailFetch();
    const refreshed = await inbox.refreshLiveInbox();
    const data = await store.readStore();
    check('live list upserts a real Gmail thread when support@ is connected',
      refreshed.ok && refreshed.live === true && data.inbox.some((item) => item.live && item.subject === 'Quote for P14s'));
    check('Gmail list used REST fetch, not a fake inbox', gmail.listCalls === 1);
    global.fetch = origFetch;
    clearGmailEnv();
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home);
  }

  {
    const gated = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'inbox' }, url: '/ops/inbox' }, gated);
    check('inbox still requires a session', gated.statusCode === 401 && String(gated.raw).includes('Email me a sign-in link'));
  }

  global.fetch = origFetch;
  clearGmailEnv();
  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
