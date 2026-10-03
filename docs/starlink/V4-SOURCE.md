# Starlink v4: source snapshot for `api/starlink/_site`

Copied from Osman's `OneDrive\Desktop\startlink\` (read-only source, not a git repo) on Fri Oct 2, 2026 ~7:30 PM CT.
The `v4/` + `assets/product/` layout is kept as-is so every file except the three integration edits is byte-identical.
SHA-256 below is of the **OneDrive source file** (text files hashed with line endings normalised to LF, so Windows checkouts match; `v4/motion.js` is CRLF at source and is kept CRLF). `tests/test-starlink.js` checks every `identical` row still matches.

Not copied (docs, not served): `v4/CHANGELOG.md`, `v4/ASSET-NEEDS.md`, `assets/product/README.md`. The old `assets/product/cutout/` set is no longer used by v4 and was dropped.

| File | Source SHA-256 | Status |
|---|---|---|
| `assets/product/fields/box.webp` | `5ec24e7e6c36134fe2b8c80dbf3837ff3fa8559089f74d0a10f95b1ed4496c17` | identical |
| `assets/product/fields/cable.webp` | `f8ffeceb2c5cc6b810c3d1cd885524b5adb7514dfa10dee5afcf3e35cd610eb7` | identical |
| `assets/product/fields/dish.webp` | `f8d2fbdb13172d89ddf423016cda42877b1346b3f48e1edef3ed35f9ae289c9d` | identical |
| `assets/product/fields/kickstand.webp` | `fd98fb359f85177201b02d0e7d3de63dba7b6704aecb2b42545374302329213c` | identical |
| `assets/product/fields/mesh.webp` | `609478f9f0fccf6a5582fb38b17abcfb427245fa80beccc81c64c86b44019efa` | identical |
| `assets/product/fields/og.jpg` | `ae2b6c34a5487ce3243a2f247da1eb10edcf82a166e465351b598eaf85ec7fd9` | identical |
| `assets/product/fields/polemount.webp` | `b106e7489d5d6d690984b8ceb3618728e13bab7aa0142f0da61c59f5dfac81b6` | identical |
| `assets/product/fields/power.webp` | `cb8aecb66fdcff46e793fdb18780c0700501d72a7fe6b1a661bf2b9fc7906c00` | identical |
| `assets/product/fields/router.webp` | `588cff7d407ead448abcd59d8f099ab9bfe4863a7e1c0b4b8e3385a8f6af64d9` | identical |
| `assets/product/fields/system.webp` | `1bd3de3482f621fc3afd5c15dee3ad7733ca31b014b5dbb5e18f9374388d536d` | identical |
| `assets/product/fields/ups.webp` | `fa05724f133d6b59752d4d044004c0fe3d4d2b0c5087c4e8545bd8a70de940a9` | identical |
| `assets/product/perk-cut/box.webp` | `546c5616a69a04f37fb8ad6051880e3ffec6b1f87d2b5559e94c9b959c7ef043` | identical |
| `assets/product/perk-cut/cable.webp` | `9a6499e970abbd003bd00e6d99fb7c186b42931fb16111809561b2b1286662c6` | identical |
| `assets/product/perk-cut/dish.webp` | `ee9db52660bd6fdd2db86dcddfcd4f3751743b8779a1bc0b7d6d3e4aa652ed15` | identical |
| `assets/product/perk-cut/install.webp` | `fcdc05dbaac23870c689c5ff5aa2943cda5c113ce034f3333d04c13393d8e74f` | identical |
| `assets/product/perk-cut/kickstand.webp` | `f8ed071b703bfc503abd1f6c4833e2b4467c689192e1b2c62e5e45b16b5d424d` | identical |
| `assets/product/perk-cut/mesh.webp` | `82de27e6327a9a5fe3da78a9301b7a491ffa1484e62f1ed28416bbcd47e83059` | identical |
| `assets/product/perk-cut/polemount.webp` | `23176bfd869f46f2bd35820d13ffe77dbd1c91e8f8c0782baf1590e0277b8acc` | identical |
| `assets/product/perk-cut/power.webp` | `946c796a0ed5e72d2daec0e362e423bcb1e6b616582fc728852fda4124b9fe97` | identical |
| `assets/product/perk-cut/router.webp` | `46b6d47d837c6eea504a89cf80ce66e789bf9b919037315cee5ceb7bd23d3b57` | identical |
| `assets/product/perk-cut/system.webp` | `53f1c0e5e212f34a3d3c1bf71c82059764644441e4313328b8531e0c663fe7ce` | identical |
| `assets/product/perk-cut/ups.webp` | `e5022dc5a080bc39e969bb7b8f6d18d1086bc41b6aafbcbec421a627bbbe093b` | identical |
| `v4/app.js` | `9bc12ac0d5c227eaa34a9e16de68b6bdc0294a0f6f623323ca9147446661c954` | edited |
| `v4/globe.js` | `f251401640a2fc911183fd9de6efcfd78eef1095f2d3ec72aff0d488ca6348d6` | identical |
| `v4/index.html` | `2cfecfe4ba7ed4969a27b49220e82a6af08296bc76338ea192405584ec5c6396` | edited |
| `v4/motion.js` | `1a9fa6d1edda2811663ba7d6d289d0decf50a886f7dafca1294a9b051addca0a` | identical |
| `v4/styles.css` | `2854553ce1d26d2d8b0f809abcbc51b71721b08ae769d452f27a82b663e669ff` | edited |

## Integration edits
- `v4/index.html`: absolute `og:image` (`https://lavaall.com/starlink/assets/product/fields/og.jpg`; the server swaps in the request origin on Preview/local); `<meta name="robots" content="noindex, nofollow">`; Get connected fields (WhatsApp, Email, honeypot, status line) in the result panel; `?v=cp4c-be1` cache-bust on `styles.css` and `app.js`. Inline `.is-pinned` script unchanged (already in sync with `motion.js`; a test now enforces it).
- `v4/app.js`: server-issued setup code (`POST /setups`, client `code()` kept as the offline fallback), Get connected (`POST /setups/:code/connect`) with busy / ok / error states, return visits (`?code=LV-XXXXX` link or the remembered code via `GET /setups/:code`), contact links from server config (`window.LV_CONFIG`, placeholders kept as defaults). Shop `data-sku` enquiries unchanged.
- `v4/styles.css`: one appended block for `.connect` / `.connect__status` using existing tokens only (no gradients, no shadows, lime only as the status dot).
