# Vision: Salone artist catalog + workflow videos

Status: **draft for Osman's approval. Nothing here is built yet.** Researched 2026-10-03.

---

## Part A. The artist catalog

### The idea in one line
LAVAALL Web builds a **premium home on the internet for Sierra Leonean artists**: one place where fans hear the new music, watch the videos, buy tickets, and get told the moment something drops. Artists sit together in a catalog, so the catalog itself becomes a destination.

### What the research says

| Finding | Source | What it means for us |
|---|---|---|
| The best artist sites put **tour dates and a ticket button** first, easy to scan, sold-out shows clearly marked | Landingi review of Ed Sheeran, Martin Garrix, John Mayer sites | Shows and tickets get the top slot, not the bio |
| Strong sites **look like the artist** (big visuals, performance video) but keep the practical paths obvious: music, tour, merch | Same review (Martin Garrix) | Each artist hub gets its own look on one shared, simple structure |
| "Drops": fans tap **"tell me when it drops"**, then get a text, email, Instagram or **WhatsApp** message the moment a release or ticket goes live | Laylo (10,000+ creators, supports WhatsApp); Feature.fm pre-saves | This is the engine. In Salone it should be **WhatsApp first** |
| SMS/WhatsApp-style messages are reported to get far higher open rates than email | Reddit r/musicmarketing (reported, not verified) | Treat as a reason to prefer WhatsApp, not as a number to publish |
| Salone events today sell through **Eventbrite, Facebook posts and phone numbers on flyers** (e.g. Sierra Leone Music Awards 2026: Eventbrite plus two phone numbers) | Eventbrite, Facebook, Instagram listings | **The gap:** artists don't own a home or a fan list. Everything is rented from Facebook and flyers |

### What one artist hub contains (template)
1. **Hero:** full-bleed music video loop, artist name, the one thing happening now ("New single out Friday" / "Live at the National Stadium, Dec 28").
2. **The drop:** countdown + **"Tell me on WhatsApp"** button. Fans join a list the artist owns.
3. **Music:** latest release first, then catalog. Plays through embeds from where fans already listen (Audiomack, Boomplay, Spotify, YouTube Music; to confirm which ones this artist uses).
4. **Videos:** music videos in a cinematic strip, plays inline.
5. **Shows and tickets:** dates, venues, ticket button per show. Ticket sales link to a ticket provider at first (Eventbrite or local), later a LAVAALL checkout once payments are confirmed.
6. **Merch (optional):** drops with limited quantities.
7. **For promoters:** press kit (bio, photos, logos, tech rider) and a booking form. This is what gets artists paid shows.
8. **Fan club:** WhatsApp channel and Instagram, with exclusive early access.

### The catalog page (all artists)
A dark, cinematic grid of artist cards. Each card plays a short loop on hover, shows "Next show" and "New drop" badges, and opens that artist's hub. Filters: genre (Afropop, Gospel, Hip-hop, Bubu), city. Over time this becomes **"where Salone music lives online"**, which helps every artist on it.

### Where Lava (our automation) fits for artists
- **Fan DMs:** answers "when is the show?", "how much are tickets?", "where can I stream?" from the artist's own info, 24/7. Anything about bookings or money goes to the manager for approval.
- **Drop day:** at release time, sends the WhatsApp message to everyone on the list, posts to Instagram, updates the hub. Manager approves the message first.
- **Show night:** guest list and ticket check-in list, sent to the door team.
- **After the show:** thank-you message with the next date, and a merch link.

### What we need before using a real artist
- **The artist's written OK** (you mentioned someone; we wait for their approval).
- Rights to use their music embeds, videos, photos and logo.
- Which streaming platforms and ticket provider they use.
- Until then: a **template with a made-up artist**, clearly labelled "sample", using generated imagery (no real person's likeness).

### Proposed look for the template
Dark stage, one bold signature colour per artist (taken from their artwork), huge name type, video everywhere, mono "set-list" labels for dates. Reference direction: Hardworkclub-style "black-box stage" (full-bleed film as the hero), with Stink Studios' 2-up video grid for music videos. **To lock with Refero once you approve the idea.**

---

## Part B. Workflow videos ("show me how it helps them")

### The honest gap
The site has an **interactive** automation player (8 automations, run log, Approve button) and the Lava chat demo. But there is **no short video** that shows, start to finish, *how a business owner's day changes*. Interactive demos need the visitor to click; a video works on WhatsApp Status, Instagram and in a sales chat, where most owners in Salone will first see us.

### What works elsewhere
- The proven agency page puts **a short video right under the main button** ("watch how it works") (Wize Templates framework, researched earlier).
- n8n's template library and creators sell automations by showing the **canvas running step by step**, with the result at the end.
- Owners buy **outcomes** ("no missed bookings"), not tools (Serop, researched earlier).

### Proposed: four 20 to 30 second videos
Each one a split view: **customer's phone | Lava working | owner's phone**, crisp real UI (built in code, recorded frame by frame like the POUR / PLAY video, so text is always sharp), captions on screen, no voiceover needed.

| # | Story | Shows |
|---|---|---|
| 1 | **Restaurant, Friday night** | 3 WhatsApp bookings arrive while the kitchen is busy; Lava answers, owner taps Approve once; the booking sheet fills |
| 2 | **Guesthouse, 2am** | A guest from abroad asks about rooms; Lava answers with photos, holds the room; owner approves in the morning |
| 3 | **Shop, new stock** | Owner photographs a solar lamp; listing, Instagram post and WhatsApp broadcast drafted; one tap to publish |
| 4 | **Artist, drop day** | Countdown hits zero; WhatsApp alert goes to the fan list, Instagram posts, hub updates; ticket questions answered |

Formats: **16:9** for the website (under the hero button and in each "Who it is for" tile), **9:16** for WhatsApp Status / Reels so you can send them to prospects directly.

### Iteration plan
1. **v1 storyboard** (frames as images) for video 1 only. You review.
2. Build video 1, watch it, fix what doesn't land (pace, captions, clarity).
3. Only then make 2 to 4 with the same system.

---

## What I need from you
1. **Artist catalog:** go with a made-up sample artist for now? Any genre or vibe to aim for?
2. **Workflow videos:** OK to start with video 1 (restaurant) as a storyboard?
3. **Who is the real artist?** (Only when you have their OK. I won't use their name or likeness before then.)
