# LAVAALL OS `/ops` visual baseline

**Locked:** Option I — Aboard blush, with an improved LAVAALL color schema.  
**Scope:** Preview `/ops` only. Do not merge to production/`main` without a later founder L3.  
**Public catalog:** unchanged. MAGNUM marketplace cards, sun/sky/lime energy, and `assets/css/main.css` stay the public language.

This file is the visual source of truth for the internal operating floor. The original HTML mock lived at `LAVAALL-OS/specs/lavaall-os-ops/design-options/option-i-aboard-blush.html` and is not in this repo; tokens below recreate that workspace and then correct the palette.

---

## Decision

Founder chose **Option I (Aboard blush)** for background and shape: warm cream/blush canvas, soft rounded surfaces, table-first Kits.

Founder also asked to **improve I’s colors**: keep the warm cream/blush base, but make accents clearly LAVAALL (cyan + emerald), raise text/table contrast, and make Active / Inactive chips read at a glance.

Follow-up (founder): make the cream **a teeny bit darker** — not dark mode, not navy. Canvas `#F3EEE8`, surfaces `#F9F4EF`, borders a step deeper (`#D9CCC3`). Cyan/emerald accents and blush wash stay.

Rejected:

- Dark navy / snobby admin / glass fortress
- Muddy pink-only branding
- Purple, gold neon, dark glass
- KPI fortress walls on Kits
- Option G Attio-soft cool gray (superseded)

---

## Tokens

Shared in `api/ops/_shell.js` → `opsThemeVars()` and used by the signed-in shell and the login page.

| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#F3EEE8` | Page background. One step darker cream than the original I mock (`#FAF6F2`). Not navy. |
| `--blush` | `#F8E6DF` | Sidebar + corner wash. Stationery peach, not brand pink. |
| `--blush-deep` | `#F3D5CB` | Hover wash only. Never a primary fill. |
| `--surface` | `#F9F4EF` | Cards, table, login panel. Warm paper — not pure white (`#FFFCFA`). |
| `--surface-2` | `#F4EDE6` | Inset fields, table header, list rows. |
| `--line` | `#D9CCC3` | Hairline borders. Slightly deeper warm gray. |
| `--ink` / `--text` | `#1C1410` | Near-black primary. Strong contrast on cream. |
| `--muted` | `#5E554E` | Secondary copy. Readable warm gray — not faded rose. |
| `--sky` | `#00C2FF` | MAGNUM cyan. Primary CTA, links, active wash. |
| `--sky-deep` | `#0077A3` | Cyan text on light washes (AA on cream). |
| `--lime` | `#00F5A0` | MAGNUM lime. Washes only — too neon for body text. |
| `--emerald` | `#0B8F6A` | Readable good-status / signed-in accent. |
| `--emerald-wash` | `#D8F8EA` | Active chip, success banners. |
| `--coral` | `#E11D48` | Danger / Lost. |
| `--amber` | `#B45309` | Warnings / Unknown. |
| `--sun` | `#FFE03D` | MAGNUM yellow. Rare emphasis, never a chrome fill. |

Type stays MAGNUM: **Clash Display** for titles, **Bricolage Grotesque** for UI.

---

## Layout

Workspace, not a marketing page and not a dark console.

- Light **sidebar** on cream/blush. Active item is a cyan → emerald wash, not a dark rail.
- Main canvas is warmer, slightly deeper cream. Cards are paper (`#F9F4EF`), ~20–24px radius, 1px `--line`, light shadow only.
- Mobile (`≤860px`): sidebar stacks on top; nav wraps as pills; Sign out stays visible.
- Do not add a KPI metric wall.

---

## Kits (table-first)

Toolbar: search, status chips, Refresh. Columns: Kit Number, Name, Status, Date added.

Status chips (pastel pills, ink that actually reads):

| Status | Background | Text |
|---|---|---|
| Active | `#D8F8EA` | `#0B8F6A` |
| Inactive | `#F1EAE4` | `#6B615A` |
| Returned | `#D7F4FF` | `#0077A3` |
| Lost | `#FDE8EA` | `#BE123C` |
| Unknown | `#FFF3C4` | `#B45309` |

The table lives in a rounded paper card. Row hover is a cyan wash. Email stays out of the list; drawer is read-only.

---

## Rules

1. Cream/blush is the **room**. Cyan and emerald are the **tools**.
2. Blush never replaces LAVAALL accents. No pink CTAs, no pink Active chips.
3. Never return to `#0B1424` / `#121C2E` navy panels.
4. Body copy and table cells use `--text`, not muted gray.
5. Auth, Drive Kits sync, store writes, and founders-only allowlist are out of scope for visual work.
6. Public `index.html` / catalog CSS is a different system. Do not “Aboard-ify” the marketplace.

---

## Implementation

- Shell + tokens: `api/ops/_shell.js`
- Login / deny pages: `api/ops/_html.js`
- Kits markup: `api/ops/_pages.js` (`kitsPage`)
- Kits behavior (unchanged): `assets/js/ops-kits.js`
