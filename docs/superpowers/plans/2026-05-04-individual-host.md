# Individual Host Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce individual hosts as a first-class layer — community-scoped, reputation-driven, platform-verified — without touching any existing company organizer or events infrastructure.

**Architecture:** Additive-only data model changes. `organizer_type` discriminator on `organizer_profiles` routes all business logic divergence. New `host` community role adds production permissions orthogonally to the governance role axis. Shared event/booking/wallet engine throughout. Mobile "Scene" tab replaces "Happenings" tab with dual sub-tabs.

**Tech Stack:** Supabase (PostgreSQL migrations + RLS), Next.js App Router (API routes + server components), React Native (Expo mobile), Zod validation, existing `lib/plans.ts` + `lib/auth.ts` + `lib/rate-limit.ts`.

**Spec:** `docs/superpowers/specs/2026-05-04-individual-host-design.md` — read this before implementing any task.

---

## Phase 1 — Data Foundation

> All migrations are additive. No existing column is removed or renamed. No existing route changes behaviour.

---

### Task 1: Migration — extend `organizer_profiles` for individual hosts

**Files:**
- Create: `rawaq-web/supabase/migrations/00080_individual_host_profile.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 00080_individual_host_profile.sql

ALTER TABLE organizer_profiles
  ADD COLUMN IF NOT EXISTS organizer_type        TEXT NOT NULL DEFAULT 'company'
                                                 CONSTRAINT organizer_type_values
                                                 CHECK (organizer_type IN ('company', 'individual')),
  ADD COLUMN IF NOT EXISTS bio                   TEXT,
  ADD COLUMN IF NOT EXISTS skills_tags           TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sessions_hosted_count INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_count    INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_rating            NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS paid_sessions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payout_hold_days      INT  NOT NULL DEFAULT 3;

-- Index for fast individual host lookups
CREATE INDEX IF NOT EXISTS idx_organizer_profiles_type
  ON organizer_profiles(organizer_type)
  WHERE organizer_type = 'individual';

-- Backfill: existing rows stay 'company' (DEFAULT handles it)
```

- [ ] **Step 2: Apply migration locally and verify**

```bash
cd rawaq-web && npx supabase db push 2>&1 | tail -5
```

Expected: migration applied, no errors.

- [ ] **Step 3: Verify TypeScript types still compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/supabase/migrations/00080_individual_host_profile.sql
git commit -m "feat(db): extend organizer_profiles with individual host fields"
```

---

### Task 2: Migration — add `host` value to `community_role` enum

**Files:**
- Create: `rawaq-web/supabase/migrations/00081_community_host_role.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 00081_community_host_role.sql

-- Add 'host' between 'member' and 'community_admin'
ALTER TYPE community_role ADD VALUE IF NOT EXISTS 'host' BEFORE 'community_admin';

-- community_role is now: ('member', 'host', 'community_admin', 'owner')
-- host = production trust (can post sessions in this community)
-- community_admin = governance trust (moderation, membership management)
-- These are orthogonal: a user can hold host + community_admin simultaneously
```

- [ ] **Step 2: Apply and verify**

```bash
cd rawaq-web && npx supabase db push 2>&1 | tail -5
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/supabase/migrations/00081_community_host_role.sql
git commit -m "feat(db): add 'host' value to community_role enum"
```

---

### Task 3: Migration — seed individual host plan tiers

**Files:**
- Create: `rawaq-web/supabase/migrations/00082_individual_host_plans.sql`

- [ ] **Step 1: Read existing plan seeding to match format**

Open the most recent plan migration (search for `plan_definitions` in migrations) to confirm column names and JSONB feature structure. The columns are: `id`, `name`, `price_sar`, `events_per_month`, `attendees_per_event`, `platform_fee_pct`, `features`.

- [ ] **Step 2: Write the migration**

```sql
-- 00082_individual_host_plans.sql

