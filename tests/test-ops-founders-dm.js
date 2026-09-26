// Private founder thread — flag, server-side access, unread, and isolation from agents.
const fs = require('fs');
const os = require('os');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const apiDir = path.join(__dirname, '../api');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const ops = require(path.join(opsDir, 'index.js'));
const dm = require(path.join(opsDir, '_founders_dm.js'));
const chat = require(path.join(opsDir, '_chat.js'));
const desks = require(path.join(opsDir, '_agent_thread.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const OSMAN = 'osmanjalloh104@gmail.com';
const HAMID = 'abdulhbah55@gmail.com';
const OUTSIDER = 'ada@example.com';
const PHRASE = 'dm-secret-phrase-9f3c2a';
const BOT_PHRASE = 'bot-should-not-land-44aa';
const AGENT_PHRASE = 'agent-should-not-land-77bb';

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

function authed(email, extra) {
  const asJson = !extra || extra.json !== false;
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: Object.assign({
      cookie: extra && Object.prototype.hasOwnProperty.call(extra, 'cookie') ? extra.cookie : cookieFor(email),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'application/x-www-form-urlencoded',
    }, extra && extra.headers),
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/api/founders-dm',
    body: extra && extra.body,
  };
}

function jsFiles(dir, acc) {
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) jsFiles(full, acc);
    else if (name.endsWith('.js')) acc.push(full);
  });
  return acc;
}

function enable() {
  process.env.FOUNDERS_DM_ENABLED = '1';
}

function disable() {
  delete process.env.FOUNDERS_DM_ENABLED;
}

