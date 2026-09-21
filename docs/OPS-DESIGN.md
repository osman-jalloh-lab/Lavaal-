# LAVAALL OS `/ops` visual + copy baseline

**Locked:** Option I — Aboard blush, final cream (one step darker), then **stop color tweaks**.  
**Scope:** Preview `/ops` only. Do not merge to production/`main`.  
**Public catalog:** unchanged. MAGNUM marketplace cards stay on `assets/css/main.css`.

---

## Decision

Founder chose **Option I (Aboard blush)** for the room: warm cream, soft rounded surfaces, table-first Kits.

Founder locked LAVAALL accents (cyan + emerald), then asked for **one more teeny darker cream** — not dark mode, not navy. Color work stops here.

Rejected: dark navy fortress, muddy pink-only branding, purple, gold neon, dark glass, KPI walls, Option G Attio-soft.

---

## Final tokens

Shared in `api/ops/_shell.js` → `opsThemeVars()`.

| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#EDE7E0` | Page background. Final cream. |
| `--side` | `#E6DFD7` | Sidebar. |
| `--surface` | `#F3EEE7` | Cards, table, login panel. |
| `--surface-2` | `#EBE4DC` | Inset fields, table header. |
| `--line` | `#CFC7BC` | Hairline borders. |
| `--blush` | `#E9D8D0` | Corner wash only. Atmosphere, not a brand fill. |
| `--ink` / `--text` | `#141414` | Primary text. |
| `--muted` | `#57534E` | Helper sentences. |
| `--sky` | `#2EC4FF` | LAVAALL cyan. Buttons, active wash. |
| `--sky-deep` | `#0891B2` | Links. |
| `--emerald` | `#10B981` | Good accent. |
| `--emerald-deep` | `#047857` | Active chip text. |
| `--emerald-wash` | `#D1FAE5` | Active chip / success. |
| `--chip-idle` | `#F3EFE8` | Inactive chip background. |
| `--chip-idle-fg` | `#78716C` | Inactive chip text. |
| `--chip-dot` | `#D97706` | Inactive status dot. |
| `--lime` | `#00F5A0` | MAGNUM lime. Washes only. |
| `--coral` | `#E11D48` | Danger / Lost. |
| `--amber` | `#B45309` | Warnings / Unknown. |

Type: **Clash Display** titles, **Bricolage Grotesque** UI.

---

## Kits chips

| Status | Background | Text |
|---|---|---|
| Active | `#D1FAE5` | `#047857` |
| Inactive | `#F3EFE8` + amber dot `#D97706` | `#78716C` |
| Returned | cyan wash | `#0891B2` |
| Lost | rose wash | `#BE123C` |
| Unknown | amber wash | `#B45309` |

---

## Copy rules (Osman + Hamid)

Every tab: **2–3 plain sentences**. What it is. What to do. No snobby admin jargon. No invented metrics. No multi-doc packs.

| Tab | What they see |
|---|---|
| Dashboard | What we are finishing, and the next thing to do. |
| You | Your role, and the one company goal. |
| Office | Who sits where. Talk opens that desk. CEO Talk waits on the real LAVAALL CEO. Desktop ≥1200px: full-bleed scene, Dashboard below. Phone/iPad stay cards. |
| Chat | Ask about the goal, a task, or a note. Confirm before anything is sent or saved. CEO desk uses the bridge, not the helper. |
| Memory | Short notes on who we talk to. Issue log lives here as a subsection and at `/ops/issues`. |
| Issues | Founder complaints. Same title increments a count. After two reports, a Technical plan stub. Not dumped into CEO Talk. |
| Inbox | Mail people sent us. Live support@ when `OPS_GMAIL_*` is set; otherwise a connect empty state. Write a reply, then Confirm send. |
| Calendar | What is next. Add a meeting if you need one. |
| Kits | Full kit list inside OS. Search. Read-only. Edits stay in the Sheet. |
| Map | Kits, people, tasks, and decisions as bubbles. Tap a bubble, then open the real record. |
| Tasks | Task-first. Projects are optional folders at the bottom. |
| Routines | Saved questions you run yourself. Nothing in the background. |
| Sign in | Enter your work email → Continue. |

---

## Rules

1. Cream/blush is the room. Cyan and emerald are the tools.
2. Do not retune cream after this file. Founder said stop.
3. Never return to `#0B1424` navy panels.
4. Auth, Drive Kits sync, and store logic are not visual work.
5. Public catalog CSS is a different system.

---

## Implementation

- Shell + tokens: `api/ops/_shell.js`
- Login: `api/ops/_html.js`
- Pages / copy: `api/ops/_pages.js`
- Kits behavior: `assets/js/ops-kits.js` (unchanged)
- Map graph: `api/ops/_map.js` + `assets/js/ops-map.js`
- Office desktop full-bleed: `api/ops/_office.js` (no Growth Option I full-bleed pattern in-repo; uses Option I tokens and breaks `.ops-wrap` at 1200px)
