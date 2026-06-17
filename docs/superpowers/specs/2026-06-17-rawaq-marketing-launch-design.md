# Rawaq — Cairo Beachhead Marketing Launch Design

**Date:** 2026-06-17
**Status:** Approved design (pre-implementation)
**Owner:** Founder (solo)
**Product:** Rawaq (رواق) — the Arab world's events discovery platform. Bilingual EN/AR, two-sided marketplace (organizers + attendees), web + mobile, Paymob-first (Egypt) + Stripe.

---

## 1. Goal & Constraints

**Primary objective (next ~8 weeks):** Launch both sides of the marketplace in **one beachhead city — Cairo** — recruiting a small set of real organizers AND their attendees together, so the marketplace feels alive locally before expanding to the other 12+ countries.

**Strategic approach:** **Supply-seeded beachhead** (spine) with **build-in-public** as the content style.
- Hand-seed ~15–25 real Cairo organizers first so the platform has genuine inventory.
- Build SEO city/event pages that capture existing "things to do in Cairo" search demand.
- Then run attendee content that points at real listings.
- The existing **host-community auto-join** and **referral** features act as built-in growth loops.

**Constraints:**
- **Solo founder, time-rich, cash-poor.** No meaningful paid-ad budget. Growth must be organic, founder-led, and content/SEO-driven.
- **Pre-launch:** product is feature-complete but not yet taking live payments (paid tickets switch on in Weeks 7–8).
- **Founder is comfortable being the visible face** (build-in-public is on).

---

## 2. Positioning & Messaging

**Attendee positioning:**
> Rawaq — discover what's actually happening in Cairo. Sports, culture, business, nightlife, and the communities behind them, all in one place.

**Organizer positioning:**
> List your event in 2 minutes, fill your seats, and keep your crowd. Free to start.

**Three message pillars** (every piece of content ladders up to exactly one):

| Pillar | Attendee promise | Organizer promise | Backing feature |
|---|---|---|---|
| **Discovery** | "Never miss what's on in your city" | "Get found by people actually looking" | SEO city pages, search, categories |
| **Belonging** | "Find your people, not just an event" | "Turn one event into a community that returns" | Host-community auto-join, follows |
| **Trust** | "Real events, real organizers, secure tickets" | "Get paid reliably, build a verified reputation" | Paymob, QR tickets, organizer verification |

**Brand voice:** warm, local, Cairo-native, founder-authentic (first-person, build-in-public, not corporate). Aspirational anchor (already in product): *"Where Arab communities come alive."*

**Language rule:** **Arabic-first for Cairo** — Egyptian colloquial for social, MSA for formal/SEO; English secondary. Never machine-translate Arabic: Claude drafts native Egyptian Arabic, founder sanity-checks tone.

---

## 3. The Content Engine

A repeatable weekly system so the founder is never staring at a blank page. One ~30-min Claude session → a full week of content.

**Weekly output (one Claude batch):**
- **3 short-video scripts** (Reels/TikTok/Shorts) — build-in-public + event spotlights, AR-led with EN captions
- **5 social posts** (IG/X/LinkedIn) — recycled from the videos + 1 founder thread
- **1 SEO blog article** (e.g., "أفضل الفعاليات في القاهرة هذا الأسبوع" / "Best things to do in Cairo this week") — feeds the existing event-blog feature
- **2 organizer DM/pitch variants** — for hand-recruiting supply

**Three content lanes (rotate):**
1. **Build-in-public** — founder journey, milestones, behind-the-scenes. Cheap, authentic, doubles as organizer recruiting (founders trust founders).
2. **Event spotlights** — feature a real seeded Cairo event/organizer. Gives them reach → incentive to list.
3. **City utility** — "This weekend in Cairo" roundups. Pure discovery value, shareable, SEO.

**Reusable asset:** `docs/marketing/content-engine.md` — a saved "content system prompt" (positioning, voice, pillars, formats, AR rules) pasted into Claude each week so output is consistent without re-explaining context.

---

## 4. In-product Growth Features (built into the codebase)

Three compounding, zero-ad-spend channels, ranked by leverage.

### 4.1 Programmatic SEO city pages (highest leverage)
Server-rendered, indexable pages capturing existing search demand — "فعاليات القاهرة", "things to do in Cairo this weekend", per-category and per-area.
- Routes: `/cairo`, `/cairo/[category]`, rich event detail pages.
- Full Arabic metadata + JSON-LD `Event` schema → Google rich results + Google Events listings for free.
- This is the single best growth investment when traffic can't be bought.

### 4.2 Auto-generated Arabic share cards (OG images)
Every shared event link renders a branded card (Arabic, event title, date, Rawaq logo) via `@vercel/og`. Turns every share into branded reach at zero marginal cost.

### 4.3 Pre-launch capture + referral surfacing
- Lightweight "notify me about events near me" capture wired to content CTAs (collects demand before full launch).
- Surface the **existing referral system** at the right moments ("invite friends → both get X").
- Surface the **existing host-community auto-join** prompt post-booking.
- The loops already exist in code — this is about *exposing* them, not building from scratch.

**YAGNI cuts:** no new analytics dashboards, no email-automation platform. UTM links + existing admin tables are enough at this stage.

---

## 5. The 8-Week Cairo Launch Calendar

| Weeks | Theme | Supply (founder) | Content (Claude-fueled) | In-product (Claude builds) |
|---|---|---|---|---|
| **1–2** | Foundation | Recruit first 5 organizers from network | Announce build-in-public; founder origin story | SEO scaffolding + share cards + capture page |
| **3–4** | Seed supply | Reach 15–25 organizers with real listed events | Event spotlights begin | City SEO pages live + submitted to Google |
| **5–6** | Activate demand | First free-event bookings; gather testimonials | "This weekend in Cairo" roundups; referral push | Referral + host-community prompts surfaced |
| **7–8** | Launch moment | Switch on paid tickets (Paymob); partner with 2–3 communities | Public launch story; first-paid-event spotlight | OG/SEO polish; measure top pages |

**Operating rhythm:** weekly Claude content batch (Section 3) every Sunday; daily light build-in-public post; 2–3 organizer conversations/day.

---

## 6. Metrics (lean — 5 only)

1. **North star: # of Cairo events with ≥1 real booking** — marketplace liquidity; the only number that proves it works.
2. **Supply:** organizers with a live event.
3. **Demand:** waitlist/early-access signups + weekly bookings.
4. **Content→signup:** which content lane drives signups (UTM-tagged links).
5. **Loop health:** referral invites sent/accepted + host-community joins.

---

## 7. Implementation Sequencing

The implementation plan starts with the highest-leverage buildable piece and works down:
1. **SEO city pages + capture page** (Section 4.1 + 4.3) — the compounding growth spine.
2. **Arabic share cards / OG images** (Section 4.2).
3. **Content-engine system prompt** asset (`docs/marketing/content-engine.md`).
4. **Referral / host-community surfacing** (Section 4.3) — exposing existing loops.

Content production (Section 3) and organizer recruiting (Section 5) run in parallel by the founder, fueled by Claude batches, independent of the code work.

---

## 8. Out of Scope

- Expansion beyond Cairo (revisit after liquidity is proven in the beachhead).
- Paid advertising channels.
- New analytics/email-automation infrastructure.
- A dedicated cold-outreach automation machine (founder recruits supply through personal network + Claude-drafted DM variants).
