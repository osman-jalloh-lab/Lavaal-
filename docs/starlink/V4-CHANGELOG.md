# Static V4 — changelog (2026-10-01)

Isolated build in `v4/` (forked from `v3/`). Spec: `../REFERENCE-LOCK-v3.md` + the "recreate Dala, don't interpret it" correction. Not deployed, nothing published, no production APIs. The LAVAALL repo was not written to.

Run: `python -m http.server` in `startlink/`, open `/v4/`. Screenshots: `../qa-v4/` (Dala reference images in `../qa-v4/_ref/`).

## Reference
Live Refero style `ba81bf2a-…` (Dala), preview images downloaded and measured at 1440×900: headline x=120, 3 lines at 106px pitch, light/regular weight, **sentence case**, white only; yellow uppercase tagline; violet only on pill CTAs; copy left, art right ~55% bleeding off the bottom; scroll dissolves the art into the next scene. AuthKit (`9712d1d1-…`) is used only inside the configurator panel.

## Checkpoints
1. **Nav + hero** — Dala nav (wordmark, 3 uppercase links, violet pill); "Get / connected / for less." Montserrat 400 at 113px, −0.04em; dish/router/cable composition replaces the brain. Sentence case confirmed by Osman.
2. **Hero → unboxing** — on desktop/tablet the hero overlaps the scroll track; the unboxing parts render the hero composition at identical coordinates (frame 0 is pixel-identical to the static hero), then separate into an exploded kit while the copy recedes. Phones: copy clears fast, hardware drifts apart, story follows.
3. **Unboxing** — camera moves through the exploded kit (6 Starlink parts) → statement → LAVAALL cluster (mount, power+UPS, mesh, installation) → parts converge into a depth composition, "The complete setup." Mobile story got its own complete-setup composition.
4. **Adds + configurator + final** — "More than the box." is one huge installation close-up + four labels; configurator keeps the AuthKit panel inside a section that fades from black; final CTA = one pill + uppercase text links. Nav gains a dark backdrop after the hero (as Dala's does on scroll).

## Fixed from screenshots
v3's heavy all-caps type throughout · hero art top-heavy / cropped · stale cached JS hid checkpoint 2 (assets now versioned `?v=`) · double headline during the hand-off · kit collapsing into small thumbnails · isolated close-ups · thumbnail-row ending · pole through dish · headline/dish collisions at 1440 and 1024 · mobile statement widow · stray progress line at the seam · nav colliding with headings.

## Open
- Parts briefly pass through each other mid-assembly (≈ ½ segment of scroll).
- Dark renders (box, kickstand, power) read dim; dish soft at hero scale. See `ASSET-NEEDS.md`.
- Contact links are placeholders (`app.js` → `CONTACT`).
