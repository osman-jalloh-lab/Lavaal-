# LAVAALL Starlink v4 — Frontend Handoff for Backend Work

_Prepared 2026-10-02. Read alongside `LAVAALL-Starlink-v4-Backend-Plan.md`, which is
authoritative on branching, deployment and approval gates. This document covers the
**frontend**: what exists, what it expects from you, and what is not real yet._

---

## 1. What this is

A static marketing + lead-capture page for LAVAALL's Starlink hardware and installation
business in **Sierra Leone, Liberia, Guinea and Guinea-Bissau**. It is finished visually
and completely inert functionally. Nothing persists, nothing sends, no prices exist.

**The canonical build is `v4`. Nothing else.** Everything else in the project tree
(`v1`, `v3`, `versions/`, `qa*/`, `vendor/`) was archived to `_archive/` on 2026-10-02
and is dead. If you see references to those, they are stale.

Source of truth: `OneDrive\Desktop\startlink\v4\`
Served in dev as a plain static directory (`python -m http.server`), page at `/v4/`.

---

## 2. Stack

Deliberately minimal — **no build step, no framework, no package manager, no dependencies.**

| File | Role |
|---|---|
| `v4/index.html` | Entire page markup. One file. |
| `v4/styles.css` | All styling. Design tokens in `:root`. |
| `v4/app.js` | The 5-step setup builder + all contact link wiring. **Your main integration point.** |
| `v4/motion.js` | Scroll-driven unboxing animation. Pure presentation — ignore. |
| `v4/globe.js` | Canvas globe. Pure presentation — ignore. |

Scripts are plain IIFEs, ES5-level syntax, loaded with `<script src>` at end of body.
There is no module system. If you add JS, match this — do not introduce a bundler
without asking.

**There is no git in this folder.** It is not a repository. Treat the folder as a
read-only source to copy from, per the backend plan ("your original v4 folder is not touched").

---

## 3. Integration contract — what you need to hook

### 3.1 The setup builder (`app.js`)

Five steps, answers held in `state.a`, keyed exactly:

| `key` | Options |
|---|---|
| `place` | Home, Business, Office, School, Hotel, Organization, Other |
| `country` | Sierra Leone, Liberia, Guinea, Guinea-Bissau, Somewhere else — **plus a free-text city field** |
| `need` | New complete setup, I already have Starlink, Installation only, Better Wi-Fi coverage, Power backup, Not sure |
| `size` | Small, Medium, Large, Multiple buildings |
| `priority` | Lowest starting cost, Best Wi-Fi coverage, Backup power, Fast installation, Business reliability (single-select) |

State shape: `{ i: <step index>, a: { …answers }, code: "LV-XXXXX" | null }`

**Setup code** is generated client-side in `code()`: `"LV-"` + 5 chars from the
alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I/O/0/1, deliberately unambiguous for
reading aloud over the phone). It is `crypto.getRandomValues` where available, `Math.random`
otherwise. **This is fake** — there is no uniqueness guarantee and no persistence. Per the
backend plan, server-side generation replaces it. Keep the format and alphabet; staff will
have started reading these aloud.

**Persistence today** is `sessionStorage` under the key `lv-setup`. Dies with the tab.

### 3.2 Contact links (`wireContacts()` in `app.js`)

All outbound contact is attribute-driven. Scan for these:

- `[data-contact="whatsapp"]` → opens `wa.me` prefilled
- `[data-contact="call"]` → `tel:`
- `[data-contact="email"]` → `mailto:` with subject + body
- `[data-sku="<product name>"]` → **shop enquiry**; when present, the WhatsApp message
  becomes `"Hi LAVAALL, I'd like to ask about the <sku>."` instead of the builder summary.
  Nine of these exist (complete kit + 8 parts).
- `#getConnected` → the primary CTA at the end of the builder. **Currently does nothing
  useful.** This is the lead-capture moment.

`CONTACT` at the top of `app.js` holds the destinations. **All three are placeholders:**
`wa.me/00000000000`, `tel:+00000000000`, `hello@lavaall.com`.

### 3.3 What the shop does not have

Eight SKUs + the kit, each with a "Reach out" WhatsApp link. **No prices, no cart, no
checkout, deliberately.** Osman chose enquiry-only. Do not add pricing UI without
explicit instruction.

