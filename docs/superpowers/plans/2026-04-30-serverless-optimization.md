# Serverless Backend Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce per-request latency and Supabase/Vercel serverless load by adding a Redis profile cache, deferring post-response work with `waitUntil`, eliminating a duplicated DB query in the booking flow, fixing an events cache revalidation gap, and moving one stateless route to Edge Runtime.

**Architecture:** A Redis cache layer wraps the `profiles` table lookup in `requireAuth()`, reducing authenticated requests from 2 Supabase round trips to 1 on cache hits. A shared `validateBookingInput()` helper deduplicates ~200 lines of booking validation across two routes and collapses the event + organizer-plan fetch into one join query. Post-response side effects (notifications, sold-out checks) are moved into Vercel `waitUntil` so the HTTP response flushes before any of that work runs.

**Tech Stack:** Next.js 15 App Router, Supabase (supabase-js + @supabase/ssr), Upstash Redis (@upstash/redis), @vercel/functions (waitUntil), Node.js built-in test runner (node:test), TypeScript, Zod

---

## File Map

| Status | File | Change |
|---|---|---|
| NEW | `lib/redis.ts` | Shared Upstash Redis singleton |
| MODIFY | `lib/rate-limit.ts` | Import redis from lib/redis.ts |
| NEW | `lib/supabase/profile-cache.ts` | Redis get/set/del for profile auth cache |
| NEW | `lib/supabase/profile-cache.test.ts` | Tests for pure helpers in profile-cache |
| MODIFY | `lib/auth.ts` | Use Redis cache in requireAuth() |
| MODIFY | `app/api/admin/users/[id]/route.ts` | Invalidate cache after ban/unban |
| MODIFY | `app/api/admin/organizers/[id]/route.ts` | Invalidate cache after role change |
| MODIFY | `lib/supabase/cache-client.ts` | Module-level singleton |
| MODIFY | `lib/events/cache.ts` | revalidate: false → 300 on getCachedEventsGrid |
| NEW | `lib/bookings/validate.ts` | Shared validateBookingInput() helper |
| MODIFY | `app/api/bookings/route.ts` | Use validateBookingInput + waitUntil |
| MODIFY | `app/api/payments/initiate/route.ts` | Use validateBookingInput + waitUntil |
| MODIFY | `app/api/payments/options/route.ts` | Edge Runtime + Cache-Control header |

---

## Task 1: Extract Redis Singleton and Install @vercel/functions

**Files:**
- Create: `lib/redis.ts`
- Modify: `lib/rate-limit.ts` (lines 1–9)
- Install: `@vercel/functions`

- [ ] **Step 1: Install @vercel/functions**

```bash
cd rawaq-web && npm install @vercel/functions
```

Expected output: package added to `node_modules`, `package-lock.json` updated.

- [ ] **Step 2: Create the shared Redis singleton**

Create `rawaq-web/lib/redis.ts`:

```typescript
import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  enableAutoPipelining: true,
})
```

- [ ] **Step 3: Update lib/rate-limit.ts to import from lib/redis.ts**

Replace lines 1–9 in `rawaq-web/lib/rate-limit.ts`:

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/redis'
import { RateLimitException } from './errors'
```

Remove the local `const redis = new Redis({...})` block (lines 5–9 in the original file) — it is now imported from `lib/redis.ts`.

- [ ] **Step 4: Verify the rate-limit module still works**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add rawaq-web/lib/redis.ts rawaq-web/lib/rate-limit.ts rawaq-web/package.json rawaq-web/package-lock.json
git commit -m "chore: extract Redis singleton to lib/redis.ts, add @vercel/functions"
```

---

## Task 2: Redis Profile Cache Helpers

**Files:**
- Create: `rawaq-web/lib/supabase/profile-cache.ts`
- Create: `rawaq-web/lib/supabase/profile-cache.test.ts`

- [ ] **Step 1: Write the failing test for the cache key helper**

Create `rawaq-web/lib/supabase/profile-cache.test.ts`:

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { profileCacheKey } from './profile-cache'

test('profileCacheKey returns namespaced key for a given userId', () => {
  assert.equal(profileCacheKey('abc-123'), 'profile:auth:abc-123')
})

