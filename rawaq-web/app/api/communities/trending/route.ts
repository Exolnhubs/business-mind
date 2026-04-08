import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import { z } from 'zod'

const TrendingCommunitiesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(20).default(6),
})

const COMMUNITY_SELECT =
  'id, name, name_ar, slug, description, description_ar, level, type, city, country, cover_url, member_count, is_verified, is_private, created_by, owner_user_id, parent_community_id, created_at, updated_at'
const COMMUNITY_SELECT_LEGACY =
  'id, name, name_ar, slug, description, description_ar, level, type, city, country, cover_url, member_count, is_verified, is_private, created_by, owner_user_id, created_at, updated_at'

export async function GET(req: NextRequest) {
  try {
    const params = TrendingCommunitiesSchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const admin = createSupabaseAdminClient()
    const ctx = await optionalAuth()
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    let memberIds: string[] = []
    const memberRoleByCommunityId = new Map<string, string>()
    const memberStatusByCommunityId = new Map<string, string>()
    if (ctx?.userId) {
      const { data: memberships } = await admin
        .from('community_memberships')
        .select('community_id, role, status')
        .eq('user_id', ctx.userId)

      memberIds = (memberships ?? [])
        .filter((membership) => membership.status !== 'removed' && membership.status !== 'banned')
        .map((membership) => membership.community_id)

      for (const membership of memberships ?? []) {
        memberRoleByCommunityId.set(membership.community_id, membership.role)
        memberStatusByCommunityId.set(membership.community_id, membership.status)
      }
    }

    let communitiesResult = await admin
      .from('communities')
      .select(COMMUNITY_SELECT)
      .order('member_count', { ascending: false })
      .limit(100)

    if (communitiesResult.error && `${communitiesResult.error.message ?? ''}`.includes('parent_community_id')) {
      communitiesResult = await admin
        .from('communities')
        .select(COMMUNITY_SELECT_LEGACY)
        .order('member_count', { ascending: false })
        .limit(100)
    }
    if (communitiesResult.error) throw communitiesResult.error

    const { data: recentMemberships, error: membershipsError } = await admin
      .from('community_memberships')
      .select('community_id, joined_at')
      .gte('joined_at', since)
    if (membershipsError) throw membershipsError

    const { data: recentHappenings, error: happeningsError } = await admin
      .from('happenings')
      .select('community_id, created_at')
      .gte('created_at', since)
    if (happeningsError) throw happeningsError

    const { data: recentEventLinks, error: eventLinksError } = await admin
      .from('event_communities')
      .select('community_id, event:events!inner(created_at, is_published)')
      .gte('event.created_at', since)
      .eq('event.is_published', true)
    if (eventLinksError) throw eventLinksError

    const newMembers7d = new Map<string, number>()
    const newHappenings7d = new Map<string, number>()
    const newEvents7d = new Map<string, number>()

    for (const membership of recentMemberships ?? []) {
      newMembers7d.set(membership.community_id, (newMembers7d.get(membership.community_id) ?? 0) + 1)
    }
    for (const happening of recentHappenings ?? []) {
      newHappenings7d.set(happening.community_id, (newHappenings7d.get(happening.community_id) ?? 0) + 1)
    }
    for (const link of recentEventLinks ?? []) {
      newEvents7d.set(link.community_id, (newEvents7d.get(link.community_id) ?? 0) + 1)
    }

    const memberSet = new Set(memberIds)
    const scored = (communitiesResult.data ?? [])
      .map((community) => {
        const score =
          (newMembers7d.get(community.id) ?? 0) * 2 +
          (newHappenings7d.get(community.id) ?? 0) * 3 +
          (newEvents7d.get(community.id) ?? 0)

        return {
          ...community,
          parent_community_id: 'parent_community_id' in community ? community.parent_community_id : null,
          is_member: memberSet.has(community.id) && !['removed', 'banned'].includes(memberStatusByCommunityId.get(community.id) ?? ''),
          member_role: memberRoleByCommunityId.get(community.id) ?? null,
          member_status: memberStatusByCommunityId.get(community.id) ?? null,
          trending_score: score,
          trending_breakdown: {
            new_members_7d: newMembers7d.get(community.id) ?? 0,
            new_happenings_7d: newHappenings7d.get(community.id) ?? 0,
            new_events_7d: newEvents7d.get(community.id) ?? 0,
          },
        }
      })
      .filter((community) => community.trending_score > 0)
      .sort((a, b) => {
        if (a.trending_score !== b.trending_score) return b.trending_score - a.trending_score
        if (a.member_count !== b.member_count) return b.member_count - a.member_count
        return a.name.localeCompare(b.name)
      })

    const from = (params.page - 1) * params.per_page
    const to = from + params.per_page
    const sliced = scored.slice(from, to)

    return ok({
      data: sliced,
      total: scored.length,
      page: params.page,
      per_page: params.per_page,
      has_more: scored.length > to,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
