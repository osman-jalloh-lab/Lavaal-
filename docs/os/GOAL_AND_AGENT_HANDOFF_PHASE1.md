# LAVAALL OS: /goal and multi-agent handoff, phase 1

Status: **implementation in draft PR, not deployed or operationally verified**.

## Product boundary
- **Grok/xAI business side**: planning, drafts, outreach review, day-to-day coordination. Email send or external business action needs separate permission/connector and user approval.
- **LAVAALL OS engineering side**: the goal record, repository map, Codex/Claude/Grok chat, coding-run approvals, patch links, tests and reviewer checkpoints.
- **GitHub**: code truth, not assistant claims.
- **Obsidian**: optional synchronized notes and decision journal, not currently a live OS API integration.
- **Redis/KV**: current durable goal metadata and atomic checkpoint lists. Shared prior chat storage is still a separate read-modify-write document with concurrency risk.

## Implemented in this PR
1. Type `/goal Build a consent-safe applicant view` in Harness Request and press Send. This records an objective for the currently selected project; **no model call or code execution**.
2. The OS creates `goal-<uuid>` under `lavaall:goals:v1:item:` and places its ID on the project's Redis list. A goal does not rewrite the bundled `projects.json`.
3. The Goal panel lists recent saved goals (up to 50/project) and allows one to be selected for the current browser view.
4. A selected goal's objective, mapped repo and recent checkpoint notes (up to 12) are included in the next provider chat prompt using its `goalId`. The server verifies the goal belongs to the chosen project.
5. Manual checkpoint notes are appended atomically to a per-goal Redis list. Each is explicitly **unverified** and cannot be passed off as a code merge or executed task.
6. All goal routes flow through the existing founder-session gate; mutations require a same-origin HTTPS Origin header. Missing Redis configuration fails closed.

## Supported project routing
- `lavaall` → `osman-jalloh-lab/Lavaal-` (execution runner exists but needs real proof).
- `salonehire` and `saloneworks` → `osman-jalloh-lab/saloneworks` (context only, no coding runner).
- Other projects → no guessed execution repository.

## Not implemented yet
- Automatic Obsidian synchronization or access to existing private Obsidian vault.
- Reading Grok.com's conversation history or detecting a weekly subscription quota reset.
- Triggering xAI to run autonomously when quota becomes available. API-key chat and subscription quota are separate.
- Automatic GitHub status verification for checkpoints, PR creation, Claude CLI execution, multi-repo coding or safe background jobs.
- Production email/sending tools, job application submissions, or secrets/browser authorization for agents.
- Long-term transactional goal index, audit-log retention and redaction/export/delete UI.
- Direct per-agent authenticated writes. All checkpoint mutation currently requires founder session. Do not distribute the founder cookie to any agent.

## Phase 2
1. **OAuth repair (Grok currently owns):** keep existing Google callback exact-match rules; test stable `www.lavaall.com/os` login. Separate workstream, no auth edits in this PR.
2. **Goal run event ingestion:** pull signed workflow run and artifact evidence server-side; show `verified` only after GitHub confirms evidence. Attach commit SHA, branch, tests, timestamps.
3. **Scoped execution adapters:** map project → repo → runner → suite; distinct restricted credentials for private SaloneHire.
4. **Obsidian export/sync:** explicit connector or local bridge with encrypted access and note-level permission; sync curated goals/specifications and handoffs, not raw secrets, applicant CVs or unfiltered conversations.
5. **Handoff contract:** `goalId`, project, objective, owner, current state, last verified commit, open blockers, next action, provider, model, evidence links, timestamp. Providers read this before proposing work.
6. **Quota-aware model fallback:** only on true 429/quota or user choice, no automatic endless retries. Ask approval for paid execution and external writes.
7. **Task scheduling:** authorized user scheduler, not a speculative `Thursday reset`. Verify availability before kicking off approved work; never treat model subscription reset as API budget reset.

## Acceptance tests
- /goal persists on one request and appears in a later request.
- A checkpoint appends without overwriting earlier checkpoints.
- Invalid Origin POST is denied, missing founder session is denied through Harness gate.
- Unknown project, mismatched goal/project, bad evidence URL, missing KV and oversized objective are rejected.
- Provider chat receives explicitly selected goal context and labels claims unverified.
- All no-network safe tests pass; Preview smoke test proves persisted state under authenticated session.
- No writes to auth code or production deployments from this PR.

## One-shot business-to-engineering example
Grok drafts a SaloneHire consent feature spec → founder approves and saves a /goal in OS → Codex/Claude can read that goal's handoff in the OS → a separately approved agent runs code in an allowlisted repo → GitHub tests and patch are independently verified → the OS records evidence and marks work reviewable → Grok reads a summary to prepare business updates. **Only the goal and chat-context parts are built in phase 1.**

## Developer caveats
- Current /goal index requires both SET NX and LPUSH; failed second operation can leave a durable but unindexed goal. Fix with a transactional Lua script or repair process before scaling.
- Current checkpoint status is user-supplied, not a verified execution state. Never use it to authorize deployments.
- Single shared chat history KV document remains subject to lost updates.
- UI goal selection is ephemeral across page reloads. Readable saved goals remain in KV.
- Enforce true production security review before turning on new agent automation.
