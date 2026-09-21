// Slice 2 — CEO Assign → Researchy child + CEO synthesize.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const desks = require(path.join(opsDir, '_agent_thread.js'));
const assign = require(path.join(opsDir, '_assign.js'));
const office = require(path.join(opsDir, '_office.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';

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
  const headers = Object.assign({
    cookie: cookieFor(ALLOWED),
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

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.OPS_CEO_BRIDGE_SECRET = BRIDGE_SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();
  ceo.resetCeoBridge();
  desks.resetDeskTalk();

  check('NL assign detects /assign and assign to researchy',
    assign.looksLikeAssign({ text: '/assign find ThinkPad suppliers' }) === true
    && assign.looksLikeAssign({ text: 'Please assign this to researchy: source docks' }) === true
    && assign.looksLikeAssign({ assign: 'researchy', text: 'source docks' }) === true
    && assign.looksLikeAssign({ text: 'What is the current goal?' }) === false);

  check('assign brief strips the command prefix',
    assign.parseAssignBrief('/assign find ThinkPad suppliers').brief === 'find ThinkPad suppliers'
    && assign.parseAssignBrief('assign to researchy: source docks').title === 'source docks');
  check('assign titles are Assign N — topic ≤6 words, not the full brief',
    assign.formatAssignTitle(3, 'source Apple products for Freetown enterprise quotes now') === 'Assign 3 — source Apple products for Freetown enterprise'
    && assign.topicWords('source Apple products for Freetown enterprise quotes now') === 'source Apple products for Freetown enterprise'
    && !assign.formatAssignTitle(1, 'a very long founder brief about everything').includes('everything'));

  {
    const page = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), page);
    const html = String(page.raw);
    check('A) CEO Talk first paint has Assign to Researchy next to Send',
      page.statusCode === 200
      && html.includes('Assign to Researchy')
      && html.includes('id="ceo-assign-researchy"')
      && html.includes('<button class="btn" type="submit">Send</button>')
      && html.indexOf('id="ceo-assign-researchy"') > html.indexOf('ceo-bridge-form')
      && html.includes('/ops/ceo-assign/message')
      && html.includes('"assignUrl":"/ops/ceo-assign/message"')
      && html.includes('/assets/js/ops-ceo-chat.js?v=assign-fix'));

    const researchy = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/researchy',
      query: { area: 'chat', agent: 'researchy' },
    }), researchy);
    const researchyHtml = String(researchy.raw);
    check('Researchy Talk has no Assign control and never polls ceo-bridge',
      researchy.statusCode === 200
      && !researchyHtml.includes('Assign to Researchy')
      && !researchyHtml.includes('/ops/ceo-assign/')
      && !researchyHtml.includes('/ops/ceo-bridge/thread')
      && !researchyHtml.includes('/ops/api/ceo-bridge/')
      && researchyHtml.includes('data-talk-agent="researchy"')
      && researchyHtml.includes('desk Talk does not use ceo-bridge')
      && researchyHtml.includes('/ops/desk-talk/researchy/thread'));
  }

  {
    process.env.XAI_API_KEY = 'test-xai-key-not-real';
    const seen = { researchy: 0, ceo: 0, other: 0, urls: [] };
    global.fetch = async (url, opts) => {
      seen.urls.push(String(url));
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const system = body.messages && body.messages[0] ? String(body.messages[0].content) : '';
      if (String(url).includes('ceo-bridge') || String(url).includes('ceo-assign')) {
        seen.other += 1;
      }
      if (system.includes('synthesizing Researchy')) {
        seen.ceo += 1;
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'CEO synthesis: Researchy found quote-first leads. Next: pick one vendor to validate. Not a raw dump.' } }] }),
        };
      }
      if (system.includes('You are Researchy')) {
        seen.researchy += 1;
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'Researchy draft: two possible docks, no landed cost invented.' } }] }),
        };
      }
      seen.other += 1;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Unexpected desk.' } }] }),
      };
    };

    const posted = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/ceo-assign/message',
      query: { area: 'api/ceo-assign/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: 'assign to researchy: source ThinkPad docks',
        correlationId: 'assign-corr-1',
        assign: 'researchy',
      },
    }), posted);

    const task = posted.body && posted.body.task;
    const ceoMessages = posted.body && posted.body.thread && posted.body.thread.messages
      ? posted.body.thread.messages
      : [];
    check('B) child task has short Assign N title, parent link, and Doing',
      posted.statusCode === 200
      && posted.body.ok === true
      && posted.body.assignee === 'researchy'
      && task
      && /^Assign 1 — /.test(task.title)
      && task.title.split('—')[1].trim().split(/\s+/).length <= 6
      && !task.title.includes('assign to researchy')
      && task.ownerAgentId === 'researchy'
      && task.parentThreadId === posted.body.thread.id
      && task.parentCorrelationId === 'assign-corr-1'
      && task.childThreadId
      && task.childCorrelationId
      && task.assignStatus === 'assigned'
      && task.status === 'doing'
      && task.status !== 'done'
      && task.brief.includes('Founder ask:')
      && task.brief.includes('Sierra Leone')
      && task.brief.includes('Quote-first')
      && task.brief.includes('source ThinkPad docks'));

    const pending = await ceo.listPending();
    const researchyPending = store.listResearchyPending(await store.readStore());
    check('Assign does not wake CEO B2 pending',
      pending.ok === true && pending.pending.length === 0);
    check('Assign wakes Researchy Grok pending with the packed brief',
      posted.body.wake === 'researchy-pending'
      && researchyPending.length === 1
      && researchyPending[0].text.includes('Locked LAVAALL company context')
      && researchyPending[0].taskId === task.id);

    const inspectedDesk = await desks.inspectDeskThread('researchy', task.childThreadId);
    const deskFounder = (inspectedDesk.thread.messages || []).find((item) => item.role === 'founder');
    const deskAssistant = (inspectedDesk.thread.messages || []).find((item) => item.role === 'assistant');
    check('C) assign does not auto-run in-OS Researchy xAI',
      inspectedDesk.thread.agentId === 'researchy'
      && deskFounder
      && /Assigned from LAVAALL CEO/.test(deskFounder.text)
      && /source ThinkPad docks/.test(deskFounder.text)
      && !deskAssistant
      && seen.researchy === 0
      && !posted.body.deskReply);

    check('A/NL) CEO thread has the assign ack, not a raw specialist dump only',
      ceoMessages.some((item) => item.role === 'founder' && item.text.includes('source ThinkPad docks'))
      && ceoMessages.some((item) => item.role === 'ceo' && /Assigned to Researchy/.test(item.text))
      && !ceoMessages.some((item) => /Researchy draft/.test(item.text)));

    const denied = mockRes();
    await ops({
      method: 'GET',
      headers: { host: 'preview.example.test', accept: 'application/json' },
      query: { area: 'api/desk-talk/researchy/pending', agent: 'researchy' },
      url: '/ops/api/desk-talk/researchy/pending',
    }, denied);
    check('Researchy pending without bearer is 401', denied.statusCode === 401);

    const listed = mockRes();
    await ops({
      method: 'GET',
      headers: {
        host: 'preview.example.test',
        accept: 'application/json',
        authorization: `Bearer ${BRIDGE_SECRET}`,
      },
      query: { area: 'api/desk-talk/researchy/pending', agent: 'researchy' },
      url: '/ops/api/desk-talk/researchy/pending',
    }, listed);
    check('Researchy Grok Bot lists the assign wake inbox',
      listed.statusCode === 200
      && listed.body.ok === true
      && listed.body.lead === 'researchy'
      && listed.body.pending.some((item) => item.taskId === task.id));

    const replied = mockRes();
    await ops({
      method: 'POST',
      headers: {
        host: 'preview.example.test',
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${BRIDGE_SECRET}`,
      },
      query: { area: 'api/desk-talk/researchy/reply', agent: 'researchy' },
      url: '/ops/api/desk-talk/researchy/reply',
      body: {
        threadId: task.childThreadId,
        correlationId: task.childCorrelationId,
        text: 'Two quote-first dock options in Freetown. No landed cost invented.',
      },
    }, replied);
    const afterStore = await store.readStore();
    const saved = afterStore.tasks.find((row) => row.id === task.id);
    const ceoInspectEarly = await ceo.inspectCeoThread(posted.body.thread.id);
    const foundNote = (ceoInspectEarly.thread.messages || []).find((item) => /Based on that, recommend/i.test(item.text));
    check('D) Researchy reply writes results-only into CEO Talk and Ready for review',
      replied.statusCode === 200
      && replied.body.ok === true
      && saved.assignStatus === 'ready_for_review'
      && saved.status === 'doing'
      && saved.nextAction === 'Ready for review'
      && /Found:/.test(saved.result)
      && /awaiting your OK/i.test(saved.result)
      && foundNote
      && foundNote.provenance === 'grok_bot_bridge'
      && !/methodology|I searched|OK Researchy/i.test(foundNote.text));

    const researchyPage = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/researchy',
      query: { area: 'chat', agent: 'researchy' },
    }), researchyPage);
    check('C) Researchy Talk page shows the assigned child work',
      String(researchyPage.raw).includes('Assigned from LAVAALL CEO')
      && String(researchyPage.raw).includes('source ThinkPad docks')
      && String(researchyPage.raw).includes(`<h1>${office.officeAgentById('researchy').name}</h1>`));

    const tasksPage = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/tasks',
      query: { area: 'tasks' },
    }), tasksPage);
    check('B) tasks list shows short title, Researchy owner, and full brief',
      String(tasksPage.raw).includes('Assign 1 —')
      && String(tasksPage.raw).includes('owner researchy')
      && String(tasksPage.raw).includes(`parent ${task.parentThreadId}`)
      && String(tasksPage.raw).includes('Ready for review')
      && String(tasksPage.raw).includes('Full brief + context')
      && String(tasksPage.raw).includes('Sierra Leone'));

    check('E) default assign does not call in-OS Researchy xAI',
      seen.researchy === 0
      && seen.ceo === 0
      && seen.other === 0);

    const nl = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: '/assign source USB-C hubs',
        correlationId: 'assign-corr-nl',
      },
    }), nl);
    check('NL assign on the CEO message path still creates a Researchy child',
      nl.statusCode === 200
      && nl.body.assigned === true
      && nl.body.task
      && nl.body.task.ownerAgentId === 'researchy'
      && nl.body.task.parentCorrelationId === 'assign-corr-nl'
      && /^Assign 2 — /.test(nl.body.task.title));

    const technical = await assign.assignToResearchy({
      text: 'source docks',
      founderEmail: ALLOWED,
      assignee: 'technical',
    });
    check('Technical is not an Assign target in this slice',
      technical.error === 'invalid_assignee');

    const ceoInspect = await ceo.inspectCeoThread(posted.body.thread.id);
    const notice = (ceoInspect.thread.messages || []).find((item) => /Assigned to Researchy/.test(item.text));
    const synthOwned = (ceoInspect.thread.messages || []).find((item) => /CEO synthesis/.test(item.text));
    check('provenance is tool for the assign ack and grok_bot_bridge for results',
      notice && notice.provenance === 'tool'
      && !synthOwned);

    delete process.env.XAI_API_KEY;
    global.fetch = origFetch;
  }

  {
    const src = fs.readFileSync(path.join(opsDir, '_assign.js'), 'utf8');
    const vercel = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
    const chatJs = fs.readFileSync(path.join(__dirname, '../assets/js/ops-ceo-chat.js'), 'utf8');
    const note = fs.readFileSync(path.join(__dirname, '../docs/OPS-CEO-BRIDGE.md'), 'utf8');
    check('assign module extends KV tasks and desk-talk, not a second store',
      src.includes("require('./_store')")
      && src.includes("require('./_agent_thread')")
      && src.includes('enqueuePending: false')
      && src.includes('completeXai: false')
      && src.includes("agentId: RESEARCHY_ID")
      && !src.includes('gmail')
      && !src.includes('sendMail')
      && !src.includes('confirmInboxSend'));
    check('vercel rewrites ceo-assign before the catch-all',
      vercel.includes('/ops/ceo-assign/:kind')
      && vercel.includes('/ops/api/ceo-assign/:kind')
      && vercel.indexOf('/ops/ceo-assign/:kind') < vercel.indexOf('/ops/:path*'));
    check('Talk JS routes Assign from CEO only and never lets non-CEO poll ceo-bridge',
      chatJs.includes('function assignPostUrl()')
      && chatJs.includes('function looksLikeAssignText(')
      && chatJs.includes("postUrl.indexOf('ceo-assign')")
      && chatJs.includes("isDeskTalk() && url.indexOf('/ops/desk-talk/')")
      && chatJs.includes('/ceo-bridge/i.test(url) && !isCeoTalk()')
      && !chatJs.includes('/ops/api/ceo-bridge'));
    check('docs include Slice 2 assign smoke and Researchy Grok wake',
      note.includes('Slice 2')
      && note.includes('Assign to Researchy')
      && note.includes('/ops/ceo-assign/message')
      && note.includes('Specialist done is not task done')
      && note.includes('/ops/api/desk-talk/researchy/pending')
      && note.includes('/ops/api/desk-talk/researchy/reply')
      && note.includes('Assign N'));
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home);
  }

  global.fetch = origFetch;
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
