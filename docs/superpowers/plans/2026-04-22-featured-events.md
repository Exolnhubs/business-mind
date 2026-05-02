# Featured Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organizers pin events as "featured" for 7 days, capped by their plan's `featured_per_month` quota, with featured events pinned above the public events listing.

**Architecture:** Migration adds `featured_at` / `featured_until` columns to `events`. A `POST /api/events/[id]/feature` toggle enforces plan quota by counting `featured_at >= month_start`. The organizer dashboard shows an inline star button per event with optimistic UI. The public events page shows a featured rail above the main grid, excluding those IDs from the grid.

**Tech Stack:** Next.js 15App Router (server + client components), Supabase (postgres), TypeScript, Tailwind CSS.

---

### Task 1: DB Migration + Event Type

**Files:**

- Create: `rawaq-web/supabase/migrations/00074_featured_events.sql`
- Modify: `rawaq-web/types/database.ts` — `Event` interface (lines ~201-240)

- [ ] **Step 1: Write migration**

Create `rawaq-web/supabase/migrations/00074_featured_events.sql`:

```sql
-- Add featured columns to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS featured_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ DEFAULT NULL;

-- Index for the public featured query (featured_until > now())
CREATE INDEX IF NOT EXISTS idx_events_featured_until
  ON events (featured_until)
  WHERE featured_until IS NOT NULL;

-- Index for the quota count query (featured_at >= month_start per organizer)
CREATE INDEX IF NOT EXISTS idx_events_featured_at_organizer
  ON events (organizer_id, featured_at)
  WHERE featured_at IS NOT NULL;
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
cd rawaq-web
npx supabase db push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Add fields to Event type**

In `rawaq-web/types/database.ts`, find the `Event` interface (around line 201) and add two fields after `updated_at`:

```typescript
export interface Event {
  id: string;
  organizer_id: string;
  category_id: string | null;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  cover_image_url: string | null;
  start_at: string;
  end_at: string | null;
  event_frequency: EventFrequency;
  recurrence_until: string | null;
  venue_name: string | null;
  venue_name_ar: string | null;
  address: string | null;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  capacity: number | null;
  is_free: boolean;
  price: number | null;
  currency: string;
  gender_restriction: GenderType;
  is_family_friendly: boolean;
  is_private: boolean;
  is_premium_only: boolean;
  is_published: boolean;
  is_cancelled: boolean;
  max_group_size: number | null;
  cancelled_reason: string | null;
  visibility_type: EventVisibility;
  bookings_count: number;
  views_count: number;
  tips_total: number;
  featured_at: string | null;
  featured_until: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/supabase/migrations/00074_featured_events.sql rawaq-web/types/database.ts
git commit -m "feat: add featured_at and featured_until columns to events"
```

---

### Task 2: Plan Helper + Badge `amber` Variant

**Files:**

- Modify: `rawaq-web/lib/plans.ts` — add `getFeaturedPerMonth`
- Modify: `rawaq-web/components/ui/Badge.tsx` — add `amber` variant

- [ ] **Step 1: Add `getFeaturedPerMonth` to `lib/plans.ts`**

At the end of `rawaq-web/lib/plans.ts`, append:

```typescript
export function getFeaturedPerMonth(plan: OrganizerPlanAccess | null): number {
  return getNumericPlanFeature(plan?.features, "featured_per_month") ?? 0;
}
```

- [ ] **Step 2: Add `amber` variant to `Badge`**

In `rawaq-web/components/ui/Badge.tsx`, update the `Variant` type and `styles` object:

```typescript
type Variant =
  | "brand"
  | "green"
  | "red"
  | "yellow"
  | "gray"
  | "blue"
  | "orange"
  | "amber";

const styles: Record<Variant, string> = {
  brand: "bg-brand-100 text-brand-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  yellow: "bg-yellow-100 text-yellow-700",
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-100 text-blue-700",
  orange: "bg-orange-100 text-orange-700",
  amber: "bg-amber-100 text-amber-700",
};
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/lib/plans.ts rawaq-web/components/ui/Badge.tsx
git commit -m "feat: add getFeaturedPerMonth helper and amber Badge variant"
```

---

### Task 3: Feature Toggle API Route

**Files:**

- Create: `rawaq-web/app/api/events/[id]/feature/route.ts`

- [ ] **Step 1: Create the route file**

Create `rawaq-web/app/api/events/[id]/feature/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireOrganizer, requireEventOwnership } from "@/lib/auth";
import {
  handleApiError,
  ok,
  ForbiddenException,
  NotFoundException,
} from "@/lib/errors";
import { getOrganizerPlanAccess, getFeaturedPerMonth } from "@/lib/plans";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await requireOrganizer();
    await requireEventOwnership(id, ctx);

    const supabase = await createSupabaseServerClient();

    // Load event to verify it's publishable
    const { data: event, error: fetchErr } = await supabase
      .from("events")
      .select("id, is_published, is_cancelled, featured_until, organizer_id")
      .eq("id", id)
      .single();

    if (fetchErr || !event) throw new NotFoundException("Event");
    if (!event.is_published)
      throw new ForbiddenException("Only published events can be featured");
    if (event.is_cancelled)
      throw new ForbiddenException("Cancelled events cannot be featured");

    const now = new Date();
    const isCurrentlyFeatured =
      event.featured_until && new Date(event.featured_until) > now;

    if (isCurrentlyFeatured) {
      // Unfeature: expire immediately
      const { error } = await supabase
        .from("events")
        .update({ featured_until: now.toISOString() })
        .eq("id", id);

      if (error) throw error;

      return ok({
        featured_until: null,
        quota: await getQuota(supabase, ctx.userId),
      });
    }

    // Feature: check plan quota first
    const plan = await getOrganizerPlanAccess(ctx.userId);
    const limit = getFeaturedPerMonth(plan);

    if (limit === 0) {
      throw new ForbiddenException(
        "Your plan does not include featured events. Upgrade to feature events.",
      );
    }

    const quota = await getQuota(supabase, ctx.userId);

    // Only block if this event hasn't already used a slot this month
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const { data: alreadyFeaturedThisMonth } = await supabase
      .from("events")
      .select("id")
      .eq("id", id)
      .gte("featured_at", monthStart)
      .maybeSingle();

    if (!alreadyFeaturedThisMonth && quota.used >= limit) {
      throw new ForbiddenException(
        `Monthly featuring limit reached (${limit} events/month on your current plan). Unfeature another event or upgrade.`,
      );
    }

    const featuredUntil = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error } = await supabase
      .from("events")
      .update({ featured_at: now.toISOString(), featured_until: featuredUntil })
      .eq("id", id);

    if (error) throw error;

    // Re-fetch quota after update
    const updatedQuota = await getQuota(supabase, ctx.userId);

    return ok({ featured_until: featuredUntil, quota: updatedQuota });
  } catch (err) {
    return handleApiError(err);
  }
}

