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
