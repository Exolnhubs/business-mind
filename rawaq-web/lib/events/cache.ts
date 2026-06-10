import { unstable_cache } from 'next/cache'
import { createSupabaseCacheClient } from '@/lib/supabase/cache-client'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/events/recurrence'
import type { EventWithOrganizer } from '@/types/database'
import type { GenderType } from '@/types/database'

type SupabaseQueryError = {
  message: string
  code?: string
  details?: string
  hint?: string
}

function throwIfSupabaseError(error: SupabaseQueryError | null, context: string): void {
  if (!error) return
  throw new Error(`${context}: ${error.message}`)
}

const EVENT_SELECT = `
  *,
  organizer:profiles!organizer_id(
    id, display_name, avatar_url,
    organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
  ),
  category:event_categories(id, name_en, name_ar, icon),
  ticket_types(id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at)
`

// ── Featured events rail ──────────────────────────────────────────────────────

const _getCachedFeaturedEvents = unstable_cache(
  async (): Promise<EventWithOrganizer[]> => {
    const supabase = createSupabaseCacheClient()
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gt('featured_until', now)
      .order('featured_until', { ascending: false })
      .limit(8)
    throwIfSupabaseError(error, 'Failed to load featured events')

    return ((data ?? []) as unknown as EventWithOrganizer[]).map((e) =>
      applyResolvedEventWindow(e)
    )
  },
  ['events-featured'],
  { tags: ['events', 'events-featured'], revalidate: 300 }
)

/**
 * Public accessor. The featured rail is decorative — a transient DB hiccup
 * (e.g. statement timeout during a cold start) must never break the page.
 * Degrade to an empty rail and log. The underlying error stays uncached, so the
 * next request retries instead of serving an empty list for the whole
 * revalidate window.
 */
export async function getCachedFeaturedEvents(): Promise<EventWithOrganizer[]> {
  try {
    return await _getCachedFeaturedEvents()
  } catch (err) {
    console.error('[events] featured rail degraded to empty:', err)
    return []
  }
}

// ── Weekend rail ──────────────────────────────────────────────────────────────

const _getCachedWeekendEvents = unstable_cache(
  async (params: {
    city?: string
    lat?: number
    lng?: number
    radiusKm: number
    weekendStart: string
    weekendEnd: string
  }): Promise<EventWithOrganizer[]> => {
    const { city, lat, lng, radiusKm, weekendStart, weekendEnd } = params
    const supabase = createSupabaseCacheClient()
    let events: EventWithOrganizer[] = []

    if (lat && lng) {
      const { data: geoIds, error: geoError } = await supabase.rpc('events_within_radius', {
        user_lat: lat,
        user_lng: lng,
        radius_meters: radiusKm * 1000,
      })
      throwIfSupabaseError(geoError, 'Failed to load weekend event locations')
      const ids = ((geoIds ?? []) as { id: string }[]).map((e) => e.id)
      if (ids.length > 0) {
        const { data, error } = await supabase
          .from('events')
          .select(EVENT_SELECT)
          .in('id', ids)
          .eq('is_published', true)
          .eq('is_cancelled', false)
        throwIfSupabaseError(error, 'Failed to load weekend events')
        events = ((data ?? []) as unknown as EventWithOrganizer[])
          .map((e) => applyResolvedEventWindow(e))
          .filter((e) => e.start_at >= weekendStart && e.start_at <= weekendEnd)
          .sort(compareEventsByResolvedStartAt)
          .slice(0, 8)
      }
    } else if (city) {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .eq('city', city)
        .gte('start_at', weekendStart)
        .lte('start_at', weekendEnd)
        .order('start_at')
        .limit(16)
      throwIfSupabaseError(error, 'Failed to load weekend city events')
      events = ((data ?? []) as unknown as EventWithOrganizer[])
        .map((e) => applyResolvedEventWindow(e))
        .sort(compareEventsByResolvedStartAt)
        .slice(0, 8)
    }

    return events
  },
  ['events-weekend'],
  { tags: ['events'], revalidate: 3600 }
)

