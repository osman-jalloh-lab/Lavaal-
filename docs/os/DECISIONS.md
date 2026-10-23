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
