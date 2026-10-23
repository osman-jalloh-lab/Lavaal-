# LAVAALL OS data pack (static, read-only)

Built 22 Oct 2026 (CT) against main at cba1c7c, re-exported the same day after two fixes, then updated to v2 on 23 Oct 2026.
The JSON files here are committed exactly as exported. They are bundled with the /os function and read with `require()`
by `api/ops/_os_data.js`. They are never written to the KV store (`normalizeStore` drops a `decisions` key, and
`store.routines` are /ops runnable prompts). See `docs/os/DECISIONS.md`.

| File | Rows | Used for |
|---|---|---|
| `decisions.json` | 52 (22 Open, 30 Closed; 6 with a Jev score) | Decisions, Home "open decisions", Brain. A copy in the store wins if one ever exists. |
| `routines.json` | 14 | Routines (schedule, owner, status, workflow steps), desk drawers, Brain. `lastRunAt` and `lastRunStatus` are stale and ignored. |
| `desks.json` | 6 desks + 1 in `extraDesks` (Scout) | Desk now line, rules and skills, merged into the desk registry by id. |
| `skills.json` | 54 | Brain skill nodes (FR-030 override, DECISIONS.md #2). |
| `rules.json` | 30 | Brain rule nodes, matched by FR id (DECISIONS.md #8). |
| `council.json` | 0 | AI Council runs. Empty on purpose: the Council view shows its honest empty state until real runs exist. A `council` array in the store wins if one exists. |

Left out on purpose: Starlink, Guinea, leads and customer items. Nothing here is secret: no tokens, keys, phone numbers or
customer emails. Decision `desk` is set on 25 of 52 (technical 16, lavaall-ceo 5, growth 2, sales 2) and blank on 27; 10 decisions have no
`level`. /os shows blanks as dashes. 15 desk rules end with an FR id such as " (FR-002)"; the Brain links each to that rule.

v2 (23 Oct 2026) changed only `decisions.json` and `desks.json`.

v3 (23 Oct 2026, phase 4) added `steps` to every routine in `routines.json`: `[{kind: "trigger" | "step" | "output", label, tool?}]`,
written by hand from the procedures in the handoff (what each routine does, nothing invented), or `null` when no procedure is
written (the Slack task bridge). A `null` routine shows "Steps not written yet". Order on screen is trigger, steps, outputs.

v4 (23 Oct 2026, phase 6) added `council.json` (0 records). A council record is one chat thread. Shape (docs/os/SCHEMA.md):

```
{id, title, desk, level, date, status, maxRounds,
 messages:[{round, role:"builder"|"reviewer"|"scorer"|"approver", agent:"Claude"|"Codex"|"Jev"|"Osman", at, text, draft?, score?}]}
```

`status` is `waiting_l3`, `approved`, `changes_requested`, `flagged` or `held`. The agent always follows the role (Claude builds, Codex
reviews, Jev scores, Osman approves). The old shape, `drafter`, `reviewer` and `rounds[{n, draft, review, at}]`, is still read: each
round becomes a builder message and a reviewer message. A test fixture with one sample run lives in `tests/fixtures/council-sample.json`
and is used only by tests.

