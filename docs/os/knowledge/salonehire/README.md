# SaloneHire

aliases: Salone Hire, salon hire, SL hire [src: tools/lavaall-ai/projects.json, 2026-11-26]

## What it is
- SaloneHire is the public brand and GCP project for the SaloneWorks recruitment app; Cloud Run in Iowa, private test. [src: tools/lavaall-ai/handoffs/salonehire.md, 2026-11-25]
- Code: github.com/osman-jalloh-lab/saloneworks; deploy target Cloud Run (deploy/cloudrun/). [src: tools/lavaall-ai/projects.json, 2026-11-26]
- Launch date in the catalog: 2026-12-01. [src: tools/lavaall-ai/projects.json, 2026-11-26]

## State
- Interview tools (#65) and the listing-expiry job (#66) are in the MVP branch; #69 to #72 merged on 25 Nov, so every PR runs the tests. [src: tools/lavaall-ai/projects.json, 2026-11-26]
- Launch gaps: Tailwind Play CDN, two placeholder candidate pages, placeholder logo. [src: tools/lavaall-ai/projects.json, 2026-11-26]
- Free plan job limit raised from 2 to 5 (migration 0026), merged as d85cd33. [src: github.com/osman-jalloh-lab/saloneworks/pull/73, 2026-11-26]
- DNS for salonehire.com is on hold until Osman has tested. [src: tools/lavaall-ai/handoffs/salonehire.md, 2026-11-25]

## Rules
- Synthetic data only; no real CVs or applicant data. EMAIL_ENABLED stays false. [src: tools/lavaall-ai/handoffs/salonehire.md, 2026-11-25]
- Public prices go on the site only after Osman approves the tiers. [src: tools/lavaall-ai/handoffs/salonehire.md, 2026-11-25]