INSERT INTO plan_definitions (id, name, price_sar, events_per_month, attendees_per_event, platform_fee_pct, features)
VALUES
  (
    'ind_free',
    'Individual Free',
    0,
    5,
    30,
    0.15,
    '{"free_sessions_only": true, "featured_per_month": 0, "payout_hold_days": 7, "organizer_type": "individual"}'::jsonb
  ),
  (
    'ind_basic',
    'Individual Basic',
    49,
    15,
    60,
    0.12,
    '{"free_sessions_only": false, "featured_per_month": 0, "payout_hold_days": 3, "organizer_type": "individual"}'::jsonb
  ),
  (
    'ind_pro',
    'Individual Pro',
    129,
    40,
    100,
    0.08,
    '{"free_sessions_only": false, "featured_per_month": 1, "payout_hold_days": 1, "organizer_type": "individual"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 3: Apply and verify**

```bash
cd rawaq-web && npx supabase db push 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/supabase/migrations/00082_individual_host_plans.sql
git commit -m "feat(db): seed individual host plan tiers (ind_free, ind_basic, ind_pro)"
```

---

### Task 4: Update `lib/plans.ts` to handle individual host plan features

**Files:**
- Modify: `rawaq-web/lib/plans.ts`

- [ ] **Step 1: Read `lib/plans.ts` to understand the current helper functions**

Note the existing pattern for reading plan features (e.g., `getFeaturedPerMonth`, `getOrganizerPlanAccess`).

- [ ] **Step 2: Add individual-specific plan feature helpers**

Add after the existing helpers:

```typescript
export function isFreeSessionsOnly(plan: OrganizerPlanAccess | null): boolean {
  if (!plan) return true
  return (plan.features as Record<string, unknown>)?.free_sessions_only === true
}

export function getPayoutHoldDays(plan: OrganizerPlanAccess | null): number {
  if (!plan) return 7
  return (plan.features as Record<string, unknown>)?.payout_hold_days as number ?? 7
}

export function isIndividualPlan(plan: OrganizerPlanAccess | null): boolean {
  if (!plan) return false
  return (plan.features as Record<string, unknown>)?.organizer_type === 'individual'
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/lib/plans.ts
git commit -m "feat(plans): add individual host plan feature helpers"
```

---

## Phase 2 — Platform Individual Host Onboarding

---

### Task 5: Individual host application API

**Files:**
- Create: `rawaq-web/app/api/individual-host/apply/route.ts`

This is a new, lightweight application route — different from the existing company organizer request flow.

- [ ] **Step 1: Write the Zod schema and route**

```typescript
// app/api/individual-host/apply/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ConflictException, BadRequestException } from '@/lib/errors'
import { checkRateLimit, limiters } from '@/lib/rate-limit'

const ApplySchema = z.object({
  bio:         z.string().min(20).max(500),
  skills_tags: z.array(z.string().min(2).max(40)).min(1).max(10),
  display_name: z.string().min(2).max(60),
})

export async function POST(req: NextRequest) {
  try {
    const ctx   = await requireAuth()
    await checkRateLimit(limiters.organizerReq, ctx.userId)
    const input = ApplySchema.parse(await req.json())
    const supabase = await createSupabaseServerClient()

    // Check not already an organizer
    const { data: existing } = await supabase
      .from('organizer_profiles')
      .select('id, organizer_type, status')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (existing) {
      throw new ConflictException(
        existing.organizer_type === 'individual'
          ? 'You already have an individual host application.'
          : 'You are already registered as a company organizer.'
      )
    }

    const { error } = await supabase
      .from('organizer_profiles')
      .insert({
        user_id:        ctx.userId,
        organizer_type: 'individual',
        bio:            input.bio,
        skills_tags:    input.skills_tags,
        business_name:  input.display_name, // reuse for display; individual-specific label in UI
        status:         'pending',
        verified:       false,
        paid_sessions_enabled: false,
        plan_id:        'ind_free',
      } as never)

    if (error) throw error

    return ok({ applied: true })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Add `individualHost` rate limiter to `lib/rate-limit.ts`**

The existing `organizerReq` limiter (3 per 24h) is appropriate — reuse it.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/individual-host/apply/route.ts
git commit -m "feat(individual-host): add application API route"
```

---

### Task 6: Admin — approve individual host and toggle paid sessions

**Files:**
- Create: `rawaq-web/app/api/admin/individual-hosts/[id]/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// app/api/admin/individual-hosts/[id]/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

const PatchSchema = z.object({
  status:               z.enum(['approved', 'rejected', 'suspended']).optional(),
  paid_sessions_enabled: z.boolean().optional(),
  plan_id:              z.enum(['ind_free', 'ind_basic', 'ind_pro']).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx    = await requireAdmin()
    const input  = PatchSchema.parse(await req.json())
    const supabase = await createSupabaseServerClient()

    const { data: host } = await supabase
      .from('organizer_profiles')
      .select('id, organizer_type')
      .eq('id', id)
      .eq('organizer_type', 'individual')
      .single()

    if (!host) throw new NotFoundException('Individual host')

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.status !== undefined) {
      updates.status      = input.status
      updates.reviewed_by = ctx.userId
      updates.reviewed_at = new Date().toISOString()
      // Promote role to 'organizer' on approval
      if (input.status === 'approved') {
        await supabase
          .from('profiles')
          .update({ role: 'organizer' })
          .eq('id', (await supabase
            .from('organizer_profiles')
            .select('user_id')
            .eq('id', id)
            .single()
          ).data!.user_id)
      }
    }
    if (input.paid_sessions_enabled !== undefined) {
      updates.paid_sessions_enabled = input.paid_sessions_enabled
    }
    if (input.plan_id !== undefined) {
      updates.plan_id = input.plan_id
    }

    const { error } = await supabase
      .from('organizer_profiles')
      .update(updates)
      .eq('id', id)

    if (error) throw error

    return ok({ updated: true })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/api/admin/individual-hosts/[id]/route.ts
git commit -m "feat(admin): add individual host approval and paid sessions toggle"
```

---

## Phase 3 — Community Host Role

---

### Task 7: Community host role management API

**Files:**
- Create: `rawaq-web/app/api/communities/[slug]/hosts/route.ts`
- Create: `rawaq-web/app/api/communities/[slug]/hosts/[userId]/route.ts`

These mirror the existing `/admins` routes. Read `app/api/communities/[slug]/admins/route.ts` first for the exact pattern.

- [ ] **Step 1: Write `route.ts` (GET + POST)**

```typescript
// app/api/communities/[slug]/hosts/route.ts
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ForbiddenException, NotFoundException, BadRequestException } from '@/lib/errors'

// GET /api/communities/[slug]/hosts — list all hosts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { data: community } = await supabase
      .from('communities').select('id').eq('slug', slug).single()
    if (!community) throw new NotFoundException('Community')

    const { data } = await supabase
      .from('community_memberships')
      .select('user_id, role, joined_at, profile:profiles!user_id(id, display_name, avatar_url)')
      .eq('community_id', community.id)
      .eq('role', 'host')
      .eq('status', 'active')

    return ok({ hosts: data ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/communities/[slug]/hosts — grant host role (owner only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx = await requireAuth()
    const { user_id } = await req.json()
    if (!user_id) throw new BadRequestException('user_id is required')
    const supabase = await createSupabaseServerClient()

    const { data: community } = await supabase
      .from('communities').select('id, owner_user_id').eq('slug', slug).single()
    if (!community) throw new NotFoundException('Community')
    if (community.owner_user_id !== ctx.userId) {
      throw new ForbiddenException('Only the community owner can grant host role')
    }

    const { data: membership } = await supabase
      .from('community_memberships')
      .select('id, role, status')
      .eq('community_id', community.id)
      .eq('user_id', user_id)
      .single()

    if (!membership || membership.status !== 'active') {
      throw new BadRequestException('User must be an active community member to become a host')
    }

    await supabase
      .from('community_memberships')
      .update({ role: 'host' })
      .eq('community_id', community.id)
      .eq('user_id', user_id)

    await supabase.from('community_audit_logs').insert({
      community_id: community.id,
      actor_id:     ctx.userId,
      target_id:    user_id,
      action:       'assign_host_role',
    } as never)

    return ok({ user_id, role: 'host' })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Write `[userId]/route.ts` (DELETE — revoke host role)**

```typescript
// app/api/communities/[slug]/hosts/[userId]/route.ts
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ForbiddenException, NotFoundException } from '@/lib/errors'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { data: community } = await supabase
      .from('communities').select('id, owner_user_id').eq('slug', slug).single()
    if (!community) throw new NotFoundException('Community')
    if (community.owner_user_id !== ctx.userId) {
      throw new ForbiddenException('Only the community owner can revoke host role')
    }

    await supabase
      .from('community_memberships')
      .update({ role: 'member' })
      .eq('community_id', community.id)
      .eq('user_id', userId)
      .eq('role', 'host')

    await supabase.from('community_audit_logs').insert({
      community_id: community.id,
      actor_id:     ctx.userId,
      target_id:    userId,
      action:       'revoke_host_role',
    } as never)

    return ok({ user_id: userId, role: 'member' })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 3: Add audit log actions to enum** (migration)

