# LAVAALL Open Icecat importer

This is offline ingestion tooling. It does not modify `assets/js/catalog-data.js`, `assets/js/catalog.js`, `index.html`, routing, search, quote flow, or the live catalogue.

## Before any public display

Open Icecat fair-use requirements must be implemented and verified before generated product data is displayed publicly. In particular, review the required **Specs Icecat** attribution/link and the required AS IS disclaimer for the account's access terms. This phase deliberately does not change the public site.

## Access and credentials

Register the appropriate Open/Full Icecat content-user account and confirm its access method in MyIcecat. The documented XML_s3 interface accepts product lookups by Icecat ID, GTIN/EAN/UPC, or manufacturer product code plus brand. The importer supports either Basic credentials, an `api-token` request header, or both when the account requires them.

Copy `.env.example` into a local, ignored `.env` file only if your execution environment loads it, or otherwise set the variables in your shell/CI secret store. Never commit credentials.

```text
ICECAT_USERNAME=
ICECAT_PASSWORD=
ICECAT_API_TOKEN=
ICECAT_LANGUAGE=EN
```

When neither a token nor a complete username/password pair is configured, authenticated import stops with exactly: `ICECAT credentials not configured.` No web-scraping fallback exists.

## Seed and category map

`catalog-seed.example.json` contains deliberately unusable placeholders. Copy it to `catalog-seed.json` and replace them with legitimate supplier/distributor MPNs, GTINs, or Icecat IDs.

`category-map.json` intentionally starts empty. Populate it only from authenticated Icecat category IDs or names observed in returned source records. Example map entry shape:

```json
{
  "sourceCategoryId": "VERIFIED_ICECAT_CATEGORY_ID",
  "sourceCategoryName": "VERIFIED_ICECAT_CATEGORY_NAME",
  "lavaallCategory": "tablets"
}
```

An unmapped source category is logged as `unmapped-category` and skipped. The importer never creates LAVAALL categories.

## Commands

```powershell
# Offline seed validation; works without credentials or network.
node scripts/catalog-import/import-products.mjs --seed scripts/catalog-import/catalog-seed.example.json --validate-seed

# Offline importer self-test.
node scripts/catalog-import/test-importer.mjs

# Validate generated output and any locally downloaded assets.
node scripts/catalog-import/validate-catalog.mjs

# After supplying a real seed, verified category map, and credentials:
node scripts/catalog-import/import-products.mjs --seed scripts/catalog-import/catalog-seed.json
```

The example seed is expected to fail validation because its identifiers are intentionally fake. `--dry-run` and `--validate-seed` do not request Icecat data.

## Import behavior

- XML_s3 GET requests are sequential by default, delayed by `requestDelayMs`, capped by `maxProducts`, timed out, and retried only for transient failures.
- Permanent client failures, authentication failures, restricted products, and invalid identifiers are not retried.
- Identity priority is GTIN, then Icecat source product ID, then normalized brand plus MPN. MPN alone is never global identity.
- A valid product without permitted media is still imported with `primaryImage: null`, `images: []`, and `mediaUsageStatus: restricted` or `unavailable`.
- Private (`IsRich`) and expired gallery media are skipped individually and logged. Maximum gallery download is four images per product.
- Media is downloaded locally under `images/catalog/<category>/<brand>/<source-product-id>/`, converted to WebP while preserving aspect ratio, and then measured from the final local asset.
- `assets/data/catalog-generated.json` is generated for review only. It is not loaded by the site.

## Run reports

Every authenticated run writes a JSON report under `scripts/catalog-import/reports/` with requested, accepted, skipped, failed, downloaded/skipped images, and duplicates. No item is silently discarded.

## Product discovery (review-only)

`discover-products.mjs` reads an already obtained official Icecat index locally. It does **not** call Product XML, download galleries, invoke the importer, or alter the public catalog. Keep large indexes under `scripts/catalog-import/cache/`; that directory is ignored by Git.

Use the official supplier list to resolve desired brand names to Icecat supplier IDs and the official category list to label unmapped source categories. The production `category-map.json` remains the only mapping used for candidate eligibility. Discovery can write a separate proposed map for review, but never changes the production map.

```powershell
# Offline discovery against a locally obtained official index and reference lists.
node scripts/catalog-import/discover-products.mjs `
  --index-file scripts/catalog-import/cache/official-index.xml.gz `
  --index-type on-market `
  --targets scripts/catalog-import/discovery-targets.example.json `
  --suppliers-file scripts/catalog-import/cache/SuppliersList.xml.gz `
  --categories-file scripts/catalog-import/cache/CategoriesList.xml.gz `
  --category-map scripts/catalog-import/category-map.json `
  --market US `
  --max-candidates 50 `
  --output scripts/catalog-import/discovery/candidates.json `
  --proposed-category-map scripts/catalog-import/discovery/proposed-category-map.json

# Use only a reviewed discovery output where specific candidates were manually
# changed to selected: true. This writes a seed; it never runs the importer.
node scripts/catalog-import/discover-products.mjs `
  --generate-seed scripts/catalog-import/discovery/approved-candidates.json `
  --seed-output scripts/catalog-import/catalog-seed.json

# Offline synthetic discovery test.
node scripts/catalog-import/test-discovery.mjs
```

Supported index labels are `on-market`, `full`, and `daily`. The label controls discovery filtering policy only; this utility does not invent or download an index URL. The On Market index defaults to `onMarketOnly`; use `--on-market-only` with another index type when appropriate.

Candidate output is grouped by verified source supplier and source category. Each candidate includes only index metadata: Icecat ID, MPN, GTINs, model name, quality, on-market/limited flags, update time, market codes, preview URL, and `selected: false`. `HighPic` is never treated as permission to publish or download media.
