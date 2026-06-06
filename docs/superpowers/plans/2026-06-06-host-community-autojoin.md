# Host Community + Auto-Join on Booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an approved organizer/host run one opt-in "host community" and prompt attendees to join it after a confirmed booking.

**Architecture:** Reuse the existing `communities` + `community_memberships` stack. A host community is a normal `communities` row tagged `kind='host'`, created idempotently via a `SECURITY DEFINER` RPC. The join prompt is resolved on the booking-confirmation surface (gated on `status='confirmed'`) so it works for free, simulated, and async-paid flows alike.

**Tech Stack:** Next.js App Router (route handlers), Supabase Postgres (SQL migrations, RLS, RPC), TypeScript, zod. Verification: `npm run type-check`, `npm run lint`, SQL assertions, manual API/UI checks. No test runner.

**Spec:** `docs/superpowers/specs/2026-06-06-host-community-autojoin-design.md`

---

## Conventions (read once)

- Route handlers follow the existing pattern: `requireAuth`/`optionalAuth` from `@/lib/auth`; `ok`/`created`/`handleApiError` and exception classes from `@/lib/errors`; `createSupabaseAdminClient` from `@/lib/supabase/admin`; `checkRateLimit`/`limiters` from `@/lib/rate-limit`; zod for input.
- Migrations live in `rawaq-web/supabase/migrations/` with `0XXXX_` numbering. Apply via the project's normal method (e.g. `npx supabase db push` or `npx supabase migration up`); verify with the SQL blocks given.
- After **every** code task: `npm run type-check` and `npm run lint` must pass (run from `rawaq-web/`).
- Commit after each task.

## File Structure

- Create `rawaq-web/supabase/migrations/00093_host_communities.sql` — columns, partial unique index, `ensure_host_community` RPC, integrity trigger.
- Modify `rawaq-web/types/database.ts` — `communities.kind`, `organizer_profiles.host_community_*`, `SuggestedCommunity` type.
- Create `rawaq-web/lib/host-community.ts` — `resolveHostCommunitySuggestion()` (suppression rule) + `HostCommunitySummary` shape.
- Create `rawaq-web/app/api/organizer/host-community/route.ts` — GET/POST/PATCH toggle.
- Create `rawaq-web/app/api/bookings/[id]/host-community-suggestion/route.ts` — confirmed-only suggestion.
- Modify `rawaq-web/app/api/communities/route.ts` and `.../communities/trending/route.ts` — discovery exclusion + `kind` in SELECT.
- Modify `rawaq-web/app/api/bookings/route.ts` and `.../payments/initiate/route.ts` — optional convenience hint.
- Create organizer dashboard toggle component + booking-confirmation prompt component (paths in Tasks 9–10).

---

### Task 1: Migration — schema, index, RPC, integrity trigger

**Files:**
- Create: `rawaq-web/supabase/migrations/00093_host_communities.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 00093 · Host communities: organizer-owned "host" community + opt-in + idempotent RPC

-- 1. Discriminator on communities
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard'
    CHECK (kind IN ('standard', 'host'));

CREATE INDEX IF NOT EXISTS communities_kind_idx ON communities(kind);

-- At most one host community per owner
CREATE UNIQUE INDEX IF NOT EXISTS communities_one_host_per_owner
  ON communities(owner_user_id)
  WHERE kind = 'host';

-- 2. Opt-in pointer + flag on organizer_profiles
ALTER TABLE organizer_profiles
  ADD COLUMN IF NOT EXISTS host_community_id UUID REFERENCES communities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS host_community_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Idempotent, concurrency-safe creation + enable
CREATE OR REPLACE FUNCTION ensure_host_community(
  p_owner   UUID,
  p_name    TEXT,
  p_name_ar TEXT,
  p_country TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   UUID;
  v_slug TEXT;
BEGIN
  -- Reuse existing host community if present
  SELECT id INTO v_id
  FROM communities
  WHERE owner_user_id = p_owner AND kind = 'host'
  LIMIT 1;

  IF v_id IS NULL THEN
    v_id   := gen_random_uuid();
    v_slug := 'host-' || replace(v_id::text, '-', '');

    INSERT INTO communities (
      id, name, name_ar, slug, level, type, country,
      is_verified, is_private, approval_status, kind,
      owner_user_id, created_by
    )
    VALUES (
      v_id, p_name, p_name_ar, v_slug, 'interest', 'other', UPPER(COALESCE(p_country, 'SA')),
      false, false, 'approved', 'host',
      p_owner, p_owner
    )
    ON CONFLICT (owner_user_id) WHERE kind = 'host'
    DO NOTHING;

    -- If a concurrent caller won the race, pick up their row
    IF NOT FOUND THEN
      SELECT id INTO v_id
      FROM communities
      WHERE owner_user_id = p_owner AND kind = 'host'
      LIMIT 1;
    END IF;
  END IF;

  -- Ensure owner membership exists & active
  INSERT INTO community_memberships (community_id, user_id, role, status, timeout_until, status_updated_at)
  VALUES (v_id, p_owner, 'owner', 'active', NULL, NOW())
  ON CONFLICT (community_id, user_id)
  DO UPDATE SET status = 'active', role = 'owner', status_updated_at = NOW();

  -- Flip the opt-in pointer/flag
  UPDATE organizer_profiles
  SET host_community_id = v_id, host_community_enabled = true
  WHERE user_id = p_owner;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION ensure_host_community(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_host_community(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 4. Integrity guard: host_community_id must point to an owned host community
CREATE OR REPLACE FUNCTION fn_validate_host_community_pointer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.host_community_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM communities c
      WHERE c.id = NEW.host_community_id
        AND c.kind = 'host'
        AND c.owner_user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'host_community_id must reference a host community owned by this organizer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_host_community_pointer ON organizer_profiles;
CREATE TRIGGER trg_validate_host_community_pointer
  BEFORE INSERT OR UPDATE OF host_community_id ON organizer_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_validate_host_community_pointer();
```

