import { unstable_cache } from 'next/cache'
import { createSupabaseCacheClient } from '@/lib/supabase/cache-client'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/events/recurrence'
import type { EventWithOrganizer } from '@/types/database'
import type { GenderType } from '@/types/database'

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

export const getCachedFeaturedEvents = unstable_cache(
  async (): Promise<EventWithOrganizer[]> => {
    const supabase = createSupabaseCacheClient()
    const now = new Date().toISOString()

    const { data } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .gt('featured_until', now)
      .order('featured_until', { ascending: false })
      .limit(8)

    return ((data ?? []) as unknown as EventWithOrganizer[]).map((e) =>
      applyResolvedEventWindow(e)
    )
  },
  ['events-featured'],
  { tags: ['events', 'events-featured'], revalidate: false }
)

// ── Weekend rail ──────────────────────────────────────────────────────────────

export const getCachedWeekendEvents = unstable_cache(
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
      const { data: geoIds } = await supabase.rpc('events_within_radius', {
        user_lat: lat,
        user_lng: lng,
        radius_meters: radiusKm * 1000,
      })
      const ids = ((geoIds ?? []) as { id: string }[]).map((e) => e.id)
      if (ids.length > 0) {
        const { data } = await supabase
          .from('events')
          .select(EVENT_SELECT)
          .in('id', ids)
          .eq('is_published', true)
          .eq('is_cancelled', false)
        events = ((data ?? []) as unknown as EventWithOrganizer[])
          .map((e) => applyResolvedEventWindow(e))
          .filter((e) => e.start_at >= weekendStart && e.start_at <= weekendEnd)
          .sort(compareEventsByResolvedStartAt)
          .slice(0, 8)
      }
    } else if (city) {
      const { data } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .eq('city', city)
      events = ((data ?? []) as unknown as EventWithOrganizer[])
        .map((e) => applyResolvedEventWindow(e))
        .filter((e) => e.start_at >= weekendStart && e.start_at <= weekendEnd)
        .sort(compareEventsByResolvedStartAt)
        .slice(0, 8)
    }

    return events
  },
  ['events-weekend'],
  { tags: ['events'], revalidate: 3600 }
)

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

export const getCachedEventsGrid = unstable_cache(
  async (
    params: GridParams,
    excludeIds: string[]
  ): Promise<EventWithOrganizer[]> => {
    const supabase = createSupabaseCacheClient()

    let query = supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('is_published', true)
      .eq('is_cancelled', false)

    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`)
    }
    if (params.q) {
      const q = params.q.replace(/'/g, "''")
      query = query.or(`title.ilike.%${q}%,title_ar.ilike.%${q}%,description.ilike.%${q}%`)
    }
    if (params.city)   query = query.eq('city', params.city)
    if (params.gender) query = query.eq('gender_restriction', params.gender as GenderType)
    if (params.free === 'true')   query = query.eq('is_free', true)
    if (params.family === 'true') query = query.eq('is_family_friendly', true)

    if (params.hot === 'true') {
      const { data: hotRows } = await supabase
        .from('ticket_types')
        .select('event_id')
        .eq('is_hot_offer', true)
        .eq('is_active', true)
        .gt('hot_offer_ends_at', new Date().toISOString())
      const hotIds = (hotRows ?? []).map((r: { event_id: string }) => r.event_id).filter(Boolean)
      if (hotIds.length === 0) return []
      query = query.in('id', hotIds)
    }

    if (params.category) query = query.eq('category_id', params.category)

    if (params.community) {
      const { data: community } = await supabase
        .from('communities')
        .select('id')
        .eq('slug', params.community)
        .single()
      if (!community) return []
      const { data: ecRows } = await supabase
        .from('event_communities')
        .select('event_id')
        .eq('community_id', (community as { id: string }).id)
      const ids = (ecRows ?? []).map((r: { event_id: string }) => r.event_id)
      if (ids.length === 0) return []
      query = query.in('id', ids)
    }

    if (params.lat && params.lng) {
      const { data: geoEvents } = await supabase.rpc('events_within_radius', {
        user_lat: Number(params.lat),
        user_lng: Number(params.lng),
        radius_meters: Number(params.radius_km ?? 25) * 1000,
      })
      if (geoEvents) {
        const ids = (geoEvents as { id: string }[]).map((e) => e.id)
        if (ids.length === 0) return []
        query = query.in('id', ids)
      }
    }

    const { data: events } = await query

    return ((events ?? []) as unknown as EventWithOrganizer[])
      .map((e) => applyResolvedEventWindow(e))
      .filter((e) => new Date(e.start_at).getTime() >= Date.now())
      .sort(compareEventsByResolvedStartAt)
  },
  ['events-grid'],
  { tags: ['events'], revalidate: 300 }
)
