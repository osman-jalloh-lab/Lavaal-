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
