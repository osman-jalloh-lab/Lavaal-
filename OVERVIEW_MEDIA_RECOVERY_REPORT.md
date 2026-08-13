# Overview Media Audit & Recovery Report

Date: 2026-08-13
Scope: frozen Layer 1 Products overview only. No overview layout, card, CTA,
typography, or catalog-data change was made.

## Result

- 24 of 24 cards rendered in fresh Chromium desktop/mobile and WebKit
  desktop/mobile contexts.
- `BROKEN`: 0; `WRONG_MEDIA`: 0; accidental `GENERIC_ICON`: 0.
- 7 cards use defensible original category artwork.
- 4 cards are intentional no-media sourcing/family listings. They visibly use
  the existing generic icon because the current frozen overview renderer uses
  that as its no-media state; this is an unresolved media-rights gap, not a
  file, path, or browser-rendering failure.
- 13 local assets render successfully but have no provenance record. They are
  classified `UNKNOWN_SOURCE` and must not be described as approved/recovered
  media until their origin and permitted usage are established.
- No asset was recovered, downloaded, replaced, or committed: none met the
  permitted-media recovery gate from the currently available local records.

## Screenshot-first evidence

Each of the 24 cards was individually scrolled into view and captured in all
four fresh browser contexts. The generated evidence is intentionally local and
untracked:

- `scripts/qa/artifacts/overview-media-audit/chromium-desktop/`
- `scripts/qa/artifacts/overview-media-audit/chromium-mobile/`
- `scripts/qa/artifacts/overview-media-audit/webkit-desktop/`
- `scripts/qa/artifacts/overview-media-audit/webkit-mobile/`

Each folder contains one card PNG per overview entry, a full/viewport overview
capture, `network.har`, and `trace.zip`. The machine-readable audit is
`scripts/qa/artifacts/overview-media-audit/report.json`.

## Card inventory

`200 image/*` below is transport evidence only. Classification also required a
settled visual card capture, non-zero natural dimensions, non-zero rendered
dimensions, and visible computed state.

| # | Card | Asset / state | HTTP + dimensions | Classification |
|---|---|---|---|---|
| 1 | Cisco ISR 4000 Series Router | `images/products/network-cisco-isr-4000.webp` | 200 WebP; 1100x365; rendered 307x201 | UNKNOWN_SOURCE |
| 2 | Cisco Catalyst Managed Switch | `images/products/network-cisco-catalyst-switch.webp` | 200 WebP; 1100x340; 307x201 | UNKNOWN_SOURCE |
| 3 | MikroTik RouterBoard | `images/products/network-mikrotik-routerboard.webp` | 200 WebP; 1280x674; 307x201 | UNKNOWN_SOURCE |
| 4 | Dell PowerEdge Server | Intentional generic server icon | No image request; 230px media state | INTENTIONAL_NO_MEDIA |
| 5 | HP ProLiant Server | Intentional generic server icon | No image request; 230px media state | INTENTIONAL_NO_MEDIA |
| 6 | Dell OptiPlex Workstation | Intentional generic computer icon | No image request; 230px media state | INTENTIONAL_NO_MEDIA |
| 7 | HP ProBook Business Laptop | Intentional generic computer icon | No image request; 230px media state | INTENTIONAL_NO_MEDIA |
| 8 | Fiber Optic Cable | `images/products/category-fiber-optic-cable.webp` | 200 WebP; 1200x800; 307x201 | REAL_CATEGORY_ART |
| 9 | Structured Cabling (Cat6/Cat6A) | `images/products/category-structured-cabling.webp` | 200 WebP; 1200x800; 307x201 | REAL_CATEGORY_ART |
| 10 | 1.5mm 4-Core Armoured Cable | `images/products/cables-armoured-reel.jpg` | 200 JPEG; 1200x1600; 307x201 | UNKNOWN_SOURCE |
| 11 | 100A 4-Pole Rotary Changeover (Havells) | `images/products/switch-havells-100a.jpg` | 200 JPEG; 1000x500; 307x201 | UNKNOWN_SOURCE |
| 12 | Andeli 1000W Voltage Stabilizer | `images/products/power-andeli-1000w.jpg` | 200 JPEG; 1125x1102; 307x201 | UNKNOWN_SOURCE |
| 13 | 12,000 BTU Rotary AC Compressor | `images/products/hvac-compressor.jpg` | 200 JPEG; 800x800; 307x201 | UNKNOWN_SOURCE |
| 14 | Compact Refrigerator | `images/products/appliance-compact-refrigerator.webp` | 200 WebP; 1200x800; 307x201 | REAL_CATEGORY_ART |
| 15 | Phones | `images/products/category-phones.webp` | 200 WebP; 1200x630; 307x201 | UNKNOWN_SOURCE |
| 16 | TVs | `images/products/category-tvs.webp` | 200 WebP; 1200x800; 307x201 | REAL_CATEGORY_ART |
| 17 | Monitors | `images/products/category-monitors.webp` | 200 WebP; 1200x800; 307x201 | REAL_CATEGORY_ART |
| 18 | Gaming | `images/products/category-gaming.webp` | 200 WebP; 508x605; 307x201 | UNKNOWN_SOURCE |
| 19 | Audio | `images/products/category-audio.webp` | 200 WebP; 1200x630; 307x201 | UNKNOWN_SOURCE |
| 20 | Smart Watches | `images/products/category-watches.webp` | 200 WebP; 721x443; 307x201 | UNKNOWN_SOURCE |
| 21 | Cameras | `images/products/category-cameras.webp` | 200 WebP; 1200x800; 307x201 | REAL_CATEGORY_ART |
| 22 | Printers | `images/products/category-printers.webp` | 200 WebP; 556x300; 307x201 | UNKNOWN_SOURCE |
| 23 | Accessories | `images/products/category-accessories.webp` | 200 WebP; 1200x800; 307x201 | REAL_CATEGORY_ART |
| 24 | Tablets | `images/products/category-tablets.webp` | 200 WebP; 903x566; 307x201 | UNKNOWN_SOURCE |

