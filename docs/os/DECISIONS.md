# LAVAALL OS decisions

Settled by Osman Jalloh. Do not re-ask.

## 2026-10-22 (6:58 PM CT) — brief section 0

1. **Route.** A clean `/os` URL is approved. Exactly one rewrite block is added to `vercel.json`:
   `{ "source": "/os/:path*", "destination": "/api/os?area=:path*" }`. Nothing else in that file changes.
   `/ops` rewrites are untouched and `/ops/:path*` does not overlap `/os/:path*`.
2. **Skills on the Brain graph.** Skill nodes are visible by default. This is Osman's override of
   FR-030 (22 Oct 2026) for the Brain view only. Skills stay out of every other OS view except the
   desk drawer list.
3. **Palette.** Jack's dark palette applies to `/os` only. The rest of `/ops` keeps Option I palette v2
   (cyan #2EC4FF, emerald #3DDC97, blush #FCE7F3, canvas #FAF8F5). Every `/os` token is scoped under an
   `/os`-only root class so nothing leaks into `/ops`.

## 2026-10-22 — answers to the build-start questions

4. **Soul data deferred (option b).** No `functions` entry for `api/os/index.js` is added to
   `vercel.json`, so `docs/ops/souls/**` is not bundled with the `/os` function. Desk "now" lines,
   skills and rules from SOUL packs show empty states in this PR. Bringing soul data in is its own later step.
5. **Empty states are correct** for Decisions, Jev scores, Spend and AI Council: the store has no
   collections for them. Values are "—" or an empty state with a one-line reason, never sample data.
6. **Outreach stays empty for now.** Leads come from the daily Sierra Leone leads routine, not the Kits
   sync, and no read path for them is in scope yet.
7. **Local clone.** Work happens in a fresh clone of `main` (3fc3735); the other local clones are untouched.

## 2026-10-22 — Brain graph (brief section 5.7)

8. **Links come only from real relations, matched exactly.** The prototype guessed links from first words
   (a lead "Hillside Hotel" linked to any decision containing "Hillside") and from a hand-made mapping of
   routines to desks. The build does not. A link exists only when:
   desk->skill and desk->rule come from desk data (SOUL data, deferred); routine->desk needs a routine owner
   (the store has none); decision->desk matches the desk id, short name or full name; lead->sales desk for any
   lead; lead->decision when the decision text contains the lead's full name (four or more characters);
   note->rule/desk/decision/lead when the note text contains the FR id that exists as a rule node, the desk's
   full registry name, the decision title (eight or more characters) or the lead's full name.
   Paraphrases and common words ("sales", "growth") never link.
9. **Today's graph is small and mostly unlinked.** With the registry, routines and notes only, Brain shows the
   six desks plus routines and notes and no links. Rules, skills, leads and desk-linked routines appear when
   SOUL data, a leads read path and a routine owner exist. The Skills chip ("Skills (FR-030 override)") is
   visible with a count of 0 until then.
10. **The graph refits on resize until the user pans or zooms,** because layout can still be settling when the
    canvas is first measured. A manual pan or zoom stops auto-fit; the Fit button turns it back on.

## 2026-10-22 — Council, Spend and Settings (brief section 5)

11. **Council and Spend read stored records only, and none exist yet.** The read-only loaders return `null`
    until the store holds `council` or `spend` arrays, so both views show empty states today. The record
    shapes the loaders accept are the contract for whatever writes them later:
    council `{ id, title, desk, level (L0-L4), date, drafter {name, role}, reviewer {name, role}, maxRounds
    (default 3), rounds [{ n, draft, review, at }], jev (0-1), status (waiting_l3 | approved |
    changes_requested | flagged | held) }`; spend `{ id, date, amount (US dollars), currency (optional, USD
    only), provider, note }`.
12. **Spend is dollars summed in whole cents, never estimated.** Records in another currency, with a
    non-numeric or negative amount, an unreadable date, or dated after today (Chicago) are skipped. There is
    no budget, forecast or projection, and an empty chart prints no axis numbers. "This month" is the
    America/Chicago calendar month.
13. **Two prototype cards are left out on purpose.** "Cost estimate, per run" is an estimate, and "Model
    settings" (builder, Opus gate, daily cap) is configuration that no record backs. Neither is shown. The
    Council view has no Approve, Request changes, New run or Replay actions: it runs no model and writes
    nothing.
14. **Settings reports presence of env var names, not service health.** GitHub has no env variable in the
    ops app, so it is "unknown", never "connected". Values are never read into the page.

## 2026-10-22 — Phone layout (brief step 9, plus Osman's two additions)

15. **Fifth phone tab is "More".** The tab bar is Home, Desks, Decisions, Outreach, More. More opens a sheet with
    Notes, Brain, AI Council, Spend and Settings (Osman's list) and also Routines, which lost its tab and would
    otherwise be unreachable on a phone. More shows as active while a view inside it is open.
16. **Brain on touch: tap to highlight, tap again to open.** The first tap selects the node and highlights it and
    its links, exactly like a desktop click. A second tap on the same node opens it in its own view (desk ->
    Desks, decision -> Decisions, routine -> Routines, note -> Notes, lead -> Outreach, rule or skill -> its
    desk). A mouse click still only selects; the side panel's Open button opens. A hint reads "Tap again to
    open <name>". A few pixels of finger wobble still counts as a tap, touch gets a larger hit area, and two
    fingers pinch-zoom (same 0.25 to 4 limits).

## 2026-10-22 — Answers to the draft PR's open questions

17. **Routines stays in More on phones.** Routines has no tab of its own; it lives in the More sheet with Notes,
    Brain, AI Council, Spend and Settings (entry 15). Osman confirmed.
18. **The "Sierra Leone leads routine" mentions stay.** They appear in `api/ops/_os_data.js` (the Outreach and
    hotel-bounce source lines) and in this file, even though the repository is public. Osman confirmed.

## 2026-10-22 — Return to /os after sign-in (approved fence exception)

19. **Signing in from /os returns the founder to /os.** Osman approved editing `api/ops/auth.js`, outside the
    original fence, for exactly this and nothing else. When `/os` sends a signed-out visitor to the `/ops`
    login it sets a 10-minute cookie `lavaall-os-return=os` (HttpOnly, SameSite=Lax, Secure on HTTPS).
    `auth.js` now asks `postSignInPath(req)` (new file `api/ops/_os_return.js`) in its two successful sign-in
    redirects, Google and magic link, and clears the cookie there. The cookie must equal exactly `os` and the
    answer is one of two fixed paths, `/os` or `/ops`; nothing from a request is ever used as a URL, so there is
    no open redirect. No cookie, or any other value, gives `/ops` as before. Failed sign-ins, logout and the
    JSON responses are unchanged. The edit to `auth.js` is one `require` line plus those two redirects
    (+3 lines, -2 lines). Limit: a magic link opened on a different device or browser has no cookie and lands
    on `/ops`.

## 2026-10-23 — Static LAVAALL OS data pack (next entry after 19)

20. **/os reads a static data pack built 22 Oct 2026. It ends the SOUL deferral of entry 4 for desk now line, rules and
    skills, adds a routine owner and schedule, and adds the decision log.** Five JSON files (`decisions.json` 52 rows,
    22 Open and 30 Closed, 6 with a Jev score; `routines.json` 14; `desks.json` 6 desks plus Scout; `skills.json` 54;
    `rules.json` 30) are committed unchanged in `api/os/_data/` and bundled with the /os function by literal
    `require()` in `api/os/_data/index.js`. No `vercel.json` change was needed. They are read-only and are never written
    to the KV store: `normalizeStore` drops a `decisions` key, and `store.routines` are /ops runnable prompts.
    - **Decisions** come from the pack; a `decisions` array in the store wins if one ever exists (even an empty one).
      Decision `desk` is empty on all 52 and 10 have no `level`, so /os shows dashes and there are no decision-to-desk links.
    - **Routines** come from the pack with schedule, owner (a desk id) and status, and replace store routines in /os.
      The pack's `lastRunAt` and `lastRunStatus` are stale and ignored: "last run" shows only the live routine-health
      record, merged by routine id, and a dash without one.
    - **Desks** merge `desks.json` into the desk registry by id (now line, rules, skills). **Scout is a seventh desk**,
      taken from `extraDesks` (Osman approved), so its three routines link to it. It has no /ops Talk link. Only
      Lifecycle has a now line ("Parked as routing priority; Talk still works.").
    - **Brain** gets a node for every pack skill (54) and rule (30), as entries 2 and 8 describe. Links stay exact: a
      skill links to a desk only through that desk's own skill list (24 of the 54 are linked, 30 are not), a routine to
      its owner desk (14 links), and a rule only when a note cites its FR id. Desk rules in `desks.json` carry no FR ids,
      so rule nodes start unlinked. Total today: 157 nodes and 61 links.
    - **Left out on purpose:** Starlink, Guinea, leads and customer items, as the pack was built. The one decision titled
      "No free trial anywhere" is kept as is: it is the rule itself, internal data and not copy.
    - **Pack provenance:** the pack was re-exported after two fixes (a duplicate decision id and Researchy's rules that had
      lost their "I do not"). Its own README had stale counts (53 and 23), so `api/os/_data/README.md` was rewritten.

## 2026-10-23 — Data pack v2 (next entry after 20)

21. **Data pack v2: decisions carry a desk, and desk rules carry FR ids.** Only `decisions.json` and `desks.json` changed
    (`routines.json`, `rules.json` and `skills.json` are identical); both were copied byte for byte. No code changed, only
    the pins in `tests/test-os-pack.js`.
    - **Decisions:** `desk` is set on 25 of 52 (technical 16, lavaall-ceo 5, growth 2, sales 2) and blank on 27. Counts are
      unchanged: 22 Open, 30 Closed, 6 scored, 10 with no `level`. This supersedes the "desk is empty" line of entry 20.
    - **Desk rules:** 15 end with an FR id like " (FR-002)", and every cited id exists in `rules.json`, so no rule nodes were
      added (30 stay). Researchy's rules still start with "I do not ".
    - **Brain:** 157 nodes and 100 links (was 61): 14 runs, 47 uses skill, 25 decided, 14 follows rule. Lifecycle cites
      FR-015 twice, so 15 rule lines make 14 distinct links, to 9 rules; the other 21 rules and 27 decisions stay unlinked.
    - **Decisions view:** the Desk column shows the raw desk id. Showing the short name is a possible polish, not done here.

## 2026-10-23 — Live data feeds (next entry after 21)

22. **/os gets five authenticated POST feeds. This is the first write path tied to /os, and it is approved (Osman, 23 Oct
    2026, "Phase 7").** `/os` itself stays read-only; only the ingest endpoint writes.
    - **Endpoints:** `POST /api/os/ingest/{morning-brief, routine-health, spend, outreach-stats, desk-status}`, served by
      one dynamic function `api/os/ingest/[feed].js`. One function, not five: the project already has 10 and the Vercel
      plan limit is near. No `vercel.json` change was needed. `api/os` now exposes two functions (the app and this).
    - **Auth:** the existing `OPS_CEO_BRIDGE_SECRET` bearer (at least 16 characters, constant-time compare), the same
      one the inbox push and routine health use. No new env var. The check is mirrored in `api/ops/_os_ingest.js`
      because neither existing module exports it and `/ops` code is off limits. No secret, no store write: 401.
    - **Storage:** one new KV key per feed, `lavaall-os-feed-<feed>-v1`. The existing `lavaall-ops-v2` key is never
      written (this keeps the original "no KV writes to existing keys" fence). Preview deploys write to a `preview:`
      prefixed key. Strict shapes, 20 KB cap, nothing stored unless the whole payload is valid, and a 422 names only the
      field path, never a value. Nothing is logged.
    - **Rules decided here:** spend is stored in whole cents and posting a date replaces that date (so re-sending is
      safe); outreach is counts only, one record per day, and `bounced` cannot exceed `sent`; the bounce rate is
      `bounced / sent` for the latest day (a dash when nothing was sent); routine health statuses are
      `ok | late | failed | skipped` and the feed wins over the older routine-health record per routine; a desk-status
      line wins over the data pack line for that desk only.
    - **Added to the UI:** a Routine health card on Home (counts by status), the day on the Morning brief card, the
      counts in the Outreach column headers (no lead cards: names are never stored), and "Updated <day>" under a desk's
      now line. The Sierra Leone mentions from entry 18 are kept in the empty-state source lines.
    - **Docs:** `api/os/_data/INGEST.md`, one curl per endpoint with the secret shown as `$TOKEN`.

## 2026-10-23 — Routines as workflows (phase 4)

23. **Routines open into an animated workflow.** Clicking a row opens `#routines/<id>`: trigger, steps and outputs drawn in SVG
    (rows of four on desktop that snake so every link is a straight line; one column on a phone), a pulse that moves along the links
    one node at a time (CSS animation, 600 ms per node), a Replay button, and the schedule (CT), owner desk, last run and health
    underneath. `prefers-reduced-motion` turns the pulse off.
    - **Data:** `routines.json` gains a `steps` field on all 14 routines, written by hand from the handoff's routine descriptions
      (13 have steps; the Slack task bridge is `null` because no procedure is written, and shows "Steps not written yet").
      Tools are named only where the handoff names them (Gmail, Google Sheets, YouTube, X, /ops, the vault). No outputs are invented.
    - **Still read only:** no Run button, no toggles. Last run and health still come only from the live routine-health record.

## 2026-10-23 — Desk chats (phase 5)

24. **/os gets one-on-one desk chats, and this is the first place /os sends something.** `#talk/<deskId>` (nav item "Talk", key
    `G T`, in More on a phone) lists the six desks that can Talk (CEO, Sales, Technical, Growth, Lifecycle, Researchy) with their
    last message and its time (America/Chicago), and shows the thread: founder bubbles on the right, desk bubbles on the left,
    typing dots while a desk has not answered, and a composer. Each desk's drawer gets a "Talk to <short>" button.
    - **No new server code and no model client.** The page calls the existing /ops Talk endpoints, same origin, with the founder's
      existing /ops session cookie and CSRF token (`credentials: same-origin`; the token comes from the thread GET):
      `GET /ops/desk-talk/<id>/thread` and `POST /ops/desk-talk/<id>/message` (`_agent_thread.js`), and for the CEO
      `GET /ops/ceo-bridge/thread` and `POST /ops/ceo-bridge/message` (`_ceo_bridge.js`). Whatever those do today (store the message,
      wait for the desk, run xAI if it is configured) is unchanged. The /os CSP already allows `connect-src 'self'`. No `/ops` file,
      `vercel.json` or env var changed.
    - **Auth is the /ops rule, not a new one:** no session, a non-founder session, agent credentials or a bad CSRF token are refused
      with **403** (that is what those handlers answer today; they do not use 401). The /os page itself still answers 302/401.
    - **Server text handling stays as /ops has it:** the server strips `<` and `>` from a message; the client escapes everything
      it shows and never shows the founder email that the thread payload carries.
    - **Polling:** while a desk is waiting, the open thread is re-read every 6 seconds; it stops when the desk answers or the
      view is left.
    - **Local only:** the dev server routes just those four /ops paths to the real handlers, with a session cookie minted for the
      first allow-listed founder, and only when the loopback dev bypass is open (flag, loopback, no Vercel). Threads live in that
      process (no KV), so nothing local reaches a real desk or a real store. The shell test's "no remote calls" rule now reads
      "the only fetch is talk.js, same origin, to those /ops paths".

## 2026-10-23 — AI Council as one conversation, common schema (phase 6)

25. **Each council run is one chat thread, one lane and colour per role.** Claude builds (blue), Codex reviews (violet), Jev scores
    (amber), Osman approves (green), with a legend at the top. Round by round: Claude's draft, Codex's review, Claude's revision
    (shown as a diff against the last draft, with the full draft behind a toggle), Jev's score (number, bar, PASS or FLAG), then Osman's
    gate ("Waiting for L3 OK" with typing dots, or the stored decision). A run with no score says "Jev: not run"; a run with nothing
    stored says so. Still read only: no model call, no buttons, no cost.
    - **Record shape:** `{id, title, desk, level, date, status, maxRounds, messages:[{round, role, agent, at, text, draft?, score?}]}`,
      documented in `api/os/_data/README.md`. The agent always follows the role, so a message cannot claim another lane. The old shape
      (`drafter`, `reviewer`, `rounds[]`) is still read and mapped to builder and reviewer messages; the record-level `jev` still works.
    - **`api/os/_data/council.json` holds 0 records** and an empty pack keeps `council` null, so the empty state stays honest. A
      `council` array in the store wins. One sample run lives in `tests/fixtures/council-sample.json`, used only by tests (and by a local
      screenshot), never shipped.
    - **`docs/os/SCHEMA.md`** is the common item schema (id, type, title, date, updated, desk, status, level, jev, tags, links, source,
      plus per-type extras). The vault notes pack and the council shape follow it. The five committed exports (decisions, routines,
      desks, skills, rules) are kept byte for byte, so the adapter maps them rather than the files being rewritten; SCHEMA.md says which
      type is where.
    - **Brain edges from `links[]` and `desk`:** a note's `links` give "links to" edges (both ends must exist) and its `desk` gives an
      "owned by" edge. The older exact-match relations are unchanged.

## 2026-10-23 — Precise notes filter

26. **The notes filter drops for specific reasons instead of any "@", "lead" or "customer".** It now lives in one module,
    `api/ops/_notes_filter.js`, used by `scripts/build-notes-pack.js` and re-checked by the notes feed on a push. A note is dropped when its
    title, path or body holds: a real **email** address (a bare "@handle" or a lone "@" is fine); a **phone** number (7 or more digits,
    optional +, spaces, dashes, parentheses; dates, times, version numbers, PR numbers, sizes, year ranges, money and ids inside URLs or
    identifiers are ignored); one of four **blocked words**; or **lead data**: a title or path naming a lead list, outreach batch, quote
    request or RFQ, or a markdown table with a Name, Business, Contact, School or Hotel column. Everything else is kept, including notes
    that only use the words "lead" or "customer".
    - **Manual drops:** a vault-root `.os-exclude` file (one glob per line, `#` comments) drops matching paths as `excluded`;
      `Skills/_NEVER-LOAD.md` is never shipped, whatever `.os-exclude` says.
    - **Output:** counts kept and dropped, a tally by reason, then each dropped file name with its reasons (`email`, `phone`,
      `blocked-word`, `lead-data`, `excluded`), never content. The builder also runs the feed's own validator over the pack before writing
      it, so a pack the feed would refuse is caught on the PC.
    - Still local: nothing is pushed by running the builder, and notes content is never committed.

