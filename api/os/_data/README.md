# LAVAALL OS data pack (static, read-only)

Built 22 Oct 2026 (CT) against main at cba1c7c and re-exported the same day after two fixes.
The JSON files here are committed exactly as exported. They are bundled with the /os function and read with `require()`
by `api/ops/_os_data.js`. They are never written to the KV store (`normalizeStore` drops a `decisions` key, and
`store.routines` are /ops runnable prompts). See `docs/os/DECISIONS.md`.

| File | Rows | Used for |
|---|---|---|
| `decisions.json` | 52 (22 Open, 30 Closed; 6 with a Jev score) | Decisions, Home "open decisions", Brain. A copy in the store wins if one ever exists. |
| `routines.json` | 14 | Routines (schedule, owner, status), desk drawers, Brain. `lastRunAt` and `lastRunStatus` are stale and ignored. |
| `desks.json` | 6 desks + 1 in `extraDesks` (Scout) | Desk now line, rules and skills, merged into the desk registry by id. |
| `skills.json` | 54 | Brain skill nodes (FR-030 override, DECISIONS.md #2). |
| `rules.json` | 30 | Brain rule nodes, matched by FR id (DECISIONS.md #8). |

Left out on purpose: Starlink, Guinea, leads and customer items. Nothing here is secret: no tokens, keys, phone numbers or
customer emails. Decision `desk` is empty and 10 decisions have no `level`; /os shows those as dashes.
