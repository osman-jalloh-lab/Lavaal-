# LAVAALL Web: Plan (draft, nothing built yet)

Sub-brand under the LAVAALL umbrella. Sells website building, animated sites, automation and AI agent skills to small businesses in **Sierra Leone, Guinea, Liberia**.

## 1. What I learned from the existing repo (read-only)

Sources: `Desktop/test lavaall/` (concept lab), `Desktop/startlink/`, `Desktop/new lavaall/Lavaal--main/` (production, untouched).

- LAVAALL is a multi-division brand. The lab already has four divisions: Technologies, Electronics, **Web**, Studio. Each must stay visually distinct, no shared generic template.
- The lab already has a **Web v1 lock** (`REFERENCE-LOCK.md`):
  - Primary reference: Exo Ape (Refero style `83f0586f-0344-4da8-afbe-3f8bdc508ee7`), secondary Active Theory and ONE.
  - Look: black / deep violet / off-white, monumental editorial sans, oversized project statement, violet only as focus/interaction signal.
  - Signature interaction: one project morphing across desktop, tablet and phone, with annotations explaining the business reason for each change.
  - Reject: repeated service cards, fake code rain, browser-frame clutter, hollow agency slogans, fake metrics, fake customer names.
- `web/v1/` and `web/assets/` are **empty**. The direction is locked but nothing is built.
- House rules to carry over: static HTML first, no framework without approval, screenshot QA at 1440 / 1024 / 390, reduced-motion fallback, never deploy without approval, new version folder instead of overwriting.

## 2. Decisions (answered 2026-10-03)

- **Scope:** front-end mockup only. No backend; a backend will be built separately by another tool. Forms are non-functional placeholders with clear hand-off points.
- **Stack:** plain static HTML, CSS, JS. No framework, no build step.
- **Pricing:** not shown for now.
- **Contact:** same pattern as LAVAALL (role-based email cards plus an inquiry form, sourced from `Lavaal--main/index.html`). Reuse the LAVAALL addresses until web-specific ones exist.
- **Proof to show:** LAVAALL site, LAVAALL Starlink concept, Hermes OS, personal portfolio.
- **Template gallery:** 5 or 6 Refero-style design directions in a scrollable section so visitors can browse styles. See `REFERENCES.md`.
- **Still open (using defaults unless told otherwise):** build location = this folder; language = English only for now (structure kept i18n-ready, as LAVAALL uses `data-i18n`).

## 3. Site shape (one story, not a card grid)

Case-study reel, per the Web lock.

1. **Hero**: oversized statement of what I build and who for. One line naming the region.
2. **Work**: full-bleed project frames, one at a time. Signature device-morph on one real project.
3. **Animated sites**: a short reel showing what motion does for a business (before/after, same content).
4. **Automation & agents**: concrete examples shown as small flows ("customer messages on WhatsApp, agent answers, order lands in a sheet"). Draw from the Hermes OS agent work as real evidence.
5. **How it works**: brief, 4 steps from first message to launch and maintenance.
6. **Templates**: a horizontally scrollable gallery of 5 or 6 style directions, each previewed on a clearly labelled sample business.
7. **Built for West Africa**: mobile-first, low-bandwidth performance budget, mobile money and WhatsApp ordering, offline-tolerant. This is the differentiator, shown with real numbers I measure (page weight, load time on throttled 3G).
8. **Contact**: LAVAALL-style role cards plus inquiry form. No pricing anywhere.

## 3b. Automation and Business OS (the second half of the offer)

**Who it is for:** restaurants, hotels, e-commerce shops, marketers. Landing sections speak to each in its own terms (a menu and bookings, rooms and availability, product listings, campaigns), not a generic "businesses" pitch.

### Visual automation demos (the signature of this half)
Animated workflow canvases, built code-native (inline SVG + CSS/JS, no images, no libraries), each playing a short loop: nodes light up in sequence, a payload moves along the wire, the result appears. Each is labelled "illustrative demo".

1. **Social poster:** connect Instagram or Facebook Page, agent picks photos from a folder, writes captions, queues posts, owner taps Approve.
2. **Listing and ads:** new product photo arrives, agent writes the listing, posts it to the shop and ad channels.
3. **Customer replies:** a WhatsApp or Instagram message arrives, agent answers from the menu or room data, books or hands off to the owner.
4. **Weekly sales check-up:** agent reads sales, finds the slow products, suggests what to promote.

