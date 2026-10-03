# Static V3 — asset needs

The build is image-first, so assets are now the main quality limit.

## Done (2026-10-01)
A new AI-generated photographic set now lives in `../assets/product/shop/` — 11 images at
1232×1232 plus `og.jpg`, all shot to one preamble (black studio sweep, softbox key upper
left, grounded contact shadow) so they read as a single shoot. These feed the `#shop`
section. The lock amendment permitting AI imagery is at the top of `../REFERENCE-LOCK-v3.md`.
This retires the old "complete system" and "installation" fallbacks that reused the dish render.

## Blocking for a 9/10 visual
1. **Both plug standards exist — confirm which ships.** Sierra Leone is 230V **Type G**;
   Liberia is 120V **Type A/B**. Both are rendered:
   - `shop/power-uk.webp` + `shop/ups-uk.webp` — Type G. **Currently wired in `#shop`.**
   - `shop/power.webp` + `shop/ups.webp` — Type A (US), for the Liberia variant.
   If both markets are served equally this needs a locale switch, not one default.
2. **The scroll track still uses the old cutouts.** `#shop` uses the new photographs, but the
   hero and unboxing animation still read `../assets/product/cutout/*.webp` — the upscaled
   preview thumbnails. Those need transparent-background versions of the new set
   (the new ones are shot on black with a grounded shadow, so they are *not* drop-in cutouts).
   - Dark objects (box, power supply, UPS, kickstand) need a real alpha mask; luminance keying loses their dark faces.
3. **Separate surge-protector render** — today "Power protection" and "UPS backup" share one image, so the lock's steps 8 and 9 are merged into one.
4. **Real installation photography** (rooftop or pole mount in Sierra Leone/Liberia) for the Installation stop and "More than the box". `shop/install.webp` is an AI architectural detail crop, not a real site — do not caption it as a real install.
5. **`og:image` needs an absolute URL.** `v4/index.html` points at a relative path, which
   social platforms cannot resolve. Replace with `https://<domain>/assets/product/shop/og.jpg`.

Hardware in the new set is deliberately generic and unbranded — plausible, not an exact
replica of the real SKUs. Do not use official Starlink marketing imagery without permission.

## Before any public use
- Real WhatsApp number, phone number and email — `CONTACT` in `app.js` holds placeholders (`wa.me/00000000000`, `tel:+00000000000`, `hello@lavaall.com`).
- Approved affiliation wording — the footer line is conservative but not legally reviewed.
- Self-host the fonts (Bricolage Grotesque, Inter, IBM Plex Mono) or confirm Google Fonts is acceptable.
