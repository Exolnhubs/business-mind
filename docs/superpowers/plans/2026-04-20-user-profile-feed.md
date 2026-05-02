# User Profile Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `/user/[id]` into a rich social profile with tabbed activity feed, user-to-user follow requests, and a "Say Hi" action.

**Architecture:** New `user_follows` table with `pending/accepted` status drives a `FollowState` enum computed server-side; the RSC page fetches all data in parallel and passes it as props to client components. Three API route groups handle follow CRUD, happenings/events pagination, and say-hi rate-limiting via Redis.

**Tech Stack:** Next.js 15 App Router (RSC + `use client`), Supabase admin client, Upstash Redis (`@upstash/redis`), TypeScript

---

## File Map

### New files
- `rawaq-web/supabase/migrations/00072_user_follows.sql` — `user_follows` table + indexes
- `rawaq-web/app/api/users/[id]/follow/route.ts` — POST (send request) + DELETE (cancel/unfollow)
- `rawaq-web/app/api/users/[id]/follow/accept/route.ts` — POST accept incoming request
- `rawaq-web/app/api/users/[id]/follow/decline/route.ts` — POST decline incoming request
- `rawaq-web/app/api/users/[id]/happenings/route.ts` — GET paginated happenings
- `rawaq-web/app/api/users/[id]/events/route.ts` — GET mutual-gated attended events
- `rawaq-web/app/api/users/[id]/say-hi/route.ts` — POST rate-limited say-hi notification
- `rawaq-web/components/social/UserFollowButton.tsx` — `use client`, all follow state transitions
- `rawaq-web/components/social/SayHiButton.tsx` — `use client`, say-hi action
- `rawaq-web/components/social/UserHappeningCard.tsx` — server component, happening display
- `rawaq-web/components/social/UserProfileTabs.tsx` — `use client`, 3-tab panel with lazy loading

### Modified files
- `rawaq-web/types/database.ts` — add 3 `NotificationType` literals
- `rawaq-web/lib/notifications.ts` — add push title/body copy for 3 new types
- `rawaq-web/app/(app)/notifications/page.tsx` — add ICONS + `notificationLabel` cases
- `rawaq-web/app/(app)/user/[id]/page.tsx` — full RSC rewrite with parallel fetches

---

### Task 1: Database migration — `user_follows` table

**Files:**
- Create: `rawaq-web/supabase/migrations/00072_user_follows.sql`

- [ ] **Step 1: Write the migration**

```sql
-- rawaq-web/supabase/migrations/00072_user_follows.sql
CREATE TABLE IF NOT EXISTS user_follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_following_status
  ON user_follows (following_id, status);
```

- [ ] **Step 2: Apply locally**

```bash
cd rawaq-web && npx supabase db push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/supabase/migrations/00072_user_follows.sql
git commit -m "feat: add user_follows migration"
```

---

### Task 2: Type system — NotificationType + notification copy

**Files:**
- Modify: `rawaq-web/types/database.ts`
- Modify: `rawaq-web/lib/notifications.ts`
- Modify: `rawaq-web/app/(app)/notifications/page.tsx`

- [ ] **Step 1: Add three new notification types to `types/database.ts`**

Find this block (line ~23):
```ts
export type NotificationType =
  | "booking_confirmed"
  | ...
  | "community_happening";
```

Add three literals before the closing semicolon:
```ts
export type NotificationType =
  | "booking_confirmed"
  | "booking_cancelled"
  | "event_reminder"
  | "comment_reply"
  | "mention"
  | "organizer_approved"
  | "organizer_rejected"
  | "organizer_suspended"
  | "event_cancelled"
  | "tip_received"
  | "waitlist_promoted"
  | "new_follower"
  | "new_review"
  | "new_attendee"
  | "new_comment"
  | "event_updated"
  | "new_event_published"
  | "event_sold_out"
  | "referral_signup_reward"
  | "referral_conversion_reward"
  | "community_new_event"
  | "community_happening"
  | "follow_request"
  | "follow_accepted"
  | "say_hi";
```

- [ ] **Step 2: Add push titles in `lib/notifications.ts` — `getPushTitle`**

In the `titles` Record inside `getPushTitle`, add after `community_happening`:
```ts
    follow_request:  'New follow request 👤',
    follow_accepted: 'Follow request accepted ✅',
    say_hi:          'Someone waved at you 👋',
```

- [ ] **Step 3: Add push body cases in `lib/notifications.ts` — `getPushBody`**

In the `switch` inside `getPushBody`, add before the `default` case:
```ts
    case 'follow_request':  return `${str('actor_name')} wants to follow you`
    case 'follow_accepted': return `${str('actor_name')} accepted your follow request`
    case 'say_hi':          return `${str('actor_name')} waved at you 👋`
```

