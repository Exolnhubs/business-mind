import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EventFiltersPlayful } from '@/components/events/EventFiltersPlayful'
import { EventsPageHero } from '@/components/events/EventsPageHero'
import { EventsPageWeekendRail } from '@/components/events/EventsPageWeekendRail'
import { EventsGridEmpty, EventsGridError, EventsGridPagination } from '@/components/events/EventsGridFeedback'
import type { EventWithOrganizer } from '@/types/database'

export const metadata: Metadata = { title: 'Events' }

function getThisWeekendRange(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay()
  if (day === 0) {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }
  const daysToSat = day === 6 ? 0 : (6 - day + 7) % 7
  const saturday = new Date(now)
  saturday.setDate(now.getDate() + daysToSat)
  saturday.setHours(0, 0, 0, 0)
  const sunday = new Date(saturday)
  sunday.setDate(saturday.getDate() + 1)
  sunday.setHours(23, 59, 59, 999)
  return { start: saturday.toISOString(), end: sunday.toISOString() }
}

async function NearYouThisWeekend({
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

  const supabase = await createSupabaseServerClient()
  const { start, end } = getThisWeekendRange()

  const eventSelect = `
    *,
    organizer:profiles!organizer_id(
      id, display_name, avatar_url,
      organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
    ),
    category:event_categories(id, name_en, name_ar, icon),
    ticket_types(id, price, is_free, is_active)
  `

  let events: EventWithOrganizer[] = []

  if (lat && lng) {
    const { data: geoIds } = await supabase.rpc('events_within_radius', {
      user_lat: lat,
      user_lng: lng,
      radius_meters: radiusKm * 1000,
    })
    const ids = ((geoIds ?? []) as { id: string }[]).map((event) => event.id)
    if (ids.length > 0) {
      const { data } = await supabase
        .from('events')
        .select(eventSelect)
        .in('id', ids)
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .gte('start_at', start)
        .lte('start_at', end)
        .order('start_at', { ascending: true })
        .limit(8)
      events = (data ?? []) as unknown as EventWithOrganizer[]
    }
  } else if (city) {
    const { data } = await supabase
      .from('events')
      .select(eventSelect)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .eq('city', city)
      .gte('start_at', start)
      .lte('start_at', end)
      .order('start_at', { ascending: true })
      .limit(8)
    events = (data ?? []) as unknown as EventWithOrganizer[]
  }

  if (events.length === 0) return null

  return <EventsPageWeekendRail events={events} city={city} hasCoordinates={!!(lat && lng)} radiusKm={radiusKm} />
}

async function ActiveCommunitySpotlight({ slug }: { slug?: string }) {
  if (!slug) return null

  const supabase = await createSupabaseServerClient()
  const { data: community } = await supabase
    .from('communities')
    .select('id, name, name_ar, slug, level, city, member_count')
    .eq('slug', slug)
    .single()

  if (!community) return null

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 px-5 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Community Lens</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{community.name}</h2>
          <p className="mt-1 text-sm text-gray-500">
            Showing events connected to this community
            {community.city ? ` in ${community.city}` : ''}. {community.member_count.toLocaleString()} members.
          </p>
        </div>
        <Link href={`/communities/${community.slug}`} className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          View community →
        </Link>
      </div>
    </div>
  )
}

interface SearchParams {
  q?: string
  category?: string
  city?: string
  community?: string
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let savedIds = new Set<string>()
  if (user) {
    const { data: saves } = await supabase.from('saved_events').select('event_id').eq('user_id', user.id)
    savedIds = new Set((saves ?? []).map((save) => save.event_id))
  }

  let query = supabase
    .from('events')
    .select(
      `
      *,
      organizer:profiles!organizer_id(
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
      ),
      category:event_categories(id, name_en, name_ar, icon),
      ticket_types(id, price, is_free, is_active)
    `,
      { count: 'exact' },
    )
    .eq('is_published', true)
    .eq('is_cancelled', false)
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .range(from, to)

  if (searchParams.q) {
    const q = searchParams.q.replace(/'/g, "''")
    query = query.or(`title.ilike.%${q}%,title_ar.ilike.%${q}%,description.ilike.%${q}%`)
  }
  if (searchParams.city) query = query.eq('city', searchParams.city)
  if (searchParams.gender) query = query.eq('gender_restriction', searchParams.gender as import('@/types/database').GenderType)
  if (searchParams.free === 'true') query = query.eq('is_free', true)
  if (searchParams.family === 'true') query = query.eq('is_family_friendly', true)
  if (searchParams.category) query = query.eq('category_id', searchParams.category)
  if (searchParams.community) {
    const { data: community } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', searchParams.community)
      .single()

    if (!community) {
      return <EventsGridEmpty />
    }

    const { data: eventCommunityRows } = await supabase
      .from('event_communities')
      .select('event_id')
      .eq('community_id', community.id)

    const ids = (eventCommunityRows ?? []).map((row) => row.event_id)
    if (ids.length === 0) return <EventsGridEmpty />
    query = query.in('id', ids)
  }

  if (searchParams.lat && searchParams.lng) {
    const { data: geoEvents } = await supabase.rpc('events_within_radius', {
      user_lat: Number(searchParams.lat),
      user_lng: Number(searchParams.lng),
      radius_meters: Number(searchParams.radius_km ?? 25) * 1000,
    })
    if (geoEvents) {
      const ids = (geoEvents as { id: string }[]).map((event) => event.id)
      if (ids.length === 0) return <EventsGridEmpty nearby />
      query = query.in('id', ids)
    }
  }

  const { data: events, error, count } = await query

  if (error) {
    console.error('Supabase query error:', error)
    return <EventsGridError message={error.message} />
  }

  if (!events?.length) {
    return <EventsGridEmpty />
  }

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  function pageUrl(p: number) {
    const sp = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v != null) as [string, string][])
    if (p === 1) sp.delete('page')
    else sp.set('page', String(p))
    const qs = sp.toString()
    return `/events${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(events as unknown as EventWithOrganizer[]).map((event) => (
          <EventCard key={event.id} event={event} isSaved={savedIds.has(event.id)} showSave={!!user} />
        ))}
      </div>

      {totalPages > 1 && (
        <EventsGridPagination
          page={page}
          totalPages={totalPages}
          count={count ?? 0}
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
      {Array.from({ length: 8 }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  )
}

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
    params.lat && params.lng ? 'geo' : null,
  ].filter(Boolean).length

  return (
    <div className="max-w-7xl mx-auto space-y-8 px-4 py-8 sm:px-6">
      <EventsPageHero activeFilterCount={activeFilterCount} />

      <Suspense>
        <EventFiltersPlayful />
      </Suspense>

      <Suspense fallback={null}>
        <ActiveCommunitySpotlight slug={params.community} />
      </Suspense>

      {(params.lat && params.lng) || params.city ? (
        <Suspense fallback={null}>
          <NearYouThisWeekend
            city={params.city}
            lat={params.lat ? Number(params.lat) : undefined}
            lng={params.lng ? Number(params.lng) : undefined}
            radiusKm={params.radius_km ? Number(params.radius_km) : 25}
          />
        </Suspense>
      ) : null}

      <Suspense fallback={<EventsGridSkeleton />}>
        <EventsGrid searchParams={params} />
      </Suspense>
    </div>
  )
}
