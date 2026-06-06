# Rawaq — Software Structure & Modules Analysis

_Stack: Next.js (App Router) + Supabase (Postgres + RLS + triggers) + React
Native mobile. Web root: `rawaq-web/`. Generated 2026-06-06._

## 1. Layering model

The system is **database-centric**: business invariants live in Postgres
(triggers + RLS), and the API/UI layers are comparatively thin.

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENTS        rawaq-web/app/(app)/*  (RSC + client pages)   │
│                 rawaq-mobile/          (React Native)         │
├─────────────────────────────────────────────────────────────┤
│  API ROUTES     rawaq-web/app/api/*/route.ts  (thin handlers) │
│  - auth (lib/auth.ts), validate (zod, lib/validations/*),     │
│    rate-limit (lib/rate-limit.ts), call Supabase / services   │
├─────────────────────────────────────────────────────────────┤
│  DOMAIN SERVICES  rawaq-web/lib/*  (the only real "service"   │
│                   abstraction — thin, selective)              │
│  events/  bookings/  payments  plans  subscriptions  gateways │
├─────────────────────────────────────────────────────────────┤
│  DATA + RULES   Supabase Postgres                             │
│  - tables, ENUMs, RLS policies, SECURITY DEFINER functions,   │
│    triggers (capacity, fees, counters, notifications)         │
└─────────────────────────────────────────────────────────────┘
```

**Architectural reality:** much of the "business logic" is in SQL triggers, not
TypeScript. Capacity enforcement, platform-fee calculation, ticket-id minting,
counter denormalisation, and waitlist promotion are all triggers (mig 00014,
00064, 00013). The TS layer orchestrates; the DB enforces.

## 2. Database module map

| Module | Migrations | Core tables | Purpose |
|---|---|---|---|
| **Foundation** | 00001–00007 | `profiles`, `organizer_profiles`, `events`, `bookings`, `tips`, `comments`, `notifications`, `event_categories` | Core spine + PostGIS geo + RLS + ENUMs |
| **Engagement** | 00008–00012, 00019, 00020, 00026, 00061, 00072 | `saved_events`, `event_views`, `global_chat`, `user_reviews`, `user_follows` | Social/analytics around events |
| **Tickets & booking integrity** | 00013, 00028, 00029, 00064–00068 | `ticket_types`, `event_occurrences`, `event_occurrence_ticket_sales`, `waitlist` | Ticketing + atomic capacity + occurrence model + group booking |
| **Monetisation** | 00014, 00016, 00057–00060, 00088 | `plan_definitions`, `subscriptions`, `organizer_monthly_usage`, `subscription_payments` | Plans, quotas, fees, country pricing |
| **Payments** | 00023, 00024, 00032–00037, 00059, 00079, 00080 | `payment_transactions`, `payment_gateways`, `organizer_bank_accounts` | Real gateways (Paymob/Stripe), payouts, refunds |
| **Communities** | 00040, 00041, 00043, 00048–00055 | `communities`, `community_hierarchy`, `community_memberships`, `event_communities`, `community_follows` | Geo/interest graph, visibility, governance |
| **Happenings** | 00042, 00045–00047, 00061, 00073, 00081, 00084 | `happenings`, `happening_rsvps`, `happening_reactions`, `happening_comments` | Ephemeral community posts |
| **Individual host** | 00082–00089 | `community_hosts`, `community_host_requests`, `revenue_holds` + `organizer_profiles` cols | Solo-host identity, host reputation, payout holds, community-host grants |
| **Events ⟷ producer typing** | 00090, 00091 | `events.organizer_type` (+ trigger) | Session vs event filtering on the shared spine |
| **Growth / ops** | 00021, 00022, 00031, 00039, 00074–00078, 00092 | promo codes, referrals, support tickets, featured events, admin trust | Acquisition + moderation + ops |

### Database invariant hotspots (where logic lives)
- **Capacity & ticket sales**: `check_event_capacity()` — occurrence-scoped, atomic (mig 00064).
- **Platform fee**: `get_organizer_platform_fee()` + `fn_auto_payment_on_booking()` (00014, 00064).
- **Quota tracking**: `fn_track_event_published_*` → `organizer_monthly_usage` (00014).
- **Producer typing**: `fn_set_event_organizer_type()` backfills `events.organizer_type` from the profile (00091).
- **Counters**: denormalised `*_count` columns maintained by AFTER triggers everywhere — never trust app-side increments.
- **RLS**: `is_admin()`, `is_community_owner()`, visibility enforcement (00041, 00044 sweep).

## 3. API surface map (`app/api/`)

Organised by actor/domain — note how the producer split shows up as **parallel
route trees**:

| Route group | Serves | Notes |
|---|---|---|
| `events/`, `categories/`, `feed/`, `recommendations/` | discovery & the spine | `feed` + Gemini-backed recs |
| `sessions/feed` | **individual-host surface** | same data, different lens (organizer_type filter) |
| `bookings/`, `waitlist/`, `tickets/`, `bookings/scan` | attendance & entry | scan = ticket verification |
| `organizer/*` | **company producer** | events, profile, bank-account, payouts, wallet, request |
| `individual-host/*` | **individual producer** | apply, communities |
| `hosts/[username]` | public host profiles | individual-host public face |
| `communities/*`, `happenings/*` | social graph + ephemeral | trending/discover/active |
| `payments/*`, `webhooks/*`, `subscriptions/*`, `plans/`, `promo-codes/*`, `referral/*` | commerce & growth | Paymob + Stripe webhooks |
| `admin/*`, `owner/*` | trust & platform control | owner = plan/settings editing |

**Observation:** "company organizer" and "individual host" are split at the API
layer (`organizer/*` vs `individual-host/*`) but **converge at the data layer**
(both write `events` / `organizer_profiles`). This split-then-converge pattern is
the dominant shape of the codebase.

## 4. Domain services (`lib/`)

The service abstraction is **deliberately thin** — only the genuinely reusable /
invariant-heavy logic is extracted:

- `lib/events/occurrences.ts`, `recurrence.ts`, `cache.ts` — occurrence
  generation & recurrence expansion (the most complex domain logic in TS).
- `lib/bookings/validate.ts` — pre-insert booking validation.
- `lib/payments.ts`, `lib/gateways/*`, `lib/subscriptions.ts`, `lib/plans.ts`,
  `lib/donations.ts` — commerce.
- `lib/community-governance.ts`, `lib/community-slug.ts` — community rules.
- `lib/validations/*` (zod) — input contracts per domain.
- `lib/auth.ts`, `lib/rate-limit.ts`, `lib/redis.ts`, `lib/audit.ts`,
  `lib/notifications.ts`, `lib/errors.ts` — cross-cutting.
- `types/database.ts`, `types/plans.ts`, `types/api.ts`,
  `types/community-moderation.ts` — typed contracts.

Most CRUD bypasses services and calls Supabase directly from the route handler;
services exist only where invariants or reuse demand them. (Note: the
`fn_set_event_organizer_type` trigger in 00091 exists specifically because some
forms write `events` *directly via the Supabase client*, bypassing the API
route — confirming the DB-as-source-of-truth posture.)

## 5. Frontend module map (`app/(app)/`)

Page tree mirrors the API tree: `events/`, `communities/`, `happenings/`,
`organizer/`, `bookings/`, `tickets/`, `plans/`, `feed/`, plus `admin/*` and
`owner/*` control panels, and public `user/[id]` / `organizer/[id]` profiles.
Shared UI in `components/`, state in `contexts/`, data hooks in `hooks/`.

## 6. Structural strengths & risks (for feature planning)

**Strengths**
- DB-enforced invariants → hard to corrupt state from a buggy client.
- Clean migration discipline (numbered, idempotent `IF NOT EXISTS`, backfills).
- Occurrence model cleanly separates "series template" from "dated session".
- Plans-as-data → monetisation/gating changes need no deploy.

**Risks / friction for new features**
- **`events` is wide and overloaded** — adding another discriminator column is
  the path of least resistance but compounds the problem. Decide consciously:
  new column on `events` vs. new table.
- **Logic split across SQL + TS** — a feature touching capacity/fees/counters
  means writing a *trigger*, and trigger logic is harder to test than TS. Budget
  for it.
- **Producer duality (company/individual)** must be handled in *both* API trees
  and the shared data layer; easy to implement one and forget the other.
- **RLS coupling** — any new table needs explicit policies (see the 00044
  security sweep for the expected rigor) plus `is_admin()`/owner carve-outs.
- Migration numbering already collides chronologically (e.g. 00020, 00085 land
  out of order) — keep using the next free `00093_` and the
  `rawaq-web/supabase/migrations` path with `0XXXX_` naming.

## 7. Where a new feature plugs in (decision checklist)

1. **Is it new supply, reach, or commerce?** → events/sessions vs. communities
   vs. plans/payments.
2. **Does attendance/capacity/money attach to it?** → it lives at the
   **occurrence** level and needs triggers, not just TS.
3. **Which producer(s)?** company, individual, community-host — wire all that apply.
4. **New table?** → add ENUMs, indexes, RLS policies, admin/owner carve-out,
   realtime (if live), and a counter trigger if it has denormalised stats.
5. **Gate it via `plan_definitions.features`**, not a new schema flag.
6. **Notifications?** → extend the `notification_type` enum (`ADD VALUE IF NOT
   EXISTS`) and emit from a trigger.