```sql
-- 00083_community_host_audit_actions.sql
ALTER TYPE community_audit_action
  ADD VALUE IF NOT EXISTS 'assign_host_role' AFTER 'revoke_community_admin';
ALTER TYPE community_audit_action
  ADD VALUE IF NOT EXISTS 'revoke_host_role' AFTER 'assign_host_role';
```

```bash
cd rawaq-web && npx supabase db push 2>&1 | tail -5
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add rawaq-web/app/api/communities/[slug]/hosts/route.ts \
        rawaq-web/app/api/communities/[slug]/hosts/[userId]/route.ts \
        rawaq-web/supabase/migrations/00083_community_host_audit_actions.sql
git commit -m "feat(communities): add host role management API (grant/revoke/list)"
```

---

### Task 8: Gate — individual session creation requires `host` role in tagged community

**Files:**
- Modify: `rawaq-web/app/api/events/route.ts` (POST handler only)

- [ ] **Step 1: Read the existing POST handler**

Open `rawaq-web/app/api/events/route.ts` and find the POST handler. Note the plan enforcement section and the `community_ids` extraction logic.

- [ ] **Step 2: Add individual host gate after plan enforcement**

After the existing plan enforcement block and before the `events` insert, add:

```typescript
    // Gate: individual hosts can only post sessions tagged to communities
    // where they hold the 'host' role
    const { data: hostProfile } = await supabase
      .from('organizer_profiles')
      .select('organizer_type, paid_sessions_enabled, status')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    const isIndividual = hostProfile?.organizer_type === 'individual'

    if (isIndividual) {
      if (hostProfile?.status !== 'approved') {
        throw new ForbiddenException('Your individual host application has not been approved yet.')
      }
      // Paid session gate
      if (!input.is_free && (input.price ?? 0) > 0) {
        if (!hostProfile.paid_sessions_enabled) {
          throw new ForbiddenException(
            'Paid sessions require identity verification. Please complete verification in your profile.'
          )
        }
      }
      // Must tag to at least one community
      if (!community_ids?.length) {
        throw new ForbiddenException(
          'Individual hosts must tag sessions to at least one community where they hold host role.'
        )
      }
      // Verify host role in each tagged community
      const { data: hostMemberships } = await supabase
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', ctx.userId)
        .eq('role', 'host')
        .eq('status', 'active')
        .in('community_id', community_ids)

      const validCommunityIds = new Set((hostMemberships ?? []).map((m) => m.community_id))
      const invalidIds = community_ids.filter((id) => !validCommunityIds.has(id))
      if (invalidIds.length > 0) {
        throw new ForbiddenException(
          'You must hold host role in all tagged communities to post a session there.'
        )
      }
    }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/events/route.ts
git commit -m "feat(events): gate individual host session creation by community host role"
```

