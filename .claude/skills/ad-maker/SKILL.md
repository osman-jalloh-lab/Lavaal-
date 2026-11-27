---
name: ad-maker
description: Make social ads and posters for LAVAALL businesses (first SaloneHire's 1 Dec launch) in code, in the brand, from real facts only. Use when Osman asks for ads, posters, launch creative or social posts.
---

# Ad maker

Method from the Claude Design Blueprint, hack 13 (poster in code). Ads are drawn in HTML and CSS at true size and exported to PNG with Playwright, so every word is real text and on brand. Generated imagery (Higgsfield) is optional and costs credits: only with Osman's yes.

## Sizes
| Where | Ratio | Pixels | Safe zone |
|---|---|---|---|
| Instagram / Facebook feed | 4:5 | 1440 x 1800 | 6% sides |
| Story / Reels / TikTok | 9:16 | 1440 x 2560 | keep top 14%, bottom 35%, sides 6% free of text |
| Square | 1:1 | 1440 x 1440 | 6% |
| Share card | 1.91:1 | 1200 x 630 | 6% |

## Steps
1. Facts first: write the facts you may use (from the repo README, projects.json, Osman). Nothing else goes in the ad.
2. Three concepts, one line each: the hook, who it is for, the one action.
3. Build each as an HTML file with the brand tokens from `docs/design/DESIGN.md`. One big thing to look at first. One call to action.
4. Export PNG at 2x of the CSS size with Playwright. Check the title still reads at 200px wide.
5. Score each ad out of 10 for hook, clarity and brand. Fix anything under 8. Show Osman before anything is posted.

## Never
Invented numbers ("hundreds of jobs"), testimonials, logos of other companies, prices, or the private business name. No posting or ad spend without Osman's yes.
