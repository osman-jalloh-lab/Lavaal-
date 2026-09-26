# LAVAALL Repository Instructions

This file is the shared rules file for Cursor, Codex, and Claude Code. `MAGNUM.md` stays the source of truth for product, visual, catalog, sourcing, media, and architecture. If this file and `MAGNUM.md` disagree, follow `MAGNUM.md`, report the conflict, and do not change production behavior until it is resolved.

Before any non-trivial task in this repository:

1. Read `/MAGNUM.md` completely.
2. Treat MAGNUM.md as the project's product, visual, catalog, sourcing, media, and architecture source of truth.
3. Inspect the actual implementation before editing.
4. Report material MAGNUM/repository discrepancies before changing production architecture.
5. Complete safe authorized work autonomously.
6. Use parallel agents where work is independent and no two agents write the same file.
7. Respect MAGNUM hard-stop gates.
8. Run relevant tests after changes.
9. Never expose secrets or commit `.env`.

## Project overview

LAVAALL is a quote-first IT sourcing marketplace for West Africa (Sierra Leone, Guinea, Guinea-Bissau, Liberia). Browse path: category, brand, family, model, variant, then Request Quote. There is no live checkout price.

What is in this repo:

- **Public site.** Root `index.html` is the marketing and catalog page. `vercel.json` rewrites `/` and `/schedule` to it. `privacy.html` and `terms.html` are the legal pages. Styles and scripts live in `assets/` (`assets/css/main.css` is the public visual system). Product and catalog images live in `images/`.
- **Vercel functions in `api/`.** `api/quote.js`, `api/contact.js`, and `api/schedule.js` handle public forms. `api/slack/` is the Slack command center. `api/ops/` is the internal `/ops` app: `vercel.json` rewrites `/ops` and `/ops/*` to `/api/ops`, and `api/ops/index.js` is allowed 30 seconds and bundles `docs/ops/souls/**`.
- **Netlify is also configured.** `netlify.toml` publishes the repo root, and `netlify/functions/submit-form.js` is the protected form backend. MAGNUM says not to change that function unless the task is about it. Netlify does not run the Vercel `/api/ops` function. Use a Vercel Preview for `/ops`.
- **Hosting names found in-repo.** `.env.example` calls the Vercel project `lavaal` (`osman14/lavaal`). Docs use production host `https://www.lavaall.com`. The Preview URL in `docs/ACCEPTANCE-09.md` starts with `lavaal-`. This file does not change Vercel settings.

Deeper product and ops rules are in `MAGNUM.md` and the `docs/` files listed at the bottom. Do not treat this overview as a replacement for them.

## Approval levels

MAGNUM §25 hard-stop gates still apply (new category mappings, paid purchases, unclear media rights, changes to the human-approved product list, public-site integration, destructive git, secrets, bypassing source restrictions, and redesigns that conflict with MAGNUM).

The Slack risk ladder in `docs/ops/souls/_SHARED_CONTEXT.md` and `api/slack/_router/classify.js` is:

| Level | In-repo examples | What an agent may do |
|---|---|---|
| L0 | research, source, draft, quote, crm | Read, research, drafts. |
| L1 | audit, qa, spec, tickets | Read, research, drafts. |
| L2 | build, brand, decision, handoff | Preview-only work. Go, and flag it. Not a production merge. |
| L3 | send, ship, deploy, pay, ads, campaign, contract | Stop. Explicit founder approval. |
| L4 | secrets, credentials, delete, destroy, wipe | Stop. Explicit founder approval. |

L0 to L2 means read, research, drafts, and Preview-only work. L3 and L4 always need explicit founder approval from Osman, or from the partner where Osman has delegated. That includes a production merge, a production deploy, secrets or env changes, sending anything (email, Slack, WhatsApp, outreach), and any spend. The in-repo L3 list also stops ads, campaigns, and contracts.

Agents open pull requests and Vercel Preview deploys only. They never merge to production on their own.

**Open discrepancy, founder to confirm:** this brief spells the partner **Hameed**. The repo currently writes **Hamid** in `docs/OPS-DESIGN.md`, `docs/ops/souls/_SHARED_CONTEXT.md`, and `api/ops/_pages.js`. `MAGNUM.md` does not name the partner.

## Jev decision gate

Jev is TypeSafe AI's decision model, reached through Vercel AI Gateway as `typesafe-ai/jev`. Nothing in this repo calls it yet.

- Every L3/L4 decision and every founder-facing recommendation gets a Jev score first.
- Evidence comes first: sources, files, and test or smoke proof.
- Accept threshold is 0.75.
- If Jev cannot be reached, write `Jev: not run (<reason>)`. Never auto-pass.
- Jev scores quality only. It does not prove the work was done, and it never replaces founder approval for L3/L4.
- In-app `/ops` Jev wiring is on HOLD pending founder L3. Production has no Jev or AI Gateway key. Do not set one.

## Brand tokens

Public site tokens. These match MAGNUM §3.1 and `:root` in `assets/css/main.css`.

