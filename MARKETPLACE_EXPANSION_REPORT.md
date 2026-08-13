# Marketplace expansion report

## Quote backend

The historic form URL-encoded a Netlify Forms payload to `/`; that receiver
does not exist on Vercel. Production now exposes `POST /api/quote`, a
dependency-free Vercel function that validates contact fields, consent,
quantity, request mode, honeypot, body size and exact-vs-sourcing context.
It returns a truthful `503 delivery_not_configured` until an authorized
`QUOTE_WEBHOOK_URL` is configured in Vercel. It never reports a quote as
accepted without durable delivery.

The frontend now posts JSON with `requestType` (`verified-product` or
`sourcing`) and separated context. The quote API audit covers valid verified
and sourcing payloads, invalid email, invalid quantity, invalid mode and the
honeypot. No customer data was submitted.

## Candidates

| Candidate | Result | Decision |
| --- | --- | --- |
| Lenovo ThinkBook 16 G9, `137510906` | PASS | Integrated |
| Lenovo ThinkBook 14 G7, `120862582` | PASS | Integrated |
| LG 65UA731C0LA, `139920272` | PASS | Integrated |
| Hisense 65A6S, `143953147` | FAIL visual | Excluded: no clean permitted hero |

Each integrated SKU has authoritative supplier/category/MPN/GTIN, four
curated permitted local images and passing media validation.

### Condition reconciliation: ThinkBook 14 G7 (`120862582`)

Fresh authoritative Product XML confirms supplier **Lenovo** (`728`), category
**Laptops** (`151` → `computers`), product **ThinkBook 14 G7 ARP**, MPN
`21MV001HGE`, and GTIN `0198153150373`. Its only condition-related source
feature is `Certified refurbished: No`; no renewed, used, open-box or other
condition evidence appears in the normalized record. The prior defer was a
parser false positive that matched the feature *name* rather than its value.
The enrichment rule and regression test now require affirmative condition
evidence, so this SKU remains eligible and production-approved.

## Monitor and refrigeration discovery

The cached source index and authoritative XML support a monitor shortlist
(Dell, HP and Lenovo) and a freezer-led refrigeration shortlist (Samsung, LG,
Whirlpool, AEG, Beko, Electrolux, Haier and Hisense). They were not promoted:
each still requires the normal media download, gallery curation and browser
visual gate. Three supplier-mismatch monitor candidates were blocked:
`120864701`, `132357964`, `132365290` all resolve to R-Go Tools.

## Counts

- Verified exact SKUs: **28 → 31**
- Sourcing listings: **136 → 136**
- New approved images: **12**
- Generated image references: **105 → 117**
- New categories with verified coverage: **0** (monitors/refrigeration remain
  in verified discovery, not production)

## Validation

Catalog validation: 31 valid products. Media validation: 117/117 valid,
decodable local references. Generated JSON/JS bundle parity, importer and
adapter tests, quote API audit and syntax checks passed.

## Remaining blockers

1. Configure an authorized Vercel `QUOTE_WEBHOOK_URL` (mail/CRM receiver) for
   actual durable quote delivery. Until then the UI correctly preserves form
   input and reports delivery unavailable.
2. Perform import, visual curation and browser QA for the discovered monitor
   and refrigeration shortlists before production integration.

## Release-gate promotion

Nine monitors and nine freezer products have now passed authoritative identity,
condition, source-entitlement, local-media, and visual-curation gates. The
browser bundle contains 49 approved exact SKUs. Monitor coverage adds five Dell displays, two HP displays, and two
Lenovo ThinkVision displays. Refrigeration adds Samsung, LG, Whirlpool, Beko,
Haier, and Hisense freezer models; product names and all displayed
specifications remain source-backed.

The monitor hard-blocks `120864701`, `132357964`, and `132365290` remain out:
their authoritative XML supplier is R-Go Tools. Refrigeration exclusions are
Samsung `146926165`, AEG `124288549`, and Electrolux `122923549`, each because
the permitted gallery did not include a clean truthful exterior hero. HP
`131284986` is excluded for the same visual reason.

The browser crawler now performs a strict, bounded image state machine: it
requires an attached, visible selected image with nonzero natural and rendered
dimensions; tries `decode()`; and makes one controlled retry of that same
selected source. It records source, dimensions, elapsed time, and correlated
network response rather than treating a single cold-cache sample as either a
pass or a failure.

Vercel served the deployed browser bundle with 49 production-approved products
at `cle1::98fml-1786584627634-5a5dd9cd87b7`. Three full fresh-context production
crawls passed: desktop A, desktop B, and 390px mobile. Each opened 185 customer
listings (49 verified, 136 sourcing), visited 185 routes, activated 193 gallery
thumbnails, checked 49 exact searches and 185 quote-prefill paths, and found
zero broken or wrong images, blank routes, dead controls, console errors,
network errors, or quarantined products.
