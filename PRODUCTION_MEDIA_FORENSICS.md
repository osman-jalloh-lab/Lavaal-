# Human-device media forensics

The screenshot-first production audit is a reusable release check:

```powershell
python scripts/qa/production_visual_gallery_audit.py --browser chromium --focused-only --output scripts/qa/reports/visual-production-chromium
```

It uses real homepage-to-product navigation, then saves settled gallery screenshots, DOM snapshots, HAR, trace, layout state, console warnings/errors, and image network evidence. It deliberately requires a visible, decoded, non-zero rendered image; an HTTP 200 alone is not a pass.

Synthetic browser passes are valuable release evidence, but they do not prove every physical browser, cache state, extension, GPU, or network session is healthy. When a customer observes a blank image, ask them to reproduce it with:

```text
https://www.lavaall.com/?mediaDebug=1#products
```

The opt-in drawer is not shown to ordinary visitors. On the affected product, use **Copy debug report**, then provide the copied JSON and a screenshot of the rendered gallery. **Recheck image** observes the current state again. **Test no-cache image** loads the exact current image into a separate diagnostic `Image` with a cache-busting query parameter; it never replaces the product image.

The report captures the browser/device, route, generated-catalog fingerprint, displayed and expected product paths, DOM/layout/computed-style state, immediate parents, resource timing, a no-store same-origin fetch result, service worker/cache names, relevant catalog storage keys, image-error state, and a diagnostic classification. This preserves the original failure instead of falling back or advancing the gallery while the report is collected.

The classification distinguishes CSS/layout (`CASE_A`), visibility/compositing (`CASE_B`), network/path (`CASE_C`), browser decode/load (`CASE_D`), catalog/gallery state (`CASE_E`), stale cache (`CASE_F`), and mixed build/catalog evidence (`CASE_G`, reported when the deployed identifiers disagree during investigation).
