# HANDOFF — Remove Slack Command Center

- Branch: `chore/remove-slack`
- Base: `origin/main` at `9317148abef9220f0f1691a3ff524ca2b87bec9f`
- Scope: draft PR only. No merge, deploy, credential rotation, Vercel environment changes, or connector changes.
- Read `AGENTS.md` and repository `MAGNUM.md` completely (`/MAGNUM.md` is absent). No conflicting Slack requirement in MAGNUM; leave it unchanged.

## Progress

1. Complete: moved the pure classifier, agent registry, skill registry, and status helpers from `api/slack/_router/` to `api/ops/_router/`. Retargeted Talk, Assign, Routines, and Untrusted imports to `./_router/classify`. The underscore folder keeps helpers out of Vercel HTTP routes. Used filesystem moves because workspace `.git` is read-only.
2. Complete: deleted the entire remaining `api/slack/` tree: commands, events, interactions, signing/API helpers, approval UI, bridge, and route-task I/O. No Slack HTTP surface remains.
3. Complete: renamed `SLACK_FALLBACK` to `OPS_FALLBACK`; replaced helper-error Slack guidance with retry guidance in /ops Talk or routines. Fixed obsolete active-Slack comments. Preserved denial of Slack signature/timestamp headers and data-only safety checks.
4. Complete: replaced `test-slack-handlers.js` with `test-ops-classify.js` (pure classify + status only), replaced the deleted bridge test with the existing data-only `agentPendingItem` path, and updated removed-routine expectations. No `api/slack` imports remain in tests. Full suite recorded below.
5. Complete: updated live-path docs, example environment config, and removed routine status. Historical decisions unchanged; form backend comment only.
6. Complete: handoff includes inventory, actual tests, security impact, and founder follow-ups.
7. Local commit prepared in the writable temporary checkout; remote push and draft PR are blocked by session restrictions. No draft PR URL exists yet. See publishing details below.

## Tests

Ran every `tests/test-*.js` exactly once via plain `node` (no package.json), capturing exit codes and each file's reported checks. **42/42 files passed; 0 failed; 2,125/2,125 checks passed.** No local `.env` was loaded.

Baseline at the base SHA: 42 files, 41 passing / 1 failing; 2,188/2,192 checks. The four failures were classifier helper availability expectations in `test-slack-handlers.js`, caused by inherited API-key presence. The rewritten pure test clears/restores those two environment variables for its unavailable cases, and explicitly tests the connected cases with dummy values. All original pure sample assertions remain; classifier runtime logic and registries are unchanged.

The check count changed because Slack HTTP/signing/bridge/approval UI tests were retired. Talk (chat + CEO + desk), Assign, Routines, Untrusted, /os, auth, and marketplace suites pass.

| Test file | Passed checks |
|---|---:|
| `tests/test-inquiry-and-schedule.js` | 64/64 |
| `tests/test-ops-assign.js` | 44/44 |
| `tests/test-ops-auth.js` | 115/115 |
| `tests/test-ops-calendar.js` | 29/29 |
| `tests/test-ops-ceo-bridge.js` | 91/91 |
| `tests/test-ops-chat.js` | 32/32 |
| `tests/test-ops-classify.js` | 42/42 |
| `tests/test-ops-desk-talk.js` | 76/76 |
| `tests/test-ops-founder-polish.js` | 17/17 |
| `tests/test-ops-founders-dm.js` | 96/96 |
| `tests/test-ops-google-hint.js` | 20/20 |
| `tests/test-ops-inbox-triage.js` | 50/50 |
| `tests/test-ops-inbox.js` | 28/28 |
| `tests/test-ops-issues.js` | 9/9 |
| `tests/test-ops-kits.js` | 66/66 |
| `tests/test-ops-map.js` | 46/46 |
| `tests/test-ops-memory.js` | 20/20 |
| `tests/test-ops-office.js` | 25/25 |
| `tests/test-ops-routine-health.js` | 42/42 |
| `tests/test-ops-routines.js` | 19/19 |
| `tests/test-ops-shell.js` | 34/34 |
| `tests/test-ops-signin-hardening.js` | 41/41 |
| `tests/test-ops-store.js` | 19/19 |
| `tests/test-ops-untrusted.js` | 6/6 |
| `tests/test-os-brain.js` | 70/70 |
| `tests/test-os-council-spend.js` | 67/67 |
| `tests/test-os-council.js` | 32/32 |
| `tests/test-os-data.js` | 66/66 |
| `tests/test-os-desk-names.js` | 20/20 |
| `tests/test-os-dev-bypass.js` | 32/32 |
| `tests/test-os-home.js` | 37/37 |
| `tests/test-os-ingest.js` | 110/110 |
| `tests/test-os-mobile.js` | 38/38 |
| `tests/test-os-notes.js` | 109/109 |
| `tests/test-os-pack.js` | 66/66 |
| `tests/test-os-return.js` | 35/35 |
| `tests/test-os-routines.js` | 44/44 |
| `tests/test-os-shell.js` | 53/53 |
| `tests/test-os-talk.js` | 87/87 |
| `tests/test-os-views.js` | 86/86 |
| `tests/test-public-contact.js` | 12/12 |
| `tests/test-web.js` | 130/130 |

## Security finding

Removing the Slack HTTP and approval handlers eliminates the code path behind the High finding **"any Slack member can Approve L3/L4"**. The /ops classifier and existing auth/approval boundaries remain in place.

## Remaining founder steps

- Review and merge the draft PR when ready.
- Delete Vercel `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` after removal is accepted.
- Uninstall the Slack app from the workspace.
- Disconnect Cursor connector `user-Slack--work` / plugin `674`.

These founder steps are not performed by this PR. No box-only files or MCP connectors are changed.

## Publishing environment

The workspace `.git` is mounted read-only (`git mv` cannot create `.git/index.lock`), and shell Git/`gh` cannot resolve/connect to GitHub. A writable temporary Git checkout at `/tmp/lavaall-remove-slack-publish` is used to stage, verify, and commit the exact repository diff. The authenticated GitHub connector reports account `osman-jalloh-lab`, but its first write (`create_blob`) was refused: "MCP tool call requires approval, but approval policy is never". No remote write succeeded. The workspace files contain the final changes; its read-only Git metadata cannot advance locally.

The local commit is exported as `/tmp/lavaall-remove-slack.patch` and `/tmp/lavaall-remove-slack.bundle`. Draft PR body: `/tmp/lavaall-remove-slack-pr-body.md`. Publish the prepared `chore/remove-slack` commit from a writable/network-enabled checkout as Osman, then run:

```bash
git push origin chore/remove-slack
gh pr create --draft --repo osman-jalloh-lab/Lavaal- --base main --head chore/remove-slack --title 'chore: remove Slack integration (keep /ops classifier)' --body-file /tmp/lavaall-remove-slack-pr-body.md
```

No merge or production setting changes are authorized or performed.
