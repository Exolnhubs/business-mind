import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOrganizer, optionalAuth } from '@/lib/auth'
import { handleApiError, ok, created, ForbiddenException } from '@/lib/errors'
import { CreateEventSchema, ListEventsSchema } from '@/lib/validations/events'

// GET /api/events — public browsable event list with filters
export async function GET(req: NextRequest) {
  try {
    const params = ListEventsSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams)
    )

    const supabase = await createSupabaseServerClient()
    const ctx = await optionalAuth()

    const from = (params.page - 1) * params.per_page
    const to = from + params.per_page - 1

    let query = supabase
      .from('events')
      .select(
        `id, title, title_ar, description, cover_image_url, start_at, end_at,
         venue_name, city, country, lat, lng, capacity, is_free, price, currency,
         gender_restriction, is_family_friendly, bookings_count, views_count,
         organizer_id, category_id, is_published, is_cancelled,
         organizer:profiles!organizer_id(
           id, display_name, avatar_url,
           organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
         ),
         category:event_categories(id, name_en, name_ar, icon)`,
        { count: 'exact' }
      )
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .order('start_at', { ascending: true })
      .range(from, to)

    // Filters
    if (params.city) query = query.ilike('city', `%${params.city}%`)
    if (params.category_id) query = query.eq('category_id', params.category_id)
    if (params.gender) query = query.eq('gender_restriction', params.gender)
    if (params.is_family_friendly !== undefined)
      query = query.eq('is_family_friendly', params.is_family_friendly)
    if (params.is_free !== undefined) query = query.eq('is_free', params.is_free)
    if (params.date_from) query = query.gte('start_at', params.date_from)
    if (params.date_to) query = query.lte('start_at', params.date_to)
    if (params.organizer_id) query = query.eq('organizer_id', params.organizer_id)
    if (params.organizer_own && ctx?.userId) query = query.eq('organizer_id', ctx.userId)

    // Full-text search
    if (params.search) {
      query = query.textSearch(
        'fts',
        params.search,
        { type: 'websearch', config: 'simple' }
      )
    }

    // Geo filter (radius_km requires PostGIS RPC)
    if (params.lat && params.lng && params.radius_km) {
      const { data: geoEvents } = await supabase.rpc('events_within_radius', {
        user_lat: params.lat,
        user_lng: params.lng,
        radius_meters: params.radius_km * 1000,
      })
      if (geoEvents) {
        const ids = (geoEvents as { id: string }[]).map((e) => e.id)
        query = query.in('id', ids)
      }
    }

    // Private events: only visible to organizer / admin
    if (!ctx || ctx.role === 'user') {
      query = query.eq('is_private', false)
    }

    const { data, count, error } = await query
    if (error) throw error

    return ok({
      data,
      total: count ?? 0,
      page: params.page,
      per_page: params.per_page,
      has_more: (count ?? 0) > to + 1,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/events — create event (organizer only)
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrganizer()
    const body = await req.json()
    const input = CreateEventSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    // ── Plan enforcement ─────────────────────────────────────
    const { data: orgProfile, error: opErr } = await supabase
      .from('organizer_profiles')
      .select('plan_id, plan:plan_definitions(events_per_month, attendees_per_event)')
      .eq('user_id', ctx.userId)
      .single()

    if (opErr || !orgProfile) throw new ForbiddenException('Organizer profile not found')

    const plan = orgProfile.plan as { events_per_month: number | null; attendees_per_event: number | null } | null

    // Check monthly quota only when publishing (drafts are free)
    if (input.is_published && plan?.events_per_month !== null && plan?.events_per_month !== undefined) {
      const monthStr = new Date().toISOString().slice(0, 7) + '-01'
      const { data: usage } = await supabase
        .from('organizer_monthly_usage')
        .select('events_created')
        .eq('organizer_id', ctx.userId)
        .eq('month', monthStr)
        .maybeSingle()

      const used = usage?.events_created ?? 0
      if (used >= plan.events_per_month) {
        throw new ForbiddenException(
          `Monthly event limit reached (${plan.events_per_month} events/month on your current plan). Upgrade to publish more events.`
        )
      }
    }

    // Enforce attendee cap — if plan has a limit, cap or reject over-limit capacity
    if (plan?.attendees_per_event !== null && plan?.attendees_per_event !== undefined) {
      if (input.capacity !== undefined && input.capacity !== null && input.capacity > plan.attendees_per_event) {
        throw new ForbiddenException(
          `Your plan allows a maximum of ${plan.attendees_per_event} attendees per event. Upgrade your plan or reduce the event capacity.`
        )
      }
      // If capacity not set (unlimited), auto-cap to plan limit
      if (input.capacity === undefined || input.capacity === null) {
        input.capacity = plan.attendees_per_event
      }
    }
    // ── End plan enforcement ──────────────────────────────────

    const { data, error } = await supabase
      .from('events')
      .insert({ ...input, organizer_id: ctx.userId })
      .select()
      .single()

    if (error) throw error

    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}