- [ ] **Step 4: Add ICONS entries in `notifications/page.tsx`**

In the `ICONS` Record, add after `community_happening`:
```ts
  follow_request:  '👤',
  follow_accepted: '✅',
  say_hi:          '👋',
```

- [ ] **Step 5: Add `notificationLabel` cases in `notifications/page.tsx`**

In the `switch` inside `notificationLabel`, add before the `default` case:
```ts
    case 'follow_request':
      return { title: `${p.actor_name ?? 'Someone'} wants to follow you`, subtitle: '', href: p.actor_id ? `/user/${p.actor_id}` : null }
    case 'follow_accepted':
      return { title: `${p.actor_name ?? 'Someone'} accepted your follow request`, subtitle: '', href: p.actor_id ? `/user/${p.actor_id}` : null }
    case 'say_hi':
      return { title: `${p.actor_name ?? 'Someone'} waved at you 👋`, subtitle: '', href: p.actor_id ? `/user/${p.actor_id}` : null }
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors referencing the new types.

- [ ] **Step 7: Commit**

```bash
git add rawaq-web/types/database.ts rawaq-web/lib/notifications.ts rawaq-web/app/(app)/notifications/page.tsx
git commit -m "feat: add follow_request, follow_accepted, say_hi notification types"
```

---

### Task 3: Follow API routes — send, cancel, unfollow

**Files:**
- Create: `rawaq-web/app/api/users/[id]/follow/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// rawaq-web/app/api/users/[id]/follow/route.ts
import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, BadRequestException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

// POST /api/users/:id/follow — send a follow request (status = pending)
// If target already has a pending request to viewer, auto-accept both.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const ctx = await requireAuth()

    if (ctx.userId === targetId) throw new BadRequestException('Cannot follow yourself')

    const admin = createSupabaseAdminClient()

    // Check if target has already sent viewer a pending request
    const { data: theirRow } = await admin
      .from('user_follows')
      .select('id, status')
      .eq('follower_id', targetId)
      .eq('following_id', ctx.userId)
      .maybeSingle()

    if (theirRow?.status === 'pending') {
      // Auto-accept both directions
      await admin
        .from('user_follows')
        .update({ status: 'accepted' })
        .eq('id', theirRow.id)

      await admin
        .from('user_follows')
        .upsert(
          { follower_id: ctx.userId, following_id: targetId, status: 'accepted' },
          { onConflict: 'follower_id,following_id' }
        )

      const { data: actor } = await admin.from('profiles').select('display_name').eq('id', ctx.userId).single()
      sendNotification({
        userId: targetId,
        type: 'follow_accepted',
        payload: { actor_id: ctx.userId, actor_name: actor?.display_name ?? 'Someone' },
      }).catch(() => {})

      return ok({ follow_state: 'accepted' })
    }

    // Normal path: insert pending row
    const { error } = await admin
      .from('user_follows')
      .upsert(
        { follower_id: ctx.userId, following_id: targetId, status: 'pending' },
        { onConflict: 'follower_id,following_id' }
      )
    if (error) throw error

    const { data: actor } = await admin.from('profiles').select('display_name').eq('id', ctx.userId).single()
    sendNotification({
      userId: targetId,
      type: 'follow_request',
      payload: { actor_id: ctx.userId, actor_name: actor?.display_name ?? 'Someone' },
    }).catch(() => {})

    return ok({ follow_state: 'pending_sent' })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/users/:id/follow — cancel pending request OR unfollow accepted
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { error } = await admin
      .from('user_follows')
      .delete()
      .eq('follower_id', ctx.userId)
      .eq('following_id', targetId)

    if (error) throw error
    return ok({ follow_state: 'none' })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Create the accept route**

```ts
// rawaq-web/app/api/users/[id]/follow/accept/route.ts
import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

// POST /api/users/:id/follow/accept — accept an incoming pending request
// :id is the follower (person who sent the request)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: followerId } = await params
    const ctx = await requireAuth() // viewer = the one who received the request

    const admin = createSupabaseAdminClient()

    const { data: row, error: fetchErr } = await admin
      .from('user_follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', ctx.userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!row) throw new NotFoundException('Follow request')

    // Accept their row
    await admin
      .from('user_follows')
      .update({ status: 'accepted' })
      .eq('id', row.id)

    // Insert the reverse accepted row so viewer also follows them back
    await admin
      .from('user_follows')
      .upsert(
        { follower_id: ctx.userId, following_id: followerId, status: 'accepted' },
        { onConflict: 'follower_id,following_id' }
      )

    const { data: actor } = await admin.from('profiles').select('display_name').eq('id', ctx.userId).single()
    sendNotification({
      userId: followerId,
      type: 'follow_accepted',
      payload: { actor_id: ctx.userId, actor_name: actor?.display_name ?? 'Someone' },
    }).catch(() => {})

    return ok({ follow_state: 'accepted' })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 3: Create the decline route**

```ts
// rawaq-web/app/api/users/[id]/follow/decline/route.ts
import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// POST /api/users/:id/follow/decline — delete incoming pending request
// :id is the follower (person who sent the request)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: followerId } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    await admin
      .from('user_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', ctx.userId)
      .eq('status', 'pending')

    return ok({ follow_state: 'none' })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add rawaq-web/app/api/users/