- [ ] **Step 2: Apply the migration**

Run (from `rawaq-web/`): `npx supabase db push` (or your project's migration-apply command).
Expected: applies `00093` with no errors.

- [ ] **Step 3: SQL verification**

Run in the SQL editor / psql:

```sql
-- column + index exist
SELECT column_name FROM information_schema.columns
 WHERE table_name='communities' AND column_name='kind';                 -- 1 row
SELECT indexname FROM pg_indexes WHERE indexname='communities_one_host_per_owner'; -- 1 row

-- RPC creates exactly one, idempotently (use a real organizer user id)
SELECT ensure_host_community('<ORG_UUID>','Test Host','تجريبي','SA');   -- returns uuid
SELECT ensure_host_community('<ORG_UUID>','Test Host','تجريبي','SA');   -- SAME uuid
SELECT count(*) FROM communities WHERE owner_user_id='<ORG_UUID>' AND kind='host'; -- 1
SELECT count(*) FROM community_memberships
 WHERE user_id='<ORG_UUID>' AND role='owner' AND status='active';       -- >=1

-- integrity guard rejects a bad pointer
DO $$ BEGIN
  UPDATE organizer_profiles SET host_community_id = gen_random_uuid() WHERE user_id='<ORG_UUID>';
  RAISE EXCEPTION 'should not reach here';
EXCEPTION WHEN others THEN RAISE NOTICE 'guard works: %', SQLERRM; END $$;
```

Expected: counts are exactly 1; second RPC call returns the same UUID; guard raises.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/supabase/migrations/00093_host_communities.sql
git commit -m "feat(db): host community schema + ensure_host_community RPC"
```

---

### Task 2: Type definitions

**Files:**
- Modify: `rawaq-web/types/database.ts`

- [ ] **Step 1: Add the types**

Add `kind: 'standard' | 'host'` to the `communities` row type; add `host_community_id: string | null` and `host_community_enabled: boolean` to the `organizer_profiles` row type. Add a shared shape:

```ts
export type SuggestedCommunity = {
  id: string
  slug: string
  name: string
  name_ar: string | null
  cover_url: string | null
  member_count: number
}
```

(Match the existing style in this file — if it uses generated Supabase types, add `kind` to the relevant `Row`/`Insert`/`Update` and put `SuggestedCommunity` near other hand-written API types.)

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/types/database.ts
git commit -m "feat(types): host community kind + organizer host_community fields"
```

---

### Task 3: Suggestion helper (suppression rule)

**Files:**
- Create: `rawaq-web/lib/host-community.ts`

- [ ] **Step 1: Implement the helper**

```ts
import type { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { SuggestedCommunity } from '@/types/database'

type Admin = ReturnType<typeof createSupabaseAdminClient>

// Membership statuses that SUPPRESS the join prompt.
// none / 'removed' => suggest (join route reactivates 'removed').
const SUPPRESSING_STATUSES = new Set(['active', 'timed_out', 'banned'])

/**
 * Returns the organizer's host community to suggest to `userId`, or null.
 * Caller is responsible for confirming the booking is in 'confirmed' status.
 * Never throws — resolves to null on any error.
 */
export async function resolveHostCommunitySuggestion(
  admin: Admin,
  organizerId: string,
  userId: string,
): Promise<SuggestedCommunity | null> {
  try {
    const { data: org } = await admin
      .from('organizer_profiles')
      .select('host_community_id, host_community_enabled')
      .eq('user_id', organizerId)
      .maybeSingle()

    if (!org?.host_community_enabled || !org.host_community_id) return null

    const { data: community } = await admin
      .from('communities')
      .select('id, slug, name, name_ar, cover_url, member_count')
      .eq('id', org.host_community_id)
      .maybeSingle()

    if (!community) return null

    const { data: membership } = await admin
      .from('community_memberships')
      .select('status')
      .eq('community_id', community.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (membership && SUPPRESSING_STATUSES.has(membership.status)) return null

    return community as SuggestedCommunity
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/lib/host-community.ts
git commit -m "feat(lib): host community suggestion resolver with suppression rule"
```

---

### Task 4: Organizer toggle endpoint

**Files:**
- Create: `rawaq-web/app/api/organizer/host-community/route.ts`

- [ ] **Step 1: Implement GET/POST/PATCH**

```ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, ForbiddenException, NotFoundException } from '@/lib/errors'
import { checkRateLimit, limiters } from '@/lib/rate-limit'

async function loadOrganizer(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const { data } = await admin
    .from('organizer_profiles')
    .select('user_id, status, business_name, business_name_ar, host_community_id, host_community_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

async function summary(admin: ReturnType<typeof createSupabaseAdminClient>, communityId: string | null) {
  if (!communityId) return null
  const { data } = await admin
    .from('communities')
    .select('id, slug, name, name_ar, cover_url, member_count')
    .eq('id', communityId)
    .maybeSingle()
  return data ?? null
}

export async function GET() {
  try {
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    const org = await loadOrganizer(admin, ctx.userId)
    if (!org) throw new NotFoundException('Organizer profile')
    return ok({
      enabled: org.host_community_enabled,
      community: await summary(admin, org.host_community_id),
    })
  } catch (err) { return handleApiError(err) }
}

export async function POST() {
  try {
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    const org = await loadOrganizer(admin, ctx.userId)
    if (!org) throw new NotFoundException('Organizer profile')
    if (org.status !== 'approved') {
      throw new ForbiddenException('Only approved organizers can create a host community')
    }
    await checkRateLimit(limiters.communityCreate, ctx.userId)

    const name = `${org.business_name} Community`
    const nameAr = org.business_name_ar ? `مجتمع ${org.business_name_ar}` : null

    const { data: newId, error } = await admin.rpc('ensure_host_community', {
      p_owner: ctx.userId,
      p_name: name,
      p_name_ar: nameAr,
      p_country: 'SA',
    })
    if (error) throw error

    return ok({ enabled: true, community: await summary(admin, newId as string) })
  } catch (err) { return handleApiError(err) }
}

export async function PATCH() {
  try {
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()
    const org = await loadOrganizer(admin, ctx.userId)
    if (!org) throw new NotFoundException('Organizer profile')

    const { error } = await admin
      .from('organizer_profiles')
      .update({ host_community_enabled: false })
      .eq('user_id', ctx.userId)
    if (error) throw error

    return ok({ enabled: false, community: await summary(admin, org.host_community_id) })
  } catch (err) { return handleApiError(err) }
}
```

> Admin-on-behalf (`organizer_id` param) is deferred; the spec allows it but it is not required for v1. If added later, accept a body param and require `ctx.role === 'admin'`.

- [ ] **Step 2: Verify**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual check**

With an approved-organizer session cookie:
```bash
curl -X POST http://localhost:3000/api/organizer/host-community -b "<cookie>"   # {enabled:true, community:{...}}
curl http://localhost:3000/api/organizer/host-community -b "<cookie>"           # same community
curl -X PATCH http://localhost:3000/api/organizer/host-community -b "<cookie>"  # {enabled:false,...}
```
With a non-approved organizer: POST returns 403.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/organizer/host-community/route.ts
git commit -m "feat(api): organizer host-community opt-in toggle"
```

---

### Task 5: Confirmed-booking suggestion endpoint

**Files:**
- Create: `rawaq-web/app/api/bookings/[id]/host-community-suggestion/route.ts`

- [ ] **Step 1: Implement GET**

```ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { resolveHostCommunitySuggestion } from '@/lib/host-community'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data: booking } = await admin
      .from('bookings')
      .select('id, user_id, status, event:events(organizer_id)')
      .eq('id', id)
      .maybeSingle()

    if (!booking || booking.user_id !== ctx.userId) {
      throw new NotFoundException('Booking')
    }
    if (booking.status !== 'confirmed') {
      return ok({ suggested_community: null })
    }

    const organizerId = (booking.event as unknown as { organizer_id: string } | null)?.organizer_id
    if (!organizerId) return ok({ suggested_community: null })

    const suggested = await resolveHostCommunitySuggestion(admin, organizerId, ctx.userId)
    return ok({ suggested_community: suggested })
  } catch (err) { return handleApiError(err) }
}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual check**

