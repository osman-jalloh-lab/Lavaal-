---
name: write-verify-loop
description: >-
  Use on every code change: one builder writes, a separate verifier runs, tests,
  screenshots and security-checks it, and returns PASS/FAIL with evidence before
  the owner decides. Nothing merges, deploys or publishes without the owner's
  yes.
---
# Write-verify loop
Builder writes; verifier verifies; owner decides. Nothing is merged, deployed, published or marked ready without the owner's explicit yes.

## 0. Before building
- [ ] Brief has the goal, acceptance criteria and a click-path (the screens to prove).
- [ ] Pick one builder: a cloud agent, Codex or a mid-tier model. Top-tier models only with the owner's OK. Log the cost estimate; anything paid beyond the plan needs the owner's OK first.
- [ ] Start from the real app's repo and components, never throwaway HTML. Work on a branch or sandbox copy and back up before editing.

## 1. Builder output
- [ ] A draft PR (or sandbox diff) with a summary, the files changed and a cost line.

## 2. Verify (independent of the builder)
- [ ] Read the diff: check for scope creep and tests edited just to pass.
- [ ] Run it locally or on Preview; it boots with no errors.
- [ ] Run the full test suite and compare the pass count against the base.
- [ ] Run the audit script, hash checked so it hasn't been changed, at phone (390) and desktop (1440) widths: contrast, 44px tap targets, 14px minimum text, labels, reduced motion, page-size budget. No regressions.
- [ ] Take click-path screenshots (plus video if it's free and local) and compare them to the brief item by item.
- [ ] Security pass: grep for secrets and keys, new network calls, auth or permission changes, input validation, new dependencies (none without approval), safety gates still enforced.
- [ ] Project rules: brand, content and policy rules from the project's rule docs.

## 3. Verdict
- [ ] PASS or FAIL with evidence: the commands, counts, screenshot paths and hashes.
- [ ] Add the project's decision-score line, if it has one.
- [ ] Receipt: Expected / Ran / Got / Assumed / Rule followed.
- [ ] A FAIL goes back to the builder with the exact failures. After at most 3 loops, escalate.
- [ ] A PASS goes to the owner as a draft PR with screenshots. Wait for their yes.

## Never
- Paid video or image generation, auto-merge, or parallel paid builders without a cost OK.
