# Character bible

## Shared identity
Working family name: **LAVAALL Companions**. Both are small, expressive, original characters with a wide black/dark face panel, two simple luminous eyes, readable expressions, round compact body, restrained glowing accents, soft edges and approachable poses. Recognizable silhouette at 48x48px. Ensure there's an unanimated static image fallback.

## Technology character: Robot
- Shape: rounded head + compact body + two stubby arms and feet, friendly and useful rather than toy-ad clutter.
- Detail cues: small antenna/status light, simple chest emblem extracted from actual official LAVAALL logo, optional side panels; never put a laptop/server in its body.
- Personality: calm, welcoming, resourceful. Routes to product categories, product questions, procurement and request-a-quote flow.

## Web character: Cat-inspired companion (proposed variant)
- Match the robot's scale, screen-face size, eye animation and shared head/body ratio.
- Distinguish through two small cat ears, a subtle curved tail and softer facial poses. Avoid full realistic cat fur, anime human, or a generic emoji cat. The cat is a friendly AI creature, not an animal photo.
- Match Web site identity and help with websites, automations, AI services and the existing Lava experience. Product "Lava" should not be renamed unless owner explicitly approves.

## Surface-specific skins
Source of truth: actual logo/SVG and design tokens in `index.html`, `api/web/_site/`, `_shared-brand`, and `MAGNUM.md` if present. Extract tokens in the actual repo at implementation time; do not hardcode guessed brand HEX. Web and Technology may share the base logo while using distinct accent tokens. No forced yellow or orange.

## Design assets to create
Export `tech-idle.svg|webp`, `tech-speaking.svg|webp`, `web-idle.svg|webp`, `web-speaking.svg|webp` plus 48/96/192px static icons and dark/light contrast variants. Original concept PNG is inspiration only; do not slice it into final commercial UI assets. If using animation JSON/Lottie, keep source-editable master files in repo; document asset licenses.

## Content
Accessible text label e.g. "Open LAVAALL Assistant" on Technology and "Open LAVAALL Web assistant" on Web. No fake client claims, stock confirmations, price quotes, delivery promises or unauthorized support hours. The mascot is visual, not a commitment about the chatbot's actual capabilities.