```bash
# confirmed booking for an organizer with host community enabled, user not a member
curl http://localhost:3000/api/bookings/<CONFIRMED_ID>/host-community-suggestion -b "<cookie>"
# => { suggested_community: { id, slug, name, ... } }
# pending booking, or already-active member, or disabled organizer => suggested_community: null
# booking owned by someone else => 404
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/bookings/[id]/host-community-suggestion/route.ts
git commit -m "feat(api): confirmed-booking host community suggestion endpoint"
```

---

### Task 6: Discovery exclusion (list + trending)

**Files:**
- Modify: `rawaq-web/app/api/communities/route.ts`
- Modify: `rawaq-web/app/api/communities/trending/route.ts`

- [ ] **Step 1: Exclude host communities from the browse list**

In `communities/route.ts`, add `kind` to both `COMMUNITY_LIST_SELECT` and `COMMUNITY_LIST_SELECT_LEGACY`. Inside `buildQuery`, after the existing filters, add:

```ts
// Host communities are excluded from generic browse; only surfaced via
// member_only ("my communities"), user_id lists, direct slug, and profiles.
if (!params.member_only && !params.user_id) {
  query = query.eq('kind', 'standard')
}
```

Guard the new `kind` column the same way the route already guards `parent_community_id`/`approval_status`: if a Supabase error message includes `kind`, fall back to the legacy select without the filter.