Pattern borrowed from Hermes OS: **the agent drafts, the owner approves** (its approval queue). That is a trust selling point for owners who fear an agent posting something wrong.

### Business OS (package of skills)
A "business operating system" per client, adapted from the Hermes OS agent pattern (not a copy). Proposed modules, mapped from agents that actually exist in Hermes OS:

| Business module | Hermes OS origin | What it does for the owner |
|---|---|---|
| Inbox | Iris (email triage, drafts) | Sorts customer messages, drafts replies |
| Schedule | Kairos (calendar) | Bookings, staff time, conflict checks |
| Daily brief | Argus (morning sentinel) | Morning summary of sales, risks, what is lagging |
| Money | Plutus (budget tracking) | Cash view, costs, no money movement |
| Memory | Mnemosyne | Remembers products, regulars, prices |
| Market watch | Mercury (web search, price compare) | Competitor and price checks |
| Builder | Prometheus (idea forge + site builder) | Drafts campaigns, pages, promos |

Your skill library gets packaged as a **catalogue of capabilities** (marketing, content, SEO, lead finding, invoice chasing, review replies). Which ones appear is your call, and I will only list ones you can actually deliver.

### Facts to verify before they appear on the site
- Posting to Instagram and Facebook **Pages** is possible through Meta's official APIs. **Facebook Marketplace listing creation is not something I can confirm is available through an official API**, and automating it by other means risks account bans. Safer to promise "listings to your Facebook Shop / Instagram Shopping catalogue" until verified.
- WhatsApp automation needs the WhatsApp Business Platform (approved templates, fees). Confirm before promising it.
- The demos show the idea. They are not a live product, and the page must say so.

## 3c. Skills showcase and videos (decided 2026-10-03)

**Catalogue:** your whole skills library gets a browsable "Capabilities" section, grouped by what an owner cares about (get customers, sell more, save time, understand the numbers, hire). Each entry gets a plain-language line and, where I list it, only if you can deliver it.

**Short videos for the handful that matter most.** Now eight (you approved the six and asked for two more), each 8 to 12 seconds, looping, silent by default:
1. Social posting (content-engine / crosspost): photos in, captions drafted, owner approves, posts go out.
2. Lead finder (lead-intelligence): a list of nearby prospects builds itself.
3. Inbox and replies (email-ops / messages-ops): messages sorted, answers drafted.
4. Search visibility (seo): a shop's search presence improving.
5. Money chase (finance-billing-ops): unpaid invoices flagged and reminders drafted.
6. Hiring (job tools, including your Athena job-search work): a job post is written, candidates are scored. This covers your "jobs" point.
7. DM auto-reply (new): an Instagram or WhatsApp message arrives, the agent answers from the menu or catalogue, the owner is pinged for anything it can't answer. Most-built pattern in the n8n template library.
8. Competitor and price watch (new): the agent checks rival prices and posts a one-line summary to the owner. Based on your Mercury agent.

**How the videos are made (no Higgsfield needed for these).** Screen-style videos need exact text and UI, which image/video generators do poorly. So they are built as code (animated HTML) and recorded to MP4 with ffmpeg (already installed). Result is crisp, free and editable. Needs one small dev tool to record the browser (Playwright); a tooling install, not a site framework. Needs your OK.

**Higgsfield is used for realistic scenery only.** Done: five photorealistic stills (see `assets/photo/`), 0.25 credits each, no people, no text, no logos: restaurant, hotel room, e-commerce packing counter, marketer's night desk (blank laptop screen to overlay a demo on), West African shopfront at dusk. Inspected for watermarks and stray text. They are illustrative, not photos of real clients, and the site will say so.

## 3d. GitHub research: what is popular right now (checked 2026-10-03)

Sources: GitHub's `agent-skills` topic sorted by stars (28,744 repos), the largest open n8n template collection (280+ templates, 18 categories), and several third-party roundups. Star counts below are from the GitHub topic page; anything from a blog is marked "reported".

