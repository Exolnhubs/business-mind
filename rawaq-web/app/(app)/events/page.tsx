import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventCardDark, EventCardDarkSkeleton } from '@/components/events/EventCardDark'
import { EventFiltersDark } from '@/components/events/EventFiltersDark'
import { EventsPageHeroDark } from '@/components/events/EventsPageHeroDark'
import { EventsGridEmpty, EventsGridPagination } from '@/components/events/EventsGridFeedback'
import { HorizontalDragScroll } from '@/components/ui/HorizontalDragScroll'
import type { EventWithOrganizer } from '@/types/database'
import { getCachedFeaturedEvents, getCachedEventsGrid, getCachedWeekendEvents } from '@/lib/events/cache'

export const metadata: Metadata = { title: 'Events' }

// ── Types ──────────────────────────────────────────────────────────────────────
interface SearchParams {
  q?: string
  category?: string
  city?: string
  community?: string
  gender?: string
  free?: string
  family?: string
  hot?: string
  page?: string
  lat?: string
  lng?: string
  radius_km?: string
}

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_SIZE = 12

// ── Weekend date helper ────────────────────────────────────────────────────────
function getThisWeekendRange(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay()
  if (day === 0) {
    const start = new Date(now); start.setHours(0, 0, 0, 0)
    const end   = new Date(now); end.setHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }
  const daysToSat = day === 6 ? 0 : (6 - day + 7) % 7
  const saturday  = new Date(now); saturday.setDate(now.getDate() + daysToSat); saturday.setHours(0, 0, 0, 0)
  const sunday    = new Date(saturday); sunday.setDate(saturday.getDate() + 1); sunday.setHours(23, 59, 59, 999)
  return { start: saturday.toISOString(), end: sunday.toISOString() }
}

// ── Dark section header ────────────────────────────────────────────────────────
function DarkRailHeader({
  eyebrow,
  title,
  color = 'var(--c-gold)',
}: {
  eyebrow: string
  title: string
  color?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}`,
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: `${color}99`,
        fontFamily: 'var(--font-display)',
      }}>
        {eyebrow}
      </span>
      <span style={{
        fontSize: 15, fontWeight: 700,
        color: 'oklch(0.94 0.01 82)',
        fontFamily: 'var(--font-display)',
      }}>
        {title}
      </span>
    </div>
  )
}

// ── Dark horizontal scroll rail ───────────────────────────────────────────────
function DarkEventRail({
  events,
  eyebrow,
  title,
  color,
}: {
  events: EventWithOrganizer[]
  eyebrow: string
  title: string
  color?: string
}) {
  if (!events.length) return null
  return (
    <div style={{
      borderTop: '1px solid oklch(1 0 0 / 0.06)',
      paddingTop: '2rem',
      marginBottom: '2rem',
    }}>
      <DarkRailHeader eyebrow={eyebrow} title={title} color={color} />
      <HorizontalDragScroll
        ariaLabel={title}
        contentStyle={{ gap: 16, paddingBottom: 12, marginInlineStart: -4, paddingInlineStart: 4 }}
      >
        {events.map((event, i) => (
          <div key={event.id} style={{ flexShrink: 0, width: 256 }}>
            <EventCardDark event={event} priority={i < 3} />
          </div>
        ))}
      </HorizontalDragScroll>
    </div>
  )
}

// ── Featured rail + main grid (shares excludeIds) ─────────────────────────────
async function FeaturedRailAndGrid({ searchParams }: { searchParams: SearchParams }) {
  const featured = await getCachedFeaturedEvents()
  const excludeIds = featured.map((e) => e.id)

  return (
    <>
      {featured.length > 0 && (
        <DarkEventRail
          events={featured}
          eyebrow="⭐ Curated"
          title="Trending Now"
          color="var(--c-gold)"
        />
      )}
      <div style={{
        borderTop: '1px solid oklch(1 0 0 / 0.06)',
        paddingTop: '2rem',
      }}>
        <DarkRailHeader eyebrow="All Events" title="Browse & Discover" color="oklch(0.52 0.015 72)" />
        <Suspense fallback={<EventsGridSkeleton />}>
          <EventsGrid searchParams={searchParams} excludeIds={excludeIds} />
        </Suspense>
      </div>
    </>
  )
}

// ── Near You This Weekend rail ────────────────────────────────────────────────
async function WeekendRailDark({
  city,
  lat,
  lng,
  radiusKm = 25,
}: {
  city?: string
  lat?: number
  lng?: number
  radiusKm?: number
}) {
  if (!city && (!lat || !lng)) return null

  const { start, end } = getThisWeekendRange()
  const events = await getCachedWeekendEvents({
    city,
    lat,
    lng,
    radiusKm,
    weekendStart: start,
    weekendEnd: end,
  })

  if (!events.length) return null

  const locationLabel = lat && lng ? `within ${radiusKm}km` : city
  return (
    <DarkEventRail
      events={events}
      eyebrow={`📍 ${locationLabel}`}
      title="Near You This Weekend"
      color="#3dba6a"
    />
  )
}

// ── Community spotlight (dark) ────────────────────────────────────────────────
async function CommunitySpotlightDark({ slug }: { slug: string }) {
  const supabase = await createSupabaseServerClient()
  const { data: community } = await supabase
    .from('communities')
    .select('id, name, name_ar, slug, level, city, member_count')
    .eq('slug', slug)
    .single()

  if (!community) return null

  return (
    <div style={{
      background: 'oklch(0.14 0.022 68)',
      border: '1px solid oklch(0.78 0.18 72 / 0.22)',
      borderRadius: '1.25rem',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginBottom: '1.5rem',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: 'oklch(0.78 0.18 72 / 0.6)',
        fontFamily: 'var(--font-display)',
      }}>
        🏘 Community Lens
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17,
            color: 'oklch(0.94 0.01 82)', marginBottom: 4,
          }}>
            {community.name}
          </div>
          <div style={{ fontSize: 12, color: 'oklch(0.52 0.015 72)', fontFamily: 'var(--font-sans)' }}>
            Showing events connected to this community
            {community.city ? ` in ${community.city}` : ''}.{' '}
            <span style={{ color: 'var(--c-gold)', fontWeight: 600 }}>
              {community.member_count.toLocaleString()} members.
            </span>
          </div>
        </div>
        <Link
          href={`/communities/${community.slug}`}
          style={{
            fontSize: 12, fontWeight: 700, color: 'var(--c-gold)',
            background: 'oklch(0.78 0.18 72 / 0.10)',
            border: '1px solid oklch(0.78 0.18 72 / 0.28)',
            padding: '6px 16px', borderRadius: 20,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          View community →
        </Link>
      </div>
    </div>
  )
}

// ── Events grid (server component — cached public data, auth outside cache) ────
async function EventsGrid({
  searchParams,
  excludeIds = [],
}: {
  searchParams: SearchParams
  excludeIds?: string[]
}) {
  const page = Math.max(1, Number(searchParams.page ?? 1))
  const from = (page - 1) * PAGE_SIZE

  // Cached: pure public event data — no cookies, no auth
  const { q, category, city, community, gender, free, family, hot, lat, lng, radius_km } = searchParams
  const resolved = await getCachedEventsGrid(
    { q, category, city, community, gender, free, family, hot, lat, lng, radius_km },
    excludeIds,
  )

  // Auth + saved events: outside the cache, reads cookies
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  let savedIds = new Set<string>()
  if (user) {
    const { data: saves } = await supabase
      .from('saved_events').select('event_id').eq('user_id', user.id)
    savedIds = new Set((saves ?? []).map((s: { event_id: string }) => s.event_id))
  }

  if (!resolved.length) return <EventsGridEmpty />

  const paged = resolved.slice(from, from + PAGE_SIZE)
  const totalPages = Math.ceil(resolved.length / PAGE_SIZE)

  function pageUrl(p: number) {
    const sp = new URLSearchParams(
      Object.entries(searchParams).filter(([, v]) => v != null) as [string, string][],
    )
    if (p === 1) sp.delete('page')
    else sp.set('page', String(p))
    const qs = sp.toString()
    return `/events${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {paged.map((event, i) => (
          <EventCardDark
            key={event.id}
            event={event}
            isSaved={savedIds.has(event.id)}
            showSave={!!user}
            priority={i < 4}
          />
        ))}
      </div>
      {totalPages > 1 && (
        <EventsGridPagination
          page={page}
          totalPages={totalPages}
          count={resolved.length}
          previousHref={pageUrl(page - 1)}
          nextHref={pageUrl(page + 1)}
        />
      )}
    </div>
  )
}

function EventsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => <EventCardDarkSkeleton key={i} />)}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const activeFilterCount = [
    params.q,
    params.category,
    params.city,
    params.community,
    params.gender,
    params.free === 'true' ? 'free' : null,
    params.family === 'true' ? 'family' : null,
    params.hot === 'true' ? 'hot' : null,
    params.lat && params.lng ? 'geo' : null,
  ].filter(Boolean).length

  // Curated rails only shown when no content filters are active
  const hasContentFilters = !!(
    params.q || params.category || params.gender ||
    params.free || params.family || params.hot
  )

  return (
    <div className="page-dark">
      {/* ── Hero ── */}
      <EventsPageHeroDark activeFilterCount={activeFilterCount} />

      {/* ── Sticky filter panel ── */}
      <div
        style={{
          position: 'sticky', top: 64, zIndex: 50,
          background: 'var(--c-ink-mid)',
          padding: '0 1.5rem',
        }}
      >
        <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
          <Suspense fallback={<div style={{ height: '13rem' }} />}>
            <EventFiltersDark />
          </Suspense>
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '2.5rem 1.5rem 5rem' }}>

        {/* Community context banner */}
        {params.community && (
          <Suspense fallback={null}>
            <CommunitySpotlightDark slug={params.community} />
          </Suspense>
        )}

        {/* Near You This Weekend — only without content filters */}
        {!hasContentFilters && ((params.lat && params.lng) || params.city) && (
          <Suspense fallback={null}>
            <WeekendRailDark
              city={params.city}
              lat={params.lat ? Number(params.lat) : undefined}
              lng={params.lng ? Number(params.lng) : undefined}
              radiusKm={params.radius_km ? Number(params.radius_km) : 25}
            />
          </Suspense>
        )}

        {/* Trending Now rail + main grid (featured excluded from grid) */}
        {!hasContentFilters ? (
          <Suspense fallback={<EventsGridSkeleton />}>
            <FeaturedRailAndGrid searchParams={params} />
          </Suspense>
        ) : (
          <Suspense fallback={<EventsGridSkeleton />}>
            <EventsGrid searchParams={params} />
          </Suspense>
        )}

      </div>
    </div>
  )
}