git commit -m "feat: user follow API routes — send, cancel, accept, decline"
```

---

### Task 4: Happenings route — public, cursor-paginated

**Files:**
- Create: `rawaq-web/app/api/users/[id]/happenings/route.ts`

- [ ] **Step 1: Create the route**

```ts
// rawaq-web/app/api/users/[id]/happenings/route.ts
import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/errors'
import { NextResponse } from 'next/server'

// GET /api/users/:id/happenings?limit=10&before=<ISO>
// Public — no auth required
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const limit  = Math.min(Number(searchParams.get('limit') ?? '10'), 20)
    const before = searchParams.get('before')

    const admin = createSupabaseAdminClient()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    let query = admin
      .from('happenings')
      .select('id, body, created_at, expires_at, community_id, communities(name, slug), reactions:happening_reactions(count), rsvps:happening_rsvps(count)')
      .eq('author_id', id)
      .or(`expires_at.gt.${new Date().toISOString()},created_at.gt.${thirtyDaysAgo}`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (before) {
      query = query.lt('created_at', before)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd rawaq-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/api/users/[id]/happenings/route.ts
git commit -m "feat: public happenings route for user profile"
```

---

### Task 5: Events route — mutual follow gated

**Files:**
- Create: `rawaq-web/app/api/users/[id]/events/route.ts`

- [ ] **Step 1: Create the route**

```ts
// rawaq-web/app/api/users/[id]/events/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/errors'

// GET /api/users/:id/events?limit=8&offset=0
// 403 if viewer is not authenticated or not in a mutual follow with target
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const ctx = await optionalAuth()

    if (!ctx) {
      return NextResponse.json({ error: 'mutual_follow_required' }, { status: 403 })
    }

    // Admins bypass the gate
    if (ctx.role !== 'admin' && ctx.role !== 'owner') {
      const admin = createSupabaseAdminClient()
      // Check both directions are accepted
      const [{ data: viewerRow }, { data: targetRow }] = await Promise.all([
        admin.from('user_follows').select('id').eq('follower_id', ctx.userId).eq('following_id', targetId).eq('status', 'accepted').maybeSingle(),
        admin.from('user_follows').select('id').eq('follower_id', targetId).eq('following_id', ctx.userId).eq('status', 'accepted').maybeSingle(),
      ])
      if (!viewerRow || !targetRow) {
        return NextResponse.json({ error: 'mutual_follow_required' }, { status: 403 })
      }
    }

    const { searchParams } = new URL(req.url)
    const limit  = Math.min(Number(searchParams.get('limit') ?? '8'), 20)
    const offset = Number(searchParams.get('offset') ?? '0')

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('bookings')
      .select('id, events(id, title, title_ar, start_at, cover_image_url, city, venue_name, venue_name_ar, currency, price, is_free, capacity, bookings_count, category:categories(name_en), organizer:profiles!organizer_id(id, display_name, organizer_profile:organizer_profiles(business_name)), ticket_types(id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at))')
      .eq('user_id', targetId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    const events = (data ?? []).map((b) => (b as any).events).filter(Boolean)
    return NextResponse.json({ data: events })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd rawaq-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/api/users/[id]/events/route.ts
git commit -m "feat: mutual-gated attended events route for user profile"
```

---

### Task 6: Say Hi route — Redis rate limited

**Files:**
- Create: `rawaq-web/app/api/users/[id]/say-hi/route.ts`

- [ ] **Step 1: Create the route**

```ts
// rawaq-web/app/api/users/[id]/say-hi/route.ts
import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, BadRequestException, RateLimitException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

const redis = Redis.fromEnv()

// POST /api/users/:id/say-hi — rate limited to 1 per viewer per target per 24h
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const ctx = await requireAuth()

    if (ctx.userId === targetId) throw new BadRequestException('Cannot say hi to yourself')

    const key = `say-hi:${ctx.userId}:${targetId}`
    const already = await redis.exists(key)
    if (already) throw new RateLimitException(86400)

    await redis.setex(key, 86400, '1')

    const admin = createSupabaseAdminClient()
    const { data: actor } = await admin.from('profiles').select('display_name').eq('id', ctx.userId).single()

    await sendNotification({
      userId:  targetId,
      type:    'say_hi',
      payload: { actor_id: ctx.userId, actor_name: actor?.display_name ?? 'Someone' },
    })

    return ok({ sent: true })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd rawaq-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/api/users/[id]/say-hi/route.ts
git commit -m "feat: say-hi route with Redis 24h rate limiting"
```

---

### Task 7: UserFollowButton client component

**Files:**
- Create: `rawaq-web/components/social/UserFollowButton.tsx`

- [ ] **Step 1: Create the component**

```tsx
// rawaq-web/components/social/UserFollowButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { Spinner } from '@/components/ui/Spinner'

export type FollowState = 'self' | 'none' | 'pending_sent' | 'pending_received' | 'accepted'

interface Props {
  targetId: string
  initialState: FollowState
}

export function UserFollowButton({ targetId, initialState }: Props) {
  const [state, setState] = useState<FollowState>(initialState)
  const [pending, setPending] = useState(false)
  const [, startTransition] = useTransition()

  async function call(url: string, method: string) {
    setPending(true)
    try {
      const res = await fetch(url, { method })
      if (res.ok) {
        const { data } = await res.json() as { data: { follow_state: FollowState } }
        setState(data.follow_state)
      }
    } finally {
      setPending(false)
    }
  }

  if (state === 'self') {
    return (
      <a href="/profile" className="btn-secondary text-sm">Edit Profile →</a>
    )
  }

  if (state === 'none') {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(() => call(`/api/users/${targetId}/follow`, 'POST'))}
        className="btn-brand text-sm disabled:opacity-60"
      >
        {pending ? <Spinner size="sm" /> : '+ Follow'}
      </button>
    )
  }

  if (state === 'pending_sent') {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(() => call(`/api/users/${targetId}/follow`, 'DELETE'))}
        className="px-4 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:border-red-200 hover:text-red-500 disabled:opacity-60 transition-colors"
      >
        {pending ? <Spinner size="sm" /> : 'Requested'}
      </button>
    )
  }

  if (state === 'pending_received') {
    return (
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => startTransition(() => call(`/api/users/${targetId}/follow/accept`, 'POST'))}
          className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
        >
          {pending ? <Spinner size="sm" /> : 'Accept'}
        </button>
        <button
          disabled={pending}
          onClick={() => startTransition(() => call(`/api/users/${targetId}/follow/decline`, 'POST'))}
          className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:border-red-200 hover:text-red-500 disabled:opacity-60 transition-colors"
        >
          Decline
        </button>
      </div>
    )
  }

  // accepted
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => call(`/api/users/${targetId}/follow`, 'DELETE'))}
      className="px-4 py-2 rounded-xl border border-green-200 text-green-700 text-sm font-medium hover:border-red-200 hover:text-red-500 disabled:opacity-60 transition-colors"
    >
      {pending ? <Spinner size="sm" /> : '✓ Following'}
    </button>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd rawaq-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/components/social/UserFollowButton.tsx
