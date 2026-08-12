# Overnight catalog release — 2026-08-12

## Overview

The verified Layer 2 catalog is now enabled on `main`. It contains 28 approved, source-verified SKUs with local permitted media: the 19-product pilot (including two Lenovo replacements and refreshed Hisense media) plus nine curated Samsung phones. Layer 1 remains the existing broad Products overview.

## Pilot

- 19 integrated / identity PASS / media PASS / visual PASS.
- The two R-Go Tools mismatches, `145145130` and `145145101`, remain quarantined and are neither in the generated catalog nor tracked as production media.
- Lenovo replacements: ThinkPad P16s Gen 5 Intel (`149919314`) and ThinkPad P14s Gen 6 AMD (`130590632`).
- Hisense 40A4Q (`130695305`) and 100U7Q (`130728217`) now use their clean permitted product-focused hero media and are PASS.

## Samsung phones

Nine curated Samsung phone SKUs are live in the generated Layer 2 data across Galaxy S, Z, and A families. Three marketing-text hero images were excluded from the Z Flip8, Z Fold8, and Z Fold8 Ultra galleries; clean alternate product views are primary. S26 (`140065173`) and Z Flip7 FE (`132622690`) remain local audit candidates only because their source galleries did not meet the launch quality bar.

## Site behavior and QA

- Generated SKUs require verified identity, permitted local media, visual PASS, and `integrationApproved: true` before the browser merges them.
- Product details support local galleries, thumbnail active state with `aria-pressed`, exact MPN/GTIN-aware search, and exact-SKU quote context.
- 28 products / 105 referenced images validate successfully; no missing, zero-byte, undecodable, duplicate, or malformed image paths.
- JavaScript syntax, gallery/adapter, selection, visual-review, importer, catalog, and media validation tests pass.

## Git and deployment

- `d7f9acd` — integrate verified pilot catalog
- `2cea3b6` — add curated Samsung phone catalog
- Both commits were pushed to `origin/main`.
- The local Netlify CLI is not linked to a project, and this repository does not record a public deployment URL. The main-branch release was pushed through the existing repository workflow, but a deployed URL could not be independently smoke-tested from this checkout.

## Next

1. Confirm the hosting provider’s main-branch deployment and its public URL, then perform an external production smoke test.
2. Click Products → Tablets/Computers/TVs/Phones → Samsung/Lenovo/Hisense and open several product details.
3. Confirm the quote form receives an exact product, MPN, and GTIN context.
4. Continue Apple sourcing only after a licensed structured source is selected.
