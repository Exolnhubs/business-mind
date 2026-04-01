import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EventFilters } from '@/components/events/EventFilters'
import { EmptyState } from '@/components/ui/EmptyState'
import type { EventWithOrganizer } from '@/types/database'

export const metadata: Metadata = { title: 'Events' }

// ── Weekend date range helper ─────────────────────────────────────────────────

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

function getWeekendLabel(): string {
  const now = new Date()
  const day = now.getDay()
  if (day === 0) return 'Today'
  const daysToSat = day === 6 ? 0 : (6 - day + 7) % 7
  const sat = new Date(now); sat.setDate(now.getDate() + daysToSat)
  const sun = new Date(sat);  sun.setDate(sat.getDate() + 1)
  const fmt = (d: Date) => d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  return `${fmt(sat)} – ${fmt(sun)}`
}

// ── Near You This Weekend ─────────────────────────────────────────────────────

async function NearYouThisWeekend({ city }: { city?: string }) {
  if (!city) return null

  const supabase = await createSupabaseServerClient()
  const { start, end } = getThisWeekendRange()

  const { data } = await supabase
    .from('events')
    .select(`
      *,
      organizer:profiles!organizer_id(
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
      ),
      category:event_categories(id, name_en, name_ar, icon),
      ticket_types(id, price, is_free, is_active)
    `)
    .eq('is_published', true)
    .eq('is_cancelled', false)
    .eq('city', city)
    .gte('start_at', start)
    .lte('start_at', end)
    .order('start_at', { ascending: true })
    .limit(8)

  const events = (data ?? []) as unknown as EventWithOrganizer[]
  if (events.length === 0) return null

  return (
    <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
      <div className="mb-3">
        <h2 className="text-base font-bold text-gray-900">📍 Near You This Weekend</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Happening in <span className="font-medium text-green-700">{city}</span>
          {' · '}{getWeekendLabel()}
        </p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {events.map((event) => (
          <div key={event.id} className="shrink-0 w-56">
            <EventCard event={event} />
          </div>
        ))}
      </div>
    </div>
  )
}

interface SearchParams {
  q?: string
  category?: string
  city?: string
  gender?: string
  free?: string
  family?: string
  page?: string
  lat?: string
  lng?: string
  radius_km?: string
}

const PAGE_SIZE = 12

async function EventsGrid({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient()

  const page = Math.max(1, Number(searchParams.page ?? 1))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // Fetch user's saved event IDs (for heart buttons)
  const { data: { user } } = await supabase.auth.getUser()
  let savedIds = new Set<string>()
  if (user) {
    const { data: saves } = await supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', user.id)
    savedIds = new Set((saves ?? []).map((s) => s.event_id))
  }

  let query = supabase
    .from('events')
    .select(`
      *,
      organizer:profiles!organizer_id(
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
      ),
      category:event_categories(id, name_en, name_ar, icon),
      ticket_types(id, price, is_free, is_active)
    `, { count: 'exact' })
    .eq('is_published', true)
    .eq('is_cancelled', false)
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .range(from, to)

  if (searchParams.q) {
    const q = searchParams.q.replace(/'/g, "''") // escape single quotes
    query = query.or(`title.ilike.%${q}%,title_ar.ilike.%${q}%,description.ilike.%${q}%`)
  }
  if (searchParams.city) query = query.eq('city', searchParams.city)
  if (searchParams.gender) query = query.eq('gender_restriction', searchParams.gender as import('@/types/database').GenderType)
  if (searchParams.free === 'true') query = query.eq('is_free', true)
  if (searchParams.family === 'true') query = query.eq('is_family_friendly', true)
  
  // Handle category filter
  if (searchParams.category) {
    query = query.eq('category_id', searchParams.category)
  }

  // Geo filter — PostGIS radius query
  if (searchParams.lat && searchParams.lng) {
    const { data: geoEvents } = await supabase.rpc('events_within_radius', {
      user_lat: Number(searchParams.lat),
      user_lng: Number(searchParams.lng),
      radius_meters: Number(searchParams.radius_km ?? 25) * 1000,
    })
    if (geoEvents) {
      const ids = (geoEvents as { id: string }[]).map((e) => e.id)
      if (ids.length === 0) return <EmptyState icon="📍" title="No events nearby" description="Try a larger radius or explore all events" />
      query = query.in('id', ids)
    }
  }

  const { data: events, error, count } = await query

  if (error) {
    console.error('Supabase query error:', error)
    return (
      <div className="text-center py-16 text-red-500 text-sm">
        Failed to load events: {error.message}
      </div>
    )
  }

  if (!events?.length) {
    return <EmptyState icon="📭" title="No events found" description="Try adjusting your filters" />
  }

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  // Build a URL that preserves all current filters but changes ?page
  function pageUrl(p: number) {
    const sp = new URLSearchParams(
      Object.entries(searchParams).filter(([, v]) => v != null) as [string, string][]
    )
    if (p === 1) sp.delete('page')
    else sp.set('page', String(p))
    const qs = sp.toString()
    return `/events${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {(events as unknown as EventWithOrganizer[]).map((event) => (
          <EventCard
            key={event.id}
            event={event}
            isSaved={savedIds.has(event.id)}
            showSave={!!user}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <a
            href={pageUrl(page - 1)}
            aria-disabled={page <= 1}
            className={`px-4 py-2 text-sm rounded-xl border font-medium transition-colors ${
              page <= 1
                ? 'pointer-events-none border-gray-100 text-gray-300 bg-white'
                : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50'
            }`}
          >
            ← Previous
          </a>

          <span className="text-sm text-gray-500 px-2">
            Page {page} of {totalPages}
            <span className="text-gray-400 ml-1">({count} events)</span>
          </span>

          <a
            href={pageUrl(page + 1)}
            aria-disabled={page >= totalPages}
            className={`px-4 py-2 text-sm rounded-xl border font-medium transition-colors ${
              page >= totalPages
                ? 'pointer-events-none border-gray-100 text-gray-300 bg-white'
                : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50'
            }`}
          >
            Next →
          </a>
        </div>
      )}
    </div>
  )
}

function EventsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => <EventCardSkeleton key={i} />)}
    </div>
  )
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Discover Events</h1>
        <p className="text-gray-500 text-sm mt-1">Find local events that matter to you</p>
      </div>

      {/* Filters */}
      <Suspense>
        <EventFilters />
      </Suspense>

      {/* Near You This Weekend — only when city filter is active */}
      {params.city && (
        <Suspense fallback={null}>
          <NearYouThisWeekend city={params.city} />
        </Suspense>
      )}

      {/* Grid */}
      <Suspense fallback={<EventsGridSkeleton />}>
        <EventsGrid searchParams={params} />
      </Suspense>
    </div>
  )
}