## Root cause and recovery decision

### Intentional no-media listings

The PowerEdge, ProLiant, OptiPlex, and ProBook cards resolve to `image: null`
in `assets/js/catalog-data.js`. `productImageHtml()` therefore renders the
existing `.product-image.ph` icon path. The image manifest records official
family pages for each, but explicitly marks reseller/media reuse as `unclear`
and directs the renderer to retain its placeholder. No image was missing from
disk, excluded by migration, or blocked by a filename/case mismatch.

Do not use a different generated Dell/HP SKU image for these family/sourcing
cards: that would falsely claim an exact product. Recovery requires a permitted
Dell/HPE/HP manufacturer-reseller or authorized distributor asset, or an exact
approved generated SKU to replace the legacy spotlight through the normal
catalog gate.

### Unknown-source local media

The 13 `UNKNOWN_SOURCE` cards have valid local files and all rendered in every
browser context, but have no matching record in
`scripts/product-images/product-image-manifest.json`. Their current visual
availability is not evidence of rights or exact identity. The recovery action
is provenance reconstruction: locate the original authorized source and add a
manifest record with provider, source reference, usage basis, retrieval date,
hash, dimensions, and visual-QA outcome. If that cannot be established, retire
the asset only as part of a later authorized overview-media decision—do not
replace it with retailer or generated branded imagery.

### Approved original category art

The seven `REAL_CATEGORY_ART` entries have manifest-backed original category
art with the `original-category` source type and `original` usage status. The
manifest supplies local path, original-generation source reference, generic
identity basis, and SHA-256; the current audit additionally confirmed visual
rendering. These are valid overview media, not exact SKU claims.

## Browser result

| Context | Cards | Console warnings/errors | Failed requests | Result |
|---|---:|---:|---:|---|
| Chromium desktop | 24 | 0 | 0 | PASS |
| Chromium mobile (390x844) | 24 | 0 | 0 | PASS |
| WebKit desktop | 24 | 0 | 0 | PASS |
| WebKit mobile | 24 | 0 | 0 | PASS |

## Follow-up acquisition path

1. Reconstruct provenance for the 13 existing local files before treating them
   as approved media.
2. Seek permitted source media for the four family/sourcing cards through the
   approved waterfall: existing approved local assets, Icecat, authorized
   distributor/manufacturer-reseller feeds, then owned LAVAALL photography.
3. Do not use retailer images, unlicensed manufacturer marketing assets, or
   AI-generated branded hardware.
