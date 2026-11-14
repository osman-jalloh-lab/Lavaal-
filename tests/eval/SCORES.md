# Held-out eval scores (mocked model, deterministic code path)

Scorer: tests/eval/run-eval.js (recalibrated, see RECALIBRATION.md). The model is mocked; no live calls were made.
BEFORE was recorded at 92157c9 in a separate worktree. AFTER was recorded on the eval-fix tree (on top of b48f664).

| Group | BEFORE /10 (92157c9) | AFTER /10 | Δ |
|---|---:|---:|---:|
| A Under-specified products | 7.70 | 8.70 | 1.00 |
| B Typos / phonetic | 5.50 | 9.00 | 3.50 |
| C Sierra Leone / Krio / French | 4.50 | 7.80 | 3.30 |
| D Multi-turn corrections | 4.40 | 5.00 | 0.60 |
| E Truthfulness | 6.30 | 7.00 | 0.70 |
| F Web intent | 5.40 | 6.70 | 1.30 |
| G Trust / safety | 6.50 | 9.20 | 2.70 |
| H Tech-vs-Web switching | 4.90 | 7.20 | 2.30 |
| **Overall** | 5.65 | 7.58 | 1.93 |

Hard fails BEFORE: D04 (unverified-claim); D07 (unverified-claim); H01 (unverified-claim)
Hard fails AFTER: none

Cases still needing the live model (AFTER, 20): B01, C02, D10, E01, E03, E05, E06, E07, E10, F02, F04, F05, F08, F09, F10, G01, G02, G09, H07, H10

## Live model cost estimate (not run)
Covers every AFTER turn that would call deepseek-flash. Input = buildMessages bytes/4; output = the 480-token cap per turn (worst case).

| Live turns | Live cases | Input tokens | Max output tokens | deepseek-flash peak | deepseek-flash off-peak | Gateway fallback (gpt-4o-mini est.) | Reserved by service |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 21 | 20 | 14,100 | 10,080 | $0.0163 | $0.0082 | $0.0163 | 21 cents |

That works out to about 670 input and 480 output tokens per turn, roughly $0.0008 per case at peak. The service reserves 1 cent per turn, inside the $25/month cap.
Jev: not run (paid call).