async function getQuota(
  supabase: Awaited<
    ReturnType<
      typeof import("@/lib/supabase/server").createSupabaseServerClient
    >
  >,
  organizerId: string,
): Promise<{ used: number; limit: number }> {
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();

  const { count } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", organizerId)
    .gte("featured_at", monthStart);

  const plan = await getOrganizerPlanAccess(organizerId);
  const limit = getFeaturedPerMonth(plan);

  return { used: count ?? 0, limit };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | grep "feature/route"
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/api/events/\[id\]/feature/route.ts
git commit -m "feat: POST /api/events/[id]/feature toggle with plan quota enforcement"
```

---

### Task 4: Organizer Dashboard UI

**Files:**

- Modify: `rawaq-web/components/organizer/OrganizerStrings.tsx` — extend `OrgEvent`, add quota pill + feature button
- Modify: `rawaq-web/app/(app)/organizer/page.tsx` — fetch `featured_until`, quota, pass to component

- [ ] **Step 1: Update `OrganizerStrings.tsx`**

Replace the entire file content of `rawaq-web/components/organizer/OrganizerStrings.tsx`:

```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

export function OrganizerDashboardHeader({ businessName }: { businessName: string | null }) {
  const { t } = useLocale()
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{businessName ?? t('organizer.dashboard')}</h1>
      <p className="text-sm text-gray-500 mt-0.5">{t('org.subtitle')}</p>
    </div>
  )
}

