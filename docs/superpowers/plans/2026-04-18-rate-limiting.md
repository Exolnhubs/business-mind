# Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-grade distributed rate limiting to protect all high-risk endpoints against abuse at 10k–20k users.

**Architecture:** Global IP-based sliding-window limiter runs in Next.js middleware to block floods before they hit route handlers. Per-endpoint, per-user limiters are enforced inside each route's POST handler via a shared `checkRateLimit()` helper that throws `RateLimitException` (caught by the existing `handleApiError`). All counters live in Upstash Redis — distributed across serverless cold starts.

**Tech Stack:** `@upstash/ratelimit`, `@upstash/redis`, Upstash Redis (cloud), Next.js Middleware, existing `lib/errors.ts` pattern.

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `rawaq-web/package.json` | Add Upstash deps |
| Modify | `rawaq-web/lib/errors.ts` | Add `RateLimitException` + update `handleApiError` |
| **Create** | `rawaq-web/lib/rate-limit.ts` | All Ratelimit instances + `checkRateLimit()` helper |
| Modify | `rawaq-web/middleware.ts` | Add global IP limiter (300 req/min) |
| Modify | `rawaq-web/app/api/bookings/route.ts` | 10/min per user on POST |
| Modify | `rawaq-web/app/api/payments/initiate/route.ts` | 5/min per user on POST |
| Modify | `rawaq-web/app/api/chat/route.ts` | 10/min per user on POST |
| Modify | `rawaq-web/app/api/comments/route.ts` | 15/min per user on POST |
| Modify | `rawaq-web/app/api/support/tickets/route.ts` | 5/hour per user on POST |
| Modify | `rawaq-web/app/api/support/chat/route.ts` | 20/min per user on POST |
| Modify | `rawaq-web/app/api/tips/route.ts` | 5/min per user on POST |
| Modify | `rawaq-web/app/api/organizer/request/route.ts` | 3 per 24h per user on POST |
| Modify | `rawaq-web/app/api/happenings/[id]/rsvp/route.ts` | 20/min per user on POST |
| Modify | `rawaq-web/app/api/happenings/[id]/react/route.ts` | 30/min per user on POST |
| Modify | `rawaq-web/app/api/events/[id]/react/route.ts` | 30/min per user on POST |
| Modify | `rawaq-web/app/api/communities/[slug]/join/route.ts` | 10/min per user on POST |
| Modify | `rawaq-web/app/api/communities/[slug]/happenings/route.ts` | 5/min per user on POST |

---

## Task 1: Install Upstash packages

**Files:**
- Modify: `rawaq-web/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd rawaq-web && npm install @upstash/ratelimit @upstash/redis
```

Expected output ends with: `added N packages`

- [ ] **Step 2: Add env vars to `.env.local`**

Add these two lines (get values from https://console.upstash.com → your Redis database → REST API):

```bash
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

- [ ] **Step 3: Commit**

```bash
cd rawaq-web && git add package.json package-lock.json
git commit -m "chore(web): add @upstash/ratelimit and @upstash/redis"
```

---

## Task 2: Add `RateLimitException` to errors.ts

**Files:**
- Modify: `rawaq-web/lib/errors.ts`

- [ ] **Step 1: Add `RateLimitException` class after `BadRequestException`**

Open `rawaq-web/lib/errors.ts`. After line 43 (the closing brace of `BadRequestException`), insert:

```typescript
export class RateLimitException extends ApiException {
  readonly retryAfter?: number
  constructor(retryAfterSeconds?: number) {
    super('Too many requests. Please try again later.', 429, 'RATE_LIMITED')
    this.retryAfter = retryAfterSeconds
  }
}
```

- [ ] **Step 2: Update `handleApiError` to emit `Retry-After` header**

In `handleApiError`, the block that handles `ApiException` currently is:

```typescript
  if (error instanceof ApiException) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    )
  }
```

Replace it with:

```typescript
  if (error instanceof ApiException) {
    const headers: Record<string, string> = {}
    if (error instanceof RateLimitException && error.retryAfter != null) {
      headers['Retry-After'] = String(error.retryAfter)
    }
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode, headers }
    )
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add lib/errors.ts
git commit -m "feat(web): add RateLimitException with Retry-After header support"
```

---

## Task 3: Create `lib/rate-limit.ts`

**Files:**
- Create: `rawaq-web/lib/rate-limit.ts`

- [ ] **Step 1: Create the file**

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { RateLimitException } from './errors'

const redis = Redis.fromEnv()

function sw(requests: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`) {
  return new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(requests, window), analytics: true })
}

export const limiters = {
  globalIp:        sw(300, '1 m'),
  bookings:        sw(10,  '1 m'),
  payments:        sw(5,   '1 m'),
  chat:            sw(10,  '1 m'),
  comments:        sw(15,  '1 m'),
  supportTickets:  sw(5,   '1 h'),
  supportChat:     sw(20,  '1 m'),
  tips:            sw(5,   '1 m'),
  organizerReq:    sw(3,   '24 h'),
  reactions:       sw(30,  '1 m'),
  rsvp:            sw(20,  '1 m'),
  communityJoin:   sw(10,  '1 m'),
  happenings:      sw(5,   '1 m'),
}