- [ ] **Step 2: Exclude host communities from trending**

In `trending/route.ts`, add `kind` to `COMMUNITY_SELECT` and `COMMUNITY_SELECT_LEGACY`, and add `.eq('kind', 'standard')` to the primary `communities` select (the `.limit(100)` query) and its legacy fallback.

- [ ] **Step 3: Verify**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual check**

```bash
curl "http://localhost:3000/api/communities?level=interest"   # host communities absent
curl "http://localhost:3000/api/communities/trending"         # host communities absent
curl "http://localhost:3000/api/communities?member_only=true" -b "<owner-cookie>"  # owner's host community present
curl "http://localhost:3000/api/communities/host-xxxx"        # direct slug still resolves
```

- [ ] **Step 5: Commit**

```bash
git add rawaq-web/app/api/communities/route.ts rawaq-web/app/api/communities/trending/route.ts
git commit -m "feat(api): exclude host communities from browse and trending"
```

---

### Task 7: Convenience hint on immediate-confirm POSTs (optional but recommended)

**Files:**
- Modify: `rawaq-web/app/api/bookings/route.ts`
- Modify: `rawaq-web/app/api/payments/initiate/route.ts`

- [ ] **Step 1: Add the hint to the free booking response**

In `bookings/route.ts` POST, before `return created(booking)`, compute and attach the suggestion (booking is already `confirmed` here):

```ts
import { resolveHostCommunitySuggestion } from '@/lib/host-community'
// ...
const suggested_community = await resolveHostCommunitySuggestion(admin, event.organizer_id, ctx.userId)
return created({ ...booking, suggested_community })
```

- [ ] **Step 2: Add the hint to the free/simulated payment branches**

In `payments/initiate/route.ts`, in the `isFreeBooking` early return and the `gateway === 'simulated'` success branch (both confirm immediately), attach the same field:

```ts
import { resolveHostCommunitySuggestion } from '@/lib/host-community'
// free branch:
const suggested_community = await resolveHostCommunitySuggestion(admin, event.organizer_id, ctx.userId)
return created({ booking, payment: null, free: true, suggested_community })
// simulated success branch: add `suggested_community` to that created({...}) object too.
```

Leave the real-gateway path untouched (still `pending` → client uses Task 5 on the confirmation screen).

- [ ] **Step 3: Verify**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual check**

Book a free event from an enabled organizer → response includes `suggested_community`. Book a free event from a non-enabled organizer → `suggested_community: null`.

- [ ] **Step 5: Commit**

```bash
git add rawaq-web/app/api/bookings/route.ts rawaq-web/app/api/payments/initiate/route.ts
git commit -m "feat(api): attach host community hint on immediate-confirm bookings"
```

---

### Task 8: Organizer dashboard toggle UI

