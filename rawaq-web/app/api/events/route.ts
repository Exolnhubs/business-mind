import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOrganizer, optionalAuth } from '@/lib/auth'
import { handleApiError, ok, created, ForbiddenException } from '@/lib/errors'
import { getOrganizerPlanAccess } from '@/lib/plans'
import { CreateEventSchema, ListEventsSchema } from '@/lib/validations/events'
import { sendNotifications } from '@/lib/notifications'

function buildEventKeywordSearch(search: string) {
  const term = search
    .trim()
    .replace(/[%*,()]/g, ' ')
    .replace(/\s+/g, ' ')

  if (!term) return null

  return [
    `title.ilike.%${term}%`,
    `title_ar.ilike.%${term}%`,
    `description.ilike.%${term}%`,
    `venue_name.ilike.%${term}%`,
    `city.ilike.%${term}%`,
  ].join(',')
}

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
         event_frequency, venue_name, city, country, lat, lng, capacity, is_free, price, currency,
         gender_restriction, is_family_friendly, bookings_count, views_count,
         organizer_id, category_id, is_published, is_cancelled, visibility_type,
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
    if (params.visibility) query = query.eq('visibility_type', params.visibility)

    // Community filter: join event_communities → communities.slug
    if (params.community) {
      const { data: communityRow } = await supabase
        .from('communities')
        .select('id')
        .eq('slug', params.community)
        .single()
      if (communityRow) {
        const { data: ecRows } = await supabase
          .from('event_communities')
          .select('event_id')
          .eq('community_id', communityRow.id)
        const ids = (ecRows ?? []).map((r) => r.event_id)
        if (ids.length === 0) {
          // No events in this community — return empty immediately
          return ok({ data: [], total: 0, page: params.page, per_page: params.per_page, has_more: false })
        }
        query = query.in('id', ids)
      }
    }

    // Keyword search
    if (params.search) {
      const searchFilter = buildEventKeywordSearch(params.search)
      if (searchFilter) {
        query = query.or(searchFilter)
      }
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
    const plan = await getOrganizerPlanAccess(ctx.userId)

    // Check monthly quota only when publishing (drafts are free)
    if (input.is_published && plan.eventsPerMonth !== null) {
      const monthStr = new Date().toISOString().slice(0, 7) + '-01'
      const { data: usage } = await supabase
        .from('organizer_monthly_usage')
        .select('events_created')
        .eq('organizer_id', ctx.userId)
        .eq('month', monthStr)
        .maybeSingle()

      const used = usage?.events_created ?? 0
      if (used >= plan.eventsPerMonth) {
        throw new ForbiddenException(
          `Monthly event limit reached (${plan.eventsPerMonth} events/month on your current plan). Upgrade to publish more events.`
        )
      }
    }

    // Enforce attendee cap
    if (plan.attendeesPerEvent !== null) {
      if (input.capacity !== undefined && input.capacity !== null && input.capacity > plan.attendeesPerEvent) {
        throw new ForbiddenException(
          `Your plan allows a maximum of ${plan.attendeesPerEvent} attendees per event. Upgrade your plan or reduce the event capacity.`
        )
      }
      if (input.capacity === undefined || input.capacity === null) {
        input.capacity = plan.attendeesPerEvent
      }
    }
    // ── End plan enforcement ──────────────────────────────────

    // Extract community_ids before inserting (not a DB column)
    const { community_ids, ...eventInput } = input

    const { data, error } = await supabase
      .from('events')
      .insert({ ...eventInput, organizer_id: ctx.userId } as any)
      .select()
      .single()

    if (error) throw error

    // ── Tag communities ───────────────────────────────────────
    if (community_ids?.length && data) {
      const admin = createSupabaseAdminClient()
      await admin
        .from('event_communities')
        .insert(community_ids.map((cid) => ({ event_id: data.id, community_id: cid })) as any)

      // Notify community members if event is published
      if (input.is_published) {
        notifyCommunityMembers({
          communityIds: community_ids,
          eventId: data.id,
          eventTitle: data.title as string,
        }).catch((err) =>
          console.error('[Community notify] failed:', err?.message ?? err)
        )
      }
    }

    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// Fire-and-forget: notify all members of the tagged communities about the new event
async function notifyCommunityMembers({
  communityIds,
  eventId,
  eventTitle,
}: {
  communityIds: string[]
  eventId: string
  eventTitle: string
}) {
  const admin = createSupabaseAdminClient()

  // Fetch community names + members for all tagged communities
  const [{ data: communities }, { data: memberships }, { data: follows }] = await Promise.all([
    admin.from('communities').select('id, name').in('id', communityIds) as any,
    admin.from('community_memberships').select('user_id, community_id, status').in('community_id', communityIds) as any,
    admin.from('community_follows').select('user_id, community_id').in('community_id', communityIds) as any,
  ])

  const communityNameById = new Map<string, string>(
    (communities ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
  )

  // Deduplicate users — if a user is in multiple tagged communities, pick the first community name
  const audience = [
    ...((memberships ?? []) as Array<{ user_id: string; community_id: string; status?: string | null }>)
      .filter((membership) => membership.status === 'active')
      .map((membership) => ({ user_id: membership.user_id, community_id: membership.community_id })),
    ...((follows ?? []) as Array<{ user_id: string; community_id: string }>),
  ]

  if (!audience.length) return

  const userMap = new Map<string, string>()
  for (const entry of audience) {
    if (!userMap.has(entry.user_id)) {
      userMap.set(entry.user_id, communityNameById.get(entry.community_id) ?? 'your community')
    }
  }

  const notifications = Array.from(userMap.entries()).map(([userId, communityName]) => ({
    userId,
    type: 'community_new_event' as const,
    payload: { event_id: eventId, event_title: eventTitle, community_name: communityName },
  }))

  await sendNotifications(notifications)
}
