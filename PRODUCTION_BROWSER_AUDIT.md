# Production browser audit

**Target:** https://www.lavaall.com
**Result:** PASS — 12 August 2026

The reusable audit began at the customer-facing Products overview, discovered
the runtime product tree, opened every reachable category, brand, family and
model card, then opened every detail modal. It used fresh desktop and mobile
browser contexts; it did not submit quote forms.

| Check | Desktop | Mobile (390 x 844) |
| --- | ---: | ---: |
| Overview cards | 24 | 24 |
| Categories / brands / families | 19 / 54 / 95 | 19 / 54 / 95 |
| Customer routes visited | 168 | 168 |
| Model cards and details opened | 164 | 164 |
| Generated SKUs opened | 28 | 28 |
| Legacy models opened | 136 | 136 |
| Real images decoded | 62 | 62 |
| Truthful sourcing fallbacks | 102 | 102 |
| Gallery thumbnail clicks | 133 | 133 |
| Generated SKU searches | 28 | 28 |
| Generated quote-prefill checks | 28 | 28 |

## Results

- Broken images, wrong-product images, blank routes, dead controls, console
  errors and failed network requests: **0**.
- All 105 approved generated-media references were previously HTTP-checked and
  decoded on production; the browser audit additionally verified every
  customer-visible generated gallery selection.
- All generated detail galleries preserved one active `aria-pressed="true"`
  thumbnail after every click.
- The EN/FR toggle retained all 24 Products overview entries.
- The two quarantined R-Go Tools mismatches, `145145130` and `145145101`, were
  absent from the rendered catalog and generated bundle.
- The 102 legacy records without exact licensed media render intentional,
  truthful category/sourcing placeholders — never broken image elements.

## Release QA command

Run `node scripts/qa/production-browser-audit.mjs --base-url https://www.lavaall.com`.
It writes an ignored machine-readable report under `scripts/qa/reports/` and
returns nonzero for missing generated data, broken generated media, blank
product routes, dead controls, failed SKU search/quote context, or a visible
quarantined record.

## Notes

Product detail is a shared modal rather than an individual SKU hash route.
The audit reloads every reachable category/brand/family route in fresh browser
contexts and reopens every model from those routes. Quote actions validate the
client-side exact-SKU prefill only; they deliberately do not submit a customer
request or claim that the legacy Netlify form backend runs on Vercel.
