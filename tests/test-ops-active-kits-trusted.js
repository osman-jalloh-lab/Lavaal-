// Active kit count is a trusted record: counts only, direct answer, no kit PII.
const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const store = require(path.join(opsDir, '_store.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const desks = require(path.join(opsDir, '_agent_thread.js'));
const chat = require(path.join(opsDir, '_chat.js'));

const ALLOWED = 'osmanjalloh104@gmail.com';
const SECRET_EMAIL = 'secret.person@example.test';
const SECRET_NAME = 'Secret Person';
const SECRET_KIT = 'KIT000SECRET';
const SYNCED_BY = 'sync-operator@example.test';
const SYNCED_AT = Date.parse('2026-09-25T23:10:00.000Z');
const LOADED_LINE = 'Kits: 12 active of 28 total (last synced 2026-09-25 6:10 PM CT).';
const LOADED_SENTENCE = '12 kits are active of 28 total (last synced 2026-09-25 6:10 PM CT).';
const UNLOADED_LINE = 'Kits: the kit count is not loaded yet and needs a founder Refresh on the Kits page.';
const UNLOADED_SENTENCE = 'The kit count is not loaded yet and needs a founder Refresh on the Kits page.';
const ASKS = [
  'how many kits are active',
  'active kits',
  'kit count',
  'how many kids are active',
];

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function kitRow(index, status) {
  const secret = index === 1;
  return {
    kit_number: secret ? SECRET_KIT : `KIT${String(index).padStart(4, '0')}`,
    person_name: secret ? SECRET_NAME : `Person ${index}`,
    email: secret ? SECRET_EMAIL : `person${index}@example.test`,
    status,
  };
}

function mixedKits() {
  const plan = [
    ['Active', 12],
    ['Inactive', 7],
    ['Returned', 4],
    ['Lost', 3],
    ['Unknown', 2],
  ];
  const rows = [];
  plan.forEach(([status, count]) => {
    for (let i = 0; i < count; i += 1) rows.push(kitRow(rows.length + 1, status));
  });
  return rows;
}

function loadedStore() {
  return {
    kits: mixedKits(),
    kitsMeta: {
      syncedAt: SYNCED_AT,
      upserted: 28,
      unknown: 0,
      skipped: 0,
      syncedBy: SYNCED_BY,
    },
  };
}

function leaksKitIdentity(text) {
  const body = String(text || '');
  return body.includes(SECRET_EMAIL)
    || body.includes(SECRET_NAME)
    || body.includes(SECRET_KIT)
    || body.includes(SYNCED_BY)
    || body.includes('person2@example.test')
    || body.includes('Person 2');
}

async function run() {
  const origFetch = global.fetch;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_STORE_FILE;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.XAI_API_KEY;
  store.resetStore();
  ceo.resetCeoBridge();
  desks.resetDeskTalk();

  {
    const summary = store.kitsSummary(loadedStore());
    check('helper counts mixed statuses without kit identity',
      summary.loaded === true
      && summary.active === 12
      && summary.total === 28
      && summary.byStatus.Active === 12
      && summary.byStatus.Inactive === 7
      && summary.byStatus.Returned === 4
      && summary.byStatus.Lost === 3
      && summary.byStatus.Unknown === 2
      && summary.lastSyncedAt === SYNCED_AT
      && !leaksKitIdentity(JSON.stringify(summary)));
    check('loaded mirror line is counts and Chicago sync time',
      store.formatKitsTrustedLine(summary) === LOADED_LINE
      && store.formatKitsCountSentence(summary) === LOADED_SENTENCE);
    const lower = store.kitsSummary({
      kits: [{ status: 'active' }, { status: 'INACTIVE' }, { status: 'nope' }],
      kitsMeta: { syncedAt: SYNCED_AT },
    });
    check('helper normalizes status case and unknown values',
      lower.active === 1
      && lower.byStatus.Inactive === 1
      && lower.byStatus.Unknown === 1
      && lower.total === 3);
  }

  {
    const unloadedCases = [null, {}, { kits: [], kitsMeta: null }, { kits: null }];
    unloadedCases.forEach((value, index) => {
      const summary = store.kitsSummary(value);
      const line = store.formatKitsTrustedLine(summary);
      const sentence = store.formatKitsCountSentence(value);
      check(`unloaded mirror ${index} does not claim zero`,
        summary.loaded === false
        && summary.active === 0
        && summary.total === 0
        && line === UNLOADED_LINE
        && sentence === UNLOADED_SENTENCE
        && !line.includes('0 active')
        && !sentence.includes('0 active'));
    });
    const emptyLoaded = store.kitsSummary({ kits: [], kitsMeta: { syncedAt: SYNCED_AT } });
    check('synced empty mirror is loaded as zero, not unloaded',
      emptyLoaded.loaded === true
      && emptyLoaded.active === 0
      && emptyLoaded.total === 0
      && store.formatKitsTrustedLine(emptyLoaded) === 'Kits: 0 active of 0 total (last synced 2026-09-25 6:10 PM CT).');
  }

  {
    store.resetStore(loadedStore());
    const data = await store.readStore();
    const persisted = store.kitsSummary(data);
    check('store read keeps the count summary',
      persisted.active === 12 && persisted.total === 28 && persisted.loaded === true);
    const ceoStatus = ceo.formatCeoStoreContext(data, { mode: 'status' });
    const ceoDefault = ceo.formatCeoStoreContext(data, { mode: 'default' });
    const ceoAnswer = ceo.formatCeoStoreContext(data, { mode: 'answer_first' });
    const ceoPhatic = ceo.formatCeoStoreContext(data, { mode: 'phatic' });
    const deskBlock = desks.deskSystemPrompt('sales', data);
    const selected = store.resolveChatContext(data, { useGoal: '1' });
    const chatBlock = chat.formatContextBlock(selected);
    const chatUnselected = chat.formatContextBlock(chat.selectableContext(data));
    const chatPrompt = chat.systemPrompt({ leadAgent: 'lavaall-ceo', helperAgents: [], verb: 'talk', risk: 'L2' }, selected);
    [ceoStatus, ceoDefault, ceoAnswer, deskBlock, chatBlock, chatUnselected, chatPrompt].forEach((block, index) => {
      check(`trusted block ${index} has the kits line and no kit identity`,
        block.includes(LOADED_LINE) && !leaksKitIdentity(block));
    });
    check('phatic CEO context omits the kits line',
      !ceoPhatic.includes('Kits:')
      && !ceoPhatic.includes(LOADED_LINE)
      && !leaksKitIdentity(ceoPhatic));
    check('selectable chat context keeps counts only',
      chat.selectableContext(data).kitsSummary.active === 12
      && !leaksKitIdentity(JSON.stringify(chat.selectableContext(data).kitsSummary)));
    const shared = fs.readFileSync(path.join(__dirname, '../docs/ops/souls/_SHARED_CONTEXT.md'), 'utf8');
    check('shared context lists the kit count and still blocks kit emails',
      /kit count summary/.test(shared)
      && /counts only/.test(shared)
      && shared.includes('Never paste kit emails'));
  }

  {
    store.resetStore();
    const empty = await store.readStore();
    const ceoStatus = ceo.formatCeoStoreContext(empty, { mode: 'status' });
    const deskBlock = desks.deskSystemPrompt('technical', empty);
    const chatBlock = chat.formatContextBlock(store.resolveChatContext(empty, {}));
    [ceoStatus, deskBlock, chatBlock].forEach((block, index) => {
      check(`unloaded trusted block ${index} asks for a Kits refresh`,
        block.includes(UNLOADED_LINE) && !block.includes('0 active'));
    });
  }

  {
    const notAsks = ['hello', 'how many tasks are open', 'how many kids are coming', 'what is the quality gate?'];
    ASKS.forEach((phrase) => {
      check(`kit ask matches: ${phrase}`, ceo.isKitsCountAsk(phrase) === true && ceo.isKitsCountAsk(`Hey, ${phrase}?`) === true);
    });
    notAsks.forEach((phrase) => {
      check(`kit ask ignores: ${phrase}`, ceo.isKitsCountAsk(phrase) === false);
    });
  }

  {
    process.env.XAI_API_KEY = 'test-xai-key-not-real';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key-not-real';
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Invented 0 kits.' } }] }) };
    };
    store.resetStore(loadedStore());
    for (const phrase of ASKS) {
      ceo.resetCeoBridge();
      const before = fetchCalls;
      const ceoReply = await ceo.talkToCeo({
        text: phrase,
        founderEmail: ALLOWED,
        source: 'ops-office',
        correlationId: `kits-${phrase.slice(0, 12)}`,
      });
      desks.resetDeskTalk();
      const deskReply = await desks.talkToDesk({
        agentId: 'sales',
        text: `Hey, ${phrase}?`,
        founderEmail: ALLOWED,
        source: 'ops-office',
        correlationId: `desk-${phrase.slice(0, 12)}`,
      });
      const chatReply = await chat.sendChatTurn({
        question: phrase,
        selection: {},
        createdBy: ALLOWED,
      });
      check(`direct answer for "${phrase}" skips the model`,
        ceoReply.ok === true
        && ceoReply.usedModel === false
        && ceoReply.reply === LOADED_SENTENCE
        && !leaksKitIdentity(ceoReply.reply)
        && deskReply.ok === true
        && deskReply.usedModel === false
        && deskReply.reply === LOADED_SENTENCE
        && chatReply.ok === true
        && chatReply.grounded === true
        && chatReply.usedModel === false
        && chatReply.reply === LOADED_SENTENCE
        && fetchCalls === before);
    }

    store.resetStore();
    ceo.resetCeoBridge();
    desks.resetDeskTalk();
    const beforeUnloaded = fetchCalls;
    const unloadedCeo = await ceo.talkToCeo({
      text: 'how many kits are active',
      founderEmail: ALLOWED,
      source: 'ops-office',
    });
    const unloadedDesk = await desks.talkToDesk({
      agentId: 'researchy',
      text: 'kit count',
      founderEmail: ALLOWED,
      source: 'ops-office',
    });
    const unloadedChat = await chat.sendChatTurn({
      question: 'how many kids are active',
      selection: {},
      createdBy: ALLOWED,
    });
    check('unloaded direct answer does not claim zero or call the model',
      unloadedCeo.reply === UNLOADED_SENTENCE
      && unloadedDesk.reply === UNLOADED_SENTENCE
      && unloadedChat.reply === UNLOADED_SENTENCE
      && unloadedCeo.usedModel === false
      && unloadedDesk.usedModel === false
      && unloadedChat.usedModel === false
      && fetchCalls === beforeUnloaded);

    ceo.resetCeoBridge();
    const beforeHi = fetchCalls;
    const hi = await ceo.talkToCeo({
      text: 'Hi',
      founderEmail: ALLOWED,
      source: 'ops-office',
    });
    check('a pure greeting stays a greeting',
      hi.reply === ceo.PHATIC_GREETING_COPY
      && hi.usedModel === false
      && fetchCalls === beforeHi);
  }

  global.fetch = origFetch;
  delete process.env.XAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  store.resetStore();
  ceo.resetCeoBridge();
  desks.resetDeskTalk();

  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
