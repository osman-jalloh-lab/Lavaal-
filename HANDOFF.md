## OS engineering-room cleanup (feature/os-engineering-cleanup, draft)

- `OS_BUSINESS_PAGES` defaults off; only `1` or `true` enables the business pages. No environment variable was added in Vercel.
- Hidden by default: Home, Outreach, Desks, Talk, Notes, AI Council, Spend, Routines, Decisions + Jev, and Brain. AI room (Harness) and Settings remain visible. Decisions + Jev is business HQ's decision log and scoring; Brain maps business desks, rules, skills, routines and decisions. Engineering work is in the AI room.
- `/os` lands on AI room in both flag modes. The flag restores the previous business navigation and data loading; no business code was deleted and `/ops` business workflows were not changed.
- Intake QA: intake links focus their approval card; approval confirmation explains what happens after submission; project and goal links select their records; intake stubs appear in the picker; intake response links use a safe request host; submitted intakes appear in the room.
- S1–S6 and authentication remain unchanged. No secrets are included. `node tests/run-safe-suite.js` on 23 Nov 2026 (America/Chicago): TOTAL 95; PASS 95; FAIL 0 (94 files on the intake base, plus `tests/test-os-engineering-room-client.js`). Coverage includes both flag modes, the AI-room landing, intake-link focus and confirmation, project/goal links, stub projects, intake host and list, and disabled business fetches.

---

# HANDOFF — PR #103 /goal + handoffs v1 (branch `feature/os-goal-handoffs-v1`)

Status: DRAFT. No merge, no deploy, no env or settings changes. `/goal` = engineering objective inside the OS; `/project` intake is built separately and is not in this branch.

## Done (Nov 22, 2026 fix pass)
- `api/os/_client/harness.js`: fixed over-escaped `/goal` regexes (`/^\\/goal.../` → `/^\/goal(?:\s|$)/i`) that made app.js fail to compile.
- Checkpoint UI now has an optional evidence link field and a goal state select; Save sends `state` and `evidenceUrl` (omitted when empty) and reloads the goal list. Goal buttons show the current state.
- `api/ops/_harness_goals.js` `checkpoint()`: after the append, the goal record is updated (`state`, `updatedAt`, `latestCheckpointId`) with `SET ... XX`; response includes `goal`. Checkpoints remain `verification: 'unverified'`; `execution` is unchanged.
- `tests/test-harness-goals.js`: fake KV supports `XX`; asserts goal.state/latestCheckpointId update, invalid state rejected without changing the goal, client source compiles and sends evidenceUrl/state.

## Tests
- Local `node tests/run-safe-suite.js`: TOTAL 90; PASS 90; FAIL 0 (was 88/90).

## Next step
- Founder reviews CI + preview. Known limit: the goal update is read-modify-write (last writer wins); checkpoints are not verified against GitHub yet — that belongs to the shared-memory / verified-runs work.

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

## OS project intake + provider registry (feature/os-project-intake, draft)

- **Endpoint:** `POST /api/os/ingest/project-intake` (existing dynamic function; no new Vercel function). `OS_INTAKE_TOKEN` bearer (>=32 chars, distinct from bridge/session secrets, constant-time) only authenticates the sender; it creates no session and works on no other route.
- **Consent (S2 done):** one founder-approval record type in `api/ops/_approvals.js`. Only Osman's signed-in session can mint it: `POST /ops/harness/approvals` (existing founder `deny()` gate + same-origin check; session email must be in `APPROVERS`, currently only osmanjalloh104@gmail.com; sign-in allowlist and cookie behaviour unchanged) with `{ action: 'intake_create', payload: <intake body without approval_id> }`. The server validates the payload and stores `approvals:<appr-uuid>` = `{ action, requestHash, approver, createdVia: 'founder_session', expiresAt (15 min) }`. The intake must send that `approval_id`; it is consumed once via `approvals-used:<id>` (SET NX) and must match action + request hash + expiry. The token alone can no longer mint an approval. Built so plan approval and code runs can add their action names and consume the same record later.
- **Request hash:** `sha256("lavaall-os-intake-v2\n" + canonicalJson(body without approval_id))`; the idempotency key is inside the hash.
- **S3 done:** a catalog project is used only when `existing_os_project` is given. Every other intake becomes a pending stub with id `stub-<slug>` (never a catalog name), repository null, claimed repo stored unverified.
- **S5 done:** any unknown field (top level or project) -> 400 `unknown_field`; field names are not echoed. Email/phone-like text -> 400 `pii_detected`.
- **S6 done:** goals with `source: business_intake` are inserted into chat prompts inside an `UNTRUSTED_INTAKE_TEXT` block labelled as data, not instructions (`api/ops/_harness_chat.js`). Founder-created goals keep #103's format.
- **S4 done:** `rootFor(env)` in `api/ops/_harness_goals.js` owns every goals/intake/approval key prefix. Production: `lavaall:goals:v1:<kind>:<id>` (unchanged from #103). Everything else: `lavaall:preview:goals:v1:<kind>:<id>`. Kinds: `item`, `events`, `project`, `catalog`, `tasks`, `approvals`, `approvals-used`, `intake`, `intake-idem`, `intake-rate`. Preview approvals cannot be used in production. Goals created on #103 Previews before S4 sit under the old root and are no longer listed by Preview.
- **S1 done:** 404 unless `VERCEL_ENV=preview`, or production with `OS_INTAKE_PRODUCTION_ENABLED=1` (not set anywhere). Completed identical requests replay their stored 200 even after the approval expires (N1).
- **Registry:** `tools/lavaall-ai/providers.json`, `GET /ops/harness/providers` (founder session, `configured` booleans only).
- **Env / test status (22 Nov 2026, CT):** `OS_INTAKE_TOKEN` is a sensitive Preview var scoped to branch `feature/os-project-intake` only; no Production token. Preview and Production share the same KV variables; S4 keeps the keys apart. No KV-writing live test has run (POST through deployment protection needs `vercel login` on the box or an approved bypass). Rotate/remove the token after testing.
- **Approve intake UI:** `/os/?intake=<base64url JSON>#harness` (signed in) shows a "Pending project intake" card with the documented fields escaped and an Approve button -> `POST /ops/harness/approvals`; shows approval ID + expiry. Cards with unknown fields show no button.
- **Live Preview tests (23 Nov 2026, 12:00 AM CT, `vercel curl`, head a04d59c):** no token 401; bare founder_approved 400 `unverified_approval_field`; made-up approval_id 403 `approval_not_found`; unknown field 400 `unknown_field`. Positive 201 needs Osman's Approve click.
- **Next steps / open:** UI picker wiring for the registry, send-time cost approval, the business-assistant `/project` side, N2 partial-failure cleanup after the goal is written.
