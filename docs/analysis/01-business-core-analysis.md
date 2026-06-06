# Rawaq — Business Core Analysis

_Source of truth: `rawaq-web/supabase/migrations/00001 → 00092`. Generated 2026-06-06._

## 1. What the business is

Rawaq is a **two-sided events marketplace** for the MENA market (Egypt + Saudi
Arabia, bilingual AR/EN, SAR/EGP). It connects **people who want to attend
activities** with **people who run them**, monetised through subscription plans
and a platform fee taken on paid bookings, tips, and donations.

Over 92 migrations the product has grown from a simple "events + bookings" app
into four overlapping product surfaces. Understanding the business means
understanding these four and how they share the same `events` spine.

## 2. The actor hierarchy (who creates supply)

The platform has **one supply spine but three distinct "who is running this"
identities**, layered on over time:

```
profiles (every auth user)            role: user | organizer | admin  (+ owner via flag)
   │
   ├── organizer_profiles             1:1 for anyone who produces supply
   │      organizer_type = 'company'      → a business/brand (original model)
   │      organizer_type = 'individual'   → a solo host / freelancer (mig 00082, 00088)
   │
   └── community membership/host grants    → run activity *inside* a community
          community_memberships.role: member | moderator | admin (+ owner)
          community_hosts                  → orthogonal "can host here" grant (mig 00082)
```

Key business decision (mig 00082): **host capability is kept orthogonal to
governance**. A person can be a `community_admin` (governs the space) *and* a
`host` (runs sessions) without those collapsing into one role. This is the
single most important structural choice in the actor model and any new feature
must respect it.

### The three producer identities

| Identity | Table discriminator | Business meaning | Monetisation |
|---|---|---|---|
| **Company organizer** | `organizer_profiles.organizer_type='company'` | Brands, venues, agencies running formal **events** | `org_basic/pro/elite` plans, 3–10% platform fee |
| **Individual host** | `organizer_profiles.organizer_type='individual'` | Solo creators running **sessions** | `ind_free/basic/pro` plans, 8–15% fee, payout holds |
| **Community host** | `community_hosts` grant | A member empowered to run activity in a specific community | Inherits the host's own plan |

## 3. The four product surfaces (the supply types)

All four ultimately reference the `events` table or mirror its shape. This is
the crucial insight for adding features: **`events` is the shared spine.**

### 3a. Events (the formal spine) — mig 00003
The original product. A scheduled, located, capacity-bound activity with
booking, tickets, comments, tips, and analytics. Carries the full commerce
stack. `events.organizer_type` (mig 00090/00091) tags whether it came from a
company or an individual — the same table serves both, filtered by a column.

### 3b. Sessions (individual-host events) — mig 00082, 00090
**Not a separate table.** A "session" is just `events` rows where
`organizer_type='individual'`. The `/api/sessions/feed` route and a partial
index (`idx_events_sessions_start_at`) carve a distinct product surface out of
the same spine. Business framing: lighter-weight, person-led activities
(a coaching call, a workshop, a meetup-with-a-name) vs. a company's formal event.

### 3c. Communities (the social/geographic graph) — mig 00040, 00049, 00053
A 5-level hierarchy that organises *who sees what* and *where supply belongs*:

```
country → city → district → interest / micro (compound, university, company)
```

Communities are a **tagging + visibility + membership layer**, not a supply type
themselves. Events attach to communities (`event_communities` M2M) and gain a
`visibility_type` (micro / interest / city / national) that drives RLS-enforced
reach (mig 00041). Governance was hardened over migrations 00048–00055
(owner role, membership status, parent communities, follows, approval).

### 3d. Happenings (the ephemeral layer) — mig 00042
Twitter-sized (≤280 char), **6-hour-expiry** posts inside a community —
"anyone want to grab coffee in 2 hours?". Lightweight RSVP + emoji reactions,
auto-cleaned by cron (mig 00045). This is the casual, real-time counterweight to
formal events. Later given capacity/approval (00081) and comments (00061).

## 4. How money flows (the commerce core)

The revenue model is built up across many migrations and is consistent across
all producer types:

1. **Subscription plans** (`plan_definitions`, mig 00014, 00088) — recurring SAR
   revenue. Tiers gate `events_per_month`, `attendees_per_event`, and crucially
   the **`platform_fee_pct`** each producer pays.
2. **Platform fee on transactions** — the fee % is *locked in at transaction
   time* onto `bookings`, `tips`, and `payment_transactions`. Higher tiers pay
   lower fees (elite 3%, individual-free 15%). This is the core flywheel: pay us
   monthly → keep more of your gross.
3. **Quota enforcement** — `organizer_monthly_usage` tracks published events
   against the plan limit (triggers in mig 00014, refreshed 00057).
4. **Payouts & holds** — organizer bank accounts (00036), refunds (00037),
   revenue holds (00085/00087), and **host reputation-based payout-hold days**
   (00082 `payout_hold_days`, 00086 reputation) — newer/riskier individual hosts
   wait longer for payout. Trust gates cashflow.
5. **Real gateways** — Paymob + Stripe (`payment_gateways` 00032, webhooks),
   replacing the early `is_simulated` mock-payment flag seen throughout.

## 5. Trust & safety as a business primitive

Because supply is user-generated and money changes hands, trust is a
first-class concern, not an afterthought:

- **Approval gates**: organizers (`organizer_status`), communities (00055),
  community-host requests (00089) all require approval.
- **Reputation**: `avg_rating`, `sessions_hosted_count`, `cancellation_count`
  on `organizer_profiles` feed payout-hold decisions and host ranking.
- **Reporting**: comment reports (00003), happening reports (00046), event
  reports (00078), support tickets (00031).
- **Admin / Owner tier** (00070/00071): platform settings + plan editing live
  behind an owner-is-admin role, so pricing/quotas change without a deploy.

## 6. Business-level observations relevant to new features

1. **The `events` table is overloaded.** Company events, individual sessions,
   and (via occurrences) recurring series all live in one wide table
   discriminated by columns (`organizer_type`, `visibility_type`,
   `is_premium_only`, recurrence fields). Any new "supply type" should first ask:
   *am I a new row-shape on `events`, or a genuinely new table like happenings?*
2. **Occurrences are the real unit of attendance.** Since mig 00064, bookings,
   waitlist, capacity, and ticket sales are scoped to `event_occurrences`, not
   `events`. The `events` row is now the "series/template"; the occurrence is the
   "dated session". New booking-adjacent features must target occurrences.
3. **Plans are the monetisation lever for everything.** Gating a new feature =
   adding a key to `plan_definitions.features` JSONB, not a schema change.
4. **Communities are reach, not supply.** If a feature is about *who sees it* or
   *where it belongs*, it extends the community layer. If it's about *what is
   run*, it extends events/sessions.
5. **Orthogonality of governance vs. hosting** (mig 00082) is the design law of
   the actor model — preserve it.

See `02-software-structure-modules-analysis.md` for the code-level module map.
