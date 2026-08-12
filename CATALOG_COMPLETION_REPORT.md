# Catalog completion report

**Scope:** marketplace-quality legacy conversion — 12 August 2026
**Production target:** https://www.lavaall.com

## Before → after

| Measure | Before | After |
| --- | ---: | ---: |
| Verified exact SKUs | 28 | 28 |
| Handwritten legacy records | 136 | 136, all classified as sourcing listings |
| Legacy records presented as verified exact SKUs | 136 ambiguous | 0 |
| Intentional sourcing listings | 0 explicit | 136 |
| Placeholder-based exact-product cards | 102 | 0 |
| Ambiguous legacy local model images shown as exact media | 34 | 0 |
| Generated exact image references | 105 | 105 |
| Generated galleries | 28 | 28 |
| Duplicate exact records removed | 0 | 0 — no strict MPN/GTIN/source-ID duplicate existed |

## Legacy classification

The machine-readable inventory is
[`scripts/catalog-import/legacy-catalog-classification.json`](scripts/catalog-import/legacy-catalog-classification.json).

| Classification | Count | Customer treatment |
| --- | ---: | --- |
| Sourcing only | 72 | Clear sourcing request; no exact-product claim |
| Misleading or low value | 31 | Reclassified as sourcing; unproven local photo suppressed |
| Blocked source | 33 | Apple/blocked-source sourcing request; no unsupported media |
| Verified equivalent exists | 0 | — |
| Can verify today | 0 | — |
| Duplicate | 0 | — |

All handwritten rows lacked source product ID, MPN, GTIN, and permitted-media
provenance. Therefore none qualifies as a verified exact product. Broad family
overlap (for example ThinkPad and ZBook) is preserved as sourcing coverage,
while the verified exact SKU appears separately and ranks first in search.

## Customer experience

- **Verified product** is reserved for the 28 generated records that pass the
  identity, permitted-media, visual-QA, and production-approval gates.
- **Sourcing available** labels every legacy request. It uses a truthful
  category icon rather than implying an unproven image represents the named
  model, and it offers a single **Request sourcing** action.
- Sourcing quote context includes category, requested family/model and chosen
  preferences, but never invents a source product ID, MPN or GTIN.
- Exact SKU search results rank before sourcing listings.

## Verified expansion queue

Four locally XML-enriched candidates have strong identity and permitted gallery
metadata, but remain **not integrated** pending a fresh exact-media import and
visual QA: Lenovo ThinkBook 16 G9 IPL (`137510906`), Lenovo ThinkBook 14 G7
ARP (`131491540`), LG 65UA731C0LA (`139920272`), and Hisense 65A6S
(`143953147`). No monitor or refrigeration candidate has yet completed local
discovery/enrichment, so none was guessed or promoted.

## Quote backend status

Exact SKU and sourcing quote **prefill** paths are verified. Actual form
submission still posts to `/` using the historic Netlify Forms pattern, while
production is Vercel. No safe delivery backend can be claimed without an
authorized mail/CRM endpoint and credentials, so this remains a separate
production blocker; the audit intentionally does not submit customer data.

## QA

Final Vercel production full-tree audit after conversion: 24 overview cards, 19
categories, 54 brands, 95 families, 164 cards/details, 28 verified listings,
136 sourcing listings, 133 gallery thumbnail clicks, 28 exact-SKU quote checks
and 136 sourcing quote checks. Broken images, blank routes, dead controls,
console errors and failed requests: **0**.