export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<void> {
  const { success, reset } = await limiter.limit(identifier)
  if (!success) {
    throw new RateLimitException(Math.ceil((reset - Date.now()) / 1000))
  }
}
```

Each `sw()` call shares the same Redis instance; the `prefix` defaults to the limiter instance's identity so there's no key collision.

- [ ] **Step 2: Add `prefix` to each limiter to guarantee unique Redis keys**

Replace the `sw` helper and `limiters` export with:

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { RateLimitException } from './errors'

const redis = Redis.fromEnv()

function sw(
  requests: number,
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`,
  prefix: string,
) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `rl:${prefix}`,
    analytics: true,
  })
}

export const limiters = {
  globalIp:        sw(300, '1 m',  'global'),
  bookings:        sw(10,  '1 m',  'bookings'),
  payments:        sw(5,   '1 m',  'payments'),
  chat:            sw(10,  '1 m',  'chat'),
  comments:        sw(15,  '1 m',  'comments'),
  supportTickets:  sw(5,   '1 h',  'support:tickets'),
  supportChat:     sw(20,  '1 m',  'support:chat'),
  tips:            sw(5,   '1 m',  'tips'),
  organizerReq:    sw(3,   '24 h', 'organizer:req'),
  reactions:       sw(30,  '1 m',  'reactions'),
  rsvp:            sw(20,  '1 m',  'rsvp'),
  communityJoin:   sw(10,  '1 m',  'community:join'),
  happenings:      sw(5,   '1 m',  'happenings'),
}

export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<void> {
  const { success, reset } = await limiter.limit(identifier)
  if (!success) {
    throw new RateLimitException(Math.ceil((reset - Date.now()) / 1000))
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add lib/rate-limit.ts
git commit -m "feat(web): add centralised rate-limit helper with Upstash Redis"
```

---

## Task 4: Global IP limiter in middleware

**Files:**
- Modify: `rawaq-web/middleware.ts`

- [ ] **Step 1: Update middleware.ts**

Replace the entire file content with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { limiters } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  // ── Global IP rate limit (300 req/min) ────────────────────────────────────
  // Only enforce on API routes to avoid penalising page navigations.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip =
      request.ip ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'anonymous'

    const { success, reset } = await limiters.globalIp.limit(ip)
    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) },
        },
      )
    }
  }

  // ── Supabase session refresh (do not remove) ──────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // Refresh session — do not remove this call
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manually verify in dev**

```bash
cd rawaq-web && npm run dev
```

Then in a separate terminal, fire 5 quick requests to any API endpoint:

```bash
for i in {1..5}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/feed; done
```

Expected: all `200`. If you see `429`, the global limit is too tight — increase `300` to `600` in `lib/rate-limit.ts`.

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add middleware.ts
git commit -m "feat(web): add global IP rate limit (300 req/min) in Next.js middleware"
```

---

## Task 5: Protect bookings and payments

**Files:**
- Modify: `rawaq-web/app/api/bookings/route.ts:POST`
- Modify: `rawaq-web/app/api/payments/initiate/route.ts:POST`

### Bookings

- [ ] **Step 1: Add import to `rawaq-web/app/api/bookings/route.ts`**

At the top of the file, after the existing imports, add:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

- [ ] **Step 2: Add rate limit check inside the POST handler**

Find the POST handler. It starts with something like `export async function POST(req: NextRequest)`. Inside the `try` block, after `const ctx = await requireAuth()` (and its equivalent), add:

```typescript
    await checkRateLimit(limiters.bookings, ctx.userId)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

### Payments

- [ ] **Step 4: Add import to `rawaq-web/app/api/payments/initiate/route.ts`**

After the existing imports:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

- [ ] **Step 5: Add rate limit check inside POST handler**

After `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.payments, ctx.userId)
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
cd rawaq-web && git add app/api/bookings/route.ts app/api/payments/initiate/route.ts
git commit -m "feat(web): rate limit bookings (10/min) and payment initiation (5/min)"
```

---

## Task 6: Protect chat and comments

**Files:**
- Modify: `rawaq-web/app/api/chat/route.ts:POST`
- Modify: `rawaq-web/app/api/comments/route.ts:POST`

- [ ] **Step 1: Add import + check to `rawaq-web/app/api/chat/route.ts`**

Add import after existing imports:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler's `try` block, after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.chat, ctx.userId)
```

- [ ] **Step 2: Add import + check to `rawaq-web/app/api/comments/route.ts`**

Add import after existing imports:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler's `try` block, after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.comments, ctx.userId)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd rawaq-web && git add app/api/chat/route.ts app/api/comments/route.ts
git commit -m "feat(web): rate limit chat (10/min) and comments (15/min)"
```

---

## Task 7: Protect tips, support, and organizer request

**Files:**
- Modify: `rawaq-web/app/api/tips/route.ts:POST`
- Modify: `rawaq-web/app/api/support/tickets/route.ts:POST`
- Modify: `rawaq-web/app/api/support/chat/route.ts:POST`
- Modify: `rawaq-web/app/api/organizer/request/route.ts:POST`

- [ ] **Step 1: Add to `rawaq-web/app/api/tips/route.ts`**

Add import:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.tips, ctx.userId)
```

- [ ] **Step 2: Add to `rawaq-web/app/api/support/tickets/route.ts`**

Add import:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.supportTickets, ctx.userId)
```

- [ ] **Step 3: Add to `rawaq-web/app/api/support/chat/route.ts`**

Add import:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.supportChat, ctx.userId)
```

