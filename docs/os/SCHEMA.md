# LAVAALL OS common item schema

Ours, not Jack Roberts'. One shape for everything /os shows, so a pack builder, the data adapter (`api/ops/_os_data.js`) and the
views agree on names. Fields that a source does not have are `null`, `""` or `[]`, never made up.

## Fields on every item

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable id. Notes: `nt-` plus ten hex characters. Decisions: `D-YYYY-MM-DD-n`. Others: the pack id. |
| `type` | string | `note`, `scout-find`, `idea`, `decision`, `routine`, `desk`, `skill`, `rule`, `council-run` or `message`. |
| `title` | string | Short plain text. |
| `date` | `YYYY-MM-DD` | When it happened or was written. |
| `updated` | `YYYY-MM-DD` or `""` | Last change. |
| `desk` | string | Desk short id (`lavaall-ceo`, `sales`, `technical`, `growth`, `lifecycle`, `researchy`, `scout`) or `""`. The UI shows the short name ("CEO") through `OS.deskShort`; a raw id is never displayed. |
| `status` | string | Free text from the source, for example `Open`, `Closed`, `parked`, `waiting_l3`. |
| `level` | `L0` to `L4` or `null` | Permission level (FR-001). |
| `jev` | number 0 to 1, or `"not run"` | A Jev score. Outside 0 to 1 is dropped, never clamped. |
| `tags` | string[] | Up to 12 short tags. |
| `links` | string[] | Ids of related items. The Brain graph draws an edge for each (when both ends exist). |
| `source` | string | Where the item came from (a file, a feed, a channel). |

The Brain graph builds its edges from `links[]` and `desk`: a note's `links` give `links to` edges, its `desk` gives an `owned by` edge,
and the older exact-match relations (desk uses skill, routine runs on desk, decision decided by desk, desk follows rule, note mentions
rule/desk/decision) are unchanged.

## Extras per type

| Type | Extra fields |
|---|---|
| `routine` | `schedule` (text, America/Chicago), `steps` (`[{kind: trigger \| step \| output, label, tool?}]` or `null`) |
| `decision` | `closedAt` (`YYYY-MM-DD`, when known) |
| `scout-find` | `channel`, `url`, `urgent` (boolean). `channel` is never exported to /os (it holds handles). |
| `message` | `role` (`founder` or `assistant`), `agent`, `at` (ms), `text` |
| `council-run` | `maxRounds`, `messages[]` (below) |

### Council run messages

```
{ id, title, desk, level, date, status, maxRounds,
  messages: [ { round, role: "builder" | "reviewer" | "scorer" | "approver",
                agent: "Claude" | "Codex" | "Jev" | "Osman", at, text, draft?, score? } ] }
```

One lane per role, and the agent follows the role: Claude builds (blue), Codex reviews (violet), Jev scores (amber), Osman approves
(green). `draft` is the builder's full draft for that round (shown as a diff against the previous draft). `score` is the scorer's number
0 to 1. `status` is `waiting_l3`, `approved`, `changes_requested`, `flagged` or `held`. The old record shape (`drafter`, `reviewer`,
`rounds[{n, draft, review, at}]`) is still read: each round becomes a builder message and a reviewer message.

## Where each type stands today

| Type | Source | State |
|---|---|---|
| `note`, `scout-find`, `idea`, `decision` (vault notes) | `scripts/build-notes-pack.js` (never committed) and the `notes` feed | Emits every common field. |
| `council-run` | `store.council` or `api/os/_data/council.json` (0 records today) | Read in the council shape; old shape mapped. |
| `decision` | `api/os/_data/decisions.json` | Committed export, older shape: has `id`, `title`, `level`, `status`, `desk`, `text`, `source`, `date`, `jev`. The adapter fills the rest with empty values. |
| `routine` | `api/os/_data/routines.json` | Has `id`, `name` (as `title`), `schedule`, `owner` (as `desk`), `status`, `steps`. |
| `desk`, `skill`, `rule` | `desks.json`, `skills.json`, `rules.json` | Committed exports, older shapes, mapped by the adapter. |
| `message` | the /ops Talk threads, read live by `#talk` | `{id, role, text, at}` per message. |

The committed packs (`decisions`, `routines`, `desks`, `skills`, `rules`) are exports and are kept byte for byte, so they are not rewritten
to this schema. The adapter is the one place that maps them, and a pack builder written from now on emits this shape.
