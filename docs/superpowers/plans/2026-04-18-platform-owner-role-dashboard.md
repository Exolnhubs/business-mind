# Platform Owner Role & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `"owner"` platform-owner role above `"admin"`, with a dedicated web dashboard to CRUD plan definitions (pricing, limits, features), manage platform settings, and view top-level KPIs.

**Architecture:** A new `"owner"` value is added to the Postgres `user_role` enum and the TypeScript `UserRole` type. All existing `requireAdmin()` guards are widened to also accept `"owner"`. A new `/owner` route group in Next.js (parallel to `/admin`) is protected by `requireOwner()` and contains three pages: overview KPIs, plan catalog editor, and platform settings. Owner-only API routes under `/api/owner/` handle the DB mutations (plan CRUD, country-price overrides, key-value settings).

**Tech Stack:** Next.js 15 App Router, Supabase (admin client for all owner queries), Zod for request validation, Tailwind CSS, TypeScript strict mode.

---

## File Structure

**New files:**
- `rawaq-web/supabase/migrations/00070_owner_role_platform_settings.sql` — enum + table migration
- `rawaq-web/app/api/owner/plans/route.ts` — GET list + POST create
- `rawaq-web/app/api/owner/plans/[id]/route.ts` — GET / PATCH / DELETE single plan
- `rawaq-web/app/api/owner/plans/[id]/country-prices/route.ts` — PUT upsert country price
- `rawaq-web/app/api/owner/plans/[id]/country-prices/[countryCode]/route.ts` — DELETE country price
- `rawaq-web/app/api/owner/settings/route.ts` — GET / PATCH platform settings
- `rawaq-web/app/api/owner/stats/route.ts` — GET overview KPIs
- `rawaq-web/app/(app)/owner/layout.tsx` — owner-guarded sidebar layout
- `rawaq-web/app/(app)/owner/page.tsx` — overview / KPI page (server component)
- `rawaq-web/app/(app)/owner/plans/page.tsx` — plan catalog management (server component)
- `rawaq-web/app/(app)/owner/settings/page.tsx` — platform settings page (server component)
- `rawaq-web/components/owner/PlanEditor.tsx` — interactive plan CRUD client component
- `rawaq-web/components/owner/SettingsEditor.tsx` — interactive settings client component

**Modified files:**
- `rawaq-web/types/database.ts` — add `"owner"` to `UserRole`
- `rawaq-web/types/plans.ts` — add `PlatformSetting` interface
- `rawaq-web/lib/auth.ts` — add `requireOwner()`, widen `requireAdmin()` + `requireOrganizer()` + `requireEventOwnership()` to accept owner
- `rawaq-web/app/(app)/admin/layout.tsx` — allow owner role to access admin panel

---

## Task 1: Supabase migration + TypeScript types

**Files:**
- Create: `rawaq-web/supabase/migrations/00070_owner_role_platform_settings.sql`
- Modify: `rawaq-web/types/database.ts`
- Modify: `rawaq-web/types/plans.ts`

- [ ] **Step 1: Write the migration SQL**

Create `rawaq-web/supabase/migrations/00070_owner_role_platform_settings.sql`:

```sql
-- Add 'owner' value to the user_role enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'owner'
      AND enumtypid = 'user_role'::regtype
  ) THEN
    ALTER TYPE user_role ADD VALUE 'owner';
  END IF;
END $$;

-- Platform-wide key/value settings (one row per setting key)
CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB        NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by  UUID         REFERENCES profiles(id) ON DELETE SET NULL
);

-- Seed sensible defaults (safe to re-run)
INSERT INTO platform_settings (key, value) VALUES
  ('organizer_applications_enabled', 'true'::jsonb),
  ('maintenance_mode',               'false'::jsonb),
  ('maintenance_message',            '""'::jsonb),
  ('default_platform_fee_pct',       '0.10'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Apply the migration in Supabase**

Run this in the Supabase SQL editor OR via CLI:
```bash
supabase db push
# or if using linked project:
supabase migration up
```
Expected: no errors, `platform_settings` table appears in Studio.

- [ ] **Step 3: Update `rawaq-web/types/database.ts`**

Change line 16 from:
```typescript
export type UserRole = "user" | "organizer" | "admin";
```
To:
```typescript
export type UserRole = "user" | "organizer" | "admin" | "owner";
```

- [ ] **Step 4: Add `PlatformSetting` interface to `rawaq-web/types/plans.ts`**

Append at the bottom of the file (after the closing `isUnlimited` function):
```typescript
export interface PlatformSetting {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add rawaq-web/supabase/migrations/00070_owner_role_platform_settings.sql \
        rawaq-web/types/database.ts \
        rawaq-web/types/plans.ts
git commit -m "feat: add owner role enum + platform_settings table + TypeScript types"
```

---

## Task 2: Auth layer — owner role guards

**Files:**
- Modify: `rawaq-web/lib/auth.ts`
- Modify: `rawaq-web/app/(app)/admin/layout.tsx`

- [ ] **Step 1: Update `rawaq-web/lib/auth.ts`**

Replace the entire file with:

```typescript
import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from './supabase/server'
import { createSupabaseAdminClient } from './supabase/admin'
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

  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_banned')
    .eq('id', userId)
    .single()

