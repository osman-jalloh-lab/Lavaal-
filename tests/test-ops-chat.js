// Ticket 05 — contextual chat: context selection, no fake replies, no auto-send.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const chat = require(path.join(opsDir, '_chat.js'));
const ops = require(path.join(opsDir, 'index.js'));
const ceoBridge = require(path.join(opsDir, '_ceo_bridge.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
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
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: {
      cookie: cookieFor(ALLOWED),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'text/html',
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/chat',
    body: extra && extra.body,
  };
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();
  ceoBridge.resetCeoBridge();

  {
    const html = mockRes();
    await ops(authed({ json: false, url: '/ops/chat', query: { area: 'chat' } }), html);
    const page = String(html.raw);
    check('bare /ops/chat redirects to Office',
      html.statusCode === 302 && html.headers.Location === '/ops/office');
    check('bare /ops/chat does not render Helper or Everyone',
      !page.includes('<h1>Chat</h1>')
      && !page.includes('<h2>Helper</h2>')
      && !page.includes('This tab talks to everyone')
      && !page.includes('Helper connected'));
  }

  {
    store.resetStore();
    await store.saveGoal({
      title: 'Ship /ops chat',
      definitionOfDone: 'Founders can ask the next step',
      nextStep: 'Select the goal and ask what is the next step',
    });
    const task = await store.addTask({ title: 'Wire the front door', nextAction: 'Open /ops/chat', createdBy: ALLOWED });
    const live = await store.addNote({ title: 'Prefer WhatsApp', body: 'After the email pack', createdBy: ALLOWED });
    const dead = await store.addNote({ title: 'Old preference', body: 'Should not be selectable', createdBy: ALLOWED });
    await store.deleteNote(dead.note.id);
    const ctx = store.resolveChatContext(await store.readStore(), {
      useGoal: '1',
      taskId: task.task.id,
      noteId: live.note.id,
    });
    const blocked = store.resolveChatContext(await store.readStore(), {
      useGoal: '1',
      noteId: dead.note.id,
    });
    check('context selection attaches saved goal, task, and live note',
      ctx.selected && ctx.goal.title === 'Ship /ops chat' && ctx.tasks[0].title === 'Wire the front door' && ctx.notes[0].title === 'Prefer WhatsApp');
    check('deleted notes cannot be selected for chat',
      blocked.notes.length === 0 && store.notesSelectableForChat(await store.readStore()).every((note) => note.id !== dead.note.id));
  }

  {
    const before = await store.readStore();
    const goalTitle = before.goal.title;
    const noteCount = before.notes.length;
    const asked = await chat.sendChatTurn({
      question: 'What is the next step?',
      selection: { useGoal: '1' },
      createdBy: ALLOWED,
    });
    const after = await store.readStore();
    check('next-step question uses the selected goal record',
      asked.ok && asked.grounded === true && asked.reply.includes('Select the goal and ask what is the next step') && asked.reply.includes('Ship /ops chat'));
    check('send-chat does not auto-mutate goal, tasks, or notes',
      after.goal.title === goalTitle && after.notes.length === noteCount && after.goal.nextStep === before.goal.nextStep);
    check('CEO router stays lead on the turn', asked.route.leadAgent === 'lavaall-ceo');
    const pinned = await chat.sendChatTurn({
      question: 'What is the next step?',
      selection: { useGoal: '1' },
      createdBy: ALLOWED,
      agentId: 'sales',
    });
    check('Talk pins the existing sales chat without a second system',
      pinned.ok && pinned.route.leadAgent === 'sales' && pinned.route.mode === 'agent');
    const researchyPin = await chat.sendChatTurn({
      question: 'What is the next step?',
      selection: { useGoal: '1' },
      createdBy: ALLOWED,
      agentId: 'researchy',
    });
    check('Researchy Talk pins Researchy',
      researchyPin.ok && researchyPin.route.leadAgent === 'researchy' && researchyPin.route.mode === 'agent');
    const ignored = await chat.sendChatTurn({
      question: 'What is the next step?',
      selection: { useGoal: '1' },
      createdBy: ALLOWED,
      agentId: 'not-a-desk',
    });
    check('unknown desks do not pin Talk',
      ignored.ok && ignored.route.leadAgent === 'lavaall-ceo' && ignored.route.mode !== 'agent');
  }

  {
    let fetchCalls = 0;
    global.fetch = async () => { fetchCalls += 1; return { ok: true, json: async () => ({}) }; };
    const unconfigured = await chat.sendChatTurn({
      question: 'Write a poem about servers and invent a list price.',
      selection: { useGoal: '1' },
      createdBy: ALLOWED,
    });
    check('unconfigured non-grounded ask returns setup and does not call a model',
      unconfigured.ok && unconfigured.setup === true && fetchCalls === 0 && unconfigured.usedModel === false);
    check('unconfigured reply does not invent an answer',
      unconfigured.reply.includes('No reply was invented') && !/once upon|here is a poem|\$\d+/i.test(unconfigured.reply));
    global.fetch = origFetch;
  }

  {
    const src = fs.readFileSync(path.join(opsDir, '_chat.js'), 'utf8');
    check('chat bridge never imports mail or deploy senders',
      !src.includes('_gmail') && !src.includes('RESEND') && !src.includes('chat.postMessage') && !src.includes('createDeployment'));
  }

  {
    store.resetStore();
    await store.addChatProposals([{ kind: 'add-note', title: 'Drafted fact', body: 'Only after confirm', source: 'chat' }]);
    const pending = store.pendingProposals(await store.readStore());
    const mid = await store.readStore();
    check('a chat draft does not write the note yet',
      pending.length === 1 && mid.notes.length === 0);
    const confirmed = await store.confirmChatProposal(pending[0].id, { approvedBy: ALLOWED });
    const after = await store.readStore();
    check('confirm-proposal is required to persist a drafted note',
      confirmed.ok && after.notes[0].title === 'Drafted fact' && store.pendingProposals(after).length === 0);
  }

  {
    store.resetStore();
    await store.saveGoal({ title: 'Preview goal', nextStep: 'Ask chat' });
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/chat', query: { area: 'chat' } }), page);
    check('bare chat GET still redirects after a goal is saved',
      page.statusCode === 302 && page.headers.Location === '/ops/office');
    const sent = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/chat',
      body: { action: 'send-chat', message: 'What is the next step?', useGoal: '1' },
    }), sent);
    check('HTTP send-chat returns the stored next step',
      sent.statusCode === 200 && sent.body.ok === true && sent.body.reply.includes('Ask chat'));
  }

  {
    const talk = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat?agent=sales',
      query: { area: 'chat', agent: 'sales' },
    }), talk);
    const html = String(talk.raw);
    check('Talk from Office opens desk Talk for that agent',
      html.includes('<h1>LAVAALL Sales &amp; Customer Success</h1>')
      && html.includes('name="agentId" value="sales"')
      && html.includes('/ops/desk-talk/sales/message')
      && !html.includes('This desk uses Office Talk')
      && !html.includes('<div class="kicker">LAVAALL CEO</div>')
      && !html.includes('<h2>Helper</h2>')
      && !html.includes('Anthropic')
      && !html.includes('OpenAI')
      && !html.includes('Helper connected'));
    const researchy = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat?agent=researchy',
      query: { area: 'chat', agent: 'researchy' },
    }), researchy);
    check('Researchy opens its own Talk pin',
      String(researchy.raw).includes('<h1>Researchy</h1>')
      && String(researchy.raw).includes('name="agentId" value="researchy"')
      && String(researchy.raw).includes('/ops/desk-talk/researchy/message')
      && !String(researchy.raw).includes('Anthropic'));
    const sentTalk = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/chat',
      body: { action: 'send-chat', message: 'What is the next step?', useGoal: '1', agent: 'growth' },
    }), sentTalk);
    check('HTTP send-chat with agent pins that existing desk',
      sentTalk.statusCode === 200 && sentTalk.body.ok === true && sentTalk.body.route.leadAgent === 'growth' && sentTalk.body.route.mode === 'agent');
    const ceoDesk = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat?agent=lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), ceoDesk);
    const ceoHtml = String(ceoDesk.raw);
    check('CEO Talk uses the bridge and hides the Anthropic/OpenAI helper',
      ceoHtml.includes('<h1>LAVAALL CEO</h1>')
      && ceoHtml.includes('Waiting on CEO')
      && ceoHtml.includes('/ops/ceo-bridge/message')
      && ceoHtml.includes('/assets/js/ops-ceo-chat.js')
      && !ceoHtml.includes('name="action" value="send-chat"')
      && !ceoHtml.includes('No Anthropic or OpenAI key')
      && !ceoHtml.includes('Helper connected')
      && !ceoHtml.includes('Slack #laval')
      && !ceoHtml.includes('<h2>Helper</h2>'));
  }

  {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key-not-real';
    let seenUrl = '';
    global.fetch = async (url) => {
      seenUrl = String(url);
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'Helper draft only.```LAVAALL_DRAFT\n{"kind":"add-note","title":"From helper","body":"Do not auto-save"}\n```' }] }),
      };
    };
    store.resetStore();
    const helper = await chat.sendChatTurn({
      question: 'Draft a note about the catalog tone.',
      selection: {},
      createdBy: ALLOWED,
    });
    const mid = await store.readStore();
    check('configured helper is called as assistant, not a fake local reply',
      helper.usedModel === true && seenUrl.includes('api.anthropic.com') && helper.reply.includes('Helper draft only'));
    check('helper draft stays pending and does not auto-save the note',
      mid.notes.length === 0 && store.pendingProposals(mid).some((item) => item.title === 'From helper'));
    let fetchCalls = 0;
    seenUrl = '';
    global.fetch = async (url) => {
      fetchCalls += 1;
      seenUrl = String(url);
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Should not run for CEO desk' }] }) };
    };
    const ceoTurn = await chat.sendChatTurn({
      question: 'What should LAVAALL CEO do this week?',
      selection: {},
      createdBy: ALLOWED,
      agentId: 'lavaall-ceo',
    });
    check('lavaall-ceo Talk does not call Anthropic or OpenAI',
      ceoTurn.ok === true
      && ceoTurn.usedModel === false
      && ceoTurn.ceoBridge === true
      && fetchCalls === 0
      && !seenUrl.includes('api.anthropic.com')
      && !seenUrl.includes('api.openai.com')
      && ceoTurn.reply.includes('Waiting on CEO'));
    delete process.env.ANTHROPIC_API_KEY;
    process.env.XAI_API_KEY = 'test-xai-key-not-real';
    let xaiUrl = '';
    global.fetch = async (url) => {
      xaiUrl = String(url);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Ship the Preview draft. No deploy.' } }] }),
      };
    };
    ceoBridge.resetCeoBridge();
    const xaiTurn = await chat.sendChatTurn({
      question: 'What should LAVAALL CEO do this week?',
      selection: {},
      createdBy: ALLOWED,
      agentId: 'lavaall-ceo',
    });
    check('lavaall-ceo Talk completes via xAI into the CEO KV thread',
      xaiTurn.ok === true
      && xaiTurn.usedModel === true
      && xaiTurn.waiting === false
      && xaiTurn.provider === 'xai'
      && xaiTurn.reply === 'Ship the Preview draft. No deploy.'
      && xaiUrl.includes('api.x.ai/v1/chat/completions')
      && !xaiUrl.includes('api.anthropic.com')
      && xaiTurn.thread.messages.filter((item) => item.role === 'ceo').length === 1);
    delete process.env.XAI_API_KEY;
    global.fetch = origFetch;
  }

  {
    const gated = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'chat' }, url: '/ops/chat' }, gated);
    check('chat still requires a session', gated.statusCode === 401 && String(gated.raw).includes('Sign in with Google'));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home);
    check('public catalog still has no /ops chat link', !home.includes('href="/ops/chat"'));
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
