import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import { z } from 'zod'

const ListCommunitiesSchema = z.object({
  level:    z.enum(['micro', 'interest', 'district', 'city', 'country']).optional(),
  type:     z.string().optional(),
  city:     z.string().optional(),
  q:        z.string().max(100).optional(),
  member_only: z.coerce.boolean().optional(),
  page:     z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(20),
})

// GET /api/communities — list communities (public)
export async function GET(req: NextRequest) {
  try {
    const params = ListCommunitiesSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams)
    )

    const supabase  = await createSupabaseServerClient()
    const admin     = createSupabaseAdminClient()
    const ctx       = await optionalAuth()
    const from      = (params.page - 1) * params.per_page
    const to        = from + params.per_page - 1

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

    if (params.member_only && !ctx?.userId) {
      return ok({
        data: [],
        total: 0,
        page: params.page,
        per_page: params.per_page,
        has_more: false,
      })
    }

    if (params.member_only && memberIds.length === 0) {
      return ok({
        data: [],
        total: 0,
        page: params.page,
        per_page: params.per_page,
        has_more: false,
      })
    }

    const communitiesClient = params.member_only ? admin : supabase

    let query = communitiesClient
      .from('communities')
      .select('id, name, name_ar, slug, description, description_ar, level, type, city, country, cover_url, member_count, is_verified, is_private, created_by, owner_user_id, created_at, updated_at', { count: 'exact' })
      .order('member_count', { ascending: false })
      .order('name')
      .range(from, to)

    if (params.level) query = query.eq('level', params.level)
    if (params.city)  query = query.ilike('city', `%${params.city}%`)
    if (params.type)  query = query.eq('type', params.type as any)
    if (params.q)     query = query.ilike('name', `%${params.q}%`)
    if (params.member_only) query = query.in('id', memberIds)

    const { data, count, error } = await query
    if (error) throw error

    // If authenticated, annotate is_member for each community
    const memberSet = new Set(memberIds)

    const enriched = (data ?? []).map((c) => ({
      ...c,
      is_member: memberSet.has(c.id) && !['removed', 'banned'].includes(memberStatusByCommunityId.get(c.id) ?? ''),
      member_role: memberRoleByCommunityId.get(c.id) ?? null,
      member_status: memberStatusByCommunityId.get(c.id) ?? null,
    }))

    return ok({
      data: enriched,
      total: count ?? 0,
      page: params.page,
      per_page: params.per_page,
      has_more: (count ?? 0) > to + 1,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
