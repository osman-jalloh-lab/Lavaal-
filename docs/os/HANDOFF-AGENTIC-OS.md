# HANDOFF: LAVAALL OS "agentic OS" build (for Codex or the next Claude session)

Written 25 Nov 2026, about 9:30 PM CT, by Claude Code (cloud session). Read `AGENTS.md` and `MAGNUM.md` first, as the repo requires.

## Goal (from Osman)

Turn `/os` (founder-only, behind Google sign-in at https://www.lavaall.com/os) into his personal agentic OS, modeled on the *structure* of Jack Roberts' Agentic OS (Skool community template), but in **LAVAALL's own brand**. Runs online (Vercel) so it works from any device; a local copy runs with `scripts/os-dev-server.js`. Models work as a team: Claude, Codex (OpenAI API), DeepSeek, Grok (xAI). Cut token waste everywhere.

Do **not** copy Jack's code or branding into this public repo; only the layout ideas.

## Rules that still apply

- `tools/lavaall-ai/RULES.md`: no deploy/merge/send/spend without Osman's own yes; draft PRs; Claude Sonnet only, never Opus; never invent prices/SKUs/people.
- Merging to `main` deploys production on Vercel (project `lavaal`, team `osman14`). Only merge when Osman says so.
- Run `node tests/run-safe-suite.js` after every change. CI runs the same suite (`safe-tests`) on PRs.

## Done and live (merged to main, production deploy READY)

| PR | What |
|---|---|
| [#113](https://github.com/osman-jalloh-lab/Lavaal-/pull/113) | Token diet for the Harness chat: last 6 turns clipped to 1,500 chars, last 5 log lines, rules+project in a cacheable system prompt, 2,048-token reply cap, Opus refused |
| [#114](https://github.com/osman-jalloh-lab/Lavaal-/pull/114) | Build page + `build-log` ingest feed (docs: `api/os/_data/INGEST.md` §7) |
| [#115](https://github.com/osman-jalloh-lab/Lavaal-/pull/115) | Sidebar grouped into sections with tabs; LAVAALL brand theme (ink/off-white/sky/lime/sun/coral, Bricolage Grotesque titles); flaky Kits KPI test fixed |
| [#116](https://github.com/osman-jalloh-lab/Lavaal-/pull/116) | AI bar in the header (key present = lime dot); "Ask anything" on Home routes to Codex/DeepSeek/Grok/Claude (`OS.routeAsk` in `api/os/_client/core.js`) and pre-fills AI models chat; sending stays a click |
| [#117](https://github.com/osman-jalloh-lab/Lavaal-/pull/117) | **Jarvis voice**: orb on every page; `POST /ops/voice/session` mints a short-lived OpenAI Realtime secret (`api/ops/_voice.js`); tools `ask_os` (answers via `/ops/harness/chat`) and `navigate`; `/os` CSP allows `api.openai.com`, `vercel.json` allows same-origin mic on `/os(.*)`. Home "Hotel bounce rate" tile replaced by "Waiting on you" (Build items with status waiting) |

Not yet confirmed by Osman: a real Jarvis voice call on production (needs his mic; `OPENAI_API_KEY` must have Realtime access).

## Open draft PRs

| PR | State | Next step |
|---|---|---|
| [#119](https://github.com/osman-jalloh-lab/Lavaal-/pull/119) Progress + saved Memory | Ready, tests pass locally (92/92) | Merge when Osman says "merge 119". Adds `/ops/os/saved` (KV key `lavaall-os-saved-v1`), Progress section, Memory → Saved tab, Jarvis `save_memory` |
| [#118](https://github.com/osman-jalloh-lab/Lavaal-/pull/118) Inbox | **Do not merge.** Reads the `OPS_GMAIL_*` mailbox, which Osman says is the wrong account | Build a "Connect Gmail" OAuth button (read-only `gmail.readonly` scope, founder-only, refresh token stored encrypted in KV, e.g. with the `_founders_dm.js` AES-GCM pattern), then point `_os_inbox.js` at that token. Osman must add the redirect URI `https://www.lavaall.com/ops/os/gmail/callback` to the Google OAuth client (the one `/ops` sign-in uses, `OPS_GMAIL_CLIENT_ID`) and enable the Gmail API |

## Roadmap still to build (Jack's OS parity, in Osman's priority order)

1. **Connect Gmail** (above), then merge #118.
2. **Build page posting**: Osman approved reading `OPS_CEO_BRIDGE_SECRET` from Vercel to post to `/api/os/ingest/build-log`. Not done yet. Post the current state of these PRs as build items.
3. **Calendar on Home** (reuse `api/ops/_calendar.js` / Google sign-in).
4. **Money**: real revenue next to AI spend (ask Osman where payments land: Stripe, bank, QuickBooks).
5. **Fish Audio voice for Jarvis** (cheaper). The Vercel var is named `FishAudio`, Production only; rename to `FISH_AUDIO_API_KEY` and add to Preview first.
6. **Studio / Design / Websites** (Higgsfield API): last.
7. **Token diet for the Grok team bots** (Yash CEO, Richard Research, Sarah Marketing, Mini Engineer, Drake CFO, Scotty, Alison CS) and the job-search scheduled tasks (Daily job applications runs on Opus with ~20 unused connectors). Osman has not said yes to changing those.

## Vercel env (names only, verified 25 Nov via API)

Present: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY` (prod+preview), `OPS_GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/FROM`, `OPS_CEO_BRIDGE_SECRET`, `KV_REST_API_URL/TOKEN`, `FishAudio` (prod only). Stray duplicate: `XAI_API_KEYy` (safe to delete).

## SaloneWorks / SaloneHire (repo `osman-jalloh-lab/saloneworks`, default branch `feature/saloneworks-recruitment-mvp`)

- Merged: #71 (each CV scanned once; a scanner hiccup no longer loses an application), #72 (GitHub Actions: full pytest on SQLite + Alembic/retention on Postgres 16), #69 (listing expiry), #70 (share-consent wording, migration 0025).
- Closed as superseded or already merged: #16–#27, #29, #40, #41, #51, #52, #53, #57, #58, #67, #68.
- Still open: #42 (visual polish), #32 (reference-only for Grabs).
- Known launch gaps (QA `docs/qa/2026-11-18-salonehire-qa.md`): Tailwind Play CDN (slow on mobile data), two "being built" pages (candidate notifications, saved jobs), placeholder logo.
- Deploy target: Google Cloud Run (`deploy/cloudrun/`).

## How to run and test

```bash
node tests/run-safe-suite.js                        # full suite (about 10 min)
OS_DEV_BYPASS=1 node scripts/os-dev-server.js       # /os locally at http://localhost:3100/os, no sign-in
```

New test files from this work: `test-os-command-center.js`, `test-os-voice.js`, `test-os-inbox.js` (on #118), `test-os-saved.js` (on #119).

## Key files

- Shell and nav sections: `api/os/_client/core.js` (`SECTIONS`, `NAV`, `OS.routeAsk`, `OS.aiBar`)
- Views: `api/os/_client/*.js` (`build.js`, `voice.js`, `saved.js`, `inbox.js`), styles `api/os/_client/os.css`
- Bundle order: `api/os/index.js`; page shell and CSP: `api/os/_page.js`
- Server: `api/ops/_voice.js`, `api/ops/_os_saved.js`, `api/ops/_os_inbox.js`, feeds `api/ops/_os_feeds.js`, routing `api/ops/index.js` (`opsDispatch`)
