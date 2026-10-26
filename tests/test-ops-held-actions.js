// Held queued actions: founder Confirm/Decline in /ops, reply keeps the row,
// bearer replies return ids and status only.
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const desks = require(path.join(opsDir, '_agent_thread.js'));
const pages = require(path.join(opsDir, '_pages.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const OTHER = 'abdulhbah55@gmail.com';

const ACK_KEYS = [
  'ok', 'replay', 'threadId', 'messageId', 'correlationId',
  'taskId', 'status', 'assignStatus', 'waiting', 'lead',
];

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
  const asJson = !extra || extra.json !== false;
  const headers = Object.assign({
    cookie: cookieFor((extra && extra.email) || ALLOWED),
    host: 'preview.example.test',
    accept: asJson ? 'application/json' : 'text/html',
    'content-type': asJson ? 'application/json' : 'text/html',
  }, extra && extra.headers ? extra.headers : {});
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers,
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/chat/lavaall-ceo',
    body: extra && extra.body,
  };
}

function bridge(url, area, extra) {
  const headers = {
    host: 'preview.example.test',
    accept: 'application/json',
    'content-type': 'application/json',
  };
  const secret = extra && extra.secret !== undefined ? extra.secret : BRIDGE_SECRET;
  if (secret) headers.authorization = `Bearer ${secret}`;
  return {
    method: extra && extra.method ? extra.method : 'POST',
    headers,
    query: extra && extra.query ? extra.query : { area },
    url,
    body: extra && extra.body,
  };
}

function heldChunk(html) {
  const raw = String(html || '');
  const start = raw.indexOf('id="held-actions"');
  if (start < 0) return '';
  const end = raw.indexOf('</section>', start);
  return end < 0 ? raw.slice(start) : raw.slice(start, end);
}

function ackOnly(body) {
  return Boolean(body) && Object.keys(body).every((key) => ACK_KEYS.includes(key));
}

function resetAll() {
  store.resetStore();
  ceo.resetCeoBridge();
  desks.resetDeskTalk();
}

