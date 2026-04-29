# Serverless Backend Optimization — Design Spec
**Date:** 2026-04-30
**Status:** Approved
**Goal:** Reduce per-request latency and Supabase/Vercel serverless load on rawaq-web without changing visible API contracts.

---

## 1. Problem Statement

The rawaq-web Next.js app has ~100 API routes deployed as Vercel serverless functions backed by Supabase. Four categories of avoidable overhead account for most latency:

1. **Auth double-hit:** Every authenticated request makes 2 sequential Supabase round trips — JWT verify + `profiles` table fetch for `role` and `is_banned`. The second trip is redundant for the 30s lifecycle of a typical session.
2. **Blocking post-response work:** Booking and payment routes await a `notifications` DB insert before flushing the HTTP response. Sold-out checks (a `SELECT count(*)`) also block the response.
3. **Waterfall queries in booking flow:** `POST /api/bookings` and `POST /api/payments/initiate` each run 7–8 sequential DB queries, including a duplicate event + organizer-plan fetch, and ~200 lines of shared validation logic duplicated between both routes.
4. **Cache misconfigurations and missing singletons:** `unstable_cache` key collisions mean all grid queries share one cache slot; `createSupabaseCacheClient` creates a fresh HTTP client on every call; public routes lack `Cache-Control` headers.

---

## 2. Scope

**In scope:**
- `lib/auth.ts` — Redis profile cache layer
- `lib/notifications.ts` — `waitUntil` integration
- `app/api/bookings/route.ts` — `waitUntil` + shared validation
- `app/api/payments/initiate/route.ts` — `waitUntil` + shared validation + join query
- `lib/bookings/validate.ts` — new shared validation helper (new file)
- `lib/supabase/cache-client.ts` — module-level singleton
- `lib/events/cache.ts` — `unstable_cache` key fingerprinting
- `app/api/payments/options/route.ts`, `app/api/plans/route.ts`, `app/api/communities/trending/route.ts` — Edge Runtime declarations
- `app/api/happenings/discover/route.ts`, `app/api/communities/trending/route.ts` — `Cache-Control` headers
- Admin routes that mutate `role` / `is_banned` — Redis cache invalidation

**Out of scope:**
- Parallelizing Supabase queries (connection limit concern on Free/Pro plan)
- Custom JWT claims (Approach C — deferred)
- Mobile app changes
- Database schema migrations
- Stripe/Paymob gateway changes

---

## 3. Architecture

### 3.1 Redis Profile Cache

`requireAuth()` gains a Redis cache layer between JWT verification and the `profiles` DB fetch.

**Cache key:** `profile:auth:<userId>`
**TTL:** 30 seconds
**Value:** `{ role: UserRole, is_banned: boolean }` (JSON string)

```
requireAuth() — new flow:
  1. Verify JWT (Supabase Auth or bearer token) → userId          [~30ms, unavoidable]
  2. Redis GET profile:auth:<userId>                              [~5ms, Upstash]
     └─ HIT  → decode { role, is_banned }, skip step 3
     └─ MISS → step 3
  3. SELECT role, is_banned FROM profiles WHERE id = userId       [~20–40ms, Supabase]
  4. Redis SET profile:auth:<userId> EX 30 (JSON)
  5. Return AuthContext { userId, role }
```

**Cache invalidation:** Any admin action that changes `role` or `is_banned` calls `redis.del('profile:auth:<userId>')` immediately after the DB update. Affected routes:
- `PATCH /api/admin/users/[id]` (ban/unban)
- `POST /api/admin/users/[id]/warn` (does not change role/ban — no invalidation needed)
- `PATCH /api/admin/organizers/[id]` (approve/reject/suspend — changes `role`)

**Failure mode:** If Redis is unavailable, fall through to the DB fetch (fail-open, same as the existing rate-limit middleware pattern).

### 3.2 `waitUntil` for Post-Response Work

Vercel's `waitUntil` from `@vercel/functions` defers work until after the HTTP response is flushed.

**Affected routes:**
- `POST /api/bookings`
- `POST /api/payments/initiate`

