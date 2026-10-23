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
