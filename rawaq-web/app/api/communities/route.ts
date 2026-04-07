import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth, requireAuth } from '@/lib/auth'
import { ForbiddenException, handleApiError, ok, created } from '@/lib/errors'
import { writeCommunityAuditLog } from '@/lib/community-governance'
import { generateCommunitySlug } from '@/lib/community-slug'
import { z } from 'zod'

const COMMUNITY_LEVELS = ['micro', 'interest', 'district', 'city', 'country'] as const
const COMMUNITY_TYPES = [
  'compound',
  'neighborhood',
  'university',
  'company',
  'coworking',
  'tech',
  'sports',
  'gaming',
  'book_club',
  'entrepreneur',
  'arts',
  'other',
  'district',
  'city',
  'country',
] as const

const ListCommunitiesSchema = z.object({
  level:    z.enum(COMMUNITY_LEVELS).optional(),
  type:     z.string().optional(),
  city:     z.string().optional(),
  q:        z.string().max(100).optional(),
  member_only: z.coerce.boolean().optional(),
  page:     z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(20),
})

const CreateCommunitySchema = z.object({
  name: z.string().min(2).max(100),
  name_ar: z.string().max(100).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  description_ar: z.string().max(2000).optional().nullable(),
  level: z.enum(COMMUNITY_LEVELS),
  type: z.enum(COMMUNITY_TYPES),
  city: z.string().max(100).optional().nullable(),
  country: z.string().length(2).default('SA'),
  cover_url: z.string().url().optional().nullable(),
  is_private: z.boolean().default(false),
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

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const input = CreateCommunitySchema.parse(await req.json())
    const admin = createSupabaseAdminClient()

    if ((input.level === 'city' || input.level === 'country') && ctx.role !== 'admin') {
      throw new ForbiddenException('Only platform admins can create city or country communities')
    }

    if (ctx.role !== 'admin') {
      const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { count, error: rateLimitError } = await admin
        .from('communities')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', ctx.userId)
        .gte('created_at', windowStart)

      if (rateLimitError) throw rateLimitError
      if ((count ?? 0) >= 3) {
        return Response.json(
          { error: 'You have reached the community creation limit for the last 30 days' },
          { status: 429 },
        )
      }
    }

    const communityId = crypto.randomUUID()
    const slug = generateCommunitySlug(input.name, communityId)

    const communityInsert = {
      id: communityId,
      name: input.name,
      name_ar: input.name_ar ?? null,
      slug,
      description: input.description ?? null,
      description_ar: input.description_ar ?? null,
      level: input.level,
      type: input.type,
      city: input.city ?? null,
      country: input.country.toUpperCase(),
      cover_url: input.cover_url ?? null,
      is_verified: false,
      is_private: input.is_private,
      owner_user_id: ctx.userId,
      created_by: ctx.userId,
    }

    const { data: community, error: communityError } = await admin
      .from('communities')
      .insert(communityInsert)
      .select('id, name, name_ar, slug, description, description_ar, level, type, city, country, cover_url, member_count, is_verified, is_private, created_by, owner_user_id, created_at, updated_at')
      .single()

    if (communityError) throw communityError

    const { error: membershipError } = await admin
      .from('community_memberships')
      .insert({
        community_id: communityId,
        user_id: ctx.userId,
        role: 'owner',
        status: 'active',
        timeout_until: null,
      })

    if (membershipError) throw membershipError

    await writeCommunityAuditLog({
      community_id: communityId,
      actor_user_id: ctx.userId,
      action: 'community_created',
      target_type: 'community',
      target_id: communityId,
      meta: {
        level: input.level,
        type: input.type,
        is_private: input.is_private,
      },
    })

    return created(community)
  } catch (err) {
    return handleApiError(err)
  }
}
