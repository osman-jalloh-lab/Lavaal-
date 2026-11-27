# NEVER-LOAD list (LAVAALL desks)

Plain note, not a skill. Written 3 Oct 2026 (CT) by Technical & QA, at CEO's request after Scout's scan (`projects/lavaall/research/creator-scan/2026-10-03.md`). Box paths are relative to `/home/box/agent-data/projects/lavaall/`.

Rule behind it: LAVAALL bars AI-generated images, video, voice and music (LAVAALL-KIT-SCROLL-RULES §1.1). These files are fetched copies for reference. No desk may load them as skills, put them in a skill library, or follow their instructions.

## Never load
| Item | Box path (checked 3 Oct) | Why |
|---|---|---|
| brandkit (Leonxlnx/taste-skill, MIT) | `tools/taste-skill/skills/brandkit/SKILL.md`. Folder exists, commit `ce26fc2`. | Its frontmatter says "Premium brand-kit image generation skill". AI image generation. |
| image-to-code (taste-skill) | `tools/taste-skill/skills/image-to-code-skill/SKILL.md` (frontmatter name `image-to-code`). Folder exists. | "it must first generate the design image(s) itself". AI image generation, and its forceful wording would override our ban if loaded. |
| taste-skill imagegen-frontend-web / imagegen-frontend-mobile | `tools/taste-skill/skills/`. Listed in the fetch record, not opened. | Same kind (image generation), per Scout's fetch record. |
| ui-ux-pro-max sister skills: `design`, `brand`, `banner-design`, `slides` | `tools/ui-ux-pro-max-skill/.claude/skills/<name>/`. All four folders exist. | `design`: `scripts/{logo,icon,cip}/generate.py` use Gemini image generation (GEMINI_API_KEY). `brand`: `scripts/inject-brand-context.cjs:182,291` builds AI image-generation context, and `templates/brand-guidelines-starter.md:225` has an "AI Image Generation" section. `slides`: `references/html-template.md:278` hot-links images.pexels.com. `banner-design`: no image-generation call found in a grep on 3 Oct, but it is excluded with the set per CEO. |
| ui-ux-pro-max `design-system` sister skill | `tools/ui-ux-pro-max-skill/.claude/skills/design-system/`. Folder exists. | `scripts/fetch-background.py` hot-links Pexels stock photos (licence check needed). Never-load until reviewed. |
| ui-ux-pro-max Premium (uupm.cc) | none (paid product) | Adds AI image generation. Never buy it. |

Allowed instead: the ui-ux-pro-max **core** skill only, under its own LAVAALL skill `ui-ux-pro-max` (with limits). Not reviewed and not allowed yet: `ui-styling` in the same folder.

## Deferred
| Item | Box path (checked 3 Oct) | Status |
|---|---|---|
| extract-design-system (arvindrk/extract-design-system, MIT) | `tools/extract-design-system/skills/extract-design-system/`. Folder exists, commit `1873741` (19 Jun 2026). | **Deferred.** It may be useful for a future client redesign, but only on a client's own site with their OK. Its workflow runs `npx playwright install chromium` and `npx extract-design-system <url>` (browser and npm downloads), and Impeccable `extract`/`document` plus MAGNUM.md already cover our own tokens. Needs Technical review and Osman's OK before any use. |

## Web design review (after the Starlink ship)
- Use **vercel-labs/web-interface-guidelines** (https://github.com/vercel-labs/web-interface-guidelines). Its MIT licence (© 2025 Vercel Labs) was confirmed through WebFetch of the repo's LICENSE file on 3 Oct 2026. Read its rules as the review checklist and credit it.
- Don't copy vercel-labs/agent-skills `web-design-guidelines` files, because that repo has no licence. Don't use addyosmani/agent-skills for this (it's parked until 10 Oct anyway).
- Pair it with the `website-qa`, `impeccable-design-checks` (markdown mode) and `ui-ux-pro-max` skills.

- react-bits: dropped by Osman Oct 4 (duplicate of Kokonut UI)
- agency-agents (tools/agency-agents, d3f71c4): never load the carousel growth engine (auto-posts, no approval, AI images), accounts payable (makes payments incl. crypto), report distribution (scheduled email sends), or orchestrator (runs pipelines without manual intervention); never run install.sh, convert.sh, the desktop app or brew. See LAVAALL-FETCH.md for file:line evidence.