  if (!profile) throw new UnauthorizedException()
  if (profile.is_banned) throw new ForbiddenException('Your account has been suspended')

  return { userId, role: profile.role as UserRole }
}

export async function requireRole(...roles: UserRole[]): Promise<AuthContext> {
  const ctx = await requireAuth()
  if (!roles.includes(ctx.role)) {
    throw new ForbiddenException(`Requires role: ${roles.join(' or ')}`)
  }
  return ctx
}

// Owner-only: the highest privilege level
export async function requireOwner(): Promise<AuthContext> {
  return requireRole('owner')
}

// Admin OR owner (owners can do everything admins can)
export async function requireAdmin(): Promise<AuthContext> {
  return requireRole('admin', 'owner')
}

// Organizer OR admin OR owner
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
  // Admins and owners bypass ownership check
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

- [ ] **Step 2: Update admin layout to allow owner access**

In `rawaq-web/app/(app)/admin/layout.tsx`, change line 31 from:
```typescript
  if ((profile as { role: string } | null)?.role !== 'admin') redirect('/events')
```
To:
```typescript
  const role = (profile as { role: string } | null)?.role
  if (role !== 'admin' && role !== 'owner') redirect('/events')
```

- [ ] **Step 3: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/lib/auth.ts rawaq-web/app/\(app\)/admin/layout.tsx
git commit -m "feat: add requireOwner() — owner role inherits all admin + organizer access"
```

---

## Task 3: Owner API — Plan definition CRUD

**Files:**
- Create: `rawaq-web/app/api/owner/plans/route.ts`
- Create: `rawaq-web/app/api/owner/plans/[id]/route.ts`
- Create: `rawaq-web/app/api/owner/plans/[id]/country-prices/route.ts`
- Create: `rawaq-web/app/api/owner/plans/[id]/country-prices/[countryCode]/route.ts`

- [ ] **Step 1: Create `rawaq-web/app/api/owner/plans/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok, created } from '@/lib/errors'

const CreatePlanSchema = z.object({
  id:                  z.string().min(2).max(64).regex(/^[a-z0-9_]+$/),
  type:                z.enum(['user', 'organizer']),
  name:                z.string().min(1).max(80),
  name_ar:             z.string().min(1).max(80),
  price_sar:           z.number().min(0),
  billing_interval:    z.enum(['free', 'monthly', 'yearly']),
  events_per_month:    z.number().int().min(1).nullable(),
  attendees_per_event: z.number().int().min(1).nullable(),
  platform_fee_pct:    z.number().min(0).max(1),
  features:            z.record(z.unknown()).default({}),
  is_active:           z.boolean().default(true),
  sort_order:          z.number().int().min(0).default(0),
})