**Files:**
- Create: `rawaq-web/components/organizer/HostCommunityCard.tsx`
- Modify: the organizer dashboard page that should host it (e.g. `rawaq-web/app/(app)/organizer/page.tsx` or the organizer settings/profile page — place next to other organizer settings).

- [ ] **Step 1: Build the card**

A client component that on mount `GET`s `/api/organizer/host-community`, shows the enabled state + community link, and a toggle that `POST`s (enable) / `PATCH`es (disable). Follow the project's existing fetch helper (`@/lib/client-fetch`) and UI components in `components/`.

```tsx
'use client'
import { useEffect, useState } from 'react'
import { clientFetch } from '@/lib/client-fetch' // use the project's existing helper

type State = { enabled: boolean; community: { slug: string; name: string; member_count: number } | null }

export function HostCommunityCard() {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    clientFetch('/api/organizer/host-community').then(setState).catch(() => setState({ enabled: false, community: null }))
  }, [])

  async function toggle() {
    setBusy(true)
    try {
      const next = await clientFetch('/api/organizer/host-community', {
        method: state?.enabled ? 'PATCH' : 'POST',
      })
      setState(next)
    } finally { setBusy(false) }
  }

  if (!state) return null
  return (
    <section>
      <h3>Host Community</h3>
      <p>Let attendees join your community after booking your events.</p>
      {state.community && (
        <a href={`/communities/${state.community.slug}`}>{state.community.name} · {state.community.member_count} members</a>
      )}
      <button onClick={toggle} disabled={busy}>
        {state.enabled ? 'Disable prompts' : 'Create my community'}
      </button>
    </section>
  )
}
```

Adapt class names / button components to the existing design system. Add `<HostCommunityCard />` to the chosen dashboard page.

- [ ] **Step 2: Verify**

Run: `npm run type-check && npm run lint`
Expected: PASS. Then load the organizer dashboard in the browser as an approved organizer: enable → community link appears; disable → state flips.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/components/organizer/HostCommunityCard.tsx rawaq-web/app/\(app\)/organizer/
git commit -m "feat(ui): organizer host community toggle card"
```

---

### Task 9: Booking-confirmation join prompt UI

**Files:**
- Create: `rawaq-web/components/community/HostCommunityJoinPrompt.tsx`
- Modify: the booking-confirmation surface — `rawaq-web/app/(app)/bookings/[id]/page.tsx` (also reached via `?payment=success` for paid flows).

- [ ] **Step 1: Build the prompt**

Client component. Given a `bookingId`, it fetches `/api/bookings/<id>/host-community-suggestion`; if `suggested_community` is non-null, render a join-or-discard card. Join → `POST /api/communities/<slug>/join`; Discard → local dismiss.

```tsx
'use client'
import { useEffect, useState } from 'react'
import { clientFetch } from '@/lib/client-fetch'

type Suggested = { id: string; slug: string; name: string; cover_url: string | null; member_count: number }

export function HostCommunityJoinPrompt({ bookingId }: { bookingId: string }) {
  const [community, setCommunity] = useState<Suggested | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    clientFetch(`/api/bookings/${bookingId}/host-community-suggestion`)
      .then((r: { suggested_community: Suggested | null }) => setCommunity(r.suggested_community))
      .catch(() => setCommunity(null))
  }, [bookingId])

  if (!community || dismissed) return null

  async function join() {
    setJoining(true)
    try {
      await clientFetch(`/api/communities/${community!.slug}/join`, { method: 'POST' })
      setDismissed(true)
    } finally { setJoining(false) }
  }

  return (
    <div>
      <p>Stay updated — join <strong>{community.name}</strong>?</p>
      <button onClick={join} disabled={joining}>Join</button>
      <button onClick={() => setDismissed(true)}>Not now</button>
    </div>
  )
}
```

Adapt to the design system. Render `<HostCommunityJoinPrompt bookingId={...} />` on the confirmation page (works for both free and paid `?payment=success` returns since it gates server-side on `status='confirmed'`).

- [ ] **Step 2: Verify**

Run: `npm run type-check && npm run lint`
Expected: PASS. Browser: confirm a booking from an enabled organizer → prompt appears; Join → membership created (verify in `community_memberships`); revisit → prompt gone (now active member).

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/components/community/HostCommunityJoinPrompt.tsx rawaq-web/app/\(app\)/bookings/
git commit -m "feat(ui): host community join prompt on booking confirmation"
```

---

## Final verification

- [ ] `npm run type-check` PASS
- [ ] `npm run lint` PASS
- [ ] SQL assertions from Task 1 hold
- [ ] Manual flow: approved organizer enables → free booking by another user → prompt → Join → member; second booking → no prompt; browse/trending exclude host community.