async function run() {
  const origFetch = global.fetch;
  const origLog = console.log;
  const logs = [];
  console.log = (...args) => {
    logs.push(args.map((part) => String(part)).join(' '));
    origLog(...args);
  };

  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_STORE_FILE;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.OPS_CEO_BRIDGE_SECRET;
  disable();
  store.resetStore();
  dm.resetFoundersDm();
  desks.resetDeskTalk();

  check('flag is off unless FOUNDERS_DM_ENABLED is 1, true, or on',
    dm.foundersDmEnabled() === false);
  process.env.FOUNDERS_DM_ENABLED = 'true';
  check('true enables the flag', dm.foundersDmEnabled() === true);
  process.env.FOUNDERS_DM_ENABLED = 'off';
  check('off disables the flag', dm.foundersDmEnabled() === false);
  disable();

  check('identities are the two allowlisted founders and nobody else',
    dm.isFounderDmIdentity(OSMAN)
    && dm.isFounderDmIdentity(HAMID)
    && dm.isFounderDmIdentity('Osmanjalloh104@gmail.com')
    && !dm.isFounderDmIdentity(OUTSIDER)
    && !dm.isFounderDmIdentity(''));

  {
    const res = mockRes();
    await ops(authed(OSMAN, { json: false, url: '/ops/founders', query: { area: 'founders' } }), res);
    check('flag off hides the page from a founder',
      res.statusCode === 404 && !String(res.raw).includes(PHRASE) && !String(res.raw).includes('Messages between Osman'));
    const dash = mockRes();
    await ops(authed(OSMAN, { json: false, url: '/ops', query: { area: 'dashboard' } }), dash);
    check('flag off does not add a Private nav item',
      dash.statusCode === 200 && !String(dash.raw).includes('href="/ops/founders"') && !String(dash.raw).includes('ops-founders-dm.js'));
  }

  enable();

  {
    const res = mockRes();
    await ops({
      method: 'GET',
      headers: { accept: 'application/json' },
      query: { area: 'api/founders-dm' },
      url: '/ops/api/founders-dm',
    }, res);
    check('unauthenticated GET cannot read the thread',
      res.statusCode === 401 && res.body && res.body.error === 'sign_in_required' && !res.body.messages);
    const post = mockRes();
    await ops({
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      query: { area: 'api/founders-dm' },
      url: '/ops/api/founders-dm',
      body: { text: PHRASE, csrf: 'nope' },
    }, post);
    check('unauthenticated POST cannot write the thread',
      post.statusCode === 401 && post.body && post.body.error === 'sign_in_required' && !post.body.messages);
    const page = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'founders' }, url: '/ops/founders' }, page);
    check('logged-out page is the sign-in screen',
      page.statusCode === 401 && String(page.raw).includes('Enter your work email') && !String(page.raw).includes(PHRASE));
  }

  {
    const res = mockRes();
    await ops(authed(OUTSIDER, {
      json: true,
      url: '/ops/api/founders-dm',
      query: { area: 'api/founders-dm' },
    }), res);
    check('non-founder session cannot GET the thread',
      res.statusCode === 403 && res.body.error === 'forbidden' && !res.body.messages && !JSON.stringify(res.body).includes(PHRASE));
    const post = mockRes();
    await ops(authed(OUTSIDER, {
      json: true,
      method: 'POST',
      url: '/ops/api/founders-dm',
      query: { area: 'api/founders-dm' },
      body: { text: PHRASE, csrf: lib.createCsrfToken(OSMAN) },
    }), post);
    check('non-founder session cannot POST the thread',
      post.statusCode === 403 && post.body.error === 'forbidden' && !post.body.messages);
    const claimed = mockRes();
    await ops({
      method: 'GET',
      headers: { accept: 'application/json', 'x-ops-email': OUTSIDER },
      query: { area: 'api/founders-dm' },
      url: '/ops/api/founders-dm',
    }, claimed);
    check('non-founder claimed email cannot GET the thread',
      claimed.statusCode === 403 && claimed.body.error === 'forbidden' && !claimed.body.messages);
  }

  {
    const bearer = mockRes();
    await ops({
      method: 'GET',
      headers: { accept: 'application/json', authorization: 'Bearer simulated-agent-token', cookie: cookieFor(OSMAN) },
      query: { area: 'api/founders-dm' },
      url: '/ops/api/founders-dm',
    }, bearer);
    check('agent bearer cannot GET even with a founder cookie',
      bearer.statusCode === 403 && bearer.body.error === 'agent_denied' && !bearer.body.messages);
    const bot = mockRes();
    await ops({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: 'Bot simulated',
        'x-lavaall-agent': 'researchy',
        cookie: cookieFor(HAMID),
      },
      query: { area: 'api/founders-dm' },
      url: '/ops/api/founders-dm',
      body: { text: AGENT_PHRASE, csrf: lib.createCsrfToken(HAMID) },
    }, bot);
    check('agent headers cannot POST even with a founder cookie and CSRF',
      bot.statusCode === 403 && bot.body.error === 'agent_denied' && !bot.body.messages);
    const slack = mockRes();
    await ops({
      method: 'GET',
      headers: { accept: 'application/json', 'x-slack-signature': 'v0=abc', cookie: cookieFor(OSMAN) },
      query: { area: 'api/founders-dm' },
      url: '/ops/api/founders-dm',
    }, slack);
    check('Slack-signed request cannot read the thread',
      slack.statusCode === 403 && slack.body.error === 'agent_denied' && !slack.body.messages);
    const page = mockRes();
    await ops({
      method: 'GET',
      headers: { 'x-lavaall-agent': 'lavaall-ceo', cookie: cookieFor(OSMAN) },
      query: { area: 'founders' },
      url: '/ops/founders',
    }, page);
    check('agent hitting the page gets a deny page without the thread',
      page.statusCode === 403
      && String(page.raw).includes('Access denied')
      && String(page.raw).includes('founder-only')
      && !String(page.raw).includes('Messages between Osman'));
  }

  {
    const missing = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      method: 'POST',
      body: { text: '   ', csrf: lib.createCsrfToken(OSMAN) },
    }), missing);
    check('blank text is rejected', missing.statusCode === 400 && missing.body.error === 'invalid_message');
    const csrf = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      method: 'POST',
      body: { text: 'hello', csrf: lib.createCsrfToken(HAMID) },
    }), csrf);
    check('the other founder’s CSRF token is rejected', csrf.statusCode === 403 && csrf.body.error === 'csrf');
    const method = mockRes();
    await ops(authed(OSMAN, { json: true, method: 'PUT', body: { text: 'nope' } }), method);
    check('PUT is not allowed', method.statusCode === 405 && method.body.error === 'method_not_allowed');
  }

  {
    const first = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      method: 'POST',
      body: { text: PHRASE, csrf: lib.createCsrfToken(OSMAN) },
    }), first);
    check('Osman can send and the reply is newest-last with no email field',
      first.statusCode === 200
      && first.body.ok === true
      && first.body.messages.length === 1
      && first.body.messages[0].text === PHRASE
      && first.body.messages[0].author === 'You'
      && first.body.messages[0].mine === true
      && first.body.unread === 0
      && first.body.messages[0].from == null
      && first.body.messages[0].email == null);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    const second = mockRes();
    await ops(authed(HAMID, {
      json: true,
      method: 'POST',
      body: { text: 'Reply from Hamid', csrf: lib.createCsrfToken(HAMID) },
    }), second);
    check('Hamid can send and both messages stay oldest first',
      second.statusCode === 200
      && second.body.messages.map((row) => row.text).join('|') === `${PHRASE}|Reply from Hamid`
      && second.body.messages[0].author === 'Osman'
      && second.body.messages[1].author === 'You');

    const unread = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      url: '/ops/api/founders-dm?scope=unread',
      query: { area: 'api/founders-dm', scope: 'unread' },
    }), unread);
    check('unread poll returns a count and no message text',
      unread.statusCode === 200
      && unread.body.unread === 1
      && unread.body.messages == null
      && !JSON.stringify(unread.body).includes(PHRASE)
      && !JSON.stringify(unread.body).includes('Reply from Hamid'));
    const again = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      url: '/ops/api/founders-dm?scope=unread',
      query: { area: 'api/founders-dm', scope: 'unread' },
    }), again);
    check('unread poll does not mark the thread read', again.statusCode === 200 && again.body.unread === 1);

    const dash = mockRes();
    await ops(authed(OSMAN, { json: false, url: '/ops', query: { area: 'dashboard' } }), dash);
    const dashHtml = String(dash.raw);
    check('dashboard shows a Private unread badge and not the message',
      dashHtml.includes('href="/ops/founders"')
      && dashHtml.includes('Private')
      && dashHtml.includes('aria-label="1 unread"')
      && dashHtml.includes('ops-founders-dm.js')
      && dashHtml.includes('--canvas:#EDE7E0')
      && !dashHtml.includes(PHRASE)
      && !dashHtml.includes('Reply from Hamid'));

    const office = mockRes();
    await ops(authed(OSMAN, { json: false, url: '/ops/office', query: { area: 'office' } }), office);
    check('Office HTML does not include the private message',
      !String(office.raw).includes(PHRASE) && String(office.raw).includes('href="/ops/founders"'));

    const listed = mockRes();
    await ops(authed(OSMAN, { json: true }), listed);
    check('opening the list marks Osman caught up and keeps newest last',
      listed.statusCode === 200
      && listed.body.unread === 0
      && listed.body.messages.map((row) => row.author).join(',') === 'You,Hamid');
    const after = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      query: { area: 'api/founders-dm', scope: 'unread' },
    }), after);
    check('Osman unread is clear after opening the thread', after.body.unread === 0);

    const page = mockRes();
    await ops(authed(HAMID, { json: false, url: '/ops/founders', query: { area: 'founders' } }), page);
    const pageHtml = String(page.raw);
    check('Hamid’s page is the Option I thread and works as a phone page',
      page.statusCode === 200
      && pageHtml.includes('<h1>Private</h1>')
      && pageHtml.includes('Messages between Osman and Hamid only.')
      && pageHtml.includes(PHRASE)
      && pageHtml.includes('Reply from Hamid')
      && pageHtml.includes('name="viewport"')
      && pageHtml.includes('dm-compose')
      && pageHtml.includes('font-size:16px')
      && pageHtml.includes('@media (max-width:860px)')
      && pageHtml.includes('aria-current="page"')
      && !pageHtml.includes(OSMAN)
      && pageHtml.split('href="/ops/founders"').length === 2);
    const hamidUnread = mockRes();
    await ops(authed(HAMID, {
      json: true,
      query: { area: 'api/founders-dm', scope: 'unread' },
    }), hamidUnread);
    check('opening the page marks Hamid caught up', hamidUnread.body.unread === 0);
  }

  {
    const form = mockRes();
    await ops(authed(OSMAN, {
      json: false,
      method: 'POST',
      headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
      body: { text: 'Sent from the form', csrf: lib.createCsrfToken(OSMAN) },
    }), form);
    check('a no-JS form post redirects back to the thread',
      form.statusCode === 302 && form.headers.Location === '/ops/founders');
  }

  {
    const weird = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      method: 'POST',
      body: { text: 'hello <script>alert(1)</script>', csrf: lib.createCsrfToken(OSMAN) },
    }), weird);
    check('angle brackets are stripped before save',
      weird.statusCode === 200
      && weird.body.messages[weird.body.messages.length - 1].text === 'hello scriptalert(1)/script'
      && !weird.body.messages[weird.body.messages.length - 1].text.includes('<'));
    const longText = `${'a'.repeat(2001)}`;
    const long = mockRes();
    await ops(authed(HAMID, {
      json: true,
      method: 'POST',
      body: { text: longText, csrf: lib.createCsrfToken(HAMID) },
    }), long);
    check('text is capped at 2000 characters',
      long.statusCode === 200 && long.body.messages[long.body.messages.length - 1].text.length === 2000);
  }

  {
    disable();
    const hidden = mockRes();
    await ops(authed(OSMAN, { json: true }), hidden);
    check('turning the flag off hides an existing thread',
      hidden.statusCode === 404 && hidden.body.error === 'not_found' && !JSON.stringify(hidden.body).includes(PHRASE));
    const page = mockRes();
    await ops(authed(HAMID, { json: false, url: '/ops/founders', query: { area: 'founders' } }), page);
    check('flag off page does not render saved text',
      page.statusCode === 404 && !String(page.raw).includes(PHRASE));
    enable();
    const back = mockRes();
    await ops(authed(OSMAN, { json: true }), back);
    check('messages are still stored after the flag is turned back on',
      back.statusCode === 200 && back.body.messages.some((row) => row.text === PHRASE));
  }

  {
    const home = mockRes();
    await ops(authed(OSMAN, { json: true, url: '/ops', query: { area: 'dashboard' } }), home);
    check('dashboard JSON does not include the private thread',
      home.statusCode === 200 && !JSON.stringify(home.body).includes(PHRASE));
    const dump = JSON.stringify(await store.readStore());
    check('the shared office store does not include the private thread', !dump.includes(PHRASE) && !dump.includes(DM_KEY_SAFE()));
    const shared = JSON.stringify(store.getSharedChat(await store.readStore()));
    check('shared chat does not include the private thread', !shared.includes(PHRASE));
    const talk = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      method: 'POST',
      url: '/ops',
      query: { area: 'chat' },
      body: { action: 'send-chat', message: 'Write a short note about shipping labels.', agent: 'sales' },
    }), talk);
    check('Talk send does not echo the private message',
      talk.statusCode === 200 && !JSON.stringify(talk.body).includes(PHRASE));
    const memory = mockRes();
    await ops(authed(HAMID, { json: false, url: '/ops/memory', query: { area: 'memory' } }), memory);
    check('Memory HTML does not include the private message', !String(memory.raw).includes(PHRASE));
    const inbox = mockRes();
    await ops(authed(HAMID, { json: false, url: '/ops/inbox', query: { area: 'inbox' } }), inbox);
    check('Inbox HTML does not include the private message', !String(inbox.raw).includes(PHRASE));
  }

  {
    process.env.OPS_CEO_BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
    const pending = mockRes();
    await ops({
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer test-ceo-bridge-secret-32chars!!',
      },
      query: { area: 'api/ceo-bridge/pending' },
      url: '/ops/api/ceo-bridge/pending',
    }, pending);
    check('CEO bridge poll cannot see the private thread',
      pending.statusCode === 200 && pending.body.ok === true && !JSON.stringify(pending.body).includes(PHRASE));
    const researchy = mockRes();
    await ops({
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer test-ceo-bridge-secret-32chars!!',
      },
      query: { area: 'api/desk-talk/researchy/pending' },
      url: '/ops/api/desk-talk/researchy/pending',
    }, researchy);
    check('Researchy pending poll cannot see the private thread',
      researchy.statusCode === 200 && !JSON.stringify(researchy.body).includes(PHRASE));
    const reply = mockRes();
    await ops({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: 'Bearer test-ceo-bridge-secret-32chars!!',
      },
      query: { area: 'api/ceo-bridge/reply' },
      url: '/ops/api/ceo-bridge/reply',
      body: { text: BOT_PHRASE, threadId: 'ceo-nope' },
    }, reply);
    const researchyReply = mockRes();
    await ops({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: 'Bearer test-ceo-bridge-secret-32chars!!',
      },
      query: { area: 'api/desk-talk/researchy/reply' },
      url: '/ops/api/desk-talk/researchy/reply',
      body: { text: BOT_PHRASE },
    }, researchyReply);
    const afterBots = mockRes();
    await ops(authed(OSMAN, { json: true }), afterBots);
    check('CEO and Researchy reply paths cannot write the private thread',
      !afterBots.body.messages.some((row) => row.text === BOT_PHRASE)
      && !JSON.stringify(reply.body || '').includes(PHRASE)
      && !JSON.stringify(researchyReply.body || '').includes(PHRASE));
    delete process.env.OPS_CEO_BRIDGE_SECRET;
  }

  {
    const bodies = [];
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    global.fetch = async (url, opts) => {
      bodies.push({ url: String(url), body: String(opts && opts.body || '') });
      return { ok: true, json: async () => ({ content: [{ text: 'Noted.' }] }) };
    };
    const turned = await chat.sendChatTurn({
      question: 'Write a short note about shipping labels.',
      selection: {},
      createdBy: OSMAN,
    });
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = origFetch;
    check('chat model prompt does not include the private message',
      turned.ok === true
      && bodies.length > 0
      && bodies.every((call) => !call.body.includes(PHRASE) && !call.body.includes('Reply from Hamid')));
  }

  {
    const bodies = [];
    process.env.XAI_API_KEY = 'test-xai-key';
    global.fetch = async (url, opts) => {
      bodies.push({ url: String(url), body: String(opts && opts.body || '') });
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Ack.' } }] }) };
    };
    const sales = await desks.talkToDesk({
      agentId: 'sales',
      text: 'Compare the two supplier quotes for kit labels.',
      founderEmail: OSMAN,
      completeXai: true,
    });
    const researchy = await desks.talkToDesk({
      agentId: 'researchy',
      text: 'Compare the two supplier quotes for kit labels.',
      founderEmail: HAMID,
      completeXai: true,
    });
    delete process.env.XAI_API_KEY;
    global.fetch = origFetch;
    check('desk model prompts do not include the private message',
      sales.ok === true
      && researchy.ok === true
      && bodies.length >= 2
      && bodies.every((call) => call.url.includes('api.x.ai') && !call.body.includes(PHRASE) && !call.body.includes('Reply from Hamid')));
  }

  {
    const fileBase = path.join(os.tmpdir(), `lavaall-dm-${process.pid}`);
    const file = `${fileBase}.founders-dm.json`;
    process.env.OPS_STORE_FILE = fileBase;
    dm.resetFoundersDm();
    fs.writeFileSync(file, JSON.stringify({
      messages: [
        { id: 'abcdabcdabcdabcd', from: OUTSIDER, text: 'leaked-stranger', createdAt: 1 },
        { id: 'abcdabcdabcdabce', from: OSMAN, text: 'kept-founder', createdAt: 2 },
      ],
      readAt: {},
    }));
    const res = mockRes();
    await ops(authed(HAMID, { json: true }), res);
    check('messages from anyone except the two founders are dropped',
      res.statusCode === 200
      && res.body.messages.some((row) => row.text === 'kept-founder')
      && !res.body.messages.some((row) => row.text === 'leaked-stranger')
      && !JSON.stringify(res.body).includes(OUTSIDER));
    delete process.env.OPS_STORE_FILE;
    dm.resetFoundersDm();
    fs.rmSync(file, { force: true });
  }

  {
    const calls = [];
    let saved = null;
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'test-token';
    dm.resetFoundersDm();
    global.fetch = async (url, opts) => {
      const cmd = JSON.parse(opts.body);
      calls.push({ url: String(url), cmd });
      if (cmd[0] === 'GET') return { ok: true, json: async () => ({ result: saved }) };
      if (cmd[0] === 'SET') {
        saved = cmd[2];
        return { ok: true, json: async () => ({ result: 'OK' }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    };
    const sent = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      method: 'POST',
      body: { text: 'kv-only-phrase', csrf: lib.createCsrfToken(OSMAN) },
    }), sent);
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    global.fetch = origFetch;
    dm.resetFoundersDm();
    check('KV writes use the private key and not the office store key',
      sent.statusCode === 200
      && calls.some((call) => call.cmd[0] === 'SET' && call.cmd[1] === dm.DM_KEY && String(call.cmd[2]).includes('kv-only-phrase'))
      && calls.every((call) => call.cmd[1] === dm.DM_KEY)
      && !calls.some((call) => call.cmd[1] === 'lavaall-ops-v2'));
  }

  {
    const client = fs.readFileSync(path.join(__dirname, '../assets/js/ops-founders-dm.js'), 'utf8');
    check('browser poll stays on this origin and does not notify anyone',
      client.includes('/ops/api/founders-dm')
      && client.includes('scope=unread')
      && client.includes('textContent')
      && !client.includes('innerHTML')
      && !/slack|resend|api\.x\.ai|anthropic|openai|gmail|mailto:/i.test(client));
    const server = fs.readFileSync(path.join(opsDir, '_founders_dm.js'), 'utf8');
    check('the thread module does not import mail, Slack, or model adapters',
      !server.includes('_xai')
      && !server.includes('_chat')
      && !server.includes('_gmail')
      && !server.includes('_ceo_bridge')
      && !server.includes('_agent_thread')
      && !server.includes('_assign')
      && !/resend|slack|api\.x\.ai|anthropic/i.test(server));
    const hits = jsFiles(apiDir, []).filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return text.includes("require('./_founders_dm')") || text.includes('lavaall-ops-founders-dm-v1');
    });
    check('only the ops gate and the thread module reference the private store',
      hits.length === 2
      && hits.every((file) => file.endsWith(`${path.sep}index.js`) || file.endsWith(`${path.sep}_founders_dm.js`)));
    const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    check('.env.example documents the flag as off and does not set it',
      env.includes('FOUNDERS_DM_ENABLED')
      && env.includes('Default off')
      && !/^FOUNDERS_DM_ENABLED=.+/m.test(env));
  }

  check('server logs do not include private message text',
    logs.every((line) => !line.includes(PHRASE) && !line.includes(BOT_PHRASE) && !line.includes(AGENT_PHRASE) && !line.includes('kv-only-phrase')));

  console.log = origLog;
  let failed = 0;
  for (const row of results) {
    console.log(`${row.pass ? 'PASS' : 'FAIL'} - ${row.name}`);
    if (!row.pass) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

function DM_KEY_SAFE() {
  return 'lavaall-ops-founders-dm-v1';
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
