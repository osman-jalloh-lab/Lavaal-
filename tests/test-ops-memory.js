// Ticket 04 — Memory library: CRUD, search, delete exclusion from chat.
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
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
    url: extra && extra.url ? extra.url : '/ops/memory',
    body: extra && extra.body,
  };
}

async function run() {
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_STORE_FILE;
  store.resetStore();

  {
    const html = mockRes();
    await ops(authed({ json: false, url: '/ops/memory', query: { area: 'memory' } }), html);
    check('memory page is real, not a ticket stub',
      String(html.raw).includes('Save note')
      && String(html.raw).includes('Search')
      && !String(html.raw).includes('coming in ticket 04'));
    check('memory page names review-before-save for AI proposals',
      String(html.raw).includes('require review before save'));
    check('demo banner still shows when KV is unset',
      String(html.raw).includes('Demo store') && store.isDurable() === false);
  }

  {
    store.resetStore();
    const saved = await store.addNote({
      title: 'Prefer WhatsApp for SL quotes',
      body: 'Follow up on WhatsApp after the email pack.',
      source: 'Founder call',
      createdBy: ALLOWED,
    });
    check('note CRUD saves title, body, and optional source',
      saved.ok
      && saved.note.title === 'Prefer WhatsApp for SL quotes'
      && saved.note.body.includes('WhatsApp')
      && saved.note.source === 'Founder call'
      && store.selectableForChat(saved.note) === true);
    const blank = await store.addNote({ title: '   ', createdBy: ALLOWED });
    check('blank note title is rejected', blank.error === 'invalid_note');
  }

  {
    const hits = store.searchNotes(await store.readStore(), 'whatsapp');
    check('text search finds a note by body or title',
      hits.length === 1 && hits[0].title.startsWith('Prefer WhatsApp'));
    const sourceHits = store.searchNotes(await store.readStore(), 'founder call');
    check('text search finds a note by source', sourceHits.length === 1);
    const miss = store.searchNotes(await store.readStore(), 'calendar invite');
    check('search miss returns no live notes', miss.length === 0);
  }

  {
    const current = (await store.readStore()).notes[0];
    const edited = await store.updateNote(current.id, {
      title: 'Prefer WhatsApp for SL quotes',
      body: 'WhatsApp first, then email the quote pack.',
      source: 'Founder call — edited',
    });
    check('edit updates body and source on the same id',
      edited.ok && edited.note.id === current.id && edited.note.body.includes('WhatsApp first') && edited.note.source.includes('edited'));
    const still = store.searchNotes(await store.readStore(), 'email the quote');
    check('edited text is what search matches', still.length === 1 && still[0].id === current.id);
  }

  {
    const current = store.searchNotes(await store.readStore(), 'whatsapp')[0];
    const removed = await store.deleteNote(current.id);
    const after = await store.readStore();
    check('delete soft-removes the note from search',
      removed.ok
      && store.searchNotes(after, 'whatsapp').length === 0
      && store.searchNotes(after, '').length === 0);
    check('deleted note is not selectableForChat',
      store.notesSelectableForChat(after).length === 0
      && after.notes.some((row) => row.id === current.id && row.deletedAt > 0)
      && store.selectableForChat(after.notes.find((row) => row.id === current.id)) === false);
    const snap = store.dashboardSnapshot(after);
    check('dashboard recent notes exclude the deleted note', snap.notes.length === 0);
    const again = await store.deleteNote(current.id);
    check('deleting an already-deleted note is note_not_found', again.error === 'note_not_found');
  }

  {
    store.resetStore();
    const proposed = await store.addNote({
      title: 'AI guessed a preference',
      body: 'Should not land without review.',
      proposed: true,
      createdBy: 'agent',
    });
    check('AI-proposed note is blocked until review',
      proposed.error === 'memory_review_required'
      && (await store.readStore()).notes.length === 0);
    const approved = await store.approveProposedNote({
      title: 'Reviewed preference',
      body: 'Founder confirmed WhatsApp follow-up.',
      source: 'chat proposal',
    }, { approvedBy: ALLOWED });
    check('approveProposedNote is the hook that persists after review',
      approved.ok && approved.note.title === 'Reviewed preference' && store.selectableForChat(approved.note));
  }

  {
    store.resetStore();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/memory',
      body: { action: 'add-note', title: 'Home and memory agree', body: 'Same store', source: 'Dashboard' },
    }), mockRes());
    const home = mockRes();
    await ops(authed({ json: true, url: '/ops' }), home);
    const memory = mockRes();
    await ops(authed({ json: true, url: '/ops/memory', query: { area: 'memory' } }), memory);
    check('dashboard recent notes and memory library agree after save',
      home.body.snapshot.notes[0].title === 'Home and memory agree'
      && memory.body.visibleNotes[0].title === home.body.snapshot.notes[0].title
      && memory.body.visibleNotes[0].source === 'Dashboard');

    const edited = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/memory',
      body: { action: 'update-note', id: memory.body.visibleNotes[0].id, title: 'Home and memory agree', body: 'Edited once', source: 'Memory page' },
    }), edited);
    const found = mockRes();
    await ops(authed({ json: true, url: '/ops/memory', query: { area: 'memory', q: 'edited once' } }), found);
    check('HTTP search finds the edited note',
      found.body.visibleNotes.length === 1 && found.body.visibleNotes[0].body === 'Edited once');

    const gone = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/memory',
      body: { action: 'delete-note', id: found.body.visibleNotes[0].id },
    }), gone);
    const search = mockRes();
    await ops(authed({ json: true, url: '/ops/memory', query: { area: 'memory', q: 'edited once' } }), search);
    const homeAfter = mockRes();
    await ops(authed({ json: true, url: '/ops' }), homeAfter);
    check('HTTP delete removes the note from search, dashboard, and chat selection',
      gone.body.ok === true
      && search.body.visibleNotes.length === 0
      && homeAfter.body.snapshot.notes.length === 0
      && store.notesSelectableForChat(homeAfter.body.store).length === 0);
  }

  {
    const gated = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'memory' }, url: '/ops/memory' }, gated);
    check('memory still requires a session', gated.statusCode === 401 && String(gated.raw).includes('Enter your work email'));
  }

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