// GET /api/owner/plans — list all plan definitions + all country prices
export async function GET() {
  try {
    await requireOwner()
    const admin = createSupabaseAdminClient()

    const [{ data: plans, error: plansErr }, { data: prices, error: pricesErr }] = await Promise.all([
      admin.from('plan_definitions').select('*').order('type').order('sort_order'),
      admin.from('plan_country_prices').select('*').order('plan_id').order('country_code'),
    ])
    if (plansErr) throw plansErr
    if (pricesErr) throw pricesErr

    return ok({ plans: plans ?? [], countryPrices: prices ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/owner/plans — create a new plan definition
export async function POST(req: NextRequest) {
  try {
    await requireOwner()
    const body = await req.json()
    const input = CreatePlanSchema.parse(body)

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('plan_definitions')
      .insert(input as any)
      .select()
      .single()

    if (error) throw error
    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Create `rawaq-web/app/api/owner/plans/[id]/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

const UpdatePlanSchema = z.object({
  name:                z.string().min(1).max(80).optional(),
  name_ar:             z.string().min(1).max(80).optional(),
  price_sar:           z.number().min(0).optional(),
  billing_interval:    z.enum(['free', 'monthly', 'yearly']).optional(),
  events_per_month:    z.number().int().min(1).nullable().optional(),
  attendees_per_event: z.number().int().min(1).nullable().optional(),
  platform_fee_pct:    z.number().min(0).max(1).optional(),
  features:            z.record(z.unknown()).optional(),
  is_active:           z.boolean().optional(),
  sort_order:          z.number().int().min(0).optional(),
})

// GET /api/owner/plans/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner()
    const { id } = await params
    const admin = createSupabaseAdminClient()

    const [{ data: plan, error: planErr }, { data: prices, error: pricesErr }] = await Promise.all([
      admin.from('plan_definitions').select('*').eq('id', id).single(),
      admin.from('plan_country_prices').select('*').eq('plan_id', id).order('country_code'),
    ])
    if (planErr) throw planErr
    if (!plan) throw new NotFoundException('Plan')
    if (pricesErr) throw pricesErr

    return ok({ plan, countryPrices: prices ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

// PATCH /api/owner/plans/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner()
    const { id } = await params
    const body = await req.json()
    const updates = UpdatePlanSchema.parse(body)

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('plan_definitions')
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw new NotFoundException('Plan')
    return ok({ plan: data })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/owner/plans/:id — soft deactivate only (preserves subscriptions)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner()
    const { id } = await params
    const admin = createSupabaseAdminClient()

    const { error } = await admin
      .from('plan_definitions')
      .update({ is_active: false, updated_at: new Date().toISOString() } as any)
      .eq('id', id)

    if (error) throw error
    return ok({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 3: Create `rawaq-web/app/api/owner/plans/[id]/country-prices/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

const UpsertPriceSchema = z.object({
  country_code:  z.string().length(2).toUpperCase(),
  currency_code: z.string().min(3).max(3).toUpperCase(),
  amount:        z.number().min(0),
})

// PUT /api/owner/plans/:id/country-prices — upsert a country price override
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner()
    const { id: plan_id } = await params
    const body = await req.json()
    const input = UpsertPriceSchema.parse(body)

    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('plan_country_prices')
      .upsert({ plan_id, ...input, updated_at: new Date().toISOString() } as any, {
        onConflict: 'plan_id,country_code',
      })
      .select()
      .single()

    if (error) throw error
    return ok({ price: data })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 4: Create `rawaq-web/app/api/owner/plans/[id]/country-prices/[countryCode]/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// DELETE /api/owner/plans/:id/country-prices/:countryCode
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; countryCode: string }> }
) {
  try {
    await requireOwner()
    const { id: plan_id, countryCode } = await params
    const admin = createSupabaseAdminClient()

    const { error } = await admin
      .from('plan_country_prices')
      .delete()
      .eq('plan_id', plan_id)
      .eq('country_code', countryCode.toUpperCase())

    if (error) throw error
    return ok({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 5: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add rawaq-web/app/api/owner/
git commit -m "feat: owner API routes for plan definition CRUD + country-price overrides"
```

---

## Task 4: Owner API — Platform settings + overview stats

**Files:**
- Create: `rawaq-web/app/api/owner/settings/route.ts`
- Create: `rawaq-web/app/api/owner/stats/route.ts`

- [ ] **Step 1: Create `rawaq-web/app/api/owner/settings/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

const PatchSettingsSchema = z.object({
  updates: z.array(z.object({
    key:   z.string().min(1),
    value: z.unknown(),
  })).min(1),
})

// GET /api/owner/settings
export async function GET() {
  try {
    await requireOwner()
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from('platform_settings')
      .select('*')
      .order('key')
    if (error) throw error
    return ok({ settings: data ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

// PATCH /api/owner/settings — batch upsert
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireOwner()
    const body = await req.json()
    const { updates } = PatchSettingsSchema.parse(body)

    const admin = createSupabaseAdminClient()
    const rows = updates.map(({ key, value }) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    }))

    const { data, error } = await admin
      .from('platform_settings')
      .upsert(rows as any, { onConflict: 'key' })
      .select()

    if (error) throw error
    return ok({ settings: data ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 2: Create `rawaq-web/app/api/owner/stats/route.ts`**

```typescript
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

export async function GET() {
  try {
    await requireOwner()
    const admin = createSupabaseAdminClient()

    const [
      { count: totalUsers },
      { count: approvedOrganizers },
      { count: activeSubscriptions },
      { data: activeSubs },
    ] = await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      admin.from('organizer_profiles').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      admin.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      admin
        .from('subscriptions')
        .select('plan:plan_definitions(price_sar)')
        .eq('status', 'active')
        .eq('is_simulated', false),
    ])

    const mrr = (activeSubs ?? []).reduce((sum, row) => {
      const price = (row as any).plan?.price_sar ?? 0
      return sum + Number(price)
    }, 0)

    return ok({
      totalUsers:          totalUsers ?? 0,
      approvedOrganizers:  approvedOrganizers ?? 0,
      activeSubscriptions: activeSubscriptions ?? 0,
      mrr,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/api/owner/settings/route.ts \
        rawaq-web/app/api/owner/stats/route.ts
git commit -m "feat: owner API routes for platform settings + overview stats"
```

---

## Task 5: Owner dashboard layout + shell

**Files:**
- Create: `rawaq-web/app/(app)/owner/layout.tsx`

- [ ] **Step 1: Create `rawaq-web/app/(app)/owner/layout.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const NAV = [
  { href: '/owner',          label: '👑 Overview',          exact: true },
  { href: '/owner/plans',    label: '💎 Plan Catalog' },
  { href: '/owner/settings', label: '⚙️ Platform Settings' },
]

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if ((profile as { role: string } | null)?.role !== 'owner') redirect('/events')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">👑</span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Owner Panel</h1>
          <p className="text-xs text-gray-400 mt-0.5">Platform control center</p>
        </div>
      </div>

      {/* Mobile scrollable nav */}
      <div className="sm:hidden mb-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar — desktop */}
        <nav className="w-52 shrink-0 hidden sm:block">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-amber-50 hover:text-amber-900 transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 pt-4 border-t border-gray-100">
            <Link
              href="/admin"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              🛡️ Admin Panel
            </Link>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/\(app\)/owner/layout.tsx
git commit -m "feat: owner dashboard layout — amber-accented sidebar, owner-only guard"
```

---

## Task 6: Owner overview page (KPIs)

**Files:**
- Create: `rawaq-web/app/(app)/owner/page.tsx`

- [ ] **Step 1: Create `rawaq-web/app/(app)/owner/page.tsx`**

```typescript
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Owner — Overview' }

async function getStats() {
  const admin = createSupabaseAdminClient()

  const [
    { count: totalUsers },
    { count: approvedOrganizers },
    { count: activeSubscriptions },
    { count: pendingOrganizers },
    { data: activeSubs },
    { data: recentPlans },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
    admin.from('organizer_profiles').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    admin.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('organizer_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin
      .from('subscriptions')
      .select('plan:plan_definitions(price_sar)')
      .eq('status', 'active')
      .eq('is_simulated', false),
    admin.from('plan_definitions').select('id, name, type, price_sar, is_active').order('type').order('sort_order'),
  ])

  const mrr = (activeSubs ?? []).reduce((sum, row) => {
    const price = (row as any).plan?.price_sar ?? 0
    return sum + Number(price)
  }, 0)

  return {
    totalUsers:          totalUsers ?? 0,
    approvedOrganizers:  approvedOrganizers ?? 0,
    activeSubscriptions: activeSubscriptions ?? 0,
    pendingOrganizers:   pendingOrganizers ?? 0,
    mrr,
    plans:               (recentPlans ?? []) as Array<{ id: string; name: string; type: string; price_sar: number; is_active: boolean }>,
  }
}

export default async function OwnerOverviewPage() {
  const stats = await getStats()

  const kpis = [
    { label: 'Registered Users',       value: stats.totalUsers.toLocaleString(),          icon: '👥', color: 'bg-blue-50 border-blue-100' },
    { label: 'Approved Organizers',     value: stats.approvedOrganizers.toLocaleString(),  icon: '🏢', color: 'bg-green-50 border-green-100' },
    { label: 'Active Subscriptions',    value: stats.activeSubscriptions.toLocaleString(), icon: '💎', color: 'bg-purple-50 border-purple-100' },
    { label: 'Pending Organizer Apps',  value: stats.pendingOrganizers.toLocaleString(),   icon: '⏳', color: 'bg-yellow-50 border-yellow-100' },
    {
      label: 'Monthly Revenue (MRR)',
      value: `SAR ${stats.mrr.toLocaleString('en', { minimumFractionDigits: 0 })}`,
      icon: '💰',
      color: 'bg-amber-50 border-amber-100',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Platform Overview</h2>
        <p className="text-sm text-gray-500 mt-0.5">Live snapshot of platform activity.</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border p-4 ${kpi.color}`}>
            <div className="text-2xl mb-2">{kpi.icon}</div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{kpi.value}</div>
            <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          href="/owner/plans"
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          💎 Manage Plans
        </Link>
        <Link
          href="/owner/settings"
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          ⚙️ Platform Settings
        </Link>
        <Link
          href="/admin/organizers"
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          🏢 Review Organizers
        </Link>
      </div>

      {/* Plan catalog snapshot */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Active Plan Catalog</h3>
          <Link href="/owner/plans" className="text-xs text-amber-700 hover:underline">Edit plans →</Link>
        </div>
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Plan</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Type</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Price (SAR)</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{plan.name}</td>
                  <td className="px-4 py-2.5 text-gray-500 capitalize">{plan.type}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    {plan.price_sar === 0 ? 'Free' : plan.price_sar.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/\(app\)/owner/page.tsx
git commit -m "feat: owner overview page — KPI grid, MRR, plan catalog snapshot"
```

---

## Task 7: PlanEditor client component

**Files:**
- Create: `rawaq-web/components/owner/PlanEditor.tsx`

This component receives the full plan list + country prices and lets the owner view, edit, and create plans inline (selected plan on left, edit form on right).

- [ ] **Step 1: Create `rawaq-web/components/owner/PlanEditor.tsx`**

```typescript
'use client'

import { useState, useTransition } from 'react'
import type { PlanDefinition, PlanCountryPrice } from '@/types/plans'

interface Props {
  initialPlans: PlanDefinition[]
  initialCountryPrices: PlanCountryPrice[]
}

const FEATURE_KEYS: { key: string; label: string; type: 'boolean' | 'number' }[] = [
  { key: 'ticket_scanner',    label: 'Ticket Scanner',   type: 'boolean' },
  { key: 'unlimited_saves',   label: 'Unlimited Saves',  type: 'boolean' },
  { key: 'saves_limit',       label: 'Save Limit',       type: 'number'  },
  { key: 'analytics',         label: 'Analytics',        type: 'boolean' },
  { key: 'promo_codes',       label: 'Promo Codes',      type: 'boolean' },
  { key: 'custom_branding',   label: 'Custom Branding',  type: 'boolean' },
]

type PlanForm = {
  name: string
  name_ar: string
  price_sar: string
  billing_interval: 'free' | 'monthly' | 'yearly'
  events_per_month: string
  attendees_per_event: string
  platform_fee_pct: string
  is_active: boolean
  sort_order: string
  features: Record<string, unknown>
}

type PriceForm = { country_code: string; currency_code: string; amount: string }

function planToForm(plan: PlanDefinition): PlanForm {
  return {
    name:                plan.name,
    name_ar:             plan.name_ar,
    price_sar:           String(plan.price_sar),
    billing_interval:    plan.billing_interval as 'free' | 'monthly' | 'yearly',
    events_per_month:    plan.events_per_month === null ? '' : String(plan.events_per_month),
    attendees_per_event: plan.attendees_per_event === null ? '' : String(plan.attendees_per_event),
    platform_fee_pct:    String(Math.round(plan.platform_fee_pct * 100)),
    is_active:           plan.is_active,
    sort_order:          String(plan.sort_order),
    features:            plan.features ?? {},
  }
}

const emptyForm: PlanForm = {
  name: '', name_ar: '', price_sar: '0', billing_interval: 'monthly',
  events_per_month: '', attendees_per_event: '', platform_fee_pct: '10',
  is_active: true, sort_order: '0', features: {},
}

function useSavePlan(onDone: (plan: PlanDefinition) => void) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function save(planId: string | null, type: 'user' | 'organizer', form: PlanForm, newId?: string) {
    setError(null)
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {
          name:                form.name,
          name_ar:             form.name_ar,
          price_sar:           parseFloat(form.price_sar) || 0,
          billing_interval:    form.billing_interval,
          events_per_month:    form.events_per_month ? parseInt(form.events_per_month) : null,
          attendees_per_event: form.attendees_per_event ? parseInt(form.attendees_per_event) : null,
          platform_fee_pct:    (parseFloat(form.platform_fee_pct) || 0) / 100,
          is_active:           form.is_active,
          sort_order:          parseInt(form.sort_order) || 0,
          features:            form.features,
        }

        let res: Response
        if (planId) {
          res = await fetch(`/api/owner/plans/${planId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        } else {
          body.id   = newId
          body.type = type
          res = await fetch('/api/owner/plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        }

        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError((j as any).error ?? 'Failed to save plan')
          return
        }
        const j = await res.json()
        onDone((j.data?.plan ?? j.data) as PlanDefinition)
      } catch {
        setError('Network error')
      }
    })
  }

  return { save, isPending, error }
}

function useUpsertCountryPrice(onDone: (price: PlanCountryPrice) => void) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function upsert(planId: string, form: PriceForm) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/owner/plans/${planId}/country-prices`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            country_code:  form.country_code.toUpperCase(),
            currency_code: form.currency_code.toUpperCase(),
            amount:        parseFloat(form.amount) || 0,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError((j as any).error ?? 'Failed to save price')
          return
        }
        const j = await res.json()
        onDone((j.data?.price) as PlanCountryPrice)
      } catch {
        setError('Network error')
      }
    })
  }

  return { upsert, isPending, error }
}

function useDeleteCountryPrice(onDone: (planId: string, countryCode: string) => void) {
  const [isPending, startTransition] = useTransition()

  function del(planId: string, countryCode: string) {
    startTransition(async () => {
      await fetch(`/api/owner/plans/${planId}/country-prices/${countryCode}`, { method: 'DELETE' })
      onDone(planId, countryCode)
    })
  }

  return { del, isPending }
}

export function PlanEditor({ initialPlans, initialCountryPrices }: Props) {
  const [plans, setPlans] = useState(initialPlans)
  const [allPrices, setAllPrices] = useState(initialCountryPrices)
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null)
  const [newType, setNewType] = useState<'user' | 'organizer'>('organizer')
  const [newPlanId, setNewPlanId] = useState('')
  const [form, setForm] = useState<PlanForm>(emptyForm)

  const selected = selectedId === 'new' ? null : plans.find((p) => p.id === selectedId) ?? null
  const prices = allPrices.filter((p) => p.plan_id === selectedId)

  const [priceForm, setPriceForm] = useState<PriceForm>({ country_code: '', currency_code: 'SAR', amount: '' })

  const { save, isPending, error: saveError } = useSavePlan((plan) => {
    setPlans((prev) => {
      const idx = prev.findIndex((p) => p.id === plan.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = plan; return next
      }
      return [...prev, plan]
    })
    setSelectedId(plan.id)
    setForm(planToForm(plan))
  })

  const { upsert, isPending: priceIsPending, error: priceError } = useUpsertCountryPrice((price) => {
    setAllPrices((prev) => {
      const idx = prev.findIndex((p) => p.plan_id === price.plan_id && p.country_code === price.country_code)
      if (idx >= 0) { const next = [...prev]; next[idx] = price; return next }
      return [...prev, price]
    })
    setPriceForm({ country_code: '', currency_code: 'SAR', amount: '' })
  })

  const { del } = useDeleteCountryPrice((planId, cc) => {
    setAllPrices((prev) => prev.filter((p) => !(p.plan_id === planId && p.country_code === cc)))
  })

  function selectPlan(plan: PlanDefinition) {
    setSelectedId(plan.id)
    setForm(planToForm(plan))
  }

  function selectNew() {
    setSelectedId('new')
    setForm(emptyForm)
    setNewPlanId('')
  }

  function setFeature(key: string, value: unknown) {
    setForm((f) => ({ ...f, features: { ...f.features, [key]: value } }))
  }

  const userPlans  = plans.filter((p) => p.type === 'user')
  const orgPlans   = plans.filter((p) => p.type === 'organizer')

  function PlanList({ items, label }: { items: PlanDefinition[]; label: string }) {
    return (
      <div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{label}</div>
        <ul className="space-y-1">
          {items.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => selectPlan(p)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedId === p.id
                    ? 'bg-amber-100 text-amber-900 font-semibold'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <span className={!p.is_active ? 'line-through text-gray-400' : ''}>{p.name}</span>
                <span className="ml-1 text-gray-400 font-normal">
                  {p.price_sar === 0 ? '(free)' : `(${p.price_sar} SAR)`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      {/* Plan list sidebar */}
      <div className="w-56 shrink-0 space-y-4">
        <PlanList items={orgPlans}  label="Organizer Plans" />
        <PlanList items={userPlans} label="User Plans" />
        <button
          onClick={selectNew}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm border-2 border-dashed transition-colors ${
            selectedId === 'new'
              ? 'border-amber-400 text-amber-700 bg-amber-50'
              : 'border-gray-300 text-gray-400 hover:border-amber-300 hover:text-amber-600'
          }`}
        >
          + New Plan
        </button>
      </div>

      {/* Edit panel */}
      {selectedId ? (
        <div className="flex-1 space-y-6">
          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 text-sm">
              {selectedId === 'new' ? 'Create New Plan' : `Editing: ${selected?.name}`}
            </h3>

            {selectedId === 'new' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Plan ID (slug)</label>
                  <input
                    value={newPlanId}
                    onChange={(e) => setNewPlanId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="org_enterprise"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as 'user' | 'organizer')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="organizer">organizer</option>
                    <option value="user">user</option>
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name (EN)</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name (AR)</label>
                <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} dir="rtl"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Base Price (SAR/mo)</label>
                <input type="number" min="0" value={form.price_sar}
                  onChange={(e) => setForm({ ...form, price_sar: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Billing Interval</label>
                <select value={form.billing_interval}
                  onChange={(e) => setForm({ ...form, billing_interval: e.target.value as 'free' | 'monthly' | 'yearly' })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="free">Free</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Events/Month (blank = unlimited)</label>
                <input type="number" min="1" value={form.events_per_month}
                  onChange={(e) => setForm({ ...form, events_per_month: e.target.value })}
                  placeholder="unlimited"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Attendees/Event (blank = unlimited)</label>
                <input type="number" min="1" value={form.attendees_per_event}
                  onChange={(e) => setForm({ ...form, attendees_per_event: e.target.value })}
                  placeholder="unlimited"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Platform Fee (%)</label>
                <input type="number" min="0" max="100" step="0.1" value={form.platform_fee_pct}
                  onChange={(e) => setForm({ ...form, platform_fee_pct: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                <input type="number" min="0" value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            {/* Features */}
            <div>
              <div className="text-xs font-medium text-gray-600 mb-2">Features</div>
              <div className="grid grid-cols-2 gap-2">
                {FEATURE_KEYS.map(({ key, label, type }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    {type === 'boolean' ? (
                      <>
                        <input
                          type="checkbox"
                          checked={form.features[key] === true}
                          onChange={(e) => setFeature(key, e.target.checked)}
                          className="rounded"
                        />
                        {label}
                      </>
                    ) : (
                      <>
                        <span className="w-24 shrink-0">{label}:</span>
                        <input
                          type="number"
                          min="0"
                          value={typeof form.features[key] === 'number' ? String(form.features[key]) : ''}
                          onChange={(e) => setFeature(key, e.target.value ? parseInt(e.target.value) : undefined)}
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="—"
                        />
                      </>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Active toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded" />
              Plan is active (visible to users)
            </label>

            {saveError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>
            )}

            <div className="flex gap-2">
              <button
                disabled={isPending}
                onClick={() => save(
                  selectedId === 'new' ? null : selectedId,
                  selectedId === 'new' ? newType : (selected?.type ?? 'organizer'),
                  form,
                  selectedId === 'new' ? newPlanId : undefined,
                )}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Saving…' : selectedId === 'new' ? 'Create Plan' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Country price overrides — only for existing plans */}
          {selectedId !== 'new' && selected && (
            <div className="rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm">Country Price Overrides</h3>
              <p className="text-xs text-gray-500">Override the base SAR price for specific countries.</p>

              {prices.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400">
                      <th className="text-left pb-1">Country</th>
                      <th className="text-left pb-1">Currency</th>
                      <th className="text-right pb-1">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {prices.map((p) => (
                      <tr key={p.country_code}>
                        <td className="py-1.5 font-mono text-xs">{p.country_code}</td>
                        <td className="py-1.5 text-gray-600">{p.currency_code}</td>
                        <td className="py-1.5 text-right tabular-nums">{Number(p.amount).toLocaleString()}</td>
                        <td className="py-1.5 text-right">
                          <button
                            onClick={() => del(selected.id, p.country_code)}
                            className="text-red-400 hover:text-red-600 text-xs"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="flex gap-2 pt-1">
                <input value={priceForm.country_code} maxLength={2} placeholder="AE"
                  onChange={(e) => setPriceForm({ ...priceForm, country_code: e.target.value })}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono uppercase" />
                <input value={priceForm.currency_code} maxLength={3} placeholder="AED"
                  onChange={(e) => setPriceForm({ ...priceForm, currency_code: e.target.value })}
                  className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono uppercase" />
                <input type="number" min="0" value={priceForm.amount} placeholder="Amount"
                  onChange={(e) => setPriceForm({ ...priceForm, amount: e.target.value })}
                  className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <button
                  disabled={priceIsPending || !priceForm.country_code || !priceForm.amount}
                  onClick={() => upsert(selected.id, priceForm)}
                  className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  {priceIsPending ? '…' : 'Add'}
                </button>
              </div>
              {priceError && <div className="text-xs text-red-500">{priceError}</div>}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Select a plan to edit or click <span className="mx-1 font-medium text-gray-600">+ New Plan</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/components/owner/PlanEditor.tsx
git commit -m "feat: PlanEditor client component — inline plan CRUD with feature toggles + country prices"
```

---

## Task 8: Owner plans page

**Files:**
- Create: `rawaq-web/app/(app)/owner/plans/page.tsx`

- [ ] **Step 1: Create `rawaq-web/app/(app)/owner/plans/page.tsx`**

```typescript
import type { Metadata } from 'next'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { PlanEditor } from '@/components/owner/PlanEditor'
import type { PlanDefinition, PlanCountryPrice } from '@/types/plans'

export const metadata: Metadata = { title: 'Owner — Plan Catalog' }

export default async function OwnerPlansPage() {
  const admin = createSupabaseAdminClient()

  const [{ data: plans }, { data: prices }] = await Promise.all([
    admin.from('plan_definitions').select('*').order('type').order('sort_order'),
    admin.from('plan_country_prices').select('*').order('plan_id').order('country_code'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Plan Catalog</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Create and edit plan definitions — pricing, limits, platform fees, and country overrides.
          Assigning plans to users/organizers is done in the{' '}
          <a href="/admin/plans" className="text-amber-700 hover:underline">Admin → Plans</a> panel.
        </p>
      </div>

      <PlanEditor
        initialPlans={(plans ?? []) as PlanDefinition[]}
        initialCountryPrices={(prices ?? []) as PlanCountryPrice[]}
      />
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/\(app\)/owner/plans/page.tsx
git commit -m "feat: owner plans page — plan catalog management UI"
```

---

## Task 9: SettingsEditor client component + settings page

**Files:**
- Create: `rawaq-web/components/owner/SettingsEditor.tsx`
- Create: `rawaq-web/app/(app)/owner/settings/page.tsx`

- [ ] **Step 1: Create `rawaq-web/components/owner/SettingsEditor.tsx`**

```typescript
'use client'

import { useState, useTransition } from 'react'
import type { PlatformSetting } from '@/types/plans'

interface SettingMeta {
  key: string
  label: string
  description: string
  type: 'boolean' | 'number' | 'text'
}

const SETTINGS_META: SettingMeta[] = [
  {
    key: 'organizer_applications_enabled',
    label: 'Organizer Applications',
    description: 'Allow new users to apply for organizer status.',
    type: 'boolean',
  },
  {
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'Show a maintenance banner to non-owner users.',
    type: 'boolean',
  },
  {
    key: 'maintenance_message',
    label: 'Maintenance Message',
    description: 'Message shown during maintenance (leave blank for default).',
    type: 'text',
  },
  {
    key: 'default_platform_fee_pct',
    label: 'Default Platform Fee (%)',
    description: 'Fallback fee applied when a plan has no explicit fee. Range: 0–100.',
    type: 'number',
  },
]

interface Props {
  initialSettings: PlatformSetting[]
}

function getValue(settings: PlatformSetting[], key: string): unknown {
  return settings.find((s) => s.key === key)?.value
}

export function SettingsEditor({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Local draft — mirrors the DB values until Save is clicked
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const d: Record<string, unknown> = {}
    for (const meta of SETTINGS_META) {
      d[meta.key] = getValue(initialSettings, meta.key)
    }
    return d
  })

  function setDraftKey(key: string, value: unknown) {
    setSaved(false)
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const updates = SETTINGS_META.map(({ key, type }) => {
          let value = draft[key]
          if (type === 'number') value = parseFloat(String(value)) / 100 // fee pct stored as 0-1
          return { key, value }
        })
        // Restore maintenance_message as-is (not divided by 100)
        const msgIdx = updates.findIndex((u) => u.key === 'maintenance_message')
        if (msgIdx >= 0) updates[msgIdx].value = draft['maintenance_message']

        const res = await fetch('/api/owner/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError((j as any).error ?? 'Save failed')
          return
        }
        const j = await res.json()
        setSettings((j.data?.settings ?? []) as PlatformSetting[])
        setSaved(true)
      } catch {
        setError('Network error')
      }
    })
  }

  return (
    <div className="space-y-4">
      {SETTINGS_META.map((meta) => {
        const rawDbValue = getValue(settings, meta.key)

        return (
          <div key={meta.key} className="rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">{meta.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{meta.description}</div>
                {rawDbValue !== undefined && (
                  <div className="text-xs text-gray-400 mt-1">
                    Current DB value: <code className="bg-gray-100 px-1 rounded">{JSON.stringify(rawDbValue)}</code>
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {meta.type === 'boolean' && (
                  <button
                    onClick={() => setDraftKey(meta.key, !draft[meta.key])}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      draft[meta.key] ? 'bg-amber-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      draft[meta.key] ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                )}

                {meta.type === 'number' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={typeof draft[meta.key] === 'number' ? Math.round((draft[meta.key] as number) * 100 * 10) / 10 : ''}
                      onChange={(e) => setDraftKey(meta.key, parseFloat(e.target.value) / 100)}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                )}

                {meta.type === 'text' && (
                  <input
                    type="text"
                    value={typeof draft[meta.key] === 'string' ? (draft[meta.key] as string) : ''}
                    onChange={(e) => setDraftKey(meta.key, e.target.value)}
                    className="w-64 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Leave blank for default"
                  />
                )}
              </div>
            </div>
          </div>
        )
      })}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `rawaq-web/app/(app)/owner/settings/page.tsx`**

```typescript
import type { Metadata } from 'next'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { SettingsEditor } from '@/components/owner/SettingsEditor'
import type { PlatformSetting } from '@/types/plans'

export const metadata: Metadata = { title: 'Owner — Platform Settings' }

export default async function OwnerSettingsPage() {
  const admin = createSupabaseAdminClient()
  const { data: settings } = await admin
    .from('platform_settings')
    .select('*')
    .order('key')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Platform Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Global platform configuration. Changes take effect immediately.
        </p>
      </div>

      <SettingsEditor initialSettings={(settings ?? []) as PlatformSetting[]} />
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd rawaq-web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/components/owner/SettingsEditor.tsx \
        rawaq-web/app/\(app\)/owner/settings/page.tsx
git commit -m "feat: owner settings page — toggle/edit platform settings with live DB sync"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Platform owner role (`"owner"` in UserRole enum, Supabase migration) — Task 1
- [x] Owner inherits all admin + organizer access — Task 2
- [x] Plan definition CRUD (create, edit, soft-delete) — Tasks 3 + 7 + 8
- [x] Country price overrides (upsert + delete) — Task 3 + PlanEditor
- [x] Plan features management (ticket_scanner, analytics, promo_codes, etc.) — Task 7
- [x] Platform settings (organizer apps toggle, maintenance mode, default fee) — Tasks 4 + 9
- [x] Owner dashboard overview with KPIs (users, organizers, subscriptions, MRR) — Tasks 5 + 6
- [x] Owner-only route protection at layout level — Task 5
- [x] Admin layout updated to allow owner access — Task 2

**Placeholder scan:** No TBD, TODO, "implement later", or vague steps present.

**Type consistency:** `PlatformSetting` defined in `types/plans.ts` Task 1 Step 4 and used identically in `SettingsEditor.tsx` Task 9 Step 1 and `settings/page.tsx`. `PlanDefinition`/`PlanCountryPrice` from existing `types/plans.ts` used consistently throughout.