test('profileCacheKey uses the full userId string', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000'
  assert.equal(profileCacheKey(id), `profile:auth:${id}`)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd rawaq-web && npx tsx --test lib/supabase/profile-cache.test.ts
```

Expected: FAIL — `profileCacheKey` is not defined.

- [ ] **Step 3: Create the profile-cache module**

Create `rawaq-web/lib/supabase/profile-cache.ts`:

```typescript
import { redis } from '@/lib/redis'
import type { UserRole } from '@/types/database'

const TTL_SECONDS = 30

export interface CachedProfile {
  role: UserRole
  is_banned: boolean
}

export function profileCacheKey(userId: string): string {
  return `profile:auth:${userId}`
}

export async function getCachedProfile(userId: string): Promise<CachedProfile | null> {
  try {
    const raw = await redis.get<string>(profileCacheKey(userId))
    if (!raw) return null
    return JSON.parse(raw) as CachedProfile
  } catch {
    return null
  }
}

export async function setCachedProfile(userId: string, profile: CachedProfile): Promise<void> {
  try {
    await redis.set(profileCacheKey(userId), JSON.stringify(profile), { ex: TTL_SECONDS })
  } catch {
    // Non-fatal: if Redis is unavailable the DB fallback in requireAuth handles it
  }
}

export async function delCachedProfile(userId: string): Promise<void> {
  try {
    await redis.del(profileCacheKey(userId))
  } catch {
    // Non-fatal: cache will expire on its own via TTL
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd rawaq-web && npx tsx --test lib/supabase/profile-cache.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add rawaq-web/lib/supabase/profile-cache.ts rawaq-web/lib/supabase/profile-cache.test.ts
git commit -m "feat(auth): add Redis profile cache helpers with 30s TTL"
```

---

## Task 3: Apply Redis Profile Cache in requireAuth()

**Files:**
- Modify: `rawaq-web/lib/auth.ts`

- [ ] **Step 1: Update requireAuth() to check Redis before the DB**

Replace the full contents of `rawaq-web/lib/auth.ts` with:

```typescript
import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from './supabase/server'
import { createSupabaseAdminClient } from './supabase/admin'
import { getCachedProfile, setCachedProfile } from './supabase/profile-cache'
import { UnauthorizedException, ForbiddenException } from './errors'
import type { AuthContext } from '@/types/api'
import type { UserRole } from '@/types/database'

export async function requireAuth(): Promise<AuthContext> {
  const headerStore = await headers()
  const authorization = headerStore.get('authorization')
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null

  const admin = createSupabaseAdminClient()
  let userId: string

  if (bearerToken) {
    const { data, error } = await admin.auth.getUser(bearerToken)
    if (error || !data.user) throw new UnauthorizedException()
    userId = data.user.id
  } else {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) throw new UnauthorizedException()
    userId = data.user.id
  }

  // Try Redis cache first — saves a Supabase round trip on every authenticated request
  const cached = await getCachedProfile(userId)
  if (cached) {
    if (cached.is_banned) throw new ForbiddenException('Your account has been suspended')
    return { userId, role: cached.role }
  }

  // Cache miss: fetch from DB and populate cache
  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_banned')
    .eq('id', userId)
    .single()

  if (!profile) throw new UnauthorizedException()
  if (profile.is_banned) throw new ForbiddenException('Your account has been suspended')

  await setCachedProfile(userId, { role: profile.role as UserRole, is_banned: profile.is_banned })

  return { userId, role: profile.role as UserRole }
}

export async function requireRole(...roles: UserRole[]): Promise<AuthContext> {
  const ctx = await requireAuth()
  if (!roles.includes(ctx.role)) {
    throw new ForbiddenException(`Requires role: ${roles.join(' or ')}`)
  }
  return ctx
}

export async function requireOwner(): Promise<AuthContext> {
  return requireRole('owner')
}

export async function requireAdmin(): Promise<AuthContext> {
  return requireRole('admin', 'owner')
}

export async function requireOrganizer(): Promise<AuthContext> {
  return requireRole('organizer', 'admin', 'owner')
}

export async function optionalAuth(): Promise<AuthContext | null> {
  try {
    return await requireAuth()
  } catch {
    return null
  }
}

export async function requireEventOwnership(eventId: string, ctx: AuthContext): Promise<void> {
  if (ctx.role === 'admin' || ctx.role === 'owner') return

  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single()

  if (!data || data.organizer_id !== ctx.userId) {
    throw new ForbiddenException('You do not own this event')
  }
}

export function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`npm run dev`), then make an authenticated request (any protected route) via the browser or curl. Confirm the request succeeds and check the Supabase dashboard — after the first request the profiles query count should not increase on subsequent requests within 30 seconds.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/lib/auth.ts
git commit -m "perf(auth): cache profile role/ban in Redis (30s TTL) to eliminate second DB round trip"
```

---

## Task 4: Admin Route Cache Invalidation

**Files:**
- Modify: `rawaq-web/app/api/admin/users/[id]/route.ts`
- Modify: `rawaq-web/app/api/admin/organizers/[id]/route.ts`

- [ ] **Step 1: Add cache invalidation to the user ban/unban route**

Replace the full contents of `rawaq-web/app/api/admin/users/[id]/route.ts` with:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { delCachedProfile } from '@/lib/supabase/profile-cache'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'

const BanSchema = z.object({
  is_banned: z.boolean(),
})

// PATCH /api/admin/users/:id — ban or unban a user
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAdmin()
    const body = await req.json()
    const input = BanSchema.parse(body)

    if (id === ctx.userId) {
      throw new ForbiddenException('Cannot ban yourself')
    }

    const supabase = await createSupabaseServerClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .single()

    if (!profile) throw new NotFoundException('User')
    if (profile.role === 'admin') throw new ForbiddenException('Cannot ban another admin')

    const { data, error } = await supabase
      .from('profiles')
      .update({ is_banned: input.is_banned })
      .eq('id', id)
      .select('id, display_name, role, is_banned')
      .single()

    if (error) throw error

    // Invalidate the profile cache so the ban takes effect within the next request
    await delCachedProfile(id)

    // Audit log
    await supabase.from('audit_logs').insert({
      admin_id:    ctx.userId,
      action:      input.is_banned ? 'ban_user' : 'unban_user',
      target_type: 'user',
      target_id:   id,
      meta:        { display_name: data.display_name, role: data.role },
    } as any)

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/admin/users/:id — hard delete (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAdmin()

    if (id === ctx.userId) {
      throw new ForbiddenException('Cannot delete yourself')
    }

    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    const adminClient = createSupabaseAdminClient()

    const { error } = await adminClient.auth.admin.deleteUser(id)
    if (error) throw error

    // Best-effort cache cleanup for deleted user
    await delCachedProfile(id)

    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Add cache invalidation to the organizer approve/reject/suspend route**

Replace the full contents of `rawaq-web/app/api/admin/organizers/[id]/route.ts` with:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { delCachedProfile } from '@/lib/supabase/profile-cache'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const ReviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'suspended']),
  note: z.string().max(500).optional(),
})

// PATCH /api/admin/organizers/:id — approve / reject / suspend
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAdmin()
    const body = await req.json()
    const input = ReviewSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data: organizer, error: fetchErr } = await supabase
      .from('organizer_profiles')
      .select('user_id')
      .eq('id', id)
      .single()

    if (fetchErr || !organizer) throw new NotFoundException('Organizer profile')

    const { data, error } = await supabase
      .from('organizer_profiles')
      .update({
        status: input.status,
        verified: input.status === 'approved',
        reviewed_by: ctx.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    const adminClient = createSupabaseAdminClient()
    if (input.status === 'approved') {
      await adminClient
        .from('profiles')
        .update({ role: 'organizer' })
        .eq('id', organizer.user_id)

      // Invalidate cache so new role takes effect on next request
      await delCachedProfile(organizer.user_id)

      sendNotification({
        userId: organizer.user_id,
        type: 'organizer_approved',
        payload: { note: input.note ?? '' },
      }).catch(() => {})
    } else if (input.status === 'rejected' || input.status === 'suspended') {
      await adminClient
        .from('profiles')
        .update({ role: 'user' })
        .eq('id', organizer.user_id)

      // Invalidate cache so role demotion takes effect on next request
      await delCachedProfile(organizer.user_id)

      sendNotification({
        userId: organizer.user_id,
        type: input.status === 'rejected' ? 'organizer_rejected' : 'organizer_suspended',
        payload: { note: input.note ?? '' },
      }).catch(() => {})
    }

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/admin/users/[id]/route.ts rawaq-web/app/api/admin/organizers/[id]/route.ts
git commit -m "perf(admin): invalidate profile cache on ban/unban and role changes"
```

---

## Task 5: cache-client Singleton and Events Cache Revalidation Fix

**Files:**
- Modify: `rawaq-web/lib/supabase/cache-client.ts`
- Modify: `rawaq-web/lib/events/cache.ts`

- [ ] **Step 1: Promote cache-client to a module-level singleton**

Replace the full contents of `rawaq-web/lib/supabase/cache-client.ts` with:

```typescript
import { createClient } from '@supabase/supabase-js'

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

- [ ] **Step 2: Fix the getCachedEventsGrid revalidation**

In `rawaq-web/lib/events/cache.ts`, locate the `getCachedEventsGrid` definition (around line 112) and change `revalidate: false` to `revalidate: 300`:

```typescript
export const getCachedEventsGrid = unstable_cache(
  async (
    params: GridParams,
    excludeIds: string[]
  ): Promise<EventWithOrganizer[]> => {
    // ... existing function body unchanged ...
  },
  ['events-grid'],
  { tags: ['events'], revalidate: 300 }  // was: revalidate: false
)
```

Only `revalidate: false` changes to `revalidate: 300`. All other code in the file stays exactly the same.

- [ ] **Step 3: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/lib/supabase/cache-client.ts rawaq-web/lib/events/cache.ts
git commit -m "perf(cache): promote cache-client to singleton; add 5-min revalidation safety net on events grid"
```

---

## Task 6: Shared Booking Validation Helper

**Files:**
- Create: `rawaq-web/lib/bookings/validate.ts`

This helper extracts the shared validation logic from `POST /api/bookings` and `POST /api/payments/initiate`. It collapses the event fetch and the organizer-plan fetch into one join query, eliminating one DB round trip per booking request.

- [ ] **Step 1: Create lib/bookings/validate.ts**

Create `rawaq-web/lib/bookings/validate.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, EventOccurrence } from '@/types/database'
import type { AuthContext } from '@/types/api'
import { resolveTargetOccurrence } from '@/lib/events/occurrences'
import { NotFoundException, ForbiddenException, ApiException } from '@/lib/errors'
import { CreateBookingSchema } from '@/lib/validations/bookings'
import type { z } from 'zod'

type AdminClient = SupabaseClient<Database>
type CreateBookingInput = z.infer<typeof CreateBookingSchema>

// Fetches event + organizer plan fee in one query
const EVENT_SELECT = `
  id, title, is_published, is_cancelled, start_at, end_at,
  event_frequency, organizer_id, gender_restriction,
  is_premium_only, is_free, price, currency, capacity, max_group_size,
  organizer_plan:organizer_profiles!organizer_id(
    plan:plan_definitions(platform_fee_pct)
  )
`

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface ValidatedBookingContext {
  event: {
    id: string
    title: string
    is_published: boolean
    is_cancelled: boolean
    start_at: string
    end_at: string | null
    event_frequency: string | null
    organizer_id: string
    gender_restriction: string | null
    is_premium_only: boolean
    is_free: boolean
    price: number | null
    currency: string | null
    capacity: number | null
    max_group_size: number | null
  }
  occurrence: EventOccurrence
  profile: {
    display_name: string | null
    gender: string | null
    city: string | null
    plan_id: string | null
  }
  ticketType: {
    id: string
    price: number
    is_free: boolean
    capacity: number | null
    sold_count: number
    sale_starts_at: string | null
    sale_ends_at: string | null
  } | null
  promoCodeId: string | null
  discountAmount: number
  // Price of the primary (single) ticket after discount.
  // Each route adds group extras on top of this before computing the final total.
  primaryPrice: number
  platformFeePct: number
}

export async function validateBookingInput(
  admin: AdminClient,
  ctx: AuthContext,
  input: CreateBookingInput,
): Promise<ValidatedBookingContext> {
  // 1. Event — joined with organizer plan to avoid a second query
  const { data: event, error: eventErr } = await admin
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', input.event_id)
    .single()

  if (eventErr || !event) throw new NotFoundException('Event')
  if (!(event as any).is_published) throw new ForbiddenException('Event is not published')
  if ((event as any).is_cancelled) throw new ForbiddenException('Event has been cancelled')

  // 2. Occurrence
  const occurrence = await resolveTargetOccurrence(
    admin,
    event as any,
    ctx.userId,
    input.occurrence_id ?? null,
  )

  // 3. Profile
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, gender, city, plan_id')
    .eq('id', ctx.userId)
    .single()

  if (!profile?.display_name || !profile?.gender || !profile?.city) {
    throw new ForbiddenException('Please complete your profile (name, gender, city) before booking.')
  }
  if ((event as any).gender_restriction === 'male' && profile.gender !== 'male') {
    throw new ForbiddenException('This event is for men only.')
  }
  if ((event as any).gender_restriction === 'female' && profile.gender !== 'female') {
    throw new ForbiddenException('This event is for women only.')
  }
  if ((event as any).is_premium_only && profile.plan_id !== 'user_premium') {
    throw new ForbiddenException('This event is for Premium members only.')
  }

  // 4. Group size cap
  const maxGroup = (event as any).max_group_size ?? 5
  if (input.group_size > maxGroup) {
    throw new ForbiddenException(`Maximum group size for this event is ${maxGroup}`)
  }
  if (input.holders.length !== input.group_size - 1) {
    throw new ApiException('Holder details must be provided for each extra ticket', 422)
  }

  // 5. Ticket type
  let ticketType: ValidatedBookingContext['ticketType'] = null
  if (input.ticket_type_id) {
    const { data: tt } = await admin
      .from('ticket_types')
      .select('id, price, is_free, capacity, sold_count, sale_starts_at, sale_ends_at, is_active')
      .eq('id', input.ticket_type_id)
      .eq('event_id', input.event_id)
      .single()

    if (!tt || !(tt as any).is_active) throw new ForbiddenException('Ticket type not available')
    const now = new Date()
    if (tt.sale_starts_at && new Date(tt.sale_starts_at) > now) throw new ForbiddenException('Ticket sales not started')
    if (tt.sale_ends_at && new Date(tt.sale_ends_at) < now) throw new ForbiddenException('Ticket sales ended')

    const { data: occurrenceSale } = await admin
      .from('event_occurrence_ticket_sales')
      .select('sold_count')
      .eq('occurrence_id', occurrence.id)
      .eq('ticket_type_id', input.ticket_type_id)
      .maybeSingle()

    if (tt.capacity !== null && (occurrenceSale?.sold_count ?? 0) >= tt.capacity) {
      throw new ForbiddenException('This ticket type is sold out')
    }
    ticketType = tt as ValidatedBookingContext['ticketType']
  }

  // 6. Promo code
  let promoCodeId: string | null = null
  let discountAmount = 0
  if (input.promo_code) {
    const code = input.promo_code.toUpperCase().trim()
    const { data: promos } = await admin
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .or(`event_id.eq.${input.event_id},event_id.is.null`)
      .order('event_id', { nullsFirst: false })
      .limit(2)

    const promo = promos?.find((p: any) => p.event_id === input.event_id) ?? promos?.find((p: any) => !p.event_id)
    if (!promo) throw new ForbiddenException('Invalid or inactive promo code')
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) throw new ForbiddenException('Promo code expired')
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) throw new ForbiddenException('Promo code usage limit reached')

    const orderPrice = ticketType ? (ticketType.price as number) : ((event as any).price ?? 0)
    if (orderPrice < (promo.min_order_amount ?? 0)) throw new ForbiddenException(`Minimum order: ${promo.min_order_amount}`)

    promoCodeId = promo.id
    discountAmount = promo.discount_type === 'percent'
      ? round2(orderPrice * (promo.discount_value / 100))
      : Math.min(promo.discount_value, orderPrice)
  }

  // 7. Platform fee pct from event join (no separate query needed)
  const orgPlan = (event as any).organizer_plan?.plan as { platform_fee_pct?: number } | null
  const platformFeePct = orgPlan?.platform_fee_pct ?? 0.10

  // 8. Primary ticket price after discount
  const primaryPrice = ticketType
    ? Math.max(0, (ticketType.price as number) - discountAmount)
    : (event as any).price
      ? Math.max(0, (event as any).price - discountAmount)
      : 0

  return {
    event: event as ValidatedBookingContext['event'],
    occurrence,
    profile,
    ticketType,
    promoCodeId,
    discountAmount,
    primaryPrice,
    platformFeePct,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/lib/bookings/validate.ts
git commit -m "feat(bookings): add shared validateBookingInput() helper — collapses event+plan into one join query"
```

---

## Task 7: Refactor POST /api/bookings with waitUntil

**Files:**
- Modify: `rawaq-web/app/api/bookings/route.ts`

- [ ] **Step 1: Replace the POST handler in bookings/route.ts**

The GET handler at the top of the file is unchanged. Replace only the POST handler and add the `checkSoldOut` helper at the bottom. The full updated file:

```typescript
import { NextRequest } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, ForbiddenException } from '@/lib/errors'
import { CreateBookingSchema } from '@/lib/validations/bookings'
import { sendNotification } from '@/lib/notifications'
import { applyResolvedEventWindow } from '@/lib/events/recurrence'
import { limiters, checkRateLimit } from '@/lib/rate-limit'
import { validateBookingInput } from '@/lib/bookings/validate'
import type { EventOccurrence } from '@/types/database'

type BookingListEventShape = {
  id: string
  title: string
  title_ar: string | null
  start_at: string
  end_at: string | null
  event_frequency?: 'one_time' | 'weekly' | 'monthly'
  cover_image_url: string | null
  city: string
  is_cancelled: boolean
}

type BookingListOccurrenceShape = {
  id: string
  starts_at: string
  ends_at: string | null
}

// GET /api/bookings — current user's bookings
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const page = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const perPage = Number(req.nextUrl.searchParams.get('per_page') ?? 20)
    const status = req.nextUrl.searchParams.get('status')
    const from = (page - 1) * perPage

    let query = supabase
      .from('bookings')
      .select(
        `id, status, created_at, notes,
         event:events(id, title, title_ar, start_at, end_at, event_frequency, cover_image_url, city, is_cancelled),
         occurrence:event_occurrences!occurrence_id(id, starts_at, ends_at)`,
        { count: 'exact' }
      )
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (status) query = query.eq('status', status as import('@/types/database').BookingStatus)

    const { data, count, error } = await query
    if (error) throw error

    const resolvedData = (data ?? []).map((booking) => {
      const occurrence = booking.occurrence as unknown as BookingListOccurrenceShape | null
      const event = booking.event as unknown as BookingListEventShape | null

      return {
        ...booking,
        event: occurrence && event
          ? { ...event, start_at: occurrence.starts_at, end_at: occurrence.ends_at }
          : event
            ? applyResolvedEventWindow(event)
            : booking.event,
      }
    })

    return ok({ data: resolvedData, total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/bookings
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    await checkRateLimit(limiters.bookings, ctx.userId)
    const body = await req.json()
    const input = CreateBookingSchema.parse(body)

    const admin = createSupabaseAdminClient()

    // Shared validation: event (with plan join) + occurrence + profile + ticket + promo
    const vctx = await validateBookingInput(admin, ctx, input)
    const { event, occurrence, profile, ticketType, promoCodeId, discountAmount, primaryPrice, platformFeePct } = vctx

    const isFreeBooking = ticketType ? (ticketType.is_free || primaryPrice === 0) : ((event as any).is_free || primaryPrice === 0)
    const platformFeeAmount = !isFreeBooking && primaryPrice > 0
      ? Math.round(primaryPrice * platformFeePct * 100) / 100
      : 0

    // Existing booking check
    const { data: anyExisting } = await (admin as any)
      .from('bookings')
      .select('id, status')
      .eq('user_id', ctx.userId)
      .eq('occurrence_id', occurrence.id)
      .maybeSingle()

    if ((anyExisting as any)?.status === 'confirmed') {
      throw new ForbiddenException('You already have an active booking for this session')
    }

    const bookingFields = {
      status:              'confirmed',
      notes:               input.notes ?? null,
      ticket_type_id:      input.ticket_type_id ?? null,
      promo_code_id:       promoCodeId,
      discount_amount:     discountAmount,
      platform_fee_pct:    platformFeePct,
      platform_fee_amount: platformFeeAmount,
      group_size:          input.group_size,
    }

    let booking: Record<string, unknown>
    if (anyExisting) {
      const { data, error } = await admin
        .from('bookings').update(bookingFields as any).eq('id', (anyExisting as any).id).select().single()
      if (error) throw error
      booking = data as Record<string, unknown>
    } else {
      const { data, error } = await admin
        .from('bookings')
        .insert({ user_id: ctx.userId, event_id: input.event_id, occurrence_id: occurrence.id, ...bookingFields } as any)
        .select().single()
      if (error) throw error
      booking = data as Record<string, unknown>
    }

    if (input.holders.length > 0) {
      const holderRows = input.holders.map((h) => ({
        booking_id:    booking.id,
        full_name:     h.full_name,
        date_of_birth: h.date_of_birth,
        relation:      h.relation,
        position:      h.position,
      }))
      const { error: holderErr } = await admin.from('booking_holders').insert(holderRows as never)
      if (holderErr) throw holderErr
    }

    // Post-response background work — runs after HTTP response is flushed
    waitUntil(
      sendNotification({
        userId: ctx.userId,
        type: 'booking_confirmed',
        payload: {
          event_id:      event.id,
          occurrence_id: occurrence.id,
          event_title:   event.title,
          booking_id:    booking.id as string,
          ticket_id:     (booking as any).ticket_id ?? undefined,
        },
      })
    )
    waitUntil(
      sendNotification({
        userId: event.organizer_id,
        type: 'new_attendee',
        payload: {
          event_id:      event.id,
          occurrence_id: occurrence.id,
          event_title:   event.title,
          booking_id:    booking.id as string,
          actor_id:      ctx.userId,
          actor_name:    profile?.display_name ?? 'Someone',
        },
      })
    )
    if (occurrence.capacity) {
      waitUntil(checkSoldOut(admin, occurrence, event))
    }

    return created(booking)
  } catch (err) {
    return handleApiError(err)
  }
}

async function checkSoldOut(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  occurrence: Pick<EventOccurrence, 'id' | 'capacity'>,
  event: { id: string; organizer_id: string; title: string },
) {
  const { count: confirmedCount } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('occurrence_id', occurrence.id)
    .eq('status', 'confirmed')

  if (confirmedCount !== null && occurrence.capacity !== null && confirmedCount >= occurrence.capacity) {
    await sendNotification({
      userId: event.organizer_id,
      type: 'event_sold_out',
      payload: { event_id: event.id, occurrence_id: occurrence.id, event_title: event.title },
    })
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual booking smoke test**

Start the dev server. Create a booking for a free event via the UI. Confirm:
- The booking confirmation page loads quickly (notification delay no longer visible)
- A notification appears in the user's notification list (within a few seconds)
- The Supabase dashboard shows the booking row as `confirmed`

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/bookings/route.ts
git commit -m "perf(bookings): use shared validateBookingInput, defer notifications to waitUntil"
```

---

## Task 8: Refactor POST /api/payments/initiate with waitUntil

**Files:**
- Modify: `rawaq-web/app/api/payments/initiate/route.ts`

- [ ] **Step 1: Replace the payments/initiate route handler**

Replace the full contents of `rawaq-web/app/api/payments/initiate/route.ts` with:

```typescript
/**
 * POST /api/payments/initiate
 *
 * Creates a pending payment_transaction and initiates the gateway checkout.
 * Returns a redirect URL (or Fawry reference) for the client to act on.
 */

import { NextRequest } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { ApiException, handleApiError, ok, created, ForbiddenException, ConflictException } from '@/lib/errors'
import { CreateBookingSchema } from '@/lib/validations/bookings'
import { z } from 'zod'
import { getPaymentOptions, resolveGateway } from '@/lib/gateways/selector'
import { initiatePaymob } from '@/lib/gateways/paymob'
import { initiateStripe } from '@/lib/gateways/stripe-gw'
import type { InitiatePaymentParams } from '@/lib/gateways/types'
import { sendNotification } from '@/lib/notifications'
import { limiters, checkRateLimit } from '@/lib/rate-limit'
import { validateBookingInput } from '@/lib/bookings/validate'

const BodySchema = CreateBookingSchema.extend({
  payment_option_id: z.string().min(1).default('simulated'),
  source: z.enum(['web', 'mobile']).default('web'),
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(req: NextRequest) {
  try {
    const ctx   = await requireAuth()
    await checkRateLimit(limiters.payments, ctx.userId)
    const body  = await req.json()
    const input = BodySchema.parse(body)

    const admin = createSupabaseAdminClient()

    // Shared validation: event (with plan join) + occurrence + profile + ticket + promo
    const vctx = await validateBookingInput(admin, ctx, input)
    const { event, occurrence, profile, ticketType, promoCodeId, discountAmount, primaryPrice, platformFeePct } = vctx

    // Occurrence capacity pre-check (initiate-specific — groups need enough spots)
    if (
      occurrence.capacity !== null &&
      occurrence.bookings_count + input.group_size > occurrence.capacity
    ) {
      throw new ForbiddenException('Not enough spots available for your group size')
    }

    // Total effective price including group extras
    const extraPrice     = ticketType
      ? (ticketType.price as number) * (input.group_size - 1)
      : ((event as any).price ?? 0) * (input.group_size - 1)
    const effectivePrice = primaryPrice + extraPrice
    const isFreeBooking  = effectivePrice === 0

    const platformFeeAmount = !isFreeBooking && effectivePrice > 0
      ? round2(effectivePrice * platformFeePct)
      : 0

    // Existing booking check
    const { data: anyExisting } = await (admin as any)
      .from('bookings')
      .select('id, status')
      .eq('user_id', ctx.userId)
      .eq('occurrence_id', occurrence.id)
      .maybeSingle()

    const existingStatus: string | null = anyExisting ? (anyExisting as any).status : null

    if (existingStatus === 'confirmed') {
      throw new ConflictException('You already have an active booking for this session')
    }

    if (anyExisting && existingStatus === 'pending') {
      await (admin as any)
        .from('payment_transactions')
        .update({ status: 'failed', failure_reason: 'superseded_by_new_attempt' })
        .eq('booking_id', (anyExisting as any).id)
        .eq('status', 'pending')
    }

    const bookingStatus       = isFreeBooking ? 'confirmed' : 'pending'
    const paymentPendingUntil = isFreeBooking ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const bookingFields = {
      status:               bookingStatus,
      notes:                input.notes ?? null,
      group_size:           input.group_size,
      ticket_type_id:       input.ticket_type_id ?? null,
      promo_code_id:        promoCodeId,
      discount_amount:      discountAmount,
      platform_fee_pct:     platformFeePct,
      platform_fee_amount:  platformFeeAmount,
      payment_pending_until: paymentPendingUntil,
    }

    let booking: Record<string, unknown>
    if (anyExisting) {
      const { data, error } = await admin.from('bookings').update(bookingFields as any).eq('id', (anyExisting as any).id).select().single()
      if (error) throw error
      booking = data as Record<string, unknown>
    } else {
      const { data, error } = await admin.from('bookings').insert({ user_id: ctx.userId, event_id: input.event_id, occurrence_id: occurrence.id, ...bookingFields } as any).select().single()
      if (error) throw error
      booking = data as Record<string, unknown>
    }

    if (input.holders.length > 0) {
      const holderRows = input.holders.map((h) => ({
        booking_id:    booking.id,
        full_name:     h.full_name,
        date_of_birth: h.date_of_birth,
        relation:      h.relation,
        position:      h.position,
      }))
      const { error: holderErr } = await admin.from('booking_holders').insert(holderRows as never)
      if (holderErr) throw holderErr
    }

    // Free booking: respond immediately, defer notifications
    if (isFreeBooking) {
      waitUntil(
        sendNotification({ userId: ctx.userId, type: 'booking_confirmed', payload: { event_id: event.id, event_title: event.title, booking_id: booking.id as string } })
      )
      waitUntil(
        sendNotification({ userId: event.organizer_id, type: 'new_attendee', payload: { event_id: event.id, event_title: event.title, booking_id: booking.id as string, actor_id: ctx.userId, actor_name: profile.display_name ?? 'Someone' } })
      )
      return created({ booking, payment: null, free: true })
    }

    // Paid booking: create pending payment transaction
    const organizerNet  = round2(effectivePrice - platformFeeAmount)
    const { gateway, method } = resolveGateway(event.currency ?? 'SAR', input.payment_option_id)

    const { data: txRow, error: txErr } = await (admin as any)
      .from('payment_transactions')
      .upsert({
        user_id:          ctx.userId,
        organizer_id:     event.organizer_id,
        event_id:         event.id,
        occurrence_id:    occurrence.id,
        booking_id:       booking.id,
        type:             'ticket',
        status:           'pending',
        amount:           effectivePrice,
        platform_fee:     platformFeeAmount,
        organizer_net:    organizerNet,
        currency:         event.currency ?? 'SAR',
        gateway,
        source:           input.source,
        payment_method:   method,
        is_simulated:     gateway === 'simulated',
        gateway_payload:  { source: input.source },
        gateway_ref:      null,
        gateway_order_id: null,
        failure_reason:   null,
      }, { onConflict: 'booking_id' })
      .select('id')
      .single()

    if (txErr) throw txErr

    // Simulated gateway: confirm immediately, defer notifications
    if (gateway === 'simulated') {
      await (admin as any)
        .from('payment_transactions')
        .update({ status: 'succeeded', gateway_ref: `sim_${Date.now()}` })
        .eq('id', txRow.id)
      await admin.from('bookings').update({ status: 'confirmed', payment_pending_until: null } as any).eq('id', booking.id as string)
      waitUntil(
        sendNotification({ userId: ctx.userId, type: 'booking_confirmed', payload: { event_id: event.id, event_title: event.title, booking_id: booking.id as string } })
      )
      waitUntil(
        sendNotification({ userId: event.organizer_id, type: 'new_attendee', payload: { event_id: event.id, event_title: event.title, booking_id: booking.id as string, actor_id: ctx.userId, actor_name: profile.display_name ?? 'Someone' } })
      )
      return created({ booking, payment: { gateway: 'simulated', free: false }, free: false })
    }

    // Real gateway: initiate checkout
    const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rawaq.app'
    const isMobile = input.source === 'mobile'

    const successUrl = isMobile
      ? `${appUrl}/api/payments/mobile-return?booking_id=${booking.id as string}&status=success`
      : `${appUrl}/bookings/${booking.id as string}?payment=success`
    const cancelUrl  = isMobile
      ? `${appUrl}/api/payments/mobile-return?booking_id=${booking.id as string}&status=cancelled`
      : `${appUrl}/events/${event.id}?payment=cancelled`

    const initParams: InitiatePaymentParams = {
      bookingId:      booking.id as string,
      transactionId:  txRow.id,
      amount:         effectivePrice,
      currency:       event.currency ?? 'SAR',
      userId:         ctx.userId,
      organizerId:    event.organizer_id,
      eventId:        event.id,
      eventTitle:     event.title,
      platformFeePct,
      method,
      userEmail:      undefined,
      successUrl,
      cancelUrl,
    }

    let gatewayResult
    try {
      if (gateway === 'paymob') {
        gatewayResult = await initiatePaymob(initParams)
      } else {
        gatewayResult = await initiateStripe(initParams)
      }
    } catch (gatewayError) {
      if (gateway === 'paymob') {
        const message = gatewayError instanceof Error
          ? gatewayError.message
          : 'Paymob is temporarily unavailable. Please try again in a moment.'
        const timedOut = /timed out|could not be reached/i.test(message)
        throw new ApiException(
          message,
          timedOut ? 504 : 502,
          timedOut ? 'PAYMENT_GATEWAY_TIMEOUT' : 'PAYMENT_GATEWAY_ERROR',
        )
      }
      throw gatewayError
    }

    const { error: gwUpdateErr } = await (admin as any)
      .from('payment_transactions')
      .update({ gateway_order_id: gatewayResult.gatewayOrderId })
      .eq('id', txRow.id)
    if (gwUpdateErr) {
      console.error('[payments/initiate] Failed to store gateway_order_id:', gwUpdateErr, 'txId:', txRow.id, 'orderId:', gatewayResult.gatewayOrderId)
    }

    return ok({
      booking_id:             booking.id,
      transaction_id:         txRow.id,
      gateway:                gatewayResult.gateway,
      redirect_url:           gatewayResult.redirectUrl,
      fawry_reference_number: gatewayResult.fawryReferenceNumber ?? null,
      expires_at:             gatewayResult.expiresAt ?? null,
      free:                   false,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual payment smoke test**

Start the dev server. Initiate a payment for a paid event using the simulated gateway. Confirm:
- The API responds quickly with `{ gateway: 'simulated', free: false }`
- The booking row in Supabase is `confirmed`
- The notification appears in the user's inbox (may take a few seconds due to waitUntil)

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/payments/initiate/route.ts
git commit -m "perf(payments): use shared validateBookingInput, defer notifications to waitUntil"
```

---

## Task 9: Edge Runtime and Cache-Control for payments/options

**Files:**
- Modify: `rawaq-web/app/api/payments/options/route.ts`

This is the only route that is truly stateless (no DB calls, no cookies, pure env-var logic). Adding Edge Runtime eliminates cold starts. Adding `Cache-Control: public` lets Vercel's CDN cache the response across requests for the same currency.

- [ ] **Step 1: Add Edge Runtime and Cache-Control to the payments/options route**

Replace the full contents of `rawaq-web/app/api/payments/options/route.ts` with:

```typescript
/**
 * GET /api/payments/options?currency=EGP
 *
 * Returns available payment options for a given currency.
 * Called by the checkout form to dynamically show the right payment methods.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPaymentOptions } from '@/lib/gateways/selector'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  try {
    const currency = req.nextUrl.searchParams.get('currency') ?? 'SAR'
    const options  = getPaymentOptions(currency)
    return NextResponse.json(
      { data: options },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    )
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

Note: `handleApiError` and `ok` from `lib/errors` import `NextResponse` from `next/server` which works on Edge Runtime. The direct `NextResponse.json` call above is slightly more explicit but either approach is fine.

- [ ] **Step 2: Verify lib/gateways/selector.ts is Edge-compatible**

Run:

```bash
cd rawaq-web && grep -n "require\|import.*fs\|import.*path\|import.*crypto" lib/gateways/selector.ts
```

Expected: no Node.js-only imports. If any appear, those imports must be removed or the Edge Runtime declaration must be removed from this task.

- [ ] **Step 3: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Build check**

```bash
cd rawaq-web && npm run build 2>&1 | grep -E "error|Error|edge"
```

Expected: build succeeds, `payments/options` is listed as an Edge route in the build output.

- [ ] **Step 5: Commit**

```bash
git add rawaq-web/app/api/payments/options/route.ts
git commit -m "perf(payments/options): add Edge Runtime and 1h public Cache-Control"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Task covering it |
|---|---|
| 3.1 Redis profile cache (30s TTL) | Tasks 2, 3 |
| 3.1 Cache invalidation on ban/role change | Task 4 |
| 3.2 waitUntil for post-response notifications | Tasks 7, 8 |
| 3.2 waitUntil for sold-out check | Task 7 |
| 3.3a Event + organizer plan join query | Task 6 (validateBookingInput) |
| 3.3b Shared validateBookingInput helper | Tasks 6, 7, 8 |
| 3.4 unstable_cache revalidation fix | Task 5 |
| 3.5 cache-client singleton | Task 5 |
| 3.6 Edge Runtime for stateless routes | Task 9 |
| 3.7 Cache-Control on public routes | Task 9 |

**Notes on spec deviations:**
- `communities/trending` and `happenings/discover` were evaluated for Edge Runtime and public `Cache-Control` but both routes call `optionalAuth()` and return personalized data (`is_member`, `user_has_rsvp`, `user_has_reacted`) — public CDN caching would leak user-specific data across requests. These changes are correctly omitted from the plan.
- `plans/route.ts` was evaluated for Edge Runtime but uses `createSupabaseServerClient()` with a live DB query — not stateless, stays on Node.js.

**Type consistency check:**
- `ValidatedBookingContext.primaryPrice` is referenced as `primaryPrice` consistently across Tasks 6, 7, 8 ✓
- `validateBookingInput` signature is `(admin, ctx, input)` in Tasks 6, 7, 8 ✓
- `profileCacheKey` exported from `profile-cache.ts` and used in test ✓
- `getCachedProfile` / `setCachedProfile` / `delCachedProfile` names consistent across Tasks 2, 3, 4 ✓
- `waitUntil` imported from `@vercel/functions` in Tasks 7, 8 ✓

**Placeholder scan:** No TBDs, no "implement later", no missing code blocks found.
