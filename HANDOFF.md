# HANDOFF — P0 OS sign-out "sticks" investigation (branch `fix/os-signout-sticks`)

- Base: `origin/main` at `9419cf6`. Draft PR only. No merge, no deploy, no Vercel or Google Console change.
- Auth code is unchanged. Founder allowlist, Google flow, CSRF and rate limits are untouched.

## Report being investigated
22 Nov 2026, ~10:16 PM CT, www.lavaall.com: after Sign out from the /os sidebar, the page showed the /ops sign-in card and then appeared to return to /os signed in about 2 seconds later, with no click.

## What was checked (no code defect found)
1. `api/os/_page.js:62`: the OS Sign out button is a plain form, `POST /api/ops/auth` with `action=logout`, the same as /ops.
2. `api/ops/auth.js:298-305` `handleLogout` clears `lavaall_ops` (`_lib.js:291`, `Path=/`, host-only, Max-Age=0) and 302s to `/ops`. No cookie has ever been set with `Domain=` (git history checked), so www vs apex can't leave a second session cookie behind.
3. `api/ops/_html.js` `loginPage`: no `<script>`, no meta refresh. Google only starts from a POST `action=google` click. A plain `GET /api/ops/auth` redirects to `/ops?error=...` and never to Google (`auth.js:362-368`).
4. Production, read-only curl: `POST action=logout` returns `302 /ops` + `Set-Cookie: lavaall_ops=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`. `/ops` returns 401 with no script. `/os` without a session returns `302 /ops`. There's no service worker (`/sw.js` and `/service-worker.js` both return 404). All responses are `Cache-Control: no-store`.
5. Local headless Chrome (synthetic secret, loopback only): sign out from /os ends on /ops and stays there for 5.5 s. After that the cookie jar is empty. Pressing Back requests /os again, gets 302 to /ops and stays signed out (no bfcache restore).
6. The box browser used for the 10:16 PM test: its history shows `22:16:21` form submit /os to /ops and **no later lavaall.com navigation**. The tab was still on "/ops — LAVAALL OS — Sign in" at about 10:45 PM CT. The "back on /os" observation is not supported by that browser's own history. It was most likely a stale screenshot taken during the redirect.

## What this branch adds
- `tests/test-os-signout-sticks.js` (8 checks), a regression lock for "signed out stays signed out until Sign in with Google is clicked". It covers: the OS logout form, the logout cookie clear, the passive login page, /os after logout, a plain GET never starting Google, a stale `lavaall-os-return` cookie, and JSON logout.
- No production code change. Clearing `lavaall-os-return` on logout was tried and dropped. It adds almost nothing (sign-in already clears that cookie), and `tests/test-os-ingest.js` guards against any diff to `api/ops/auth.js`.

## Tests
- `node tests/test-os-signout-sticks.js`: 8/8
- `node tests/run-safe-suite.js`: TOTAL 90; PASS 90; FAIL 0 (89 existing test files + the new one).

## Next step
Osman checks it once in his own browser on https://www.lavaall.com/os: sign in, Sign out, wait 10 s, then reload /ops. It should stay on "Sign in with Google". If it does bounce back, note the exact URL bar and the time (CT) so it can be traced.

---

# HANDOFF — OS harness chat