**Work moved into `waitUntil`:**
- `sendNotification(booking_confirmed)` to attendee
- `sendNotification(new_attendee)` to organizer
- `sendNotification(event_sold_out)` to organizer (including the `SELECT count(*)` sold-out check)

**Inside `sendNotification`:** The function signature is unchanged. The DB insert into `notifications`, push delivery via Expo, and email via Resend all remain in sequence inside the function. The entire function call is what moves into `waitUntil` at the call site.

**Error handling:** Failures inside `waitUntil` are caught and logged to Sentry/console. They do not affect the HTTP response the client already received. Existing `.catch(() => {})` patterns on individual notification calls remain.

### 3.3 Shared Booking Validation + Event Join

**3.3a Event + organizer plan join**

Both booking routes currently fetch event data then later fetch `organizer_profiles.plan.platform_fee_pct` in a second query. These merge into one:

```typescript
// lib/bookings/validate.ts — event select string
const EVENT_SELECT = `
  id, title, is_published, is_cancelled, start_at, end_at,
  event_frequency, organizer_id, gender_restriction,
  is_premium_only, is_free, price, currency, capacity, max_group_size,
  organizer_plan:organizer_profiles!organizer_id(
    plan:plan_definitions(platform_fee_pct)
  )
`
```

The `platform_fee_pct` is extracted directly from the joined result. The second `organizer_profiles` query is removed from both booking routes.

**3.3b Shared `validateBookingInput()` helper**

A new file `lib/bookings/validate.ts` exports:

```typescript
export interface ValidatedBookingContext {
  event: EventRow & { platform_fee_pct: number }
  occurrence: ResolvedOccurrence
  profile: ProfileRow
  ticketType: TicketTypeRow | null
  promoCodeId: string | null
  discountAmount: number
  effectivePrice: number
  isFreeBooking: boolean
  platformFeePct: number
  platformFeeAmount: number
}

export async function validateBookingInput(
  admin: SupabaseAdminClient,
  ctx: AuthContext,
  input: CreateBookingInput,
): Promise<ValidatedBookingContext>
```

The function runs the same 6-step validation both routes share today (event → occurrence → profile completeness → gender/premium → group size → ticket type → promo code), returning a typed result object. Both route handlers call this, then implement only their diverging logic (free booking vs. payment initiation).

**Query count per booking request (before → after):**
- Event fetch: 2 queries → 1 (event + plan joined)
- Profile fetch: 1 query → 1 (unchanged)
- Ticket type: 1 query → 1 (unchanged)
- Promo code: 1 query → 1 (unchanged)
- Occurrence resolution: 1 query → 1 (unchanged)
- Existing booking check: 1 query → 1 (unchanged)
- **Total: 7–8 → 6 queries**

### 3.4 `unstable_cache` Revalidation Safety Net

Next.js 15 automatically includes a hash of the function's runtime arguments in the cache key, so different `params` combinations do produce distinct cache slots. There is no key collision.

The real issue is `revalidate: false` on `getCachedEventsGrid` — the cache entry for any given param set lives forever and is only cleared by an explicit `revalidateTag('events')` call. If an event mutation path misses the tag revalidation (e.g. a direct DB update via admin panel), users see stale grid data indefinitely.

**Fix:** Change `revalidate: false` → `revalidate: 300` on `getCachedEventsGrid` as a safety fallback. Tag-based revalidation on event publish/cancel/update remains the primary mechanism; the TTL is a backstop.

```typescript
export const getCachedEventsGrid = unstable_cache(
  async (params: GridParams, excludeIds: string[]) => { ... },
  ['events-grid'],
  { tags: ['events'], revalidate: 300 }  // was: revalidate: false
)
```

`getCachedFeaturedEvents` keeps `revalidate: false` — featured events are high-signal and always explicitly invalidated when the `featured_until` field changes. `getCachedWeekendEvents` already has `revalidate: 3600` — no change needed.

### 3.5 `createSupabaseCacheClient` Singleton

```typescript
// lib/supabase/cache-client.ts — after
let _cacheClient: ReturnType<typeof createClient> | null = null

export function createSupabaseCacheClient() {
  if (_cacheClient) return _cacheClient
  _cacheClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return _cacheClient
}
```