**Most-starred skill repos (context, not all business-relevant):** anthropics/skills 179k, ponytail 152k, addyosmani/agent-skills 101k, open-design 99k, archify 76.5k, ComposioHQ/awesome-claude-skills 76.4k, career-ops 73.4k, awesome-claude-code 55k, blader/humanizer 53.7k, awesome-openclaw-skills 52.9k.

**Ten business capabilities to put in the catalogue** (picked for restaurants, hotels, shops, marketers):

| # | Capability | Popular source | You have it? | How to deliver it |
|---|---|---|---|---|
| 1 | Instagram / WhatsApp DM auto-reply agent | n8n template "AI agent for Instagram DM inbox" (ManyChat + OpenAI) | Partly (iris, messages-ops) | Message webhook, answer from product/menu data, hand off to owner |
| 2 | Social posting and content calendar | n8n "AI-Powered Social Media Amplifier"; your content-engine, crosspost | Yes | Draft, owner approves, post to Pages and Instagram via official APIs |
| 3 | Shop support agent | n8n "AI-powered WooCommerce Support-Agent" | No | Read orders and FAQs, answer, escalate |
| 4 | Email summarise and reply | n8n "Summarize & Respond with RAG" | Yes (email-ops) | Retrieval over business FAQs, drafts only |
| 5 | Lead capture and qualification | n8n "AI-driven lead management" | Yes (lead-intelligence) | Score inbound enquiries, route to owner |
| 6 | Competitor research | n8n "Competitor Research with Exa.ai + AI agents" | Yes (Mercury, market-research) | Scheduled web checks, one-paragraph summary |
| 7 | Customer feedback sentiment | n8n "AI Customer feedback sentiment analysis" | No | Collect reviews, classify, flag complaints |
| 8 | Hiring and applications | career-ops (73.4k), n8n job-application handling | Yes (Athena, hiring-screener) | Score candidates against a role, owner decides |
| 9 | Writing that doesn't sound like AI | blader/humanizer (53.7k) | Yes (humanizer skill) | Final pass on captions and replies |
| 10 | Quotes, invoices and documents | anthropics/skills docx/pdf/xlsx | Yes (docx, pdf, xlsx) | Generate quote or invoice from a template |

**Caution:** these are third-party repos. I have **not** installed or run any of them. Before any are used for a client: read the code, check the licence, and test in isolation. Several lists mix real tools with marketing, so only items I can verify get shown on the site.

## 4. Research phase (before any design)

Per your skills-first rule, load `refero-design`, `impeccable`, `design-motion-principles`, `frontend-design` before building.

- Pull Refero styles/screens for the locked references (Exo Ape, Active Theory, ONE) plus 3 to 5 agency and automation-service sites. Record IDs in a `REFERENCE-LOCK` file for this site.
- Competitor scan: what web agencies in Freetown, Conakry, Monrovia, and diaspora-run studios show. Identify the gap.
- Market facts to verify before they appear on the page: mobile/Internet usage, payment methods (Orange Money, Afrimoney, etc.), common platforms. No unsourced stats.
- Pick 2 to 3 scroll-motion techniques that stay fast on cheap Android phones.

## 5. Build phases

| Phase | Output | Gate |
|---|---|---|
| 0 | Answers to section 2, reference lock | **Approved 2026-10-03** |
| 1 | Content map and copy (EN first; FR later, same keys) | Draft in `content/en.json`, awaiting review |
| 2 | Desktop + mobile static v1: hero, work, device morph, contact | **Built 2026-10-03**: no console errors, no horizontal scroll at 1440/1024/390; screenshots in `qa/` |
| 3 | Signature morph, automation demos, 8 capability videos, Business OS | **Built and merged 2026-10-03**: no console errors, no broken files, no horizontal scroll at 1440/1024/390, motion and reduced-motion; initial load about 551 KB; videos 2.3 MB total, load only on play |
| 4 | WhatsApp/contact wiring, SEO, a11y audit | Lighthouse, WCAG 2.2 AA |
| 5 | Your review, then deploy decision | You say go |

## 6. Constraints

- No deploy, no push, no edits to the production LAVAALL repo.
- No fake clients, testimonials or metrics.
- Performance budget set up front (target: under ~1 MB initial load, usable on 3G).

## 7. Next step

Authorise Refero (`/mcp`), confirm the six templates in `REFERENCES.md`, then Phase 0 lock file and Phase 1 copy.
