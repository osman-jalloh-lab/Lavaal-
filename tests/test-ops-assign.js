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
    && assign.looksLikeAssign({ text: 'What is the current goal?' }) === false
    && assign.looksLikeAssign({ text: 'how can we leverage LAVAALL better?' }) === false);

  check('Send routing keeps generic/leverage with CEO and Researchy for sourcing only',
    assign.routeCeoSend({ text: 'how can we leverage LAVAALL better?' }).action === 'ceo'
    && assign.routeCeoSend({ text: 'how can we leverage LAVAALL better?' }).suggest === 'growth'
    && assign.routeCeoSend({ assign: 'researchy', text: 'how can we leverage LAVAALL better?' }).action === 'ceo'
    && assign.looksLikeExplicitAssignText({ text: 'how can we leverage LAVAALL better?' }) === false
    && assign.routeCeoSend({ text: 'What is the current goal?' }).action === 'ceo'
    && assign.routeCeoSend({ text: 'source ThinkPad docks' }).action === 'assign-researchy'
    && assign.routeCeoSend({ text: 'research USB-C hub suppliers' }).action === 'assign-researchy'
    && assign.routeCeoSend({ text: 'source a customer quote in Freetown' }).action === 'ceo'
    && assign.routeCeoSend({ text: 'the checkout bug on product pages' }).action === 'ceo'
    && assign.routeCeoSend({ text: '/assign source USB-C hubs' }).action === 'assign-researchy'
    && assign.routeCeoSend({ text: 'assign to researchy: source docks' }).reason === 'explicit');

  check('assign brief strips the command prefix',
    assign.parseAssignBrief('/assign find ThinkPad suppliers').brief === 'find ThinkPad suppliers'
    && /thinkpad|docks|suppliers/i.test(assign.parseAssignBrief('assign to researchy: source docks').title)
    && assign.parseAssignBrief('assign to researchy: source docks').title.split(/\s+/).length <= 6
    && !/^source\b/i.test(assign.parseAssignBrief('assign to researchy: source docks').title));
  check('assign titles are Assign N — topic ≤6 words, not the full brief',
    /^Assign 3 — /.test(assign.formatAssignTitle(3, 'source Apple products for Freetown enterprise quotes now'))
    && /Apple/i.test(assign.formatAssignTitle(3, 'source Apple products for Freetown enterprise quotes now'))
    && assign.formatAssignTitle(3, 'source Apple products for Freetown enterprise quotes now').split('—')[1].trim().split(/\s+/).length <= 6
    && !assign.formatAssignTitle(1, 'a very long founder brief about everything').includes('everything'));
  {
    const longTitle = assign.formatAssignTitle(1, 'Please go look for wholesale Apple products we can quote in Freetown for enterprise buyers this week');
    check('long brief becomes a short noun-ish title',
      longTitle === 'Assign 1 — Apple products' || longTitle === 'Assign 1 — Apple sourcing');
  }
  check('source Apple products title contains Apple and is ≤6 words after the dash', (() => {
    const title = assign.formatAssignTitle(1, 'source Apple products');
    const topic = title.split('—')[1] ? title.split('—')[1].trim() : '';
    return /^Assign 1 — /.test(title)
      && /Apple/i.test(topic)
      && topic.split(/\s+/).length <= 6
      && (topic === 'Apple products' || topic === 'Apple sourcing');
  })());
  check('assign topic does not start with Please or go look',
    !/^(Please|go look)\b/i.test(assign.topicWords('Please go look for wholesale Apple'))
    && !/^Assign \d+ — Please\b/i.test(assign.formatAssignTitle(1, 'Please go look for wholesale Apple'))
    && !/^Assign \d+ — go look\b/i.test(assign.formatAssignTitle(1, 'Please go look for wholesale Apple'))
    && /Apple/i.test(assign.formatAssignTitle(1, 'Please go look for wholesale Apple')));
  check('into Cisco router Guinea drops the leftover preposition',
    assign.formatAssignTitle(2, 'into Cisco router Guinea') === 'Assign 2 — Cisco router Guinea'
    && assign.topicWords('look into Cisco router Guinea') === 'Cisco router Guinea'
    && !/\binto\b/i.test(assign.formatAssignTitle(2, 'into Cisco router Guinea')));

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
      && html.includes('type="button"')
      && html.includes('id="ceo-send"')
      && html.includes('name="intent" value="send"')
      && html.includes('<button class="btn" type="submit" name="intent" value="send" id="ceo-send" data-intent="send">Send</button>')
      && html.indexOf('id="ceo-assign-researchy"') > html.indexOf('ceo-bridge-form')
      && html.includes('/ops/ceo-assign/message')
      && html.includes('"assignUrl":"/ops/ceo-assign/message"')
      && html.includes('/assets/js/ops-ceo-chat.js?v=send-not-assign')
      && html.includes('id="talk-mic"'));

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
      && /ThinkPad/i.test(task.title)
      && task.title.split('—')[1].trim().split(/\s+/).length <= 6
      && !/Please|go look|assign to researchy/i.test(task.title.split('—')[1])
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
      && String(tasksPage.raw).includes('Owner: Researchy')
      && !String(tasksPage.raw).includes(`parent ${task.parentThreadId}`)
      && !String(tasksPage.raw).includes('owner researchy')
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
    store.resetStore();
    ceo.resetCeoBridge();
    desks.resetDeskTalk();
    process.env.XAI_API_KEY = 'test-xai-key-not-real';
    let xaiCalls = 0;
    global.fetch = async (url, opts) => {
      xaiCalls += 1;
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const system = body.messages && body.messages[0] ? String(body.messages[0].content) : '';
      if (system.includes('You are LAVAALL CEO')) {
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'Use Growth for brand leverage. Do not invent spend.' } }] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Unexpected desk.' } }] }),
      };
    };

    const leaked = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: 'how can we leverage LAVAALL better?',
        assign: 'researchy',
        assignee: 'researchy',
        correlationId: 'send-not-assign-1',
      },
    }), leaked);
    const leakedTasks = (await store.readStore()).tasks || [];
    const leakedPending = store.listResearchyPending(await store.readStore());
    const leakedCeo = (leaked.body.thread && leaked.body.thread.messages || []).filter((item) => item.role === 'ceo');
    check('Send does not auto-assign Researchy even if assign=researchy leaked',
      leaked.statusCode === 200
      && leaked.body.ok === true
      && leaked.body.assigned !== true
      && !leaked.body.task
      && leakedTasks.length === 0
      && leakedPending.length === 0
      && leakedCeo.length === 1
      && leakedCeo[0].text.includes('Use Growth for brand leverage')
      && xaiCalls === 1
      && !leakedCeo.some((item) => /Assigned to Researchy/i.test(item.text)));

    const cleanSend = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: 'how can we leverage LAVAALL better?',
        correlationId: 'send-not-assign-2',
      },
    }), cleanSend);
    check('plain CEO Send answers via xAI and creates no Researchy child',
      cleanSend.statusCode === 200
      && cleanSend.body.assigned !== true
      && !cleanSend.body.task
      && ((await store.readStore()).tasks || []).length === 0
      && store.listResearchyPending(await store.readStore()).length === 0
      && xaiCalls === 2);

    const routed = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: 'source ThinkPad docks for Freetown quotes',
        correlationId: 'send-route-researchy-1',
      },
    }), routed);
    check('Send routes a clear sourcing ask to Researchy only',
      routed.statusCode === 200
      && routed.body.assigned === true
      && routed.body.task
      && routed.body.task.ownerAgentId === 'researchy'
      && /^Assign 1 — /.test(routed.body.task.title)
      && /ThinkPad/i.test(routed.body.task.title)
      && store.listResearchyPending(await store.readStore()).length === 1);

    const button = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/ceo-assign/message',
      query: { area: 'api/ceo-assign/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: 'look into local UGC partners',
        assign: 'researchy',
        assignee: 'researchy',
        correlationId: 'assign-button-intentional-1',
      },
    }), button);
    check('Assign to Researchy button still creates an intentional child',
      button.statusCode === 200
      && button.body.assigned === true
      && button.body.task
      && button.body.task.ownerAgentId === 'researchy'
      && /^Assign 2 — /.test(button.body.task.title));

    delete process.env.XAI_API_KEY;
    global.fetch = origFetch;
  }

  {
    store.resetStore();
    ceo.resetCeoBridge();
    desks.resetDeskTalk();
    const sharedThread = 'researchy-2ccd9aac6cff1126';
    const createdA = await store.addTask({
      title: 'Assign 1 — Starlink Liberia',
      nextAction: 'Researchy working',
      status: 'doing',
      createdBy: ALLOWED,
      ownerAgentId: 'researchy',
      childThreadId: sharedThread,
      childCorrelationId: 'corr-starlink-a',
      assignStatus: 'assigned',
      brief: 'Starlink Liberia',
    });
    const createdB = await store.addTask({
      title: 'Assign 2 — Cisco Guinea',
      nextAction: 'Researchy working',
      status: 'doing',
      createdBy: ALLOWED,
      ownerAgentId: 'researchy',
      childThreadId: sharedThread,
      childCorrelationId: 'corr-cisco-b',
      assignStatus: 'assigned',
      brief: 'Cisco Guinea',
    });
    const taskA = createdA.task;
    const taskB = createdB.task;
    await store.enqueueResearchyPending({
      threadId: sharedThread,
      founderEmail: ALLOWED,
      taskId: taskA.id,
      messageId: taskA.childCorrelationId,
      correlationId: taskA.childCorrelationId,
      text: 'Starlink Liberia brief',
    });
    await store.enqueueResearchyPending({
      threadId: sharedThread,
      founderEmail: ALLOWED,
      taskId: taskB.id,
      messageId: taskB.childCorrelationId,
      correlationId: taskB.childCorrelationId,
      text: 'Cisco Guinea brief',
    });

    const replyA = await assign.postResearchyReply({
      threadId: sharedThread,
      correlationId: taskA.childCorrelationId,
      text: 'Starlink coverage looks quote-first.',
    });
    const afterA = await store.readStore();
    const savedA = afterA.tasks.find((row) => row.id === taskA.id);
    const savedB = afterA.tasks.find((row) => row.id === taskB.id);
    const leftover = store.listResearchyPending(afterA);
    check('shared Researchy thread: A correlation updates A only',
      replyA.ok === true
      && replyA.error !== 'assign_not_found'
      && replyA.task
      && replyA.task.id === taskA.id
      && savedA.assignStatus === 'ready_for_review'
      && /Starlink/i.test(savedA.result)
      && savedB.assignStatus === 'assigned'
      && !savedB.result
      && leftover.length === 1
      && leftover[0].taskId === taskB.id);

    const guess = await assign.postResearchyReply({
      threadId: sharedThread,
      text: 'Should not attach to Cisco Guinea.',
    });
    const afterGuess = await store.readStore();
    const stillA = afterGuess.tasks.find((row) => row.id === taskA.id);
    const stillB = afterGuess.tasks.find((row) => row.id === taskB.id);
    check('shared Researchy thread: threadId-only reply does not attach to B',
      guess.error === 'assign_not_found'
      && stillB.assignStatus === 'assigned'
      && !stillB.result
      && stillA.assignStatus === 'ready_for_review');

    const wrongPending = await assign.postResearchyReply({
      threadId: sharedThread,
      pendingId: 'not-a-real-pending',
      text: 'Wrong pending must not steal leftover B.',
    });
    const afterWrong = await store.readStore();
    check('shared Researchy thread: unknown pending does not fall back to leftover B',
      wrongPending.error === 'assign_not_found'
      && afterWrong.tasks.find((row) => row.id === taskB.id).assignStatus === 'assigned'
      && !afterWrong.tasks.find((row) => row.id === taskB.id).result
      && store.listResearchyPending(afterWrong).length === 1
      && store.listResearchyPending(afterWrong)[0].taskId === taskB.id);

    const progressSkip = await assign.noteDeskProgress({
      agentId: 'researchy',
      threadId: sharedThread,
      resultText: 'Desk progress without correlation',
      waiting: false,
    });
    check('noteDeskProgress skips when only shared threadId is present',
      progressSkip.ok === true
      && progressSkip.skipped === true
      && (await store.readStore()).tasks.find((row) => row.id === taskB.id).assignStatus === 'assigned');

    const progressB = await assign.noteDeskProgress({
      agentId: 'researchy',
      threadId: sharedThread,
      correlationId: taskB.childCorrelationId,
      resultText: 'Cisco Guinea findings only.',
      waiting: false,
    });
    const afterProgress = await store.readStore();
    const progressedB = afterProgress.tasks.find((row) => row.id === taskB.id);
    const progressedA = afterProgress.tasks.find((row) => row.id === taskA.id);
    check('noteDeskProgress with B correlation updates B only',
      progressB.ok === true
      && progressB.task
      && progressB.task.id === taskB.id
      && progressedB.assignStatus === 'ready_for_review'
      && /Cisco Guinea/i.test(progressedB.result)
      && progressedA.assignStatus === 'ready_for_review'
      && /Starlink/i.test(progressedA.result));
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
      && chatJs.includes('function isSendSubmitter(')
      && chatJs.includes('function isAssignSubmitter(')
      && chatJs.includes('async function postTalk(')
      && chatJs.includes("postUrl.indexOf('ceo-assign')")
      && chatJs.includes("isDeskTalk() && url.indexOf('/ops/desk-talk/')")
      && chatJs.includes('/ceo-bridge/i.test(url) && !isCeoTalk()')
      && !chatJs.includes('/ops/api/ceo-bridge'));
    check('vercel allows microphone on /ops and keeps it off elsewhere',
      vercel.includes('microphone=(self)')
      && vercel.includes('"source": "/ops(.*)"')
      && /"source": "\/\(\.\*\)"[\s\S]*microphone=\(\)/.test(vercel));
    check('docs include Slice 2 assign smoke and Researchy Grok wake',
      note.includes('Slice 2')
      && note.includes('Assign to Researchy')
      && note.includes('/ops/ceo-assign/message')
      && note.includes('Does **not** auto-assign Researchy')
      && note.includes('how can we leverage LAVAALL better?')
      && note.includes('Specialist done is not task done')
      && note.includes('/ops/api/desk-talk/researchy/pending')
      && note.includes('/ops/api/desk-talk/researchy/reply')
      && note.includes('Assign N')
      && note.includes('https://www.lavaall.com/ops/api/desk-talk/researchy/pending')
      && note.includes('https://www.lavaall.com/ops/api/desk-talk/researchy/reply')
      && note.includes('Never attach a reply by desk threadId alone')
      && note.includes('Preview branch URLs may 410')
      && !note.includes('GET {PREVIEW_ORIGIN}/ops/api/desk-talk/researchy/pending')
      && !note.includes('POST {PREVIEW_ORIGIN}/ops/api/desk-talk/researchy/reply'));
    check('assign matcher does not fall through to shared childThreadId or leftover pending',
      src.includes('function matchAssignTask(')
      && !src.includes('listResearchyPending(storeData)[0]')
      && !src.includes("row.childThreadId === threadId && row.assignStatus === 'assigned'")
      && !src.includes('row.childThreadId === childId'));
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