| Token | Hex |
|---|---|
| `--sun` | `#FFE03D` |
| `--sky` | `#00C2FF` |
| `--lime` | `#00F5A0` |
| `--coral` | `#FF5C5C` |
| `--ink` | `#0A0A14` |
| `--white` | `#FFFFFF` |
| `--offwhite` | `#F4F9FF` |
| `--muted` | `#5A6A80` |

Fonts, public site and `/ops`: **Clash Display** for headings, **Bricolage Grotesque** for body. MAGNUM §3.1, `index.html` / `privacy.html` / `terms.html`, and `docs/OPS-DESIGN.md` agree.

MAGNUM's core color list does not name `--white` or `--muted`. `assets/css/main.css` defines both at the hexes above. That is not a conflict.

**Open discrepancy, founder to confirm:** `/ops` reuses some of the same token names with different hexes. `docs/OPS-DESIGN.md` (Option I, locked for the `/ops` room) and `api/ops/_shell.js` set `--sky` `#2EC4FF`, `--ink` `#141414`, `--coral` `#E11D48`, and `--muted` `#57534E`. `--lime` `#00F5A0` and `--sun` `#FFE03D` match MAGNUM. OPS-DESIGN says the public catalog CSS is a different system and that cream/blush tweaks should stop. This file keeps the MAGNUM / `main.css` values as the public brand. Do not retint the public site to the `/ops` hexes, and do not retint `/ops` to the public hexes, until the founder confirms.

**Open discrepancy, founder to confirm:** `assets/css/legal.css` paints legal-page paragraphs `#1c2433`, not `var(--ink)`.

## Standing rules

- No "free trial" anywhere: copy, CTAs, metadata, or emails. A search of this repo did not find that phrase.
- Product imagery follows MAGNUM §2.4 and §4–§6. No fake branded hardware generated by AI. Exact SKU photos come from a permitted source. Generic category art may be original and unbranded. MAGNUM §5.4 allows generated generic category artwork at about 1200×800 WebP.
- **Open discrepancy, founder to confirm:** a requested standing rule bans all AI-generated imagery and video in the site or product. MAGNUM does not ban generated generic unbranded category artwork, and it does not mention video. This file keeps MAGNUM's image rule until the founder confirms. Do not add AI-generated video; MAGNUM does not allow a video pipeline.
- Do not claim LAVAALL is an authorized Starlink reseller. MAGNUM does not mention Starlink.
- **Open discrepancy, founder to confirm:** the requested rule says Starlink imagery is mockup-only and must be labelled as a mockup. `assets/js/catalog-data.js` lists `Starlink 45m Cable Kit (Gen 3)` (`starlink-kit-45m`, image `cables-starlink-kit.jpg`) and does not label that entry as a mockup. Do not edit the catalog from a rules-only change.
- Preview before production. Every change is verified on a Vercel Preview before anyone asks for a production merge. `docs/ACCEPTANCE-09.md` still holds `/ops` v1 off production pending founder L3.
- Keep production `LAVAALL_PUBLIC_ORIGIN` unset. That name is not in `.env.example` (magic-link origins are documented as `OPS_PUBLIC_URL`). Do not add the variable and do not set it on Production.
- Before starting any suggested idea or feature, check whether it was already tried, parked, or cancelled, and say so instead of redoing it. There is no single decision-log file. Look in `MAGNUM.md`, `docs/`, the root `*REPORT*.md` files, and git history. Already recorded: the Lifecycle desk is parked (`docs/ops/souls/SOUL_lifecycle.md`); `/ops` v1 production is HOLD (`docs/ACCEPTANCE-09.md`); CEO Talk B2 as a production poll is HOLD, while Researchy Assign wake is already production (`docs/OPS-CEO-BRIDGE.md`); in-app Jev wiring is HOLD (above).

## Where to read more

- `MAGNUM.md` — product, visual, catalog, sourcing, media, and agent architecture.
- `docs/OPS-DESIGN.md` — `/ops` visual and copy baseline (Option I). Public catalog CSS stays on `assets/css/main.css`.
- `docs/OPS-CEO-BRIDGE.md` — CEO Talk and Researchy Assign wake.
- `docs/ACCEPTANCE-09.md` — `/ops` v1 acceptance. Production is HOLD.
- `docs/ops/souls/_SHARED_CONTEXT.md` — company facts, desks, and the L0–L4 ladder.
- `docs/ops/souls/` — one soul file per desk (`SOUL_lavaall-ceo.md`, `SOUL_sales.md`, `SOUL_technical.md`, `SOUL_growth.md`, `SOUL_lifecycle.md`, `SOUL_researchy.md`).
- `.env.example` — env names only. Never commit values.
- `vercel.json` — headers and rewrites for `/`, `/schedule`, and `/ops`.
- Root reports, for prior work: `PRODUCTION_BROWSER_AUDIT.md`, `PRODUCTION_MEDIA_FORENSICS.md`, `OVERVIEW_MEDIA_RECOVERY_REPORT.md`, `CATALOG_COMPLETION_REPORT.md`, `MARKETPLACE_EXPANSION_REPORT.md`, `OVERNIGHT_REPORT.md`.
- `scripts/catalog-import/README.md` — catalog import pipeline.

No `.cursorrules` file and no `.cursor/rules/` directory were in the repo when this file was extended. `CLAUDE.md` only imports this file.
