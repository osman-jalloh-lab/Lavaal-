---
name: slopmonster
description: >-
  Use this when checking or fixing writing (landing page, email, README, script,
  job post) for AI-sounding patterns: "de-slop this", "does this sound like AI",
  "humanize this", "fix this copy".
---
# SlopMonster (free checker only)

Source: https://github.com/ItsssssJack/SlopMonster (MIT, Jack Roberts). This setup includes only the free, local `deslop.py` checker. The paid second-model pass (`cleanse.sh`) is left out on purpose; get the owner's OK before any paid model pass.

## Steps
1. Identify the reader, the format, and what the reader needs from the text.
2. Run the checker (Python 3 stdlib, no key):
   - `python3 /home/box/agent-data/workflows/slopmonster/tools/deslop.py --text "..."`
   - `python3 /home/box/agent-data/workflows/slopmonster/tools/deslop.py draft.md` (also .html and .txt)
   It scores 0-5 over five categories (vocabulary, phrases/constructions, punctuation, rhythm, conversion). It exits 0 at 5/5 and 1 below that. It never edits the file.
3. Rewrite the flagged passages for the reader. Cut words that add nothing, keep claims tied to real facts, and never add invented numbers.
4. Re-run the checker until it scores 5/5, then reread the text for sense and accuracy. A 5/5 only means no known patterns matched.
5. Optional: a second review pass by a different model, only if it's free or the owner OKs the cost.

References: `/home/box/agent-data/workflows/slopmonster/references/signs-of-ai-writing.md`, `principles.md`, `sources.md`.