---

## 4. Design system — do not drift

Palette comes from Refero style `75c06591-34d2-493a-bd49-70551b5e4a53` ("Perk").
Recorded in `REFERENCE-LOCK-v3.md`. It **supersedes** the earlier black "Dala" direction;
if you find black-canvas styling anywhere, it is stale.

| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#f3f3eb` | page ground (beige — **there is no white on this page, by request**) |
| `--ink` | `#14140f` | all text — never pure `#000` |
| `--lime` | `#beff50` | **the only filled-button colour** |
| `--field-leaf` | `#eaf2da` | section field + hero panel |
| `--field-mist` / `--field-slate` | `#e3e7e5` / `#dae0e5` | section fields |
| `--field-dark` | `#2e2d29` | the one inverted block (the kit) |

Hard rules from the style: **no gradients, no box-shadows** (separation is tonal only),
**no second accent colour**, font weights 400/500 only. Radii: 28px cards/buttons,
9999px pills, 8px inputs.

Any form UI you add should use `--ak-*` tokens already defined for the configurator panel.

---

## 5. Assets

`assets/product/fields/` — 11 shop images, 1232², each on its own coloured ground.
Each shop row's background is set to match its image's sampled hex so the image dissolves
into the page. **If you change a row colour, the image will show as a visible square.**

`assets/product/perk-cut/` — the same products knocked out to transparency, 720², used by
the scroll animation.

**Plug standards** — both exist because the market spans two electrical systems:
- UK **Type G** (Sierra Leone, 230V) — `power.webp`, `ups.webp`. **Currently wired.**
- US **Type A** (Liberia, 120V) — in `_archive/assets/shop/`.
If you build locale handling, this should switch with country.

---

## 6. What is lagging / known issues

**Functional gaps (your scope):**
- Setup code is client-side and non-unique; nothing persists past the tab.
- `#getConnected` captures no lead.
- Contact details are placeholders in three places.
- No country→locale logic (currency, plug type, coverage claims all hardcoded or absent).

**Frontend issues (mine, flagged so you don't trip on them):**
- **Performance is improved but not finished.** After a QA pass: median scroll frame time
  242ms → 66ms under 4× CPU throttle, worst frame 500ms → 122ms, CLS 0.6254 → 0.0004,
  load 3.1s → 0.85s. **However**, at 4× throttle 143 frames still exceed 50ms — a low-end
  phone will still feel choppy. Remaining headroom: lower globe dot density and part count
  on small screens. Note the measurement harness paces scroll with a 24ms timer, so absolute
  frame times are floored and should not be read as real FPS.
- The globe's arc routes are **placeholder** (Freetown↔London, Monrovia↔Freetown,
  Freetown↔New York, Monrovia↔Dubai). They are decorative and imply no coverage claim.
  The `#reach` copy deliberately makes no coverage promise.
- `og:image` is a **relative path** and will not resolve when shared. Needs
  `https://<domain>/assets/product/fields/og.jpg`.
- Mobile has not been QA'd on a real device. Below 767px the page drops the pinned
  animation for a static story layout (`.is-story`); that path is less tested.
- `.is-pinned` is set by a blocking inline script in `<head>` and **must stay in sync** with
  `narrow`/`reduce` in `motion.js` (`max-width: 767px`, `prefers-reduced-motion`). If they
  diverge, you reintroduce a ~0.63 layout shift.
- The hero CSS (`.art--*`) and `HERO_DESK` in `motion.js` encode the same composition twice.
  Change one, change the other, or the hand-off into the scroll track jumps.

**Not built, previously discussed:**
A country + connection-type picker, a four-step quote flow, and a full account-creation form
exist as a reference implementation at `~/Desktop/Starlink/options/c-v4-scrollcraft/`
(separate tree, not part of this build). Connection types there:
Residential, Residential Lite, Roam, Business/Priority, Maritime, Aviation. That reference
also contains a **pricing table that Osman asked to drop** — do not port it.

---

## 7. Suggested first question back

The single biggest ambiguity: whether the builder's setup code should become a real
account identity (lookup, return visits, staff dashboard) or stay a lightweight quote
reference. The backend plan reads as the latter. Confirm before designing schema.
