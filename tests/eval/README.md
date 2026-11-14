# Held-out customer assistant evaluation

This is the synthetic held-out pack from Osman, dated 2026-11-13. Its 80 cases and expected behavior come from `/workspace/pr83-catalog-1113/test-pack.md`. These are proposed QA cases, not verified customer data, product availability, or approved product claims.

Never paste these cases into prompts, knowledge bases, few-shot examples, or catalogue data. Never import `tests/eval` from `api/`. Keep this pack separate from training and production knowledge. The runtime prompt builder may receive each case as the current visitor message solely to evaluate the existing code path; do not add the pack to its instructions or retrieval sources.

The runner exercises the real service with a fresh in-memory session per case, preserving that session across D-group turns. Model replies are mocked and network/transport attempts are blocked. Scores are **mocked code-path scores**, not live model quality measurements. `needsLive` identifies cases where the mocked model was used; it does not authorize a network call.

Run locally, without network access:

```sh
node tests/eval/run-eval.js --label before
node tests/eval/run-eval.js --label after
node tests/eval/run-eval.js --cost
```

The labeled run writes `results-<label>.json` and prints group and overall scores. `SCORES.md` records the baseline BEFORE table, hard-fail case IDs, and cases needing live evaluation. Reports exit successfully even when the evaluated product fails; harness errors fail execution.

Each case preserves the source interpretation and expected behavior verbatim. D-group sequences are split at `->`. `checks` translate expectations into conservative, case-insensitive regex strings, without regex delimiters. `intentAny` accepts at least one semantic cue; `intentAll` requires every cue. They are deterministic proxies, not a semantic judge. `clarify: one-question` requires exactly one question mark; `answer` permits a direct answer with an optional question. Explicit French cases require French; possible Krio wording alone does not prescribe a response language. State patterns inspect only the final reply and current structured context. A case-specific `note` explains ambiguous interpretation choices. Global hard-fail checks still apply to every turn, even when no case-specific prohibition is present.

An absence of hard fails is not proof of factual correctness, approved capabilities, privacy compliance, or readiness to deploy. Review individual replies and rubric limitations before interpreting aggregate scores. Do not tune product prompts or knowledge against these held-out cases.
