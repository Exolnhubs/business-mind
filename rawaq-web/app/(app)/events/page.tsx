import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'
import { EventFilters } from '@/components/events/EventFilters'
import { EmptyState } from '@/components/ui/EmptyState'
import type { EventWithOrganizer } from '@/types/database'

export const metadata: Metadata = { title: 'Events' }

interface SearchParams {
  q?: string
  category?: string
  city?: string
  gender?: string
  free?: string
  family?: string
  page?: string
}

const PAGE_SIZE = 12

async function EventsGrid({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient()

  const page = Math.max(1, Number(searchParams.page ?? 1))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('events')
    .select(`
      *,
      organizer:profiles!organizer_id(id, display_name, avatar_url),
      organizer_profile:organizer_profiles!organizer_id(business_name, business_name_ar, logo_url, verified),
      category:event_categories(id, name_en, name_ar, icon)
    `)
    .eq('is_published', true)
    .eq('is_cancelled', false)
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .range(from, to)

  if (searchParams.q) query = query.ilike('title', `%${searchParams.q}%`)
  if (searchParams.city) query = query.eq('city', searchParams.city)
  if (searchParams.gender) query = query.eq('gender_restriction', searchParams.gender)
  if (searchParams.free === 'true') query = query.eq('is_free', true)
  if (searchParams.family === 'true') query = query.eq('is_family_friendly', true)
  if (searchParams.category) {
    // Filter by category name via join — fetch category id first
    const { data: cat } = await supabase
      .from('event_categories')
      .select('id')
      .ilike('name_en', searchParams.category)
      .single()
    if (cat) query = query.eq('category_id', cat.id)
    else return <EmptyState icon="🔍" title="No events found" description="Try adjusting your filters" />
  }

  const { data: events, error } = await query

  if (error) {
    return (
      <div className="text-center py-16 text-red-500 text-sm">
        Failed to load events: {error.message}
      </div>
    )
  }

  if (!events?.length) {
    return <EmptyState icon="📭" title="No events found" description="Try adjusting your filters" />
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {(events as EventWithOrganizer[]).map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
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

      {/* Grid */}
      <Suspense fallback={<EventsGridSkeleton />}>
        <EventsGrid searchParams={params} />
      </Suspense>
    </div>
  )
}