This matches the existing pattern in `lib/supabase/admin.ts`.

### 3.6 Edge Runtime Declarations

Three routes are stateless enough for Edge Runtime:

| Route | Reason |
|---|---|
| `GET /api/payments/options` | Returns static gateway config derived from env vars |
| `GET /api/plans` | Reads `plan_definitions` via `unstable_cache` — no user session |
| `GET /api/communities/trending` | Already uses `unstable_cache`; no auth required |

Each gets `export const runtime = 'edge'` added. No other code changes required.

### 3.7 `Cache-Control` Headers on Public Routes

Two unauthenticated read routes get CDN-layer caching via response headers:

| Route | Header |
|---|---|
| `GET /api/happenings/discover` | `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` |
| `GET /api/communities/trending` | `Cache-Control: public, s-maxage=120, stale-while-revalidate=600` |

These routes return public, non-user-specific data. No auth check is performed on them today.

---

## 4. Data Flow Summary

```
Authenticated API request (e.g. POST /api/bookings):

  middleware         → Redis global rate limit (existing, ~5ms)
  requireAuth()      → JWT verify (Supabase, ~30ms)
                     → Redis profile cache GET (~5ms)
                         hit:  skip DB → -30ms saved
                         miss: DB fetch + Redis SET
  validateBooking()  → 6 sequential DB queries (down from 7–8)
  booking insert     → 1 DB write
  return response    ← HTTP 201 flushed HERE
  waitUntil()        → notifications DB insert + push + email (async, after flush)
                     → sold-out count check (async, after flush)
```

---

## 5. Tradeoffs

| Decision | Tradeoff |
|---|---|
| 30s profile cache TTL | Role/ban changes take up to 30s to propagate; mitigated by explicit Redis DEL on admin mutations |
| `waitUntil` for notifications | Notification failures no longer surface as HTTP errors; requires Sentry monitoring |
| Sequential queries preserved | Avoids connection pressure on Free/Pro plan; slightly higher per-request latency than full parallelization |
| Edge Runtime only for stateless routes | DB-heavy routes stay on Node.js to avoid edge→Supabase latency penalty |
| Shared `validateBookingInput` | Both booking routes become dependent on one helper; test coverage on the helper is critical |

---

## 6. Files Changed

| File | Change |
|---|---|
| `lib/auth.ts` | Add Redis profile cache layer to `requireAuth()` |
| `lib/supabase/cache-client.ts` | Promote to module-level singleton |
| `lib/events/cache.ts` | Change `revalidate: false` → `revalidate: 300` on `getCachedEventsGrid` |
| `lib/notifications.ts` | No change to signature; call sites move into `waitUntil` |
| `lib/bookings/validate.ts` | New file — shared `validateBookingInput()` helper |
| `app/api/bookings/route.ts` | Use `validateBookingInput`, move notifications to `waitUntil` |
| `app/api/payments/initiate/route.ts` | Use `validateBookingInput`, move notifications to `waitUntil` |
| `app/api/admin/users/[id]/route.ts` | Add `redis.del(profile:auth:<userId>)` after ban mutation |
| `app/api/admin/organizers/[id]/route.ts` | Add `redis.del(profile:auth:<userId>)` after role mutation |
| `app/api/payments/options/route.ts` | Add `export const runtime = 'edge'` |
| `app/api/plans/route.ts` | Add `export const runtime = 'edge'` |
| `app/api/communities/trending/route.ts` | Add `export const runtime = 'edge'` + `Cache-Control` header |
| `app/api/happenings/discover/route.ts` | Add `Cache-Control` header |

---

## 7. Success Criteria

- `requireAuth()` makes 1 DB call (not 2) on cache hits — verifiable via Supabase dashboard query count
- `POST /api/bookings` p50 response time drops by ≥40ms (notifications no longer block flush)
- No regression in booking confirmation delivery (Sentry error rate baseline maintained)
- `getCachedEventsGrid` serves distinct param combinations from distinct cache slots (verifiable by checking Next.js cache hit logs)
- Edge routes return responses with `x-vercel-cache: HIT` on repeated requests