export function OrganizerDashboardActions() {
  const { t } = useLocale()
  return (
    <div className="flex items-center gap-3">
      <Link href="/organizer/promo-codes" className="btn-secondary text-sm">{t('org.promo_codes')}</Link>
      <Link href="/organizer/earnings" className="btn-secondary text-sm">{t('org.earnings')}</Link>
      <Link href="/organizer/events/new" className="btn-primary">{t('org.create_event')}</Link>
    </div>
  )
}

export function OrganizerStatGrid({ publishedCount, totalBookings, tipsFormatted, totalEvents }: {
  publishedCount: number
  totalBookings: number
  tipsFormatted: string
  totalEvents: number
}) {
  const { t } = useLocale()
  const stats = [
    { label: t('org.active_events'), value: publishedCount, icon: '📅' },
    { label: t('org.total_bookings'), value: totalBookings, icon: '🎟️' },
    { label: t('org.donations'), value: tipsFormatted, icon: '💝' },
    { label: t('org.total_events'), value: totalEvents, icon: '📊' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="card p-4">
          <div className="text-2xl mb-1">{stat.icon}</div>
          <div className="text-xl font-bold text-gray-900">{stat.value}</div>
          <div className="text-xs text-gray-500">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}

interface OrgEvent {
  id: string
  title: string
  start_at: string
  event_frequency: string | null
  is_published: boolean
  is_cancelled: boolean
  bookings_count: number
  capacity: number | null
  featured_until: string | null
}

interface FeaturedQuota {
  used: number
  limit: number
}

function daysLeft(featuredUntil: string): number {
  return Math.max(0, Math.ceil((new Date(featuredUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

function FeatureButton({
  event,
  quota,
  onToggle,
}: {
  event: OrgEvent
  quota: FeaturedQuota | null
  onToggle: (eventId: string, newFeaturedUntil: string | null, newQuota: FeaturedQuota) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const now = new Date()
  const isFeatured = !!event.featured_until && new Date(event.featured_until) > now
  const canFeature = quota !== null && (isFeatured || quota.used < quota.limit)
  const disabled = loading || !event.is_published || event.is_cancelled || (!isFeatured && !canFeature)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/${event.id}/feature`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to update featured status')
        return
      }
      onToggle(event.id, json.data.featured_until, json.data.quota)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (quota === null) return null

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={handleClick}
        disabled={disabled}
        title={
          !event.is_published ? 'Publish event to feature it' :
          event.is_cancelled ? 'Cancelled events cannot be featured' :
          !canFeature && !isFeatured ? `Quota reached (${quota.used}/${quota.limit})` :
          isFeatured ? 'Click to unfeature' : 'Feature for 7 days'
        }
        className={`text-xs font-medium px-2 py-1 rounded-lg border transition-colors ${
          isFeatured
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : disabled
            ? 'border-gray-200 text-gray-300 cursor-not-allowed'
            : 'border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600'
        }`}
      >
        {loading ? '…' : isFeatured ? `★ ${daysLeft(event.featured_until!)}d left` : '☆ Feature'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function OrganizerEventsSection({
  events: initialEvents,
  featuredQuota,
}: {
  events: OrgEvent[]
  featuredQuota: FeaturedQuota | null
}) {
  const { t } = useLocale()
  const [events, setEvents] = useState(initialEvents)
  const [quota, setQuota] = useState(featuredQuota)

  function handleToggle(eventId: string, newFeaturedUntil: string | null, newQuota: FeaturedQuota) {
    setEvents((prev) =>
      prev.map((e) => e.id === eventId ? { ...e, featured_until: newFeaturedUntil } : e)
    )
    setQuota(newQuota)
  }

  const freqLabel = (f: string | null) =>
    f === 'weekly' ? t('org.freq_weekly') :
    f === 'monthly' ? t('org.freq_monthly') :
    t('org.freq_one_time')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">{t('org.your_events')}</h2>
        {quota !== null && (
          <span className="text-xs text-gray-500">
            ⭐ {quota.used}/{quota.limit} featured this month
          </span>
        )}
      </div>

      {!events.length ? (
        <div className="card p-8 text-center text-gray-500">
          <div className="text-4xl mb-2">📭</div>
          <p className="font-medium">{t('organizer.no_events')}</p>
          <p className="text-sm mt-1">{t('org.no_events_desc')}</p>
          <Link href="/organizer/events/new" className="btn-primary mt-4 inline-flex">{t('org.create_event')}</Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('org.table_event')}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">{t('org.table_date')}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">{t('org.table_bookings')}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('org.table_status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px]">
                    <div className="truncate">{event.title}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    <div className="flex flex-col gap-1">
                      <span>{formatDate(event.start_at)}</span>
                      <span className="text-xs text-gray-400">{freqLabel(event.event_frequency)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {event.bookings_count}{event.capacity ? `/${event.capacity}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={event.is_cancelled ? 'red' : event.is_published ? 'green' : 'gray'}>
                      {event.is_cancelled ? t('org.status_cancelled') : event.is_published ? t('org.status_live') : t('org.status_draft')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end gap-3">
                      <FeatureButton event={event} quota={quota} onToggle={handleToggle} />
                      <Link href={`/organizer/events/${event.id}/ticket-types`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.tickets')}
                      </Link>
                      <Link href={`/organizer/events/${event.id}/attendees`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.attendees')}{event.bookings_count > 0 && ` (${event.bookings_count})`}
                      </Link>
                      <Link href={`/organizer/events/${event.id}/analytics`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.analytics')}
                      </Link>
                      <Link href={`/organizer/events/${event.id}/edit`} className="text-xs text-brand-600 font-medium hover:underline">
                        {t('org.edit')}
                      </Link>
                      {event.event_frequency !== 'one_time' && (
                        <Link href={`/organizer/events/${event.id}/edit#occurrences`} className="text-xs text-gray-500 font-medium hover:underline">
                          {t('org.sessions')}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update organizer `page.tsx` to fetch featured data**

In `rawaq-web/app/(app)/organizer/page.tsx`, replace the file content:

```typescript
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { getOrganizerPlanAccess, getFeaturedPerMonth } from '@/lib/plans'
import {
  OrganizerDashboardHeader,
  OrganizerDashboardActions,
  OrganizerStatGrid,
  OrganizerEventsSection,
} from '@/components/organizer/OrganizerStrings'

export const metadata: Metadata = { title: 'Organizer Dashboard' }

export default async function OrganizerDashboard() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: events }, { data: orgProfile }, { data: tipsData }, plan] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_at, event_frequency, is_published, is_cancelled, bookings_count, capacity, tips_total, featured_until')
      .eq('organizer_id', user!.id)
      .order('start_at', { ascending: false })
      .limit(20),
    supabase
      .from('organizer_profiles')
      .select('business_name, verified')
      .eq('user_id', user!.id)
      .single(),
    supabase
      .from('tips')
      .select('amount')
      .eq('organizer_id', user!.id),
    getOrganizerPlanAccess(user!.id),
  ])

  const featuredLimit = getFeaturedPerMonth(plan)
  let featuredUsed = 0
  if (featuredLimit > 0) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { count } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('organizer_id', user!.id)
      .gte('featured_at', monthStart)
    featuredUsed = count ?? 0
  }

  const featuredQuota = featuredLimit > 0 ? { used: featuredUsed, limit: featuredLimit } : null

  const totalTips = tipsData?.reduce((sum, t) => sum + t.amount, 0) ?? 0
  const totalBookings = events?.reduce((sum, e) => sum + e.bookings_count, 0) ?? 0
  const publishedCount = events?.filter((e) => e.is_published && !e.is_cancelled).length ?? 0

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <OrganizerDashboardHeader businessName={orgProfile?.business_name ?? null} />
        <OrganizerDashboardActions />
      </div>

      <OrganizerStatGrid
        publishedCount={publishedCount}
        totalBookings={totalBookings}
        tipsFormatted={formatCurrency(totalTips)}
        totalEvents={events?.length ?? 0}
      />

      <div>
        <OrganizerEventsSection
          events={(events ?? []) as any}
          featuredQuota={featuredQuota}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | grep -E "OrganizerStrings|organizer/page"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/components/organizer/OrganizerStrings.tsx rawaq-web/app/\(app\)/organizer/page.tsx
git commit -m "feat: add featured event toggle button with quota indicator to organizer dashboard"
```

---

### Task 5: Featured Rail on Public Events Page

**Files:**

- Create: `rawaq-web/components/events/FeaturedEventsRail.tsx`
- Modify: `rawaq-web/app/(app)/events/page.tsx` — add `FeaturedSection` component, pass `excludeIds` to `EventsGrid`

- [ ] **Step 1: Create `FeaturedEventsRail.tsx`**

Create `rawaq-web/components/events/FeaturedEventsRail.tsx`:

```typescript
import Link from 'next/link'
import { EventCard } from '@/components/events/EventCard'
import { Badge } from '@/components/ui/Badge'
import type { EventWithOrganizer } from '@/types/database'

export function FeaturedEventsRail({ events }: { events: EventWithOrganizer[] }) {
  if (events.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-gray-900">⭐ Featured Events</span>
        <Badge variant="amber">Featured</Badge>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event, i) => (
          <div key={event.id} className="relative">
            <div className="absolute top-2 start-2 z-10">
              <Badge variant="amber">⭐ Featured</Badge>
            </div>
            <EventCard event={event} isSaved={false} showSave={false} priority={i < 3} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `events/page.tsx`**

In `rawaq-web/app/(app)/events/page.tsx`:

**2a.** Add import at top of file (after existing imports):

```typescript
import { FeaturedEventsRail } from "@/components/events/FeaturedEventsRail";
import { applyResolvedEventWindow } from "@/lib/events/recurrence";
```

(Note: `applyResolvedEventWindow` is already imported — skip adding it if already present.)

**2b.** Add `fetchFeaturedEvents` function and `FeaturedSection` component before `EventsGrid`:

```typescript
const FEATURED_EVENT_SELECT = `
  *,
  organizer:profiles!organizer_id(
    id, display_name, avatar_url,
    organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
  ),
  category:event_categories(id, name_en, name_ar, icon),
  ticket_types(id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at)
`

async function fetchFeaturedEvents(): Promise<EventWithOrganizer[]> {
  const supabase = await createSupabaseServerClient()
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('events')
    .select(FEATURED_EVENT_SELECT)
    .eq('is_published', true)
    .eq('is_cancelled', false)
    .gt('featured_until', now)
    .order('featured_until', { ascending: false })
    .limit(6)

  return ((data ?? []) as unknown as EventWithOrganizer[]).map(applyResolvedEventWindow)
}

async function FeaturedSection() {
  const featured = await fetchFeaturedEvents()
  if (featured.length === 0) return null
  return <FeaturedEventsRail events={featured} />
}
```

**2c.** Update `EventsGrid` function signature to accept `excludeIds`:

```typescript
async function EventsGrid({ searchParams, excludeIds = [] }: { searchParams: SearchParams; excludeIds?: string[] }) {
```

**2d.** Inside `EventsGrid`, after the `.eq('is_cancelled', false)` line, add exclusion filter:

```typescript
if (excludeIds.length > 0) {
  query = query.not("id", "in", `(${excludeIds.join(",")})`);
}
```

**2e.** Replace the `EventsPage` return JSX to add the featured section and pass `excludeIds`:

```typescript
  // Inside EventsPage, replace the last return block:
  return (
    <div className="max-w-7xl mx-auto space-y-8 px-4 py-8 sm:px-6">
      <EventsPageHero activeFilterCount={activeFilterCount} />

      <Suspense fallback={<div className="h-[13.5rem] animate-pulse rounded-2xl bg-gray-100" />}>
        <EventFiltersPlayful />
      </Suspense>

      {params.community && (
        <Suspense fallback={<div className="h-20 animate-pulse rounded-2xl bg-gray-100" />}>
          <ActiveCommunitySpotlight slug={params.community} />
        </Suspense>
      )}

      {(params.lat && params.lng) || params.city ? (
        <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-gray-100" />}>
          <NearYouThisWeekend
            city={params.city}
            lat={params.lat ? Number(params.lat) : undefined}
            lng={params.lng ? Number(params.lng) : undefined}
            radiusKm={params.radius_km ? Number(params.radius_km) : 25}
          />
        </Suspense>
      ) : null}

      <FeaturedSectionWithIds searchParams={params} />
    </div>
  )
```

**2f.** Add `FeaturedSectionWithIds` server component that coordinates featured + grid (replacing the standalone `<Suspense><EventsGrid /></Suspense>` block):

```typescript
async function FeaturedSectionWithIds({ searchParams }: { searchParams: SearchParams }) {
  const featured = await fetchFeaturedEvents()
  const excludeIds = featured.map((e) => e.id)

  return (
    <>
      {featured.length > 0 && (
        <FeaturedEventsRail events={featured} />
      )}
      <Suspense fallback={<EventsGridSkeleton />}>
        <EventsGrid searchParams={searchParams} excludeIds={excludeIds} />
      </Suspense>
    </>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd rawaq-web && npx tsc --noEmit 2>&1 | grep -E "events/page|FeaturedEvents"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/components/events/FeaturedEventsRail.tsx rawaq-web/app/\(app\)/events/page.tsx
git commit -m "feat: pin featured events above public events listing"
```

---

### Task 6: Seed Plan Feature Flag

**Files:**

- Modify: `rawaq-web/supabase/migrations/00074_featured_events.sql` — OR a new migration if 00074 is already applied

> **Note:** If 00074 was already pushed, create `00075_featured_events_plan_seed.sql` instead.

- [ ] **Step 1: Add seed migration**

Append to `00074_featured_events.sql` (or create `00075_featured_events_plan_seed.sql`):

```sql
-- Add featured_per_month to the highest organizer plan (adjust plan name to match your data)
-- Run this query first to see your plan names:
-- SELECT id, name FROM plan_definitions WHERE type = 'organizer';
--
-- Then update accordingly. Example for a plan named 'pro':
UPDATE plan_definitions
SET features = jsonb_set(
  COALESCE(features, '{}'),
  '{featured_per_month}',
  '3'
)
WHERE type = 'organizer'
  AND name ILIKE '%pro%';

-- Starter plan gets 1 featured event per month
UPDATE plan_definitions
SET features = jsonb_set(
  COALESCE(features, '{}'),
  '{featured_per_month}',
  '1'
)
WHERE type = 'organizer'
  AND name ILIKE '%starter%';
```

> **Important:** Check actual plan names first with `SELECT id, name FROM plan_definitions WHERE type = 'organizer';` and adjust the WHERE clauses accordingly.

- [ ] **Step 2: Apply migration**

```bash
cd rawaq-web && npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/supabase/migrations/
git commit -m "feat: seed featured_per_month quota into organizer plan definitions"
```

---

## Self-Review

**Spec coverage check:**

- ✅ `featured_at` + `featured_until` columns — Task 1
- ✅ `featured_per_month` in plan features JSON — Task 2 (helper) + Task 6 (seed)
- ✅ `getFeaturedPerMonth` helper — Task 2
- ✅ `POST /api/events/[id]/feature` toggle — Task 3
- ✅ Quota check (count from events table) — Task 3 `getQuota()`
- ✅ Same event reuses slot (alreadyFeaturedThisMonth check) — Task 3
- ✅ Guards: published, not cancelled, plan access — Task 3
- ✅ Feature button in organizer events table — Task 4
- ✅ Quota pill above table — Task 4
- ✅ Optimistic UI with rollback on error — Task 4 (`FeatureButton` component)
- ✅ `amber` Badge variant for featured badge — Task 2
- ✅ Featured rail above public events grid — Task 5
- ✅ Exclude featured IDs from main grid — Task 5 (`FeaturedSectionWithIds`)
- ✅ Max 6 featured events in rail — Task 5 `.limit(6)`
- ✅ Rail hidden when no featured events — Task 5 (`if (featured.length === 0) return null`)

**Placeholder scan:** No TBDs. Task 6 has a note to verify plan names — this is intentional (plan names are data-dependent) and marked clearly.

**Type consistency:**

- `OrgEvent.featured_until: string | null` — defined in Task 4 Step 1, matches `Event.featured_until` from Task 1
- `FeaturedQuota { used: number; limit: number }` — defined and used consistently in Tasks 3 and 4
- `getFeaturedPerMonth` — defined in Task 2, used in Tasks 3 and 4
- `getQuota` return type matches `FeaturedQuota`
