---
name: replica-entrepreneur
description: >-
  Use when you need to find what a competitor's real users hate, what's missing
  and what's unsolved, from public reviews, and turn it into a ranked fix plan
  and a positioning angle for your own product. Every quote is verbatim and
  linked.
---
# replica-entrepreneur

Adapted from [replica-skill](https://github.com/Jakeschincariol/replica-skill) (MIT, Jake Schincariol). Use it for competitor gap research, not for cloning. Build what users wish existed. Never copy a competitor's code, logo, copy or content.

Helper tool in this skill's folder (stdlib Python 3.8+, no network):

```bash
python3 reviews.py reviews.csv --out feedback.md
```

`themes.json` sits beside it. Edit the themes for the product's category.

## Rules (not negotiable)
- **Never fabricate.** No invented reviews, quotes, ratings, counts, users or sources. If a source can't be reached, say so. If there are 14 reviews, say 14.
- **Quote verbatim and link every quote.** Copy each one exactly, with its review or thread URL. `reviews.py` drops rows without a link.
- **Read, don't scrape.** Read review pages the way a person does. Use official public feeds or APIs only within their terms. Never scrape sites whose terms forbid it, and follow any org rule that bars a source.
- **No fake reviews, ever,** for or against anyone.
- **Reviewers are research, not testimonials.** Never put their words in your marketing.

## Step 1: collect
Aim for 100+ reviews across at least three sources, most recent first. Small markets will have fewer, so state the real count. Sources to check:
- app stores
- Google Maps / Google Business reviews
- Trustpilot, G2, Capterra
- Facebook pages and groups
- Reddit and forums: "X alternative", "switched from X", "X vs"
- the competitor's own feature-request board and changelog, so you don't "fix" something already fixed

Write one row per review in `reviews.csv`: `source,url,date,rating,text`, with the text copied exactly. Read the 3- and 4-star reviews too. "Love it, but..." is where the best fixes hide.

## Step 2: rank
Run `reviews.py`. It does four things:
- sorts reviews into themes
- weights low and recent ratings higher
- marks thin themes (fewer than 3 reviews, or only one source)
- lists every request in the users' own words, plus low ratings that matched no theme

Read that unmatched list by hand.

## Step 3: three lists
For each item, give the problem in one line, the review count, the source count and one or two linked quotes.
1. **What they hate:** complaints about things the product does.
2. **What's missing:** features people ask for by name.
3. **What's unsolved:** whole jobs or user groups the product ignores. These become positioning.

Label thin themes as thin. Three angry comments are not a trend.

## Step 4: fix plan
Pick the top 5–8 by evidence times cheapness. For each one give:
- what to build or change
- its size (S, M or L)
- the evidence

Send pricing and billing complaints to whoever owns pricing.

## Step 5: the angle
Write three positioning options, each grounded in a top theme:

```
For {who} who {what they hate about the competitor, in plain words},
{our product} {does this instead}.
Evidence: {theme}, {n} reviews across {n} sources.
```

Recommend one. Never use the competitor's name in your product name or ads. A comparison page is a question for a lawyer.

## Output
The deliverables are:
- `reviews.csv`
- `feedback.md`
- `fixes.md` (the three lists, the fix plan and the angle)
- a short summary that states the sample size and the sources reached or blocked