- [ ] **Step 4: Add to `rawaq-web/app/api/organizer/request/route.ts`**

Add import:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.organizerReq, ctx.userId)
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
cd rawaq-web && git add app/api/tips/route.ts app/api/support/tickets/route.ts app/api/support/chat/route.ts app/api/organizer/request/route.ts
git commit -m "feat(web): rate limit tips (5/min), support tickets (5/hr), support chat (20/min), organizer requests (3/24h)"
```

---

## Task 8: Protect reactions, RSVP, community join, and happenings

**Files:**
- Modify: `rawaq-web/app/api/happenings/[id]/rsvp/route.ts:POST`
- Modify: `rawaq-web/app/api/happenings/[id]/react/route.ts:POST`
- Modify: `rawaq-web/app/api/events/[id]/react/route.ts:POST`
- Modify: `rawaq-web/app/api/communities/[slug]/join/route.ts:POST`
- Modify: `rawaq-web/app/api/communities/[slug]/happenings/route.ts:POST`

- [ ] **Step 1: Add to `rawaq-web/app/api/happenings/[id]/rsvp/route.ts`**

Add import:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.rsvp, ctx.userId)
```

- [ ] **Step 2: Add to `rawaq-web/app/api/happenings/[id]/react/route.ts`**

Add import:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.reactions, ctx.userId)
```

- [ ] **Step 3: Add to `rawaq-web/app/api/events/[id]/react/route.ts`**

Add import:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.reactions, ctx.userId)
```

Note: both reaction endpoints share the same `reactions` limiter key (using `ctx.userId` as identifier). This means a user's combined event+happening reactions are capped at 30/min — intentional.

- [ ] **Step 4: Add to `rawaq-web/app/api/communities/[slug]/join/route.ts`**

Add import:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.communityJoin, ctx.userId)
```

- [ ] **Step 5: Add to `rawaq-web/app/api/communities/[slug]/happenings/route.ts`**

Add import:

```typescript
import { limiters, checkRateLimit } from '@/lib/rate-limit'
```

In the POST handler after `const ctx = await requireAuth()`:

```typescript
    await checkRateLimit(limiters.happenings, ctx.userId)
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
cd rawaq-web && git add \
  app/api/happenings/[id]/rsvp/route.ts \
  "app/api/happenings/[id]/react/route.ts" \
  "app/api/events/[id]/react/route.ts" \
  "app/api/communities/[slug]/join/route.ts" \
  "app/api/communities/[slug]/happenings/route.ts"
git commit -m "feat(web): rate limit reactions (30/min), RSVP (20/min), community join (10/min), happenings (5/min)"
```

---

## Task 9: End-to-end smoke test

- [ ] **Step 1: Start dev server**

```bash
cd rawaq-web && npm run dev
```

- [ ] **Step 2: Test global IP limiter triggers correctly**

This hits the endpoint 310 times rapidly. The last several should return 429:

```bash
for i in {1..310}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/feed; done | sort | uniq -c
```

Expected output contains `429` entries after the 300 limit is hit.

- [ ] **Step 3: Test a per-user endpoint (chat)**

Get a valid Bearer token from the Supabase dashboard or your test login. Then:

```bash
TOKEN="your-bearer-token-here"
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/chat \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"content":"test"}';
done
```

Expected: first 10 return `201`, next 2 return `429` with `Retry-After` header.

- [ ] **Step 4: Verify `Retry-After` header is present on 429**

```bash
curl -v -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"test"}' 2>&1 | grep -i "retry-after"
```

Expected: `< Retry-After: <N>` (some number of seconds).

- [ ] **Step 5: Final type-check**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

---

## Limits Reference

| Endpoint | Identifier | Window | Limit |
|---|---|---|---|
| All API routes (global) | IP address | 1 min | 300 |
| POST /api/bookings | userId | 1 min | 10 |
| POST /api/payments/initiate | userId | 1 min | 5 |
| POST /api/chat | userId | 1 min | 10 |
| POST /api/comments | userId | 1 min | 15 |
| POST /api/support/tickets | userId | 1 hour | 5 |
| POST /api/support/chat | userId | 1 min | 20 |
| POST /api/tips | userId | 1 min | 5 |
| POST /api/organizer/request | userId | 24 hours | 3 |
| POST /api/happenings/[id]/react | userId | 1 min | 30 (shared) |
| POST /api/events/[id]/react | userId | 1 min | 30 (shared) |
| POST /api/happenings/[id]/rsvp | userId | 1 min | 20 |
| POST /api/communities/[slug]/join | userId | 1 min | 10 |
| POST /api/communities/[slug]/happenings | userId | 1 min | 5 |
