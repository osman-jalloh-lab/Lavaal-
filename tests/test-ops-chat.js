// Ticket 05 — contextual chat: context selection, no fake replies, no auto-send.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const chat = require(path.join(opsDir, '_chat.js'));
const ops = require(path.join(opsDir, 'index.js'));

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
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();

  {
    const html = mockRes();
    await ops(authed({ json: false, url: '/ops/chat', query: { area: 'chat' } }), html);
    const page = String(html.raw);
    check('chat page is real, not a ticket stub',
      page.includes('Contextual chat') && page.includes('Send') && !page.includes('coming in ticket 05'));
    check('chat HTML never includes API keys or secret names as values',
      !/sk-ant|sk-proj|re_[A-Za-z0-9]|ANTHROPIC_API_KEY=|OPENAI_API_KEY=/.test(page));
    check('unconfigured setup copy is honest',
      page.includes('No Anthropic or OpenAI key') && page.includes('no invented reply'));
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
    check('selected context is visible on the form before send',
      String(page.raw).includes('Context sent with the next message') && String(page.raw).includes('Preview goal') && String(page.raw).includes('Ask chat'));
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
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = origFetch;
  }

  {
    const gated = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'chat' }, url: '/ops/chat' }, gated);
    check('chat still requires a session', gated.statusCode === 401 && String(gated.raw).includes('Email me a sign-in link'));
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