async function run() {
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.OPS_CEO_BRIDGE_SECRET = BRIDGE_SECRET;
  delete process.env.XAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_ASSIGN_XAI_FALLBACK;
  resetAll();

  {
    const attack = '<script>alert(1)</script> & "x"';
    const html = pages.renderHeldActions([{
      messageId: 'held-1',
      summary: attack,
      sender: ALLOWED,
      source: 'ops-office',
      sourceLabel: 'Office',
    }], {
      confirmUrl: '/ops/api/ceo-bridge/confirm',
      declineUrl: '/ops/api/ceo-bridge/decline',
    }, 'csrf-token');
    check('UI renders escaped held item',
      html.includes('Needs your OK')
      && html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;')
      && !html.includes('<script>alert(1)</script>')
      && html.includes(`From ${ALLOWED} · Office`)
      && html.includes('>Confirm<')
      && html.includes('>Decline<')
      && html.includes('data-endpoint="/ops/api/ceo-bridge/confirm"')
      && html.includes('data-endpoint="/ops/api/ceo-bridge/decline"'));
  }

  {
    const phrase = 'deploy production & "kit-ok"';
    const replyText = 'Noted. Waiting on your OK before any deploy. TOKEN-HOLD';
    const sent = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: { csrf: lib.createCsrfToken(ALLOWED), text: phrase },
    }), sent);
    const page = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), page);
    const chunk = heldChunk(page.raw);
    const html = String(page.raw || '');
    const other = mockRes();
    await ops(authed({
      json: false,
      email: OTHER,
      url: '/ops/chat/lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), other);
    check('CEO Talk shows the held action escaped, with Confirm and Decline',
      sent.statusCode === 200
      && page.statusCode === 200
      && chunk.includes('Needs your OK')
      && chunk.includes('deploy production &amp; &quot;kit-ok&quot;')
      && !chunk.includes(phrase)
      && chunk.includes(`From ${ALLOWED} · Office`)
      && chunk.includes('>Confirm<')
      && chunk.includes('>Decline<')
      && chunk.includes('/ops/api/ceo-bridge/confirm')
      && chunk.includes('/ops/api/ceo-bridge/decline')
      && html.includes('ops-held-actions.js')
      && html.includes('.held-ok-actions .btn{width:auto;flex:1 1 8rem;margin-top:0;min-height:44px;}')
      && !heldChunk(other.raw));

    const pending = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/pending',
      'api/ceo-bridge/pending',
      { method: 'GET' },
    ), pending);
    const item = pending.body && pending.body.pending && pending.body.pending[0];
    const replied = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/reply',
      'api/ceo-bridge/reply',
      {
        body: {
          threadId: item && item.threadId,
          text: replyText,
          pendingId: item && item.messageId,
        },
      },
    ), replied);
    const still = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/pending',
      'api/ceo-bridge/pending',
      { method: 'GET' },
    ), still);
    const held = still.body && still.body.pending && still.body.pending[0];
    const echo = JSON.stringify(replied.body || {});
    const stored = await ceo.inspectCeoThread(item && item.threadId);
    const noted = (stored.thread.messages || []).some((row) => row.role === 'ceo' && row.text === replyText);
    check('reply does not drop a held CEO item and the bearer response has no raw text',
      item
      && item.actionStatus === 'needs_founder_confirm'
      && replied.statusCode === 200
      && replied.body.ok === true
      && replied.body.replay === false
      && replied.body.status === 'answered'
      && replied.body.threadId === item.threadId
      && ackOnly(replied.body)
      && !echo.includes(phrase)
      && !echo.includes('TOKEN-HOLD')
      && !echo.includes('kit-ok')
      && !replied.body.thread
      && !replied.body.text
      && noted
      && held
      && held.messageId === item.messageId
      && held.actionStatus === 'needs_founder_confirm'
      && held.mayAct === false);

    const afterReply = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), afterReply);
    const confirmed = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/api/ceo-bridge/confirm',
      query: { area: 'api/ceo-bridge/confirm' },
      body: { csrf: lib.createCsrfToken(ALLOWED), messageId: item.messageId },
    }), confirmed);
    const bearerConfirm = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/confirm',
      'api/ceo-bridge/confirm',
      { body: { messageId: item.messageId } },
    ), bearerConfirm);
    const done = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/reply',
      'api/ceo-bridge/reply',
      {
        body: {
          threadId: item.threadId,
          text: 'Completed the held action. TOKEN-DONE',
          pendingId: item.messageId,
        },
      },
    ), done);
    const cleared = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/pending',
      'api/ceo-bridge/pending',
      { method: 'GET' },
    ), cleared);
    const hidden = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), hidden);
    check('confirm still works after an informational reply, and completion removes the item',
      heldChunk(afterReply.raw).includes('Needs your OK')
      && confirmed.statusCode === 200
      && confirmed.body.pending
      && confirmed.body.pending.mayAct === true
      && confirmed.body.pending.actionStatus === 'confirmed'
      && bearerConfirm.statusCode === 403
      && done.statusCode === 200
      && done.body.replay === true
      && ackOnly(done.body)
      && !JSON.stringify(done.body).includes('TOKEN-DONE')
      && !JSON.stringify(done.body).includes(phrase)
      && (cleared.body.pending || []).every((row) => row.messageId !== item.messageId)
      && !heldChunk(hidden.raw));
  }

  {
    resetAll();
    const sent = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: { csrf: lib.createCsrfToken(ALLOWED), text: 'Need a catalog status' },
    }), sent);
    const pending = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/pending',
      'api/ceo-bridge/pending',
      { method: 'GET' },
    ), pending);
    const item = pending.body && pending.body.pending && pending.body.pending[0];
    const replied = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/reply',
      'api/ceo-bridge/reply',
      {
        body: {
          threadId: item && item.threadId,
          text: 'Catalog is steady.',
          pendingId: item && item.messageId,
        },
      },
    ), replied);
    const after = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/pending',
      'api/ceo-bridge/pending',
      { method: 'GET' },
    ), after);
    const page = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), page);
    check('a plain question reply still leaves the queue',
      item
      && item.actionRequested === false
      && replied.statusCode === 200
      && !JSON.stringify(replied.body || {}).includes('Catalog is steady')
      && !JSON.stringify(replied.body || {}).includes('Need a catalog status')
      && (after.body.pending || []).every((row) => row.threadId !== item.threadId)
      && !heldChunk(page.raw));
  }

  {
    resetAll();
    const phrase = 'deploy the backup kit';
    const sent = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: { csrf: lib.createCsrfToken(ALLOWED), text: phrase },
    }), sent);
    const pending = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/pending',
      'api/ceo-bridge/pending',
      { method: 'GET' },
    ), pending);
    const item = pending.body && pending.body.pending && pending.body.pending[0];
    const noCsrf = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/api/ceo-bridge/decline',
      query: { area: 'api/ceo-bridge/decline' },
      body: { messageId: item && item.messageId },
    }), noCsrf);
    const bearer = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/decline',
      'api/ceo-bridge/decline',
      { body: { messageId: item && item.messageId } },
    ), bearer);
    const declined = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/api/ceo-bridge/decline',
      query: { area: 'api/ceo-bridge/decline' },
      body: { csrf: lib.createCsrfToken(ALLOWED), messageId: item && item.messageId },
    }), declined);
    const again = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/api/ceo-bridge/confirm',
      query: { area: 'api/ceo-bridge/confirm' },
      body: { csrf: lib.createCsrfToken(ALLOWED), messageId: item && item.messageId },
    }), again);
    const left = mockRes();
    await ops(bridge(
      '/ops/api/ceo-bridge/pending',
      'api/ceo-bridge/pending',
      { method: 'GET' },
    ), left);
    const echo = JSON.stringify(declined.body || {});
    check('decline removes a held CEO item and the bearer cannot decline',
      item
      && noCsrf.statusCode === 403
      && bearer.statusCode === 403
      && bearer.body
      && bearer.body.error === 'agent_denied'
      && declined.statusCode === 200
      && declined.body.ok === true
      && declined.body.pending
      && declined.body.pending.messageId === item.messageId
      && declined.body.pending.actionStatus === 'declined'
      && declined.body.pending.mayAct === false
      && !echo.includes(phrase)
      && !echo.includes('backup')
      && again.statusCode === 404
      && again.body.error === 'pending_not_found'
      && (left.body.pending || []).every((row) => row.messageId !== item.messageId)
      && ceo.ceoBridgeKind({ url: '/ops/api/ceo-bridge/decline', query: { area: 'api/ceo-bridge/decline' } }) === 'decline');
  }

  {
    resetAll();
    const phrase = 'deploy the kit page & "now"';
    const replyText = 'Findings only. RY-HOLD. No deploy.';
    const posted = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/ceo-assign/message',
      query: { area: 'api/ceo-assign/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: phrase,
        assign: 'researchy',
      },
    }), posted);
    const listed = mockRes();
    await ops(bridge(
      '/ops/api/desk-talk/researchy/pending',
      'api/desk-talk/researchy/pending',
      { method: 'GET', query: { area: 'api/desk-talk/researchy/pending', agent: 'researchy' } },
    ), listed);
    const item = listed.body && listed.body.pending && listed.body.pending[0];
    const researchy = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/researchy',
      query: { area: 'chat', agent: 'researchy' },
    }), researchy);
    const tasks = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/tasks',
      query: { area: 'tasks' },
    }), tasks);
    const sales = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/sales',
      query: { area: 'chat', agent: 'sales' },
    }), sales);
    const researchyChunk = heldChunk(researchy.raw);
    const tasksChunk = heldChunk(tasks.raw);
    check('Researchy and Assign views show the held action escaped',
      posted.statusCode === 200
      && item
      && item.actionStatus === 'needs_founder_confirm'
      && researchyChunk.includes('Needs your OK')
      && researchyChunk.includes('deploy the kit page &amp; &quot;now&quot;')
      && !researchyChunk.includes('<script>')
      && researchyChunk.includes(`From ${ALLOWED} · Desk Talk`)
      && researchyChunk.includes('/ops/api/desk-talk/researchy/confirm')
      && researchyChunk.includes('/ops/api/desk-talk/researchy/decline')
      && researchyChunk.includes('>Confirm<')
      && researchyChunk.includes('>Decline<')
      && String(researchy.raw).includes('ops-held-actions.js')
      && tasksChunk.includes('Needs your OK')
      && tasksChunk.includes('deploy the kit page &amp; &quot;now&quot;')
      && tasksChunk.includes('/ops/api/desk-talk/researchy/confirm')
      && !heldChunk(sales.raw));

    const replied = mockRes();
    await ops(bridge(
      '/ops/api/desk-talk/researchy/reply',
      'api/desk-talk/researchy/reply',
      {
        query: { area: 'api/desk-talk/researchy/reply', agent: 'researchy' },
        body: {
          threadId: item.threadId,
          text: replyText,
          pendingId: item.messageId,
          correlationId: item.correlationId,
        },
      },
    ), replied);
    const still = mockRes();
    await ops(bridge(
      '/ops/api/desk-talk/researchy/pending',
      'api/desk-talk/researchy/pending',
      { method: 'GET', query: { area: 'api/desk-talk/researchy/pending', agent: 'researchy' } },
    ), still);
    const held = still.body && still.body.pending && still.body.pending[0];
    const echo = JSON.stringify(replied.body || {});
    check('Researchy reply does not drop a held item and returns no raw text',
      replied.statusCode === 200
      && replied.body.ok === true
      && replied.body.replay === false
      && replied.body.lead === 'researchy'
      && ackOnly(replied.body)
      && !echo.includes(phrase)
      && !echo.includes('RY-HOLD')
      && !echo.includes('Founder ask')
      && !echo.includes('kit page')
      && !replied.body.task
      && !replied.body.thread
      && !replied.body.brief
      && !replied.body.text
      && held
      && held.messageId === item.messageId
      && held.mayAct === false
      && held.actionStatus === 'needs_founder_confirm');

    const confirmed = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/api/desk-talk/researchy/confirm',
      query: { area: 'api/desk-talk/researchy/confirm', agent: 'researchy' },
      body: { csrf: lib.createCsrfToken(ALLOWED), messageId: item.messageId },
    }), confirmed);
    const declined = mockRes();
    await ops(authed({
      method: 'POST',
      url: '/ops/api/desk-talk/researchy/decline',
      query: { area: 'api/desk-talk/researchy/decline', agent: 'researchy' },
      body: { csrf: lib.createCsrfToken(ALLOWED), messageId: item.messageId },
    }), declined);
    const bearer = mockRes();
    await ops(bridge(
      '/ops/api/desk-talk/researchy/decline',
      'api/desk-talk/researchy/decline',
      {
        query: { area: 'api/desk-talk/researchy/decline', agent: 'researchy' },
        body: { messageId: item.messageId },
      },
    ), bearer);
    const left = mockRes();
    await ops(bridge(
      '/ops/api/desk-talk/researchy/pending',
      'api/desk-talk/researchy/pending',
      { method: 'GET', query: { area: 'api/desk-talk/researchy/pending', agent: 'researchy' } },
    ), left);
    const tasksAfter = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/tasks',
      query: { area: 'tasks' },
    }), tasksAfter);
    check('Researchy confirm then decline removes the held assign',
      confirmed.statusCode === 200
      && confirmed.body.pending
      && confirmed.body.pending.mayAct === true
      && confirmed.body.pending.actionStatus === 'confirmed'
      && declined.statusCode === 200
      && declined.body.pending.actionStatus === 'declined'
      && declined.body.pending.mayAct === false
      && !JSON.stringify(declined.body).includes('kit page')
      && !JSON.stringify(declined.body).includes('RY-HOLD')
      && bearer.statusCode === 403
      && (left.body.pending || []).every((row) => row.messageId !== item.messageId)
      && !heldChunk(tasksAfter.raw));
  }

  let failed = 0;
  for (const row of results) {
    console.log((row.pass ? 'PASS' : 'FAIL') + ' - ' + row.name);
    if (!row.pass) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
