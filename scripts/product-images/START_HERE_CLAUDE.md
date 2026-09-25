# Lavaall image integration task

Use every relevant repository skill you have for code quality, UI/UX, accessibility, responsive design, image optimization, and browser QA. First inspect the repository and its existing design tokens, catalogue schema, image conventions, and routes.

## Objective

Integrate the supplied Lavaall image pack into the existing website. This is an aesthetic improvement and missing-image completion task—not a redesign. Preserve the website’s content, information architecture, layouts, interactions, navigation, and brand context.

## Required work

1. Read `IMAGE_MANIFEST.tsv` and use its exact mapping. Copy the assets into the repository’s established image directory, adapting paths only if the repo convention requires it.
2. Fill only catalogue entries whose image reference is missing or broken. Do not overwrite verified distributor/product photography unless I explicitly approve it.
3. A family image may be shared only by the catalogue entries listed together in the manifest (for example, the iPhone 13 family).
4. Use the category artwork in `category-artwork/` only for the matching category. Keep headings, copy, product data, filters, links, and routes unchanged.
5. Match the existing Lavaall dark navy/charcoal, cyan, and emerald visual system. Improve image framing, container styling, crop behavior, spacing, contrast, hover polish, and responsive presentation only where needed to make these assets feel native to the site.
   - Before placing an image, inspect the exact product card, category tile, or section where it will appear and identify its existing background color, gradient, texture, border, radius, shadow, padding, and lighting direction.
   - Make the supplied image blend naturally with that already-existing background so it does not feel pasted in, brighter, darker, or stylistically separate from nearby products.
   - Prefer matching the existing image container through CSS and careful `object-fit`/`object-position` settings. If an image itself must be adjusted, preserve the product and change only its surrounding background treatment.
   - Keep background treatment consistent across products displayed in the same grid. Do not introduce a new global background style or redesign the cards.
6. Treat generated imagery as representative sourcing artwork, not proof of an exact configuration. Use honest, specific alt text and do not add unverified specifications, prices, badges, or claims.
7. Optimize delivery: retain the supplied WebP files where supported, preserve aspect ratio, prevent layout shift, lazy-load below-the-fold images, and avoid stretching or destructive cropping.
8. Keep accessibility intact: meaningful alt text, visible keyboard focus, adequate contrast, and no information conveyed by imagery alone.

## Verification before committing

- Run the project’s existing tests, lint, and build.
- Run an automated catalogue audit confirming every mapped entry resolves to a real image with `naturalWidth > 0`.
- Browser-test the category layer and representative product routes on desktop and mobile widths.
- Check for broken paths, overflow, distorted crops, layout shift, illegible contrast, console errors, and regressions.
- Compare each inserted image with the working images immediately beside it. Verify that the background tone, gradient, visual weight, crop, padding, and apparent lighting feel consistent at desktop and mobile sizes.
- Report precisely which files and catalogue records changed.
- Create a preview deployment for review. Do not merge to production until the preview is approved.

If the repository data differs from the manifest, stop and explain the mismatch rather than guessing.
