# LAVAALL shared memory: knowledge

The one shared memory for LAVAALL OS, Drake, Claude, Codex and every other builder. Git is the source of truth. Read `docs/os/PICK-UP-HERE.md` first.

Source: Osman's build prompt `2026-11-26-os-one-shot-build-prompt.md` (26 Nov 2026, about 7:05 PM CT), "Core — one shared git memory".

## What lives where

| Path | Role |
|---|---|
| `docs/os/knowledge/` | Business briefs and sourced facts (this folder). |
| `docs/os/DECISIONS.md` | Decisions log. Extend it; never fork a second log. |
| `docs/os/knowledge/ACTIVITY.md` | What landed: sha, PR, title, time (America/Chicago). |
| `docs/os/PICK-UP-HERE.md` | One-page start pointer into the three above. |

Business folders come in Phase 1: `lavaall/`, `salonehire/`, `web/` (LAVAALL Web, the `/web/` product; also called SalonWeb or Laval Web), the private fourth line, and `saloneworks/` if sourced. Each gets a `README.md` (the brief) and a `SOURCES.md`.

## Rules

1. **Every fact has a source path and a date.** No source, no fact. Write `not in brief` or `UNVERIFIED` instead of guessing.
2. **Changes are draft PRs.** Nobody edits `main` directly. The OS Memory page proposes a new note as a draft PR; Osman merges.
3. **One memory.** The OS cache in KV holds only the last merged snapshot and its content hash. If git is newer, the cache is ignored and rebuilt. A fact that exists only in KV (for example an old "Saved memory" note) is not canonical until it is proposed and merged here.
4. **No secrets, no personal data.** Public business contact only: `support@lavaall.com`. No personal emails, phones, CVs or customer records.
5. **No invented numbers, prices, contacts, testimonials or law.**

## How the OS reads this

`node scripts/build-knowledge-pack.js` compiles this folder into `api/os/_data/knowledge.json` (paths, text and a content hash), because Vercel only ships files the code `require`s. A test fails if the pack and this folder disagree, so run the script after editing a file here.

## Notes proposed from the OS

New notes arrive as `docs/os/knowledge/<business>/notes/YYYY-MM-DD-<slug>.md` with a `source:` and `date:` line at the top.
