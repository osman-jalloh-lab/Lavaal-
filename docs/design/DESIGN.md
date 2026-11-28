# LAVAALL design file

The one file Claude, Codex and the agents read before designing anything for LAVAALL. The OS follows the calm "agentic OS" look: one quiet surface, cards a step lighter, soft tinted elevation, an accent wash for "you are here", small-caps labels and one identity colour per agent. The colours and fonts are LAVAALL's own; only the patterns are borrowed (teardown: `docs/os/research/2026-11-28-jack-agentic-os-teardown.md`).

Code: `api/os/_client/os.css`, block "Design system v2". Skills: `.claude/skills/os-design-system` (how to apply this file), `os-design-audit`, `motion-pass`, `ad-maker`, `copy-check`.

## 1. Colour tokens (dark first)
| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | #0A0A14 | #F4F9FF | page and sidebar (the same surface) |
| `--panel` | #121221 | #FFFFFF | cards, one step lighter than the page |
| `--hover` | #1B1B2E | #E3EEFA | hover fill |
| `--line` / `--line2` | 8% / 15% white | #D9E3F0 / #C3D1E3 | hairlines, quiet dividers |
| `--edge` | 26% white | 32% ink | input and button edges (3:1 target) |
| `--text` | #F4F9FF | #0A0A14 | body text |
| `--muted` | #8E9AAE | #5A6A80 | secondary lines (6.9:1 dark, 5.2:1 light) |
| `--cap` | `--tx3` | `--muted` | small-caps captions (4.5:1 or better) |
| `--accent` | #00C2FF | #0089B8 | links, focus ring, the one main action |
| `--accent-ink` | #00C2FF | #006A8F | accent text on the accent wash (5.2:1 light) |
| `--accent-soft` | 13% accent | 10% accent | active nav, selected segment |
| `--ok` / `--warn` / `--bad` | #00F5A0 / #FFE03D / #FF5C5C | #008F5D / #9A7A00 / #D6363B | done, needs you, blocked |

Rules: one accent. Status colours only mean status. No new hex values in components; add a token here first.

## 2. Agent identity colours
One colour per agent, the same on every page (team list, step cards, chat replies). Set with `data-agent="<id>"`; components read `var(--ag)`.

| Agent | id | Token | Colour |
|---|---|---|---|
| Grok | `grok` | `--ag-grok` | orange |
| DeepSeek | `deepseek` | `--ag-deepseek` | cyan (accent) |
| Codex | `codex`, `codex-chat` | `--ag-codex` | green |
| Claude Sonnet | `claude-sonnet` | `--ag-sonnet` | violet |
| Claude Opus | `claude-opus` | `--ag-opus` | orchid #C77DFF |

The agent colour is a wash or a small square, never a full fill and never body text on its own.

## 3. Elevation
`--elev-0` hairline only, `--elev-1` resting card, `--elev-2` hover or raised, `--elev-3` menus and dialogs. Shadows are tinted with the page's navy (not pure black). Cards drop their border and use elevation instead.

## 4. Shape
Radius from one base: `--r-base` 8px. `--r-sm` 6, `--r-ctl` 9 (buttons, inputs, nav items), `--r-card` 14, `--r-lg` 16 (agent and step cards), pills 999.

## 5. Type
- Display: Bricolage Grotesque 600 to 800, tracking -0.02em, for page titles and big questions only.
- Text: Inter, 13px base, 20px line. Nav 12.5px medium.
- Captions: 10.5px, uppercase, 0.09em tracking, weight 600, `--cap` colour (section labels, stat labels, side-panel headings).
- Numbers: always tabular.
- Two families on a page, never more.

## 6. Layout
- Sidebar 224px, same colour as the page, one hairline on the right. Nav item padding 8px 13px.
- Active nav: accent wash plus accent-ink text and icon. No side bar, no bold.
- Header 58px, translucent page colour with blur. Phone: 52px.
- Main padding 30px top, 34px sides, 64px bottom. Phone: 18px 16px.
- Page header: title, one muted line, actions on the right, then a hairline rule and 26px space.
- Stat tile: 16px 18px padding, caption label, 24px tabular value, muted note.
- Spacing scale 4, 8, 12, 16, 24, 32, 48, 64.

## 7. Motion
- 180ms (fast) or 260ms (medium), ease-out `cubic-bezier(.2,.7,.2,1)`.
- Animate transform and opacity only (colour and shadow transitions on hover are fine; never layout).
- Wait states are designed: a slow shimmer across a running step in its agent colour. No spinners.
- `prefers-reduced-motion` turns all of it off.

## 8. Voice
Plain, short, warm, direct. Krio-friendly English for Sierra Leone audiences. No hype words. No invented numbers, prices, testimonials or law.

## 9. Businesses
LAVAALL (electronics and IT sourcing, Sierra Leone), SaloneWorks and SaloneHire (recruitment; SaloneHire launches 1 Dec 2026). The private business is never named in public copy.

## Checklist before shipping a screen
1. Only tokens from this file; no raw hex in components.
2. Muted text 4.5:1 or better; input edges and focus ring 3:1.
3. One filled accent button per screen.
4. Captions in small caps; numbers tabular.
5. Any agent shown wears its identity colour.
6. Checked at 1440px and 390px, dark and light.