git commit -m "feat: UserFollowButton — all five follow state transitions"
```

---

### Task 8: SayHiButton client component

**Files:**
- Create: `rawaq-web/components/social/SayHiButton.tsx`

- [ ] **Step 1: Create the component**

```tsx
// rawaq-web/components/social/SayHiButton.tsx
'use client'

import { useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  targetId: string
  initialAvailable: boolean
}

export function SayHiButton({ targetId, initialAvailable }: Props) {
  const [available, setAvailable] = useState(initialAvailable)
  const [pending, setPending]     = useState(false)

  if (!available) {
    return (
      <button disabled className="px-4 py-2 rounded-xl border border-gray-100 text-gray-400 text-sm cursor-default">
        👋 Said hi today
      </button>
    )
  }

  async function sayHi() {
    setPending(true)
    try {
      const res = await fetch(`/api/users/${targetId}/say-hi`, { method: 'POST' })
      if (res.ok) setAvailable(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={sayHi}
      disabled={pending}
      className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
    >
      {pending ? <Spinner size="sm" /> : 'Say Hi 👋'}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add rawaq-web/components/social/SayHiButton.tsx
git commit -m "feat: SayHiButton with optimistic sent state"
```

---

### Task 9: UserHappeningCard component

**Files:**
- Create: `rawaq-web/components/social/UserHappeningCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// rawaq-web/components/social/UserHappeningCard.tsx
import Link from 'next/link'
import { formatRelativeTime } from '@/lib/utils'

interface Community { name: string; slug: string }
interface HappeningCardProps {
  id: string
  body: string
  created_at: string
  expires_at: string | null
  communities: Community | null
  reactions: Array<{ count: number }>
  rsvps: Array<{ count: number }>
}

export function UserHappeningCard({ body, created_at, expires_at, communities, reactions, rsvps }: HappeningCardProps) {
  const isPast = expires_at ? new Date(expires_at) < new Date() : false
  const reactionCount = reactions?.[0]?.count ?? 0
  const rsvpCount = rsvps?.[0]?.count ?? 0

  return (
    <div className="card p-4 space-y-2">
      {communities && (
        <Link href={`/communities/${communities.slug}`} className="inline-block text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full hover:bg-brand-100 transition-colors">
          {communities.name}
        </Link>
      )}
      <p className="text-sm text-gray-800 line-clamp-3 leading-relaxed">{body}</p>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>{formatRelativeTime(created_at)}</span>
        {reactionCount > 0 && <span>👍 {reactionCount}</span>}
        {rsvpCount > 0 && <span>✋ {rsvpCount}</span>}
        {isPast && <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px] font-medium">Past</span>}
      </div>
    </div>
  )
}

export function UserHappeningCardSkeleton() {
  return (
    <div className="card p-4 space-y-2">
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-3 w-3/4 rounded" />
      <div className="skeleton h-3 w-1/3 rounded" />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add rawaq-web/components/social/UserHappeningCard.tsx
git commit -m "feat: UserHappeningCard component"
```

---

### Task 10: UserProfileTabs client component

**Files:**
- Create: `rawaq-web/components/social/UserProfileTabs.tsx`

- [ ] **Step 1: Create the component**

```tsx
// rawaq-web/components/social/UserProfileTabs.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { UserHappeningCard, UserHappeningCardSkeleton } from './UserHappeningCard'
import { UserFollowButton } from './UserFollowButton'
import type { FollowState } from './UserFollowButton'
import type { EventWithOrganizer, Community } from '@/types/database'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'

interface SharedCommunity {
  id: string
  name: string
  slug: string
  member_count: number
  viewer_is_member: boolean
}

interface Props {
  targetId: string
  followState: FollowState
  isMutual: boolean
  sharedCommunities: SharedCommunity[]
}

type Tab = 'activity' | 'events' | 'communities'

interface Happening {
  id: string
  body: string
  created_at: string
  expires_at: string | null
  communities: { name: string; slug: string } | null
  reactions: Array<{ count: number }>
  rsvps: Array<{ count: number }>
}

export function UserProfileTabs({ targetId, followState, isMutual, sharedCommunities }: Props) {
  const [tab, setTab]                     = useState<Tab>('activity')
  const [happenings, setHappenings]       = useState<Happening[]>([])
  const [happeningsLoaded, setHappeningsLoaded] = useState(false)
  const [happeningsLoading, setHappeningsLoading] = useState(false)
  const [happeningsBefore, setHappeningsBefore] = useState<string | null>(null)
  const [happeningsHasMore, setHappeningsHasMore] = useState(true)

  const [events, setEvents]               = useState<EventWithOrganizer[]>([])
  const [eventsLoaded, setEventsLoaded]   = useState(false)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsOffset, setEventsOffset]   = useState(0)
  const [eventsHasMore, setEventsHasMore] = useState(true)

  const [allCommunities, setAllCommunities]         = useState<Community[]>([])
  const [communitiesLoaded, setCommunitiesLoaded]   = useState(false)
  const [communitiesExpanded, setCommunitiesExpanded] = useState(false)

  async function loadHappenings() {
    if (happeningsLoading) return
    setHappeningsLoading(true)
    const url = `/api/users/${targetId}/happenings?limit=10${happeningsBefore ? `&before=${happeningsBefore}` : ''}`
    const res = await fetch(url)
    if (res.ok) {
      const { data } = await res.json() as { data: Happening[] }
      setHappenings((prev) => [...prev, ...data])
      setHappeningsHasMore(data.length === 10)
      if (data.length > 0) setHappeningsBefore(data[data.length - 1].created_at)
    }
    setHappeningsLoaded(true)
    setHappeningsLoading(false)
  }

  async function loadEvents() {
    if (eventsLoading) return
    setEventsLoading(true)
    const res = await fetch(`/api/users/${targetId}/events?limit=8&offset=${eventsOffset}`)
    if (res.ok) {
      const { data } = await res.json() as { data: EventWithOrganizer[] }
      setEvents((prev) => [...prev, ...data])
      setEventsHasMore(data.length === 8)
      setEventsOffset((o) => o + data.length)
    }
    setEventsLoaded(true)
    setEventsLoading(false)
  }

  async function loadCommunities() {
    const res = await fetch(`/api/communities?member_only=true&user_id=${targetId}`)
    if (res.ok) {
      const { data } = await res.json() as { data: Community[] }
      setAllCommunities(data ?? [])
    }
    setCommunitiesLoaded(true)
  }

  function switchTab(next: Tab) {
    setTab(next)
    if (next === 'activity' && !happeningsLoaded) loadHappenings()
    if (next === 'events' && isMutual && !eventsLoaded) loadEvents()
    if (next === 'communities' && !communitiesLoaded) loadCommunities()
  }

  // Load activity tab data on first render
  if (!happeningsLoaded && tab === 'activity' && !happeningsLoading) {
    loadHappenings()
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="space-y-0">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        <button onClick={() => switchTab('activity')} className={tabClass('activity')}>Activity</button>
        <button onClick={() => switchTab('events')} className={tabClass('events')}>
          Events {!isMutual && <span className="ml-1">🔒</span>}
        </button>
        <button onClick={() => switchTab('communities')} className={tabClass('communities')}>Communities</button>
      </div>

      {/* Activity panel */}
      {tab === 'activity' && (
        <div className="py-4 space-y-3">
          {happeningsLoading && happenings.length === 0 && (
            <>
              <UserHappeningCardSkeleton />
              <UserHappeningCardSkeleton />
              <UserHappeningCardSkeleton />
            </>
          )}
          {happeningsLoaded && happenings.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No public activity yet.</p>
          )}
          {happenings.map((h) => <UserHappeningCard key={h.id} {...h} />)}
          {happeningsHasMore && happeningsLoaded && (
            <button
              onClick={loadHappenings}
              disabled={happeningsLoading}
              className="w-full py-2 text-sm text-brand-600 hover:underline disabled:opacity-50"
            >
              {happeningsLoading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {/* Events panel */}
      {tab === 'events' && (
        <div className="py-4">
          {!isMutual ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-gray-500 text-sm">You both need to follow each other to see attended events.</p>
              {followState === 'none' && (
                <UserFollowButton targetId={targetId} initialState="none" />
              )}
            </div>
          ) : (
            <>
              {eventsLoading && events.length === 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[0,1,2].map((i) => <EventCardSkeleton key={i} />)}
                </div>
              )}
              {eventsLoaded && events.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-10">No events attended yet.</p>
              )}
              {events.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {events.map((e) => <EventCard key={e.id} event={e} priority={false} />)}
                </div>
              )}
              {eventsHasMore && eventsLoaded && (
                <button
                  onClick={loadEvents}
                  disabled={eventsLoading}
                  className="w-full py-2 mt-4 text-sm text-brand-600 hover:underline disabled:opacity-50"
                >
                  {eventsLoading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Communities panel */}
      {tab === 'communities' && (
        <div className="py-4 space-y-6">
          {/* In common */}
          {sharedCommunities.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">In common</h4>
              <div className="space-y-2">
                {sharedCommunities.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100">
                    <Link href={`/communities/${c.slug}`} className="text-sm font-medium text-gray-800 hover:text-brand-600">{c.name}</Link>
                    {!c.viewer_is_member && (
                      <Link href={`/communities/${c.slug}`} className="text-xs text-brand-600 font-medium hover:underline">Join</Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All communities */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">All communities</h4>
            {!communitiesLoaded ? (
              <div className="space-y-2">
                {[0,1,2].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
              </div>
            ) : allCommunities.length === 0 ? (
              <p className="text-sm text-gray-400">Not a member of any public communities.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {(communitiesExpanded ? allCommunities : allCommunities.slice(0, 6)).map((c: any) => (
                    <div key={c.id} className="flex items-center p-3 rounded-xl border border-gray-100">
                      <Link href={`/communities/${c.slug}`} className="text-sm font-medium text-gray-800 hover:text-brand-600">{c.name}</Link>
                    </div>
                  ))}
                </div>
                {allCommunities.length > 6 && (
                  <button
                    onClick={() => setCommunitiesExpanded((v) => !v)}
                    className="text-xs text-brand-600 hover:underline mt-2"
                  >
                    {communitiesExpanded ? 'Show less' : `Show ${allCommunities.length - 6} more`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd rawaq-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/components/social/UserProfileTabs.tsx
git commit -m "feat: UserProfileTabs — activity, events, communities with lazy loading"
```

---

### Task 11: Upgrade `/user/[id]/page.tsx` — full RSC rewrite

**Files:**
- Modify: `rawaq-web/app/(app)/user/[id]/page.tsx`

- [ ] **Step 1: Replace the page with the full RSC implementation**

```tsx
// rawaq-web/app/(app)/user/[id]/page.tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Redis } from '@upstash/redis'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { formatDate } from '@/lib/utils'
import { ReviewSection } from '@/components/social/ReviewSection'
import { PlanBadge } from '@/components/ui/PlanBadge'
import { UserFollowButton } from '@/components/social/UserFollowButton'
import { SayHiButton } from '@/components/social/SayHiButton'
import { UserProfileTabs } from '@/components/social/UserProfileTabs'
import type { UserReviewWithReviewer } from '@/types/database'
import type { FollowState } from '@/components/social/UserFollowButton'

const redis = Redis.fromEnv()

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('profiles').select('display_name').eq('id', id).single()
  return { title: data?.display_name ?? 'User Profile' }
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-xs">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}>★</span>
      ))}
    </span>
  )
}

export default async function PublicUserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin   = createSupabaseAdminClient()
  const supabase = await createSupabaseServerClient()

  // Viewer identity (optional)
  const { data: { user: viewer } } = await supabase.auth.getUser()
  const viewerId = viewer?.id ?? null

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    profileRes,
    viewerRowRes,
    targetRowRes,
    statsRes,
    viewerMembershipsRes,
    targetMembershipsRes,
    allRatingsRes,
    reviewsRes,
    viewerReviewRes,
    sayHiAlready,
  ] = await Promise.all([
    // 1. Profile
    admin.from('profiles').select('id, display_name, avatar_url, city, bio, role, plan_id, created_at').eq('id', id).single(),

    // 2a. Viewer → target follow row
    viewerId
      ? admin.from('user_follows').select('status').eq('follower_id', viewerId).eq('following_id', id).maybeSingle()
      : Promise.resolve({ data: null }),

    // 2b. Target → viewer follow row
    viewerId
      ? admin.from('user_follows').select('status').eq('follower_id', id).eq('following_id', viewerId).maybeSingle()
      : Promise.resolve({ data: null }),

    // 3. Stats
    Promise.all([
      admin.from('happenings').select('id', { count: 'exact', head: true })
        .eq('author_id', id)
        .or(`expires_at.gt.${new Date().toISOString()},created_at.gt.${thirtyDaysAgo}`),
      admin.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', id).eq('status', 'confirmed'),
      admin.from('community_memberships').select('id', { count: 'exact', head: true }).eq('user_id', id).eq('status', 'active'),
    ]),

    // 4a. Viewer memberships (for shared communities)
    viewerId
      ? admin.from('community_memberships').select('community_id').eq('user_id', viewerId).eq('status', 'active')
      : Promise.resolve({ data: [] }),

    // 4b. Target memberships
    admin.from('community_memberships').select('community_id, communities(id, name, slug, member_count)').eq('user_id', id).eq('status', 'active'),

    // 5. All ratings for true average
    admin.from('user_reviews').select('rating').eq('reviewed_id', id),

    // 6. Reviews (first page)
    admin.from('user_reviews').select('*, reviewer:profiles!reviewer_id(id, display_name, avatar_url)', { count: 'exact' })
      .eq('reviewed_id', id).order('created_at', { ascending: false }).limit(20),

    // 7. Viewer's own review
    viewerId && viewerId !== id
      ? admin.from('user_reviews').select('rating, content').eq('reviewer_id', viewerId).eq('reviewed_id', id).maybeSingle()
      : Promise.resolve({ data: null }),

    // 8. Say-hi rate limit check (Redis read-only — no token consumed)
    viewerId && viewerId !== id
      ? redis.exists(`say-hi:${viewerId}:${id}`)
      : Promise.resolve(0),
  ])

  const profile = profileRes.data
  if (!profile || profile.role === 'admin') notFound()

  // Compute FollowState
  const viewerRow = (viewerRowRes as any).data as { status: string } | null
  const targetRow = (targetRowRes as any).data as { status: string } | null

  let followState: FollowState = 'none'
  if (viewerId === id) {
    followState = 'self'
  } else if (viewerRow?.status === 'accepted') {
    followState = 'accepted'
  } else if (viewerRow?.status === 'pending') {
    followState = 'pending_sent'
  } else if (targetRow?.status === 'pending') {
    followState = 'pending_received'
  }

  const isMutual = viewerRow?.status === 'accepted' && targetRow?.status === 'accepted'

  // Stats
  const [happeningsRes, bookingsRes, membershipsCountRes] = statsRes
  const happeningsCount  = happeningsRes.count  ?? 0
  const eventsAttended   = bookingsRes.count    ?? 0
  const communitiesCount = membershipsCountRes.count ?? 0

  // Shared communities
  const viewerCommunityIds = new Set(
    ((viewerMembershipsRes as any).data ?? []).map((m: any) => m.community_id)
  )
  const targetMemberships = (targetMembershipsRes as any).data ?? []
  const sharedCommunities = targetMemberships
    .filter((m: any) => viewerCommunityIds.has(m.community_id) && m.communities)
    .map((m: any) => ({
      id: m.community_id,
      name: m.communities.name,
      slug: m.communities.slug,
      member_count: m.communities.member_count ?? 0,
      viewer_is_member: true,
    }))

  // Ratings
  const allRatings = allRatingsRes.data ?? []
  const avgRating  = allRatings.length > 0
    ? allRatings.reduce((s: number, r: any) => s + r.rating, 0) / allRatings.length
    : null
  const totalReviews   = reviewsRes.count ?? 0
  const reviews        = (reviewsRes.data ?? []) as unknown as UserReviewWithReviewer[]
  const viewerReview   = (viewerReviewRes as any).data as { rating: number; content: string | null } | null

  const sayHiAvailable = !sayHiAlready
  const isLoggedIn     = !!viewerId
  const isSelf         = followState === 'self'

  const initials = profile.display_name
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Profile card */}
      <div className="card p-6 flex items-start gap-5">
        <div className="w-20 h-20 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
            : initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-1.5">
              {profile.display_name}
              <PlanBadge planId={profile.plan_id} size={18} />
            </h1>
            {profile.role === 'organizer' && (
              <span className="text-xs bg-brand-100 text-brand-700 font-semibold px-2 py-0.5 rounded-full">Organizer</span>
            )}
          </div>
          {profile.city && <p className="text-sm text-gray-500 mt-0.5">📍 {profile.city}</p>}
          <p className="text-xs text-gray-400 mt-1">Member since {formatDate(profile.created_at)}</p>
          {profile.bio && (
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">{profile.bio}</p>
          )}
          {avgRating !== null && (
            <div className="flex items-center gap-1.5 mt-2">
              <Stars rating={avgRating} />
              <span className="text-xs font-semibold text-amber-600">{avgRating.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({totalReviews} review{totalReviews !== 1 ? 's' : ''})</span>
            </div>
          )}

          {/* Action buttons */}
          {isLoggedIn && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <UserFollowButton targetId={id} initialState={followState} />
              {!isSelf && (
                <SayHiButton targetId={id} initialAvailable={sayHiAvailable} />
              )}
              {isSelf && (
                <Link href="/profile" className="btn-secondary text-sm">Edit Profile →</Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: '📣', label: 'Happenings',       value: happeningsCount },
          { icon: '🎟️', label: 'Events Attended',  value: eventsAttended },
          { icon: '🏘️', label: 'Communities',      value: communitiesCount },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-xl mb-0.5">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabbed feed */}
      <UserProfileTabs
        targetId={id}
        followState={followState}
        isMutual={!!isMutual}
        sharedCommunities={sharedCommunities}
      />

      {/* Reviews */}
      <ReviewSection
        reviewedId={id}
        reviews={reviews}
        totalReviews={totalReviews}
        avgRating={avgRating}
        viewerReview={viewerReview}
        isLoggedIn={isLoggedIn}
        isSelf={isSelf}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd rawaq-web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Check the page renders locally**

```bash
cd rawaq-web && npm run dev
```

Open `http://localhost:3000/user/<any-real-user-id>`. Verify:
- Profile header renders
- Stats row shows 3 counts
- Activity tab loads happenings (or "No public activity yet")
- Events tab shows 🔒 when not mutual
- Communities tab loads after click

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/(app)/user/[id]/page.tsx
git commit -m "feat: upgrade /user/[id] to full RSC with follow system + tabbed feed"
```

---

### Task 12: Wire up `/api/communities` endpoint for "All communities" tab

The `UserProfileTabs` communities panel fetches `/api/communities?member_only=true&user_id=[id]`. Check if this query param is already supported.

- [ ] **Step 1: Check the communities API**

```bash
grep -r "user_id" rawaq-web/app/api/communities/route.ts
```

- [ ] **Step 2a: If `user_id` param is NOT supported — add it**

In `rawaq-web/app/api/communities/route.ts`, find where the query is built and add:

```ts
const userId = searchParams.get('user_id')
if (userId) {
  // Filter to communities where this specific user is an active member
  query = query.in('id',
    supabase.from('community_memberships').select('community_id').eq('user_id', userId).eq('status', 'active')
  )
}
```

- [ ] **Step 2b: If `user_id` IS supported — no change needed**

- [ ] **Step 3: Verify TypeScript and commit if changed**

```bash
cd rawaq-web && npx tsc --noEmit
git add rawaq-web/app/api/communities/route.ts
git commit -m "feat: support user_id filter in /api/communities for profile tab"
```

---

## Final verification checklist

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `/user/[id]` page loads for a real user ID in dev
- [ ] Viewing own profile: only "Edit Profile →" shown, no Follow/Say Hi
- [ ] Viewing another user as logged-in: Follow and Say Hi buttons visible
- [ ] Clicking Follow sends POST; button transitions to "Requested"
- [ ] Clicking "Requested" cancels (DELETE); button returns to Follow
- [ ] Events tab shows 🔒 for non-mutual; reveals grid after mutual
- [ ] Communities tab loads all public communities after click
- [ ] Notifications page renders without TypeScript errors for new types
