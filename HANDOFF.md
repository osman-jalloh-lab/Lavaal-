# HANDOFF — OS harness switcher

- Branch: `feature/os-harness-switcher`
- Base: `origin/main` at `1621cc9` (Merge pull request #92, SEO basics)
- Scope: draft PR only. No merge, deploy, Vercel production env changes, or outbound mail.
- Auth, layout, brand, and `/ops` sign-in are unchanged. `/os` stays founders-only behind the existing Google sign-in.

## What landed

1. CLI `tools/lavaall-ai/lavaall-ai` (stdlib Python):
   - `lavaall-ai status` — free only: CLI versions, key presence, and provider `/models` lists. Never prints keys.
   - `lavaall-ai projects`
   - `lavaall-ai <harness> <project> "task"` and `--dry-run` (prints the composed RULES.md + HANDOFF.md + task prompt; no model call, no log append)
   - Harnesses: `codex` (`codex exec`, ChatGPT login), `claude` (`--model sonnet` only), `deepseek` (stdlib helper, `DEEPSEEK_API_KEY`, default `deepseek-flash`), `gemini` (Gemini CLI if present, otherwise stdlib helper; `GEMINI_API_KEY`, default `gemini-2.0-flash`; status says `key missing` when the key is unset)
2. `projects.json` is seeded with SaloneHire (`/workspace/sw-interview-1121`, branch `feature/interview-tools`, handoff `/workspace/salonehire-ai/HANDOFF.md`). After a real run the CLI appends a dated log line and mirrors it to Obsidian at `Projects/<Category>/<Project>/ai-handoff.md`, plus a bundled snapshot under `tools/lavaall-ai/handoffs/`.
3. Founder-only `/os` Harness page (nav item under More, shortcut G A): project dropdown, harness buttons with status dots, last 10 bundled handoff lines, copy-command button. The page does not call models or `/models`. DeepSeek/Gemini status on the page is key presence only; Codex/Claude are labeled as local CLIs.

## Status observed on this computer (22 Nov 2026, 8:05 PM CT, America/Chicago)

- `codex: ready (codex-cli 0.159.1)`
- `claude: ready (2.1.329 (Claude Code)); will use --model sonnet`
- `deepseek: ready (key present, /models HTTP 200; listed: deepseek-flash, deepseek-v4-pro). Default model: deepseek-flash`
- `gemini: key missing`
- Dry-run for all four harnesses on `salonehire` printed the composed prompt and did not append to the SaloneHire handoff. No paid coding calls were made.

## Tests

`node tests/run-safe-suite.js` on this branch: **TOTAL 86; PASS 86; FAIL 0**. That is the previous 84 files plus `tests/test-lavaall-ai.js` (46 checks) and `tests/test-os-harness.js` (23 checks). No local `.env` was loaded. New files cover CLI arg parsing, dry-run composition, handoff append + Obsidian mirror, and the /os Harness view (no secrets, no fetch, last 10 log lines).

## Constraints honored

- No merge, no production deploy, no Vercel env changes, no `vercel.json` or auth edits.
- No secrets in the tree. Test fixtures use an obviously fake `sk-test-DO-NOT-PRINT-…` value only to assert it never appears in output.

## Founder follow-ups (not done here)

- Review the draft PR. Merge and production deploy stay waiting on Osman's own yes.
- Optional: set `GEMINI_API_KEY` (or install the Gemini CLI) so the Gemini harness can run for real. Do not paste the key into the repo or this file.
- Optional: put `tools/lavaall-ai/lavaall-ai` on PATH (`ln -sf … ~/.local/bin/lavaall-ai`).
- A Vercel preview, if one builds from the draft PR, can be used to look at `/os` (founders only, same Google sign-in). The Harness page still does not call models.

## Draft PR

- URL: https://github.com/osman-jalloh-lab/Lavaal-/pull/99 (draft)
- Commit: `36658f8` on `feature/os-harness-switcher`
- Vercel preview (deployment protection + founder Google sign-in): https://lavaal-git-feature-os-harness-switcher-osman14.vercel.app
  - /os: https://lavaal-git-feature-os-harness-switcher-osman14.vercel.app/os
  - Deployment: https://lavaal-iik2eqj4q-osman14.vercel.app
- Vercel check: success (22 Nov 2026, 8:03 PM CT, America/Chicago). No merge or production deploy.
