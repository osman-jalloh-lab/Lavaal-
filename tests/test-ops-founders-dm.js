// Private founder thread — flag, server-side access, unread, and isolation from agents.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

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
const HAMEED = 'abdulhbah55@gmail.com';
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

function foundersGroup(html) {
  const start = html.indexOf('class="ops-nav-group"');
  if (start < 0) return '';
  const end = html.indexOf('</div>', start);
  return end < 0 ? '' : html.slice(start, end);
}

function fakeKv() {
  const kv = {
    list: [],
    hash: {},
    legacy: null,
    calls: [],
    blockNextRead: false,
    waiters: [],
  };
  kv.releaseReads = () => {
    const pending = kv.waiters.slice();
    kv.waiters = [];
    pending.forEach((resolve) => resolve());
  };
  function apply(cmd) {
    if (cmd[0] === 'RPUSH') {
      for (let i = 2; i < cmd.length; i += 1) kv.list.push(cmd[i]);
      return { result: kv.list.length };
    }
    if (cmd[0] === 'LTRIM') {
      const start = Number(cmd[2]);
      if (start < 0) kv.list = kv.list.slice(start);
      return { result: 'OK' };
    }
    if (cmd[0] === 'LRANGE') return { result: kv.list.slice() };
    if (cmd[0] === 'HSET') {
      for (let i = 2; i < cmd.length; i += 2) kv.hash[cmd[i]] = cmd[i + 1];
      return { result: 1 };
    }
    if (cmd[0] === 'HGETALL') return { result: Object.assign({}, kv.hash) };
    if (cmd[0] === 'GET') return { result: kv.legacy };
    if (cmd[0] === 'RENAME') {
      kv.legacy = null;
      return { result: 'OK' };
    }
    if (cmd[0] === 'DEL') return { result: 1 };
    return null;
  }
  kv.fetch = async (url, opts) => {
    const parsed = JSON.parse(opts.body);
    const batch = Array.isArray(parsed[0]) ? parsed : [parsed];
    const out = [];
    for (const cmd of batch) {
      kv.calls.push(cmd.slice());
      if (cmd[0] === 'LRANGE' && kv.blockNextRead) {
        kv.blockNextRead = false;
        await new Promise((resolve) => { kv.waiters.push(resolve); });
      }
      if (cmd[0] === 'LRANGE' && kv.legacy) {
        return { ok: false, status: 400, json: async () => ({ error: 'WRONGTYPE' }) };
      }
      const result = apply(cmd);
      if (!result) return { ok: false, status: 400, json: async () => ({}) };
      out.push(result);
    }
    if (Array.isArray(parsed[0])) return { ok: true, json: async () => out };
    return { ok: true, json: async () => out[0] };
  };
  return kv;
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
    && dm.isFounderDmIdentity(HAMEED)
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
    const offGroup = foundersGroup(String(dash.raw));
    check('flag off founders group is Kits then Map',
      offGroup.includes('>Founders only</h2>')
      && offGroup.includes('role="group"')
      && offGroup.indexOf('href="/ops/kits"') >= 0
      && offGroup.indexOf('href="/ops/kits"') < offGroup.indexOf('href="/ops/map"')
      && !offGroup.includes('href="/ops/founders"'));
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
        cookie: cookieFor(HAMEED),
      },
      query: { area: 'api/founders-dm' },
      url: '/ops/api/founders-dm',
      body: { text: AGENT_PHRASE, csrf: lib.createCsrfToken(HAMEED) },
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
      body: { text: 'hello', csrf: lib.createCsrfToken(HAMEED) },
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
    await ops(authed(HAMEED, {
      json: true,
      method: 'POST',
      body: { text: 'Reply from Hameed', csrf: lib.createCsrfToken(HAMEED) },
    }), second);
    check('Hameed can send and both messages stay oldest first',
      second.statusCode === 200
      && second.body.messages.map((row) => row.text).join('|') === `${PHRASE}|Reply from Hameed`
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
      && !JSON.stringify(unread.body).includes('Reply from Hameed'));
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
      && !dashHtml.includes('Reply from Hameed'));
    const onGroup = foundersGroup(dashHtml);
    const privateAt = onGroup.indexOf('href="/ops/founders"');
    const kitsAt = onGroup.indexOf('href="/ops/kits"');
    const mapAt = onGroup.indexOf('href="/ops/map"');
    check('Private is first in the Founders only group when the flag is on',
      onGroup.includes('>Founders only</h2>')
      && onGroup.includes('aria-labelledby="ops-nav-founders"')
      && privateAt >= 0
      && privateAt < kitsAt
      && kitsAt < mapAt
      && dashHtml.indexOf('href="/ops/routines"') < dashHtml.indexOf('id="ops-nav-founders"'));

    const office = mockRes();
    await ops(authed(OSMAN, { json: false, url: '/ops/office', query: { area: 'office' } }), office);
    check('Office HTML does not include the private message',
      !String(office.raw).includes(PHRASE) && String(office.raw).includes('href="/ops/founders"'));

    const listed = mockRes();
    await ops(authed(OSMAN, { json: true }), listed);
    check('opening the list does not mark Osman caught up and keeps newest last',
      listed.statusCode === 200
      && listed.body.unread === 1
      && listed.body.messages.map((row) => row.author).join(',') === 'You,Hameed');
    const still = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      query: { area: 'api/founders-dm', scope: 'unread' },
    }), still);
    check('GET does not write the read cursor', still.statusCode === 200 && still.body.unread === 1);
    const marked = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      method: 'POST',
      body: { action: 'read', csrf: lib.createCsrfToken(OSMAN) },
    }), marked);
    check('mark-read is an explicit CSRF POST',
      marked.statusCode === 200 && marked.body.ok === true && marked.body.unread === 0 && marked.body.messages == null);
    const after = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      query: { area: 'api/founders-dm', scope: 'unread' },
    }), after);
    check('Osman unread is clear after the mark-read POST', after.body.unread === 0);
    const noCsrf = mockRes();
    await ops(authed(HAMEED, {
      json: true,
      method: 'POST',
      body: { action: 'read' },
    }), noCsrf);
    check('mark-read without CSRF is rejected', noCsrf.statusCode === 403 && noCsrf.body.error === 'csrf');

    const page = mockRes();
    await ops(authed(HAMEED, { json: false, url: '/ops/founders', query: { area: 'founders' } }), page);
    const pageHtml = String(page.raw);
    check('Hameed’s page is the Option I thread and works as a phone page',
      page.statusCode === 200
      && pageHtml.includes('<h1>Private</h1>')
      && pageHtml.includes('Messages between Osman and Hameed only.')
      && pageHtml.includes(PHRASE)
      && pageHtml.includes('Reply from Hameed')
      && pageHtml.includes('name="viewport"')
      && pageHtml.includes('dm-compose')
      && pageHtml.includes('font-size:16px')
      && pageHtml.includes('@media (max-width:860px)')
      && pageHtml.includes('aria-current="page"')
      && pageHtml.includes('<h2>Osman and Hameed</h2>')
      && pageHtml.includes('id="dm-mic"')
      && pageHtml.includes('type="button" class="btn btn-mic" id="dm-mic"')
      && pageHtml.includes('id="dm-mic-status"')
      && pageHtml.includes('class="dm-actions"')
      && pageHtml.includes('/assets/js/ops-mic.js')
      && !pageHtml.includes(OSMAN)
      && pageHtml.split('href="/ops/founders"').length === 2);
    const hameedUnread = mockRes();
    await ops(authed(HAMEED, {
      json: true,
      query: { area: 'api/founders-dm', scope: 'unread' },
    }), hameedUnread);
    check('opening the page does not by itself change Hameed unread', hameedUnread.body.unread === 0);
    const later = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      method: 'POST',
      body: { text: 'After Hameed looked', csrf: lib.createCsrfToken(OSMAN) },
    }), later);
    const pageAgain = mockRes();
    await ops(authed(HAMEED, { json: false, url: '/ops/founders', query: { area: 'founders' } }), pageAgain);
    const hameedStill = mockRes();
    await ops(authed(HAMEED, {
      json: true,
      query: { area: 'api/founders-dm', scope: 'unread' },
    }), hameedStill);
    check('a page GET leaves Hameed unread', hameedStill.body.unread === 1 && String(pageAgain.raw).includes('After Hameed looked'));
    const hameedMark = mockRes();
    await ops(authed(HAMEED, {
      json: true,
      method: 'POST',
      body: { action: 'read', csrf: lib.createCsrfToken(HAMEED) },
    }), hameedMark);
    check('Hameed mark-read POST clears unread', hameedMark.body.unread === 0);
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
    await ops(authed(HAMEED, {
      json: true,
      method: 'POST',
      body: { text: longText, csrf: lib.createCsrfToken(HAMEED) },
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
    await ops(authed(HAMEED, { json: false, url: '/ops/founders', query: { area: 'founders' } }), page);
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
    await ops(authed(HAMEED, { json: false, url: '/ops/memory', query: { area: 'memory' } }), memory);
    check('Memory HTML does not include the private message', !String(memory.raw).includes(PHRASE));
    const inbox = mockRes();
    await ops(authed(HAMEED, { json: false, url: '/ops/inbox', query: { area: 'inbox' } }), inbox);
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
      && bodies.every((call) => !call.body.includes(PHRASE) && !call.body.includes('Reply from Hameed')));
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
      founderEmail: HAMEED,
      completeXai: true,
    });
    delete process.env.XAI_API_KEY;
    global.fetch = origFetch;
    check('desk model prompts do not include the private message',
      sales.ok === true
      && researchy.ok === true
      && bodies.length >= 2
      && bodies.every((call) => call.url.includes('api.x.ai') && !call.body.includes(PHRASE) && !call.body.includes('Reply from Hameed')));
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
    await ops(authed(HAMEED, { json: true }), res);
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
    const kv = fakeKv();
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'test-token';
    dm.resetFoundersDm();
    global.fetch = kv.fetch;
    const sent = mockRes();
    await ops(authed(OSMAN, {
      json: true,
      method: 'POST',
      body: { text: 'kv-only-phrase', csrf: lib.createCsrfToken(OSMAN) },
    }), sent);
    const listCalls = kv.calls.filter((cmd) => cmd[0] === 'LRANGE' || cmd[0] === 'HGETALL' || cmd[0] === 'SET' || cmd[0] === 'RPUSH');
    check('KV appends with RPUSH on the private key and does not SET the office store',
      sent.statusCode === 200
      && kv.calls.some((cmd) => cmd[0] === 'RPUSH' && cmd[1] === dm.DM_KEY && String(cmd[2]).includes('kv-only-phrase'))
      && kv.calls.some((cmd) => cmd[0] === 'LTRIM' && cmd[1] === dm.DM_KEY)
      && kv.calls.some((cmd) => cmd[0] === 'HSET' && cmd[1] === dm.READ_KEY)
      && !kv.calls.some((cmd) => cmd[0] === 'SET')
      && kv.calls.every((cmd) => cmd[1] === dm.DM_KEY || cmd[1] === dm.READ_KEY || cmd[1] === `${dm.DM_KEY}:legacy`)
      && !kv.calls.some((cmd) => cmd[1] === 'lavaall-ops-v2')
      && listCalls.length > 0);
    const beforePoll = kv.calls.length;
    kv.blockNextRead = true;
    const pollRes = mockRes();
    const pollPromise = ops(authed(OSMAN, { json: true }), pollRes);
    const waitStart = Date.now();
    while (!kv.waiters.length && Date.now() - waitStart < 1000) {
      await new Promise((resolve) => { setTimeout(resolve, 5); });
    }
    const during = mockRes();
    await ops(authed(HAMEED, {
      json: true,
      method: 'POST',
      body: { text: 'arrived-during-poll', csrf: lib.createCsrfToken(HAMEED) },
    }), during);
    kv.releaseReads();
    await pollPromise;
    const afterPoll = kv.calls.slice(beforePoll);
    const kept = mockRes();
    await ops(authed(OSMAN, { json: true }), kept);
    check('a poll interleaved with a send does not erase the message',
      during.statusCode === 200
      && during.body.messages.some((row) => row.text === 'arrived-during-poll')
      && kept.statusCode === 200
      && kept.body.messages.some((row) => row.text === 'kv-only-phrase')
      && kept.body.messages.some((row) => row.text === 'arrived-during-poll')
      && !afterPoll.some((cmd) => cmd[0] === 'SET')
      && afterPoll.filter((cmd) => cmd[0] === 'RPUSH').length === 1);
    const readOnlyStart = kv.calls.length;
    const peek = mockRes();
    await ops(authed(OSMAN, { json: true }), peek);
    const readOnly = kv.calls.slice(readOnlyStart);
    check('GET does not write',
      peek.statusCode === 200
      && readOnly.length > 0
      && readOnly.every((cmd) => cmd[0] === 'LRANGE' || cmd[0] === 'HGETALL'));
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    global.fetch = origFetch;
    dm.resetFoundersDm();
  }

  {
    const kv = fakeKv();
    kv.legacy = JSON.stringify({
      messages: [{ id: 'abc123abc123abcd', from: OSMAN, text: 'legacy-kv-phrase', createdAt: 9 }],
      readAt: { [HAMEED]: 4 },
    });
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'test-token';
    dm.resetFoundersDm();
    global.fetch = kv.fetch;
    const migrated = mockRes();
    await ops(authed(HAMEED, { json: true }), migrated);
    const again = mockRes();
    await ops(authed(HAMEED, { json: true }), again);
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    global.fetch = origFetch;
    dm.resetFoundersDm();
    check('legacy KV blob migrates on first read and later reads do not rename',
      migrated.statusCode === 200
      && migrated.body.messages.some((row) => row.text === 'legacy-kv-phrase')
      && kv.calls.filter((cmd) => cmd[0] === 'RENAME').length === 1
      && again.statusCode === 200
      && again.body.messages.some((row) => row.text === 'legacy-kv-phrase')
      && kv.calls.filter((cmd) => cmd[0] === 'RENAME').length === 1);
  }

  {
    const micSrc = fs.readFileSync(path.join(__dirname, '../assets/js/ops-mic.js'), 'utf8');
    const client = fs.readFileSync(path.join(__dirname, '../assets/js/ops-founders-dm.js'), 'utf8');
    const sends = [];
    const instances = [];
    function SpeechRecognition() {
      instances.push(this);
      this.start = () => {};
      this.stop = () => { if (this.onend) this.onend(); };
    }
    const sandbox = {
      SpeechRecognition,
      fetch: () => { sends.push('fetch'); return Promise.resolve(); },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(micSrc, sandbox);
    function control() {
      return {
        hidden: false,
        disabled: false,
        textContent: 'Mic',
        attrs: {},
        listeners: {},
        setAttribute(name, value) { this.attrs[name] = value; },
        addEventListener(name, fn) { this.listeners[name] = fn; },
      };
    }
    const box = {
      value: 'Hello',
      form: {
        requestSubmit: () => { sends.push('submit'); },
        submit: () => { sends.push('submit'); },
      },
    };
    const mic = control();
    const status = { hidden: true, textContent: '' };
    sandbox.lavaallBindSpeechMic({
      box,
      mic,
      status,
      maxLength: 2000,
      hideIfMissing: true,
    });
    mic.listeners.click();
    instances[0].onresult({ results: [[{ transcript: 'from the mic' }]] });
    check('mic appends speech into the box and does not send',
      box.value === 'Hello from the mic'
      && sends.length === 0
      && mic.attrs['aria-pressed'] === 'true'
      && mic.textContent === 'Listening…');
    mic.listeners.click();
    check('tapping the mic again stops listening',
      mic.attrs['aria-pressed'] === 'false' && mic.textContent === 'Mic' && sends.length === 0);
    box.value = 'a'.repeat(1990);
    instances.length = 0;
    mic.listeners.click();
    instances[0].onresult({ results: [[{ transcript: '12345678901234567890' }]] });
    check('mic text stays inside the 2000 character cap', box.value.length === 2000 && sends.length === 0);
    instances[0].onerror({ error: 'not-allowed' });
    check('denied mic permission shows a short note and still does not send',
      status.hidden === false
      && status.textContent.includes('Microphone permission denied')
      && sends.length === 0);
    delete sandbox.SpeechRecognition;
    delete sandbox.webkitSpeechRecognition;
    const missing = control();
    sandbox.lavaallBindSpeechMic({
      box,
      mic: missing,
      status,
      maxLength: 2000,
      hideIfMissing: true,
    });
    check('the mic button hides when the browser has no speech recognition', missing.hidden === true);
    check('private chat uses the shared mic and does not send from speech',
      client.includes('lavaallBindSpeechMic')
      && client.includes('hideIfMissing: true')
      && client.includes('maxLength: 2000')
      && !client.includes('webkitSpeechRecognition')
      && !micSrc.includes('.submit(')
      && !micSrc.includes('requestSubmit')
      && !micSrc.includes('fetch('));
  }

  {
    const client = fs.readFileSync(path.join(__dirname, '../assets/js/ops-founders-dm.js'), 'utf8');
    check('browser poll stays on this origin and does not notify anyone',
      client.includes('/ops/api/founders-dm')
      && client.includes('scope=unread')
      && client.includes('textContent')
      && !client.includes('innerHTML')
      && !/slack|resend|api\.x\.ai|anthropic|openai|gmail|mailto:/i.test(client));
    check('mark-read is a POST sent only while the tab is visible and focused',
      client.includes("action: 'read'")
      && client.includes('document.hidden')
      && client.includes('hasFocus')
      && client.includes('tabActive'));
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