- Branch: `feature/os-harness-chat`
- Base: `origin/main` at `dc874a7` (Merge pull request #99, harness switcher)
- Scope: draft PR only. No merge, production deploy, or Vercel env changes.
- Auth is unchanged. `/os` stays founders-only behind the existing Google sign-in.

## Architecture (honest)

Vercel serverless cannot run the Codex or Claude CLIs, cannot reach the private box, and cannot edit a local checkout. This version therefore uses the simplest path that actually works:

1. The founder-only `/os` Harness page is a type-and-send chat (Home + Chat). It talks only to same-origin `/ops/harness/*` (existing `/ops/:path*` rewrite; `vercel.json` is unchanged).
2. `/ops/harness/chat` calls the provider HTTP APIs from the deployment:
   - Codex on the page = OpenAI Chat Completions (`OPENAI_API_KEY`). This is not the Codex CLI and cannot open a ChatGPT login in the browser.
   - Claude = Anthropic Messages (`ANTHROPIC_API_KEY`), with a Sonnet / Haiku / Opus picker (default Sonnet).
   - DeepSeek = DeepSeek’s OpenAI-compatible chat API (`DEEPSEEK_API_KEY`).
   - Gemini is hidden and rejected (`harness_disabled`).
3. Shared context is still `tools/lavaall-ai/RULES.md` plus the project’s bundled handoff snapshot, composed on the server and also used to append a dated log line in the harness store after each run. The hosted model is told it cannot edit local files.
4. Chat history is stored under a separate KV key, `lavaall-os-harness-v1` (not the `lavaall-ops-v2` store). If KV is not bound, the reply still returns, but history will not survive a cold start (`persist: false`).
5. Replies are a single JSON response, not token streaming. The page shows a “Working…” placeholder until the reply arrives.
6. The local `tools/lavaall-ai` CLI is unchanged for real Codex/Claude CLI work on a computer (`codex login`, Claude CLI). The page no longer offers a copy-command.

## What landed

1. Chat box: pick group + project + harness, type a request, send, see the reply and per-project history.
2. Harnesses: Codex (setup path explains `OPENAI_API_KEY` in Vercel and `codex login` on his computer), Claude (model picker, default Sonnet), DeepSeek. Gemini off. No voice.
3. Project picker groups, from a snapshot of `/workspace/obsidian-bridge/staging/LAVAALL/Projects/INDEX.md` in `tools/lavaall-ai/projects-index.md` / `projects.json`:
   - LAVAALL — umbrella row plus the 15 INDEX sub-projects
   - SaloneWorks (there is no “SaloneWeb” row in the vault index)
   - Starlink
   - SaloneHire (already seeded in v1; not a table row in INDEX)
4. The Harness page is just those project tools: Home (usage/credit) and Chat. Other LAVAALL OS clutter was not added to this view.
5. Home usage is real or “not available”, never estimated:
   - DeepSeek: free `GET https://api.deepseek.com/user/balance` when `DEEPSEEK_API_KEY` is set.
   - Codex/OpenAI: usage is usually not readable with a regular API key → “not available”.
   - Claude: needs `ANTHROPIC_ADMIN_API_KEY`; totals are not wired in this version → “not available”.

## Env vars Osman must add (do not put values in the repo)

Add these in the Vercel project **lavaal** under Settings → Environment Variables, for Preview (and later Production if he chooses). Do not add them in this PR. This work did not change production or Preview env.

Required for in-page chat:

- `OPENAI_API_KEY` — Codex-style chat on the page (already documented in `.env.example`)
- `ANTHROPIC_API_KEY` — Claude chat (already documented)
- `DEEPSEEK_API_KEY` — DeepSeek chat and the balance display (now also listed in `.env.example`)

Already used by `/ops` if the KV store is bound; needed for durable chat history:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Optional (names only, not secrets):

- `OPENAI_HARNESS_MODEL` (default `gpt-4.1`)
- `ANTHROPIC_SONNET_MODEL` (default `claude-sonnet-4-5`)
- `ANTHROPIC_HAIKU_MODEL` (default `claude-haiku-4-5`)
- `ANTHROPIC_OPUS_MODEL` (default `claude-opus-4-5`)
- `DEEPSEEK_MODEL` (default `deepseek-flash`)
- `ANTHROPIC_ADMIN_API_KEY` — usage totals only; not wired to show numbers yet

Local CLI (not the page): `codex login` for the real Codex CLI; `GEMINI_API_KEY` still only matters to the CLI, because Gemini is off on the page.

## What works vs needs a key or sign-in

Works without new keys (after this branch is on a Preview and Osman is signed in with Google):

- The Harness page itself: groups, project picker, harness buttons, Claude model picker, type/send composer, Home/Chat tabs.
- Honest status dots (key present / key missing).
- Usage Home: “key missing” or “not available”, no invented totals.
- `409 key_missing` from `/ops/harness/chat` that names the env var to add.
- Local `lavaall-ai` CLI, including Gemini.

Needs a key or a local sign-in:

- In-page Codex chat: `OPENAI_API_KEY` on the Vercel project. ChatGPT/`codex login` is only for the CLI on his computer.
- In-page Claude chat: `ANTHROPIC_API_KEY`.
- In-page DeepSeek chat and a real balance figure: `DEEPSEEK_API_KEY`.
- History that survives reloads/cold starts: the existing KV binding.
- Founder Google sign-in, same as the rest of `/os` (anonymous `/os` still redirects).

No paid provider calls were made while building this. Tests mock those HTTP APIs. DeepSeek’s balance endpoint is only exercised with a mock.

## Tests

`node tests/run-safe-suite.js` on this branch (22 Nov 2026, 8:41 PM CT, America/Chicago): **TOTAL 87; PASS 87; FAIL 0**. That is the previous 86 files, plus `tests/test-harness-chat.js` (25 checks: auth, Gemini disabled, missing keys, prompt composition, mocked chat, history, usage never fakes numbers, no key leakage). `tests/test-os-harness.js` now covers the chat UI (29 checks). Existing suite files stayed green. No local `.env` was loaded.

## Constraints honored

- No merge, no production deploy, no Vercel env changes, no `vercel.json` or auth edits.
- No secrets in the tree. Test fixtures use obviously fake `sk-test-DO-NOT-PRINT-…` values only to assert they never appear in output.
- Founder-only: `/ops/harness/*` uses the same session as `/os` and rejects agent-looking requests.

## Founder follow-ups (not done here)

- Review the draft PR. Merge and production deploy stay waiting on Osman’s own yes.
- Add the env vars above in Vercel if he wants in-page chat to run on Preview. Do not paste keys into the repo or this file.
- For real Codex CLI work: `codex login` on his computer, then `lavaall-ai`.

## Draft PR

- URL: https://github.com/osman-jalloh-lab/Lavaal-/pull/100 (draft)
- Commit: `9a96303` on `feature/os-harness-chat`
- Vercel preview (deployment protection + founder Google sign-in): https://lavaal-git-feature-os-harness-chat-osman14.vercel.app
  - /os: https://lavaal-git-feature-os-harness-chat-osman14.vercel.app/os
  - Inspector: https://vercel.com/osman14/lavaal/8p2SFbSG915hivTWQK3LvyCMQK5o
- Vercel check: Ready (22 Nov 2026, 8:41 PM CT, America/Chicago). No merge or production deploy. Chat stays on the `key_missing` path until the keys are added in Vercel settings.
