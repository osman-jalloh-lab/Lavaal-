// Ticket 08 — Saved routines: seed, edit, copy, manual run, no schedules.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const routines = require(path.join(opsDir, '_routines.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const OSMAN = 'osmanjalloh104@gmail.com';

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
      cookie: cookieFor(OSMAN),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'text/html',
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/routines',
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
    await ops(authed({ json: false, url: '/ops/routines', query: { area: 'routines' } }), html);
    const page = String(html.raw);
    check('routines page is real and names the three seeds',
      page.includes('Saved routines')
      && page.includes('Morning brief')
      && page.includes('Meeting prep')
      && page.includes('Weekly review')
      && page.includes('Copy prompt')
      && page.includes('No background schedules')
      && !page.includes('coming in ticket 08'));
    check('routines HTML does not leak helper keys',
      !/sk-ant|sk-proj|ANTHROPIC_API_KEY=|OPENAI_API_KEY=/.test(page));
  }

  {
    const seeded = store.listRoutines(await store.readStore());
    check('store seeds exactly the three starter routines',
      seeded.map((row) => row.id).join(',') === store.SEED_ROUTINE_IDS.join(',')
      && seeded.length === 3
      && seeded.every((row) => row.prompt && row.contextNote));
  }

  {
    const edited = await routines.updateRoutine('weekly-review', {
      prompt: 'Weekly review rewritten for Sierra Leone quotes only.',
    });
    const again = store.getRoutine(await store.readStore(), 'weekly-review');
    check('edited weekly-review prompt persists after reopen',
      edited.ok && again.prompt === 'Weekly review rewritten for Sierra Leone quotes only.');
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/routines', query: { area: 'routines' } }), page);
    check('reopened routines page shows the edited weekly-review wording',
      String(page.raw).includes('Weekly review rewritten for Sierra Leone quotes only.'));
  }

  {
    const copied = await routines.copyRoutinePrompt('weekly-review');
    check('copy prompt returns the saved weekly-review text',
      copied.ok && copied.prompt === 'Weekly review rewritten for Sierra Leone quotes only.');
    const viaOps = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/routines',
      query: { area: 'routines' },
      body: { action: 'copy-prompt', id: 'morning-brief' },
    }), viaOps);
    check('ops POST copy-prompt returns the morning-brief prompt',
      viaOps.statusCode === 200 && viaOps.body.ok === true && String(viaOps.body.prompt).includes('morning brief'));
  }

  {
    const blank = await routines.runRoutine('weekly-review', { selection: {}, createdBy: OSMAN });
    const after = store.getRoutine(await store.readStore(), 'weekly-review');
    check('run without notes is missing_input, not success',
      blank.error === 'missing_input' && blank.missing.includes('notes') && after.lastRunStatus === 'missing_input');
  }

  {
    const note = await store.addNote({
      title: 'Week of 21 Sep',
      body: 'Followed up on two SL quotes. No prices invented.',
      createdBy: OSMAN,
    });
    const failed = await routines.runRoutine('weekly-review', {
      selection: { noteId: note.note.id },
      createdBy: OSMAN,
    });
    const after = store.getRoutine(await store.readStore(), 'weekly-review');
    check('run with notes but no helper is a clear unconfigured error, not fake success',
      failed.error === 'unconfigured'
      && /not connected|No reply was invented/i.test(failed.message)
      && after.lastRunStatus === 'unconfigured'
      && after.lastRunAt > 0);
  }

  {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key-not-real';
    let seenUrl = '';
    global.fetch = async (url) => {
      seenUrl = String(url);
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'Weekly review draft: follow the two SL quotes.```LAVAALL_DRAFT\n{"kind":"add-note","title":"Should not auto-save","body":"no"}\n```' }] }),
      };
    };
    const note = store.notesSelectableForChat(await store.readStore())[0];
    const ran = await routines.runRoutine('weekly-review', {
      selection: { noteId: note.id, useGoal: '' },
      createdBy: OSMAN,
    });
    const after = await store.readStore();
    const weekly = store.getRoutine(after, 'weekly-review');
    check('configured helper run saves a dated result',
      ran.ok === true && ran.usedModel === true && seenUrl.includes('api.anthropic.com')
      && weekly.lastRunStatus === 'ok'
      && weekly.lastRunResult.includes('follow the two SL quotes')
      && weekly.lastRunAt > 0
      && weekly.runs[0].at === weekly.lastRunAt);
    check('routine run does not auto-save drafts, send mail, or write inbox',
      after.notes.filter((item) => item.title === 'Should not auto-save').length === 0
      && after.inbox.length === 0
      && store.pendingProposals(after).length === 0
      && store.listMailAudit(after).length === 0);
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = origFetch;
  }

  {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key-not-real';
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'down' }) });
    const note = store.notesSelectableForChat(await store.readStore())[0];
    const failed = await routines.runRoutine('weekly-review', {
      selection: { noteId: note.id },
      createdBy: OSMAN,
    });
    const weekly = store.getRoutine(await store.readStore(), 'weekly-review');
    check('failed helper is recorded as helper_failed, not ok',
      failed.error === 'helper_failed' && weekly.lastRunStatus === 'helper_failed' && !/invented success/i.test(failed.message || ''));
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = origFetch;
  }

  {
    const routineSrc = fs.readFileSync(path.join(opsDir, '_routines.js'), 'utf8');
    const pageSrc = fs.readFileSync(path.join(opsDir, '_pages.js'), 'utf8');
    check('routines path has no scheduler and does not import mail senders',
      !/setInterval|node-cron|cron\.schedule|scheduleJob/.test(routineSrc + pageSrc)
      && !routineSrc.includes("require('./_inbox')")
      && !routineSrc.includes("require('./_gmail')")
      && !routineSrc.includes('confirmInboxSend'));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home);
  }

  {
    const gated = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'routines' }, url: '/ops/routines' }, gated);
    check('routines still requires a session', gated.statusCode === 401 && String(gated.raw).includes('Email me a sign-in link'));
  }

  global.fetch = origFetch;
  delete process.env.ANTHROPIC_API_KEY;
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
