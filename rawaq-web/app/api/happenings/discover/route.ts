import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import type { Community, HappeningWithAuthor, Profile } from '@/types/database'

const DiscoverHappeningsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(12),
  community: z.string().optional(),
  joined_only: z.coerce.boolean().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius_km: z.coerce.number().positive().max(200).optional(),
})

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const earthKm = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return earthKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

type DiscoverCommunity = Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level' | 'type' | 'cover_url' | 'is_private'> & {
  is_member: boolean
}

type DiscoverHappening = HappeningWithAuthor & {
  community: DiscoverCommunity
  distance_km: number | null
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'plan_id'>
}

export async function GET(req: NextRequest) {
  try {
    const params = DiscoverHappeningsSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams),
    )

    const admin = createSupabaseAdminClient()
    const ctx = await optionalAuth()
    const now = new Date().toISOString()
    const hasGeoFilter =
      params.lat !== undefined &&
      params.lng !== undefined &&
      params.radius_km !== undefined

    const membershipRows = ctx?.userId
      ? (
          await admin
            .from('community_memberships')
            .select('community_id, status')
            .eq('user_id', ctx.userId)
        ).data ?? []
      : []

    const readableCommunityIds = new Set(
      membershipRows
        .filter((row) => row.status !== 'removed' && row.status !== 'banned')
        .map((row) => row.community_id),
    )

    if (params.joined_only && !ctx?.userId) {
      return ok({ happenings: [] })
    }

    let communityIdFilter: string | null = null
    if (params.community) {
      const { data: community } = await admin
        .from('communities')
        .select('id, type')
        .eq('slug', params.community)
        .maybeSingle()

      if (!community) return ok({ happenings: [] })

      const canReadCommunity =
        ctx?.role === 'admin' ||
        community.type === 'country' ||
        readableCommunityIds.has(community.id)

      if (!canReadCommunity) return ok({ happenings: [] })
      communityIdFilter = community.id
    }

    let query = (admin as any)
      .from('happenings')
      .select(`
        id, community_id, author_id, type, body, lat, lng, location_label, expires_at, rsvp_count, reaction_count, is_pinned, created_at,
        author:profiles!author_id(id, display_name, avatar_url, plan_id),
        community:communities!community_id(id, name, name_ar, slug, level, type, cover_url, is_private)
      `)
      .gt('expires_at', now)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(hasGeoFilter ? 120 : Math.max(params.limit * 3, 24))

    if (communityIdFilter) {
      query = query.eq('community_id', communityIdFilter)
    }

    if (params.joined_only) {
      const ids = [...readableCommunityIds]
      if (ids.length === 0) return ok({ happenings: [] })
      query = query.in('community_id', ids)
    }

    const { data: rawHappenings, error } = await query
    if (error) throw error

    const visibleHappenings: DiscoverHappening[] = ((rawHappenings ?? []) as Array<Record<string, any>>)
      .filter((happening) => {
        const community = happening.community as { id: string; type: string } | null
        if (!community) return false
        if (ctx?.role === 'admin') return true
        if (community.type === 'country') return true
        return readableCommunityIds.has(community.id)
      })
      .map((happening) => {
        const lat = happening.lat as number | null
        const lng = happening.lng as number | null
        const distanceKm =
          hasGeoFilter && lat !== null && lng !== null
            ? haversineKm(params.lat!, params.lng!, lat, lng)
            : null

        return {
          ...(happening as HappeningWithAuthor),
          author: happening.author as Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'plan_id'>,
          community: {
            ...(happening.community as Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level' | 'type' | 'cover_url' | 'is_private'>),
            is_member: readableCommunityIds.has((happening.community as { id: string }).id),
          },
          distance_km: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
        } satisfies DiscoverHappening
      })
      .filter((happening) =>
        !hasGeoFilter ||
        (happening.distance_km !== null && happening.distance_km <= params.radius_km!),
      )

    const sorted = visibleHappenings.sort((a, b) => {
      if (hasGeoFilter) {
        const aDistance = a.distance_km ?? Number.MAX_SAFE_INTEGER
        const bDistance = b.distance_km ?? Number.MAX_SAFE_INTEGER
        if (aDistance !== bDistance) return aDistance - bDistance
      }
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    let rsvpSet = new Set<string>()
    let reactionSet = new Set<string>()
    if (ctx?.userId && sorted.length > 0) {
      const ids = sorted.slice(0, params.limit).map((h) => h.id as string)
      const [{ data: rsvps }, { data: reactions }] = await Promise.all([
        admin.from('happening_rsvps').select('happening_id').eq('user_id', ctx.userId).in('happening_id', ids) as any,
        admin.from('happening_reactions').select('happening_id').eq('user_id', ctx.userId).in('happening_id', ids) as any,
      ])
      rsvpSet = new Set((rsvps ?? []).map((row: { happening_id: string }) => row.happening_id))
      reactionSet = new Set((reactions ?? []).map((row: { happening_id: string }) => row.happening_id))
    }

    return ok({
      happenings: sorted.slice(0, params.limit).map((happening) => ({
        ...happening,
        user_has_rsvp: rsvpSet.has(happening.id as string),
        user_has_reacted: reactionSet.has(happening.id as string),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
