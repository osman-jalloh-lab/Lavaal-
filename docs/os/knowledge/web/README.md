# LAVAALL Web

aliases: SalonWeb, Laval Web, LAVAALL Web, /web/ [src: docs/os/DECISIONS.md, 2026-11-26]

- SalonWeb means LAVAALL Web, the /web/ product. It is not SaloneWorks and not SaloneHire. [src: docs/os/DECISIONS.md, 2026-11-26]
- A sub-brand selling websites and AI automation to restaurants, hotels, shops and marketers in Sierra Leone, Guinea and Liberia. [src: api/web/_site/AGENT-BRIEF.md, 2026-11-25]
- Plain static HTML, CSS and JS with no backend; the inquiry form says it is preview only and sends nothing. [src: docs/web/README.md, 2026-11-25]
- Served by api/web/index.js behind an on/off flag (api/web/_lib/flag.js); hidden and off on Production, not linked from lavaall.com. [src: docs/web/README.md, 2026-11-25]
- Every /web response carries X-Robots-Tag noindex, nofollow. [src: docs/web/README.md, 2026-11-25]

## Rules for builders
- No fake clients, testimonials, prices or metrics; every automation demo shows an "Illustrative demo" badge. [src: api/web/_site/AGENT-BRIEF.md, 2026-11-25]
- Agents draft, the owner approves; never show an agent sending or paying without a visible approval step. [src: api/web/_site/AGENT-BRIEF.md, 2026-11-25]
- The WhatsApp button stays hidden until Osman gives a number (content/en.json whatsapp.number is empty). [src: api/web/_site/TODO.md, 2026-11-25]
- Before promising real WhatsApp automation, confirm WhatsApp Business Platform setup and fees per client. [src: api/web/_site/TODO.md, 2026-11-25]
