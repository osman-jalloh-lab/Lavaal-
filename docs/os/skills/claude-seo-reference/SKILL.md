---
name: claude-seo-reference
description: >-
  Use this when Technical & QA runs an SEO audit of lavaall.com or a client
  site, alongside page-audit and website-qa.
---
# SEO audit checklists (reference)

Source, read-only: `/home/box/agent-data/projects/lavaall/tools/claude-seo/skills/` (github.com/AgriciDaniel/claude-seo @ 6be93f4, MIT).

## Hard limits
- Read the skill files only. Never run `install.sh` or any Python script from the repo.
- Don't use paid extensions (DataForSEO, Ahrefs, Firecrawl and similar), and don't use `seo-image-gen`, which is AI media.

## Checklists to use
- `seo-technical`: crawlability, indexing, speed and mobile.
- `seo-schema`: structured data.
- `seo-sitemap`: sitemap and robots.
- `seo-hreflang`: EN and FR language pairs.
- `seo-local`: local business listing signals.
- `seo-geo`: whether AI search tools can find and cite the page.

## Steps
1. Pick the checklists that fit the site and read their SKILL.md files.
2. Check the live pages with free tools only: fetch, view source, sitemap and robots.
3. Report each finding with its page URL, what's wrong, the fix, and its severity. Fold the results into the page-audit or website-qa report.
4. Report only what you observed, with no invented metrics. Fixes on the live site follow the usual L3/L4 approval.