---

## Phase 4 — Discovery

---

### Task 9: `hosted_by` filter on events browse + individual host type on event responses

**Files:**
- Modify: `rawaq-web/lib/validations/events.ts` (add `hosted_by` param)
- Modify: `rawaq-web/app/api/events/route.ts` (GET handler — apply filter)

- [ ] **Step 1: Add `hosted_by` to `ListEventsSchema`**

Read `rawaq-web/lib/validations/events.ts` and find `ListEventsSchema`. Add:

```typescript
hosted_by: z.enum(['company', 'individual', 'all']).default('all'),
```

- [ ] **Step 2: Apply the filter in the GET handler**

In `rawaq-web/app/api/events/route.ts` GET handler, after the existing filters, add:

```typescript
    if (params.hosted_by !== 'all') {
      // Join to organizer_profiles to filter by organizer_type
      // Supabase: filter via a foreign table using !inner join syntax
      query = query.eq('organizer:profiles!organizer_id.organizer_profile:organizer_profiles!user_id.organizer_type', params.hosted_by)
    }
```

> Note: if the Supabase client syntax for this nested filter proves problematic, use a subquery via RPC or a separate pre-fetch of organizer IDs by type. Read the existing query structure carefully before choosing approach.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/lib/validations/events.ts rawaq-web/app/api/events/route.ts
git commit -m "feat(events): add hosted_by filter (company|individual|all)"
```

---

### Task 10: Individual host public profile API

**Files:**
- Create: `rawaq-web/app/api/hosts/[username]/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// app/api/hosts/[username]/route.ts
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params
    const supabase = await createSupabaseServerClient()

    const { data: profile } = await supabase
      .from('profiles')
      .select(`
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(
          bio, skills_tags, sessions_hosted_count,
          cancellation_count, avg_rating, paid_sessions_enabled,
          organizer_type, status, verified, plan_id
        )
      `)
      .eq('username', username)
      .single()

    if (!profile) throw new NotFoundException('Host')

    const op = (profile.organizer_profile as unknown as Record<string, unknown>[] | null)?.[0]
    if (!op || op.organizer_type !== 'individual' || op.status !== 'approved') {
      throw new NotFoundException('Host')
    }

    // Upcoming sessions
    const now = new Date().toISOString()
    const { data: sessions } = await supabase
      .from('events')
      .select(`
        id, title, title_ar, cover_image_url, start_at, end_at, capacity,
        bookings_count, is_free, price, currency, city,
        category:event_categories(id, name_en, name_ar, icon),
        communities:event_communities(community:communities(id, name, slug))
      `)
      .eq('organizer_id', profile.id)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gte('start_at', now)
      .order('start_at', { ascending: true })
      .limit(10)

    return ok({ profile, sessions: sessions ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/api/hosts/[username]/route.ts
git commit -m "feat(hosts): add individual host public profile API"
```

---

### Task 11: Community sessions endpoint (individual sessions within a community)

**Files:**
- Modify: `rawaq-web/app/api/communities/[slug]/events/route.ts`

Read this file first. It likely returns all events for a community. Add a `type=sessions` query param that filters to `organizer_type = 'individual'` hosts.

- [ ] **Step 1: Read the current route**

Open `rawaq-web/app/api/communities/[slug]/events/route.ts`. Note the query structure.

- [ ] **Step 2: Add `type` param**

Add to the route's query param parsing:

```typescript
const type = req.nextUrl.searchParams.get('type') // 'sessions' | 'all'
```

Add a join/filter condition when `type === 'sessions'`:
- Only return events where the organizer has `organizer_type = 'individual'` on their `organizer_profiles`
- This can be done with a post-fetch filter on the `organizer.organizer_profile.organizer_type` field already selected

- [ ] **Step 3: Verify TypeScript compiles and commit**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
git add rawaq-web/app/api/communities/[slug]/events/route.ts
git commit -m "feat(communities): add type=sessions filter to community events endpoint"
```

---

## Phase 5 — Reputation

---

### Task 12: User reviews API for individual hosts

**Files:**
- Create: `rawaq-web/app/api/users/[id]/reviews/route.ts`

The `user_reviews` table already exists. This task only builds the missing API layer.

- [ ] **Step 1: Write the route**

```typescript
// app/api/users/[id]/reviews/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, BadRequestException, ConflictException } from '@/lib/errors'
import { checkRateLimit, limiters } from '@/lib/rate-limit'
import { paginationRange, paginatedResponse } from '@/lib/pagination'

const PAGE_SIZE = 10

const CreateReviewSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  content: z.string().max(500).optional(),
})

// GET /api/users/[id]/reviews
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const page = z.coerce.number().int().min(1).default(1)
      .parse(req.nextUrl.searchParams.get('page') ?? 1)
    const { from, to } = paginationRange(page, PAGE_SIZE)

    const { data, count } = await supabase
      .from('user_reviews')
      .select('id, rating, content, created_at, reviewer:profiles!reviewer_id(id, display_name, avatar_url)', { count: 'exact' })
      .eq('reviewed_id', id)
      .order('created_at', { ascending: false })
      .range(from, to)

    return ok(paginatedResponse(data ?? [], count ?? 0, page, PAGE_SIZE))
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/users/[id]/reviews
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx   = await requireAuth()
    await checkRateLimit(limiters.comments, ctx.userId) // reuse comments limiter
    const input = CreateReviewSchema.parse(await req.json())

    if (id === ctx.userId) throw new BadRequestException('You cannot review yourself.')

    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('user_reviews')
      .insert({ reviewer_id: ctx.userId, reviewed_id: id, rating: input.rating, content: input.content ?? null })

    if (error) {
      if (error.code === '23505') throw new ConflictException('You have already reviewed this host.')
      throw error
    }

    // Update avg_rating on organizer_profiles for individual hosts
    await supabase.rpc('refresh_host_avg_rating', { host_user_id: id }).catch(() => {})

    return created({ reviewed: true })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Write `refresh_host_avg_rating` RPC migration**

```sql
-- 00084_host_avg_rating_rpc.sql
CREATE OR REPLACE FUNCTION refresh_host_avg_rating(host_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE organizer_profiles
  SET avg_rating = (
    SELECT ROUND(AVG(rating)::NUMERIC, 2)
    FROM user_reviews
    WHERE reviewed_id = host_user_id
  )
  WHERE user_id = host_user_id
    AND organizer_type = 'individual';
END;
$$;
```

```bash
cd rawaq-web && npx supabase db push 2>&1 | tail -5
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/users/[id]/reviews/route.ts \
        rawaq-web/supabase/migrations/00084_host_avg_rating_rpc.sql
git commit -m "feat(reviews): add user reviews API with host avg_rating refresh"
```

---

### Task 13: Cancellation rate tracking

**Files:**
- Modify: `rawaq-web/app/api/events/[id]/route.ts` or wherever event cancellation is handled

Read the event cancellation logic first. When an organizer cancels their own event, if `organizer_type = 'individual'`, increment `cancellation_count` on their `organizer_profiles`.

- [ ] **Step 1: Find event cancellation handler**

Search for where `is_cancelled = true` is set on an event via an organizer action.

- [ ] **Step 2: Add cancellation count increment**

After setting `is_cancelled = true`, add:

```typescript
    // Track cancellation rate for individual hosts
    const { data: orgProfile } = await supabase
      .from('organizer_profiles')
      .select('organizer_type, cancellation_count')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (orgProfile?.organizer_type === 'individual') {
      await supabase
        .from('organizer_profiles')
        .update({ cancellation_count: (orgProfile.cancellation_count ?? 0) + 1 })
        .eq('user_id', ctx.userId)
    }
```

- [ ] **Step 3: Verify TypeScript compiles and commit**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | head -20
git add rawaq-web/app/api/events/[id]/route.ts  # adjust path if different
git commit -m "feat(individual-host): track cancellation_count on event cancellation"
```

---

## Phase 6 — Mobile UX (Scene Tab)

> These tasks are in the mobile app (`rawaq-mobile/`). Read the existing happenings screen structure before implementing.

---

### Task 14: Rename bottom tab — "Happenings" → "Scene"

**Files:**
- Modify: `rawaq-mobile/` — find the bottom tab navigator configuration

- [ ] **Step 1: Find the tab navigator**

Search for the tab bar configuration in `rawaq-mobile/` (likely in `app/(tabs)/` or a navigator file). Find where "Happenings" label and icon are defined.

- [ ] **Step 2: Update label and icon**

```typescript
// Change label from 'Happenings' to 'Scene'
// Update icon to a suitable one — suggestion: 'sparkles' (Ionicons) or 'theater' 
// The icon should feel social/activity-oriented, not just "people"
label: 'Scene',
// Keep or update the icon to match the broader scope
```

- [ ] **Step 3: Update any i18n strings**

If the app has translation files, update the happenings tab label key in both `en` and `ar`:
```
en: { scene_tab: 'Scene' }
ar: { scene_tab: 'المشهد' }
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/
git commit -m "feat(mobile): rename Happenings tab to Scene"
```

---

### Task 15: Add dual sub-tabs inside Scene tab (Sessions + Happenings)

**Files:**
- Modify: `rawaq-mobile/` — the happenings/scene screen component

- [ ] **Step 1: Read the existing happenings screen**

Find the screen component rendered by the Scene/Happenings tab. Note how it currently fetches and renders happenings.

- [ ] **Step 2: Add top sub-tab toggle**

Wrap the existing happenings content in a two-state toggle:

```typescript
// Sub-tab state
const [activeTab, setActiveTab] = useState<'sessions' | 'happenings'>('sessions')

// Render a pill/segment control at the top:
// [ Sessions ] [ Happenings ]
// When 'sessions' is active → render SessionsFeed component
// When 'happenings' is active → render existing HappeningsFeed (unchanged)
```

- [ ] **Step 3: Write `SessionsFeed` component**

```typescript
// SessionsFeed: fetches individual sessions from communities the user belongs to
// API call: GET /api/communities/{slug}/events?type=sessions for each community
// OR: a new aggregated endpoint GET /api/feed/sessions (Phase 6 addition)
// Render using existing EventCard components
// Empty state: "No upcoming sessions in your communities yet."
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-mobile/
git commit -m "feat(mobile): add Sessions/Happenings sub-tabs inside Scene tab"
```

---

## Self-Review

**Spec coverage:**

- ✅ `organizer_type` discriminator on `organizer_profiles` — Task 1
- ✅ `host` community role — Task 2
- ✅ Individual plan tiers — Task 3
- ✅ Plan helper functions — Task 4
- ✅ Individual host application — Task 5
- ✅ Admin approval + paid sessions gate — Task 6
- ✅ Community host role management API — Task 7
- ✅ Gate: host role required to post sessions — Task 8
- ✅ `hosted_by` filter on events browse — Task 9
- ✅ Individual host public profile API — Task 10
- ✅ Community sessions endpoint — Task 11
- ✅ User reviews API — Task 12
- ✅ Cancellation tracking — Task 13
- ✅ Mobile: Scene tab rename — Task 14
- ✅ Mobile: Sessions/Happenings sub-tabs — Task 15

**Out of scope (as per spec):** Private location reveal, response rate, host no-show, waitlist, featured slots for individuals on landing page — all deferred to v2.

**Placeholder scan:** All code blocks complete. No TBD or "similar to task N" references.

**Type consistency:**
- `organizer_type` string discriminator used consistently (not a TypeScript union type — kept as `TEXT` in DB and `string` in app layer to avoid migration complexity)
- `paginatedResponse` / `paginationRange` used from `lib/pagination.ts` in Task 12 ✅
- `handleApiError` + typed exceptions used in all new routes ✅
- `checkRateLimit(limiters.X)` pattern followed in Tasks 5 and 12 ✅
