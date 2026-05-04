import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOrganizer, optionalAuth } from '@/lib/auth'
import { handleApiError, ok, created, ForbiddenException } from '@/lib/errors'
import { checkRateLimit, limiters } from '@/lib/rate-limit'
import { getOrganizerPlanAccess, isFreeSessionsOnly } from '@/lib/plans'
import { CreateEventSchema, ListEventsSchema } from '@/lib/validations/events'
import { sendNotifications } from '@/lib/notifications'
import { applyResolvedEventWindow, compareEventsByResolvedStartAt } from '@/lib/events/recurrence'
import { ensureEventOccurrences } from '@/lib/events/occurrences'

const redis = Redis.fromEnv()
const EVENT_CACHE_TTL = 60 // 60 seconds

function buildEventCacheKey(params: Record<string, unknown>): string {
  return `events:list:${JSON.stringify(params)}`
}

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

    // Cache key for basic public listings (skip cache for search/organizer views)
    const urlParams = req.nextUrl.searchParams
    const isSimpleList = !urlParams.get('q') && !urlParams.get('search') && !urlParams.get('organizer_own') && !urlParams.get('user_id')
    const isForce = urlParams.get('force') === 'true'
    const cacheKey = isSimpleList && !isForce ? buildEventCacheKey(params) : null

    // Try cache for public listings
    if (cacheKey) {
const cached = await redis.get(cacheKey)
      if (cached) {
        return ok(cached)
      }
    }

    const supabase = await createSupabaseServerClient()
    const ctx = await optionalAuth()

    const from = (params.page - 1) * params.per_page
    let query = supabase
      .from('events')
      .select(
        `id, title, title_ar, description, cover_image_url, start_at, end_at,
         event_frequency, recurrence_until, venue_name, city, country, lat, lng, capacity, is_free, price, currency,
         gender_restriction, is_family_friendly, bookings_count, views_count,
         organizer_id, category_id, is_published, is_cancelled, visibility_type,
         organizer:profiles!organizer_id(
           id, display_name, avatar_url,
           organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
         ),
         category:event_categories(id, name_en, name_ar, icon),
         ticket_types(id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at)`,
        { count: 'exact' }
      )
      .eq('is_published', true)
      .eq('is_cancelled', false)

    // Filters
    if (params.city) query = query.ilike('city', `%${params.city}%`)
    if (params.category_id) query = query.eq('category_id', params.category_id)
    if (params.gender) query = query.eq('gender_restriction', params.gender)
    if (params.is_family_friendly !== undefined)
      query = query.eq('is_family_friendly', params.is_family_friendly)
    if (params.is_free !== undefined) query = query.eq('is_free', params.is_free)
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

    const { data, error } = await query
    if (error) throw error

    const now = new Date()
    const dateFromMs = params.date_from ? new Date(params.date_from).getTime() : null
    const dateToMs = params.date_to ? new Date(params.date_to).getTime() : null

    const filtered = ((data ?? []) as unknown as Array<{ start_at: string; end_at: string | null; ticket_types?: Array<{ is_active: boolean }> }>)
      .map((event) => ({
        ...event,
        ticket_types: ((event.ticket_types ?? []) as Array<{ is_active: boolean }>).filter((tt) => tt.is_active),
      }))
      .map((event) => applyResolvedEventWindow(event, now))
      .filter((event) => {
        const startMs = new Date(event.start_at).getTime()
        if (dateFromMs !== null && startMs < dateFromMs) return false
        if (dateToMs !== null && startMs > dateToMs) return false
        return true
      })
      .sort((left, right) => compareEventsByResolvedStartAt(left, right, now))

    const total = filtered.length
    const pageData = filtered.slice(from, from + params.per_page)

    const response = {
      data: pageData,
      total,
      page: params.page,
      per_page: params.per_page,
      has_more: total > from + params.per_page,
    }

    // Cache public listings
    if (cacheKey) {
      await redis.setex(cacheKey, EVENT_CACHE_TTL, response)
    }

    return ok(response)
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/events — create event (organizer only)
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrganizer()
    await checkRateLimit(limiters.eventCreate, ctx.userId)
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

    const { data: hostProfile, error: hostProfileError } = await supabase
      .from('organizer_profiles')
      .select('organizer_type, paid_sessions_enabled, status')
      .eq('user_id', ctx.userId)
      .maybeSingle<{ organizer_type: string; paid_sessions_enabled: boolean; status: string }>()

    if (hostProfileError) throw hostProfileError

    if (hostProfile?.organizer_type === 'individual') {
      if (hostProfile.status !== 'approved') {
        throw new ForbiddenException('Your individual host application has not been approved yet.')
      }

      const isPaidSession = !input.is_free && (input.price ?? 0) > 0
      if (isPaidSession && isFreeSessionsOnly(plan)) {
        throw new ForbiddenException('Your current individual host plan only allows free sessions.')
      }
      if (isPaidSession && !hostProfile.paid_sessions_enabled) {
        throw new ForbiddenException(
          'Paid sessions require identity verification. Please complete verification in your profile.'
        )
      }
      if (!community_ids?.length) {
        throw new ForbiddenException(
          'Individual hosts must tag sessions to at least one community where they hold host role.'
        )
      }

      const { data: hostGrants, error: grantsError } = await supabase
        .from('community_hosts')
        .select('community_id')
        .eq('user_id', ctx.userId)
        .in('community_id', community_ids)
        .returns<Array<{ community_id: string }>>()

      if (grantsError) throw grantsError

      const validCommunityIds = new Set((hostGrants ?? []).map((grant) => grant.community_id))
      const invalidCommunityIds = community_ids.filter((communityId) => !validCommunityIds.has(communityId))
      if (invalidCommunityIds.length > 0) {
        throw new ForbiddenException(
          'You must hold host role in all tagged communities to post a session there.'
        )
      }
    }

    const { data, error } = await supabase
      .from('events')
      .insert({ ...eventInput, organizer_id: ctx.userId } as never)
      .select()
      .single()

    if (error) throw error

    if (data) {
      await ensureEventOccurrences(createSupabaseAdminClient(), data)
    }

    // ── Tag communities ───────────────────────────────────────
    if (community_ids?.length && data) {
      const admin = createSupabaseAdminClient()
      await admin
        .from('event_communities')
        .insert(community_ids.map((cid) => ({ event_id: data.id, community_id: cid })) as never)

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

    // Invalidate events cache
    await redis.del('events:list:*')

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
    admin.from('communities').select('id, name').in('id', communityIds),
    admin.from('community_memberships').select('user_id, community_id, status').in('community_id', communityIds),
    admin.from('community_follows').select('user_id, community_id').in('community_id', communityIds),
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