/** Public accessor — see {@link getCachedFeaturedEvents} for the degrade rationale. */
export async function getCachedWeekendEvents(params: {
  city?: string
  lat?: number
  lng?: number
  radiusKm: number
  weekendStart: string
  weekendEnd: string
}): Promise<EventWithOrganizer[]> {
  try {
    return await _getCachedWeekendEvents(params)
  } catch (err) {
    console.error('[events] weekend rail degraded to empty:', err)
    return []
  }
}

// ── Main events grid ──────────────────────────────────────────────────────────

export interface GridParams {
  q?: string
  category?: string
  city?: string
  community?: string
  gender?: string
  free?: string
  family?: string
  hot?: string
  lat?: string
  lng?: string
  radius_km?: string
}

const _getCachedEventsGrid = unstable_cache(
  async (params: GridParams): Promise<EventWithOrganizer[]> => {
    const supabase = createSupabaseCacheClient()

    let query = supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('is_published', true)
      .eq('is_cancelled', false)

    if (params.q) {
      const q = params.q.replace(/'/g, "''")
      query = query.or(`title.ilike.%${q}%,title_ar.ilike.%${q}%,description.ilike.%${q}%`)
    }
    if (params.city)   query = query.eq('city', params.city)
    if (params.gender) query = query.eq('gender_restriction', params.gender as GenderType)
    if (params.free === 'true')   query = query.eq('is_free', true)
    if (params.family === 'true') query = query.eq('is_family_friendly', true)

    if (params.hot === 'true') {
      const { data: hotRows, error: hotError } = await supabase
        .from('ticket_types')
        .select('event_id')
        .eq('is_hot_offer', true)
        .eq('is_active', true)
        .gt('hot_offer_ends_at', new Date().toISOString())
      throwIfSupabaseError(hotError, 'Failed to load hot offer events')
      const hotIds = (hotRows ?? []).map((r: { event_id: string }) => r.event_id).filter(Boolean)
      if (hotIds.length === 0) return []
      query = query.in('id', hotIds)
    }

    if (params.category) query = query.eq('category_id', params.category)

    if (params.community) {
      const { data: community, error: communityError } = await supabase
        .from('communities')
        .select('id')
        .eq('slug', params.community)
        .single()
      if (communityError && communityError.code !== 'PGRST116') {
        throwIfSupabaseError(communityError, 'Failed to load event community')
      }
      if (!community) return []
      const { data: ecRows, error: eventCommunitiesError } = await supabase
        .from('event_communities')
        .select('event_id')
        .eq('community_id', (community as { id: string }).id)
      throwIfSupabaseError(eventCommunitiesError, 'Failed to load community events')
      const ids = (ecRows ?? []).map((r: { event_id: string }) => r.event_id)
      if (ids.length === 0) return []
      query = query.in('id', ids)
    }

    if (params.lat && params.lng) {
      const { data: geoEvents, error: geoError } = await supabase.rpc('events_within_radius', {
        user_lat: Number(params.lat),
        user_lng: Number(params.lng),
        radius_meters: Number(params.radius_km ?? 25) * 1000,
      })
      throwIfSupabaseError(geoError, 'Failed to load nearby events')
      const ids = ((geoEvents ?? []) as { id: string }[]).map((e) => e.id)
      if (ids.length === 0) return []
      query = query.in('id', ids)
    }

    const { data: events, error } = await query.limit(240)
    throwIfSupabaseError(error, 'Failed to load events grid')

    return ((events ?? []) as unknown as EventWithOrganizer[])
      .map((e) => applyResolvedEventWindow(e))
      .filter((e) => new Date(e.start_at).getTime() >= Date.now())
      .sort(compareEventsByResolvedStartAt)
  },
  ['events-grid'],
  { tags: ['events'], revalidate: 300 }
)

/** Public accessor — see {@link getCachedFeaturedEvents} for the degrade rationale. */
export async function getCachedEventsGrid(params: GridParams): Promise<EventWithOrganizer[]> {
  try {
    return await _getCachedEventsGrid(params)
  } catch (err) {
    console.error('[events] events grid degraded to empty:', err)
    return []
  }
}
