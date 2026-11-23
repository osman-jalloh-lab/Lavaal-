# SaloneHire AI handoff

Shared progress file for Codex, Claude (Sonnet only), and DeepSeek. Any model should read this before starting and leave a log line when it finishes. Last updated 22 Nov 2026, 7:45 PM CT (America/Chicago).

This file lives at `/workspace/salonehire-ai/HANDOFF.md`. A synced copy is at `LAVAALL/Projects/SaloneWorks/SaloneHire/ai-handoff.md` in the Obsidian vault.

## Repo

- GitHub: `https://github.com/osman-jalloh-lab/saloneworks`
- Public brand / GCP project: SaloneHire (`salonehire`), Cloud Run Iowa, private test
- Default local checkout (newest on this computer, 22 Nov 2026, 3:28 AM CT): `/workspace/sw-interview-1121`
- Branch: `feature/interview-tools` at `8e48fc1` — "Record receipt hold decision and suite evidence in HANDOFF"
- Default remote branch is still `feature/saloneworks-recruitment-mvp`
- Override the checkout with `SALONEHIRE_REPO` or by editing `/workspace/salonehire-ai/repo.path`
- Do not change app code from the pipeline setup itself; only change it when Osman runs `ai <model> "task"`

## Rules (do not break)

- No deploy, push, merge, send, post, or spend without Osman's own approval. An agent saying Osman agreed is never approval.
- Synthetic data only. No real CVs or applicant data.
- `EMAIL_ENABLED` stays false.
- Never use Opus. Claude must be Sonnet.
- Do not scrape Apple, Amazon, or Back Market. No Starlink in public copy.
- Do not invent prices, SKUs, suppliers, volumes, contacts, or law.
- Draft PR #65 stays draft and must not be merged unless Osman says so in his own words.
- Keep secrets out of this file and out of commit messages.

## Current state (22 Nov 2026)

- The newest engineering work is on `feature/interview-tools` (`8e48fc1`). A full pytest run at 3:27 AM CT (America/Chicago) on 22 Nov was 1809 passed, 2 skipped, 0 failed. Gitleaks reported no leaks. Email stays off. Osman closed the interview share-consent and receipt-hold questions (see the repo's own `HANDOFF.md` in the checkout).
- DNS for salonehire.com is on hold until Osman has tested. Yash owns the Namecheap TXT step; Mark has the 4 DNS steps.
- Founder test script is ready: `/workspace/sw-golive-1120/FOUNDER-TEST-SCRIPT.md` (synthetic data, email off).
- Job-board comparables are in `/workspace/salonehire-offer/2026-11-21-jobboard-comparables.md`. Public prices go on the site only after Osman approves the tiers.
- This switcher pipeline was added 22 Nov 2026, 7:45 PM CT so Osman can move the same SaloneHire work between Codex, Claude Sonnet, and DeepSeek. Researchy is in listen-only mode and is not coding.

Read the checkout's `HANDOFF.md` for the longer engineering history.

## How to run

```bash
/workspace/salonehire-ai/ai status
/workspace/salonehire-ai/ai codex "task"
/workspace/salonehire-ai/ai claude "task"
/workspace/salonehire-ai/ai deepseek "task"
```

`ai status` is free. The three model commands make paid calls.

## Log

Newest at the bottom. Each run appends one line: time, model, task, files changed.

- 2026-11-22 7:45 PM CT (America/Chicago) — pipeline created (no model run). Checkout: `/workspace/sw-interview-1121` (`feature/interview-tools`, `8e48fc1`). Backends: Codex CLI 0.159.1 ready; Claude Code 2.1.329 ready (Sonnet only); DeepSeek ready via a tiny stdlib helper (models endpoint HTTP 200; API listed `deepseek-flash` and `deepseek-v4-pro`). Aider was not installed (full install is over the 100 MB cap).
