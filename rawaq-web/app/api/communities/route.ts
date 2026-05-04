import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth, requireAuth } from '@/lib/auth'
import { ForbiddenException, handleApiError, ok, created, NotFoundException, BadRequestException } from '@/lib/errors'
import { checkRateLimit, limiters } from '@/lib/rate-limit'
import { writeCommunityAuditLog } from '@/lib/community-governance'
import { generateCommunitySlug } from '@/lib/community-slug'
import type { CommunityApprovalStatus } from '@/types/database'
import { z } from 'zod'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()
const COMMUNITY_CACHE_TTL = 300 // 5 minutes

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
const COMMUNITY_LEVEL_RANK: Record<(typeof COMMUNITY_LEVELS)[number], number> = {
  micro: 1,
  interest: 1,
  district: 2,
  city: 3,
  country: 4,
}

const ListCommunitiesSchema = z.object({
  level:    z.enum(COMMUNITY_LEVELS).optional(),
  type:     z.string().optional(),
  city:     z.string().optional(),
  country:  z.string().length(2).optional(),
  q:        z.string().max(100).optional(),
  member_only: z.coerce.boolean().optional(),
  recommended: z.coerce.boolean().optional(),
  approval_status: z.enum(['approved', 'pending', 'dismissed']).optional(),
  ancestor_slug: z.string().trim().min(1).max(120).optional(),
  user_id:  z.string().uuid().optional(),
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
  parent_slug: z.string().trim().min(1).max(120).optional().nullable(),
})

const COMMUNITY_LIST_SELECT =
  'id, name, name_ar, slug, description, description_ar, level, type, city, country, cover_url, member_count, is_verified, approval_status, is_private, created_by, owner_user_id, parent_community_id, created_at, updated_at'
const COMMUNITY_LIST_SELECT_LEGACY =
  'id, name, name_ar, slug, description, description_ar, level, type, city, country, cover_url, member_count, is_verified, is_private, created_by, owner_user_id, created_at, updated_at'

type CommunityListRow = {
  id: string
  name: string
  type: (typeof COMMUNITY_TYPES)[number]
  city: string | null
  member_count: number
  event_count?: number
  parent_community_id?: string | null
} & Record<string, unknown>

const INTEREST_TO_COMMUNITY_TYPES: Record<string, (typeof COMMUNITY_TYPES)[number][]> = {
  tech: ['tech'],
  coding: ['tech'],
  programming: ['tech'],
  startup: ['entrepreneur'],
  startups: ['entrepreneur'],
  founder: ['entrepreneur'],
  founders: ['entrepreneur'],
  business: ['entrepreneur'],
  entrepreneur: ['entrepreneur'],
  entrepreneurs: ['entrepreneur'],
  sports: ['sports'],
  sport: ['sports'],
  football: ['sports'],
  soccer: ['sports'],
  gym: ['sports'],
  fitness: ['sports'],
  padel: ['sports'],
  gaming: ['gaming'],
  gamer: ['gaming'],
  esports: ['gaming'],
  books: ['book_club'],
  book: ['book_club'],
  reading: ['book_club'],
  literature: ['book_club'],
  art: ['arts'],
  arts: ['arts'],
  music: ['arts'],
  design: ['arts'],
}

function buildCommunityCacheKey(params: {
  level?: string
  type?: string
  city?: string
  country?: string
  q?: string
  page: number
  per_page: number
  ancestor_slug?: string
}): string {
  return `communities:list:${JSON.stringify({
    level: params.level ?? null,
    type: params.type ?? null,
    city: params.city ?? null,
    country: params.country ?? null,
    q: params.q ?? null,
    page: params.page,
    per_page: params.per_page,
    ancestor_slug: params.ancestor_slug ?? null,
  })}`
}

function extractRecommendedCommunityTypes(preferences: unknown): Set<(typeof COMMUNITY_TYPES)[number]> {
  const rawInterests = typeof preferences === 'object' && preferences !== null
    ? (preferences as { interests?: unknown }).interests
    : null

  if (!Array.isArray(rawInterests)) {
    return new Set()
  }

  const types = new Set<(typeof COMMUNITY_TYPES)[number]>()
  for (const interest of rawInterests) {
    if (typeof interest !== 'string') continue
    const normalized = interest.trim().toLowerCase()
    for (const communityType of INTEREST_TO_COMMUNITY_TYPES[normalized] ?? []) {
      types.add(communityType)
    }
  }

  return types
}

// GET /api/communities — list communities (public)
export async function GET(req: NextRequest) {
  try {
    const params = ListCommunitiesSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams)
    )

    const supabase  = await createSupabaseServerClient()
    const admin     = createSupabaseAdminClient()
    const ctx       = await optionalAuth()

    const isPersonalized =
      params.member_only === true ||
      params.recommended === true ||
      !!params.user_id ||
      !!params.approval_status ||
      !!ctx?.userId   // logged-in users get fresh is_member annotations

    const cacheKey = isPersonalized
      ? null
      : buildCommunityCacheKey(params)

    if (cacheKey) {
      try {
        const cached = await redis.get(cacheKey)
        if (cached) return ok(cached)
      } catch {
        // Redis unavailable — fall through to DB
      }
    }

    const from      = (params.page - 1) * params.per_page
    const to        = from + params.per_page - 1
    const queryFrom = params.recommended ? 0 : from
    const queryTo   = params.recommended ? Math.max(params.per_page * 4, 24) - 1 : to
    const isPlatformAdmin = ctx?.role === 'admin'

    let memberIds: string[] = []
    const memberRoleByCommunityId = new Map<string, string>()
    const memberStatusByCommunityId = new Map<string, string>()
    let recommendedTypes = new Set<(typeof COMMUNITY_TYPES)[number]>()
    let userCity: string | null = null
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

      if (params.recommended) {
        const { data: profile } = await admin
          .from('profiles')
          .select('city, preferences')
          .eq('id', ctx.userId)
          .maybeSingle()

        recommendedTypes = extractRecommendedCommunityTypes(profile?.preferences)
        userCity = profile?.city ?? null
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

    let userFilterIds: string[] | null = null
    if (params.user_id) {
      const { data: userMemberships } = await admin
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', params.user_id)
        .eq('status', 'active')
      userFilterIds = (userMemberships ?? []).map((m) => m.community_id)
      if (userFilterIds.length === 0) {
        return ok({
          data: [],
          total: 0,
          page: params.page,
          per_page: params.per_page,
          has_more: false,
        })
      }
    }

    let descendantIds: string[] | null = null
    if (params.ancestor_slug) {
      const { data: ancestorCommunity, error: ancestorCommunityError } = await admin
        .from('communities')
        .select('id')
        .eq('slug', params.ancestor_slug)
        .maybeSingle()

      if (ancestorCommunityError) throw ancestorCommunityError

      if (!ancestorCommunity) {
        return ok({
          data: [],
          total: 0,
          page: params.page,
          per_page: params.per_page,
          has_more: false,
        })
      }

      const { data: descendantRows, error: descendantRowsError } = await admin
        .from('community_hierarchy')
        .select('child_id')
        .eq('parent_id', ancestorCommunity.id)

      if (descendantRowsError) throw descendantRowsError
      descendantIds = (descendantRows ?? []).map((row) => row.child_id)

      if (descendantIds.length === 0) {
        return ok({
          data: [],
          total: 0,
          page: params.page,
          per_page: params.per_page,
          has_more: false,
        })
      }
    }

    const communitiesClient = params.member_only ? admin : supabase

    const buildQuery = (selectColumns: string, includeApprovalFilter = true) => {
      let query = communitiesClient
        .from('communities')
        .select(selectColumns, { count: 'exact' })
        .order('member_count', { ascending: false })
        .order('name')
        .range(queryFrom, queryTo)

      if (params.level) query = query.eq('level', params.level)
      if (params.city) query = query.ilike('city', `%${params.city}%`)
      if (params.country) query = query.eq('country', params.country.toUpperCase())
      if (params.type) query = query.eq('type', params.type as never)
      if (params.q) query = query.or(`name.ilike.%${params.q.trim()}%,name_ar.ilike.%${params.q.trim()}%`)
      if (params.member_only) query = query.in('id', memberIds)
      if (userFilterIds) {
        query = query.in('id', userFilterIds).eq('is_private', false)
      }
      if (descendantIds) query = query.in('id', descendantIds)
      if (includeApprovalFilter && isPlatformAdmin && params.approval_status) {
        query = query.eq('approval_status', params.approval_status)
      } else if (includeApprovalFilter && !params.member_only) {
        query = query.eq('approval_status', 'approved')
      }

      return query
    }

    let { data, count, error } = await buildQuery(COMMUNITY_LIST_SELECT)
    if (error && `${error.message ?? ''}`.includes('parent_community_id')) {
      const legacyResult = await buildQuery(COMMUNITY_LIST_SELECT_LEGACY)
      data = legacyResult.data
      count = legacyResult.count
      error = legacyResult.error
    }
    if (error && `${error.message ?? ''}`.includes('approval_status')) {
      const noApprovalResult = await buildQuery(COMMUNITY_LIST_SELECT_LEGACY, false)
      data = noApprovalResult.data
      count = noApprovalResult.count
      error = noApprovalResult.error
    }
    if (error) throw error

    // If authenticated, annotate is_member for each community
    const memberSet = new Set(memberIds)

    const rows = (data ?? []) as unknown as CommunityListRow[]
    const communityIds = rows.map((row) => row.id)
    const publishedEventCounts = new Map<string, number>()

    if (communityIds.length > 0) {
      const { data: eventLinks, error: eventLinksError } = await admin
        .from('event_communities')
        .select('community_id, event:events!inner(id, is_published, is_cancelled)')
        .in('community_id', communityIds)
        .eq('event.is_published', true)
        .eq('event.is_cancelled', false)

      if (eventLinksError) throw eventLinksError

      for (const link of (eventLinks ?? []) as Array<{ community_id: string }>) {
        publishedEventCounts.set(link.community_id, (publishedEventCounts.get(link.community_id) ?? 0) + 1)
      }
    }

    let enriched = rows.map((c) => ({
      ...c,
      event_count: publishedEventCounts.get(c.id) ?? 0,
      parent_community_id: 'parent_community_id' in c ? c.parent_community_id : null,
      approval_status: 'approval_status' in c ? c.approval_status : 'approved',
      is_member: memberSet.has(c.id) && !['removed', 'banned'].includes(memberStatusByCommunityId.get(c.id) ?? ''),
      member_role: memberRoleByCommunityId.get(c.id) ?? null,
      member_status: memberStatusByCommunityId.get(c.id) ?? null,
    }))

    if (params.recommended && recommendedTypes.size > 0) {
      enriched = [...enriched]
        .sort((a, b) => {
          const aMatchesInterest = recommendedTypes.has(a.type) ? 1 : 0
          const bMatchesInterest = recommendedTypes.has(b.type) ? 1 : 0
          if (aMatchesInterest !== bMatchesInterest) return bMatchesInterest - aMatchesInterest

          const aMatchesCity = userCity && a.city && a.city.toLowerCase() === userCity.toLowerCase() ? 1 : 0
          const bMatchesCity = userCity && b.city && b.city.toLowerCase() === userCity.toLowerCase() ? 1 : 0
          if (aMatchesCity !== bMatchesCity) return bMatchesCity - aMatchesCity

          if (a.is_member !== b.is_member) return a.is_member ? 1 : -1
          if (a.member_count !== b.member_count) return b.member_count - a.member_count
          return a.name.localeCompare(b.name)
        })
        .slice(from, to + 1)
    }

    const response = {
      data: enriched,
      total: count ?? 0,
      page: params.page,
      per_page: params.per_page,
      has_more: (count ?? 0) > to + 1,
    }

    if (cacheKey) {
      try {
        await redis.setex(cacheKey, COMMUNITY_CACHE_TTL, response)
      } catch {
        // Redis unavailable — serve uncached response
      }
    }

    return ok(response)
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
      await checkRateLimit(limiters.communityCreate, ctx.userId)
    }

    const communityId = crypto.randomUUID()
    const slug = generateCommunitySlug(input.name, communityId)
    let parentCommunityId: string | null = null
    let parentCommunityLevel: (typeof COMMUNITY_LEVELS)[number] | null = null

    if (input.parent_slug) {
      const { data: parentCommunity, error: parentCommunityError } = await admin
        .from('communities')
        .select('id, level')
        .eq('slug', input.parent_slug)
        .maybeSingle()

      if (parentCommunityError) throw parentCommunityError
      if (!parentCommunity) {
        throw new NotFoundException('Parent community')
      }

      if (COMMUNITY_LEVEL_RANK[input.level] > COMMUNITY_LEVEL_RANK[parentCommunity.level]) {
        throw new BadRequestException('Child community level cannot be broader than its parent community')
      }

      parentCommunityId = parentCommunity.id
      parentCommunityLevel = parentCommunity.level
    }

    if (parentCommunityLevel === 'country' && input.level !== 'city') {
      throw new BadRequestException('Choose a city or local parent inside this country instead of attaching this community directly to the country root')
    }
    if (input.level === 'district' && parentCommunityLevel !== 'city') {
      throw new BadRequestException('District communities must live under a city community')
    }
    if (input.level === 'city' && parentCommunityLevel !== 'country') {
      throw new BadRequestException('City communities must live under a country community')
    }

    const approvalStatus: CommunityApprovalStatus = input.level === 'district' && ctx.role !== 'admin'
      ? 'pending'
      : 'approved'

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
      approval_status: approvalStatus,
      is_private: input.is_private,
      parent_community_id: parentCommunityId,
      owner_user_id: ctx.userId,
      created_by: ctx.userId,
    }

    const { data: community, error: communityError } = await admin
      .from('communities')
      .insert(communityInsert)
      .select('id, name, name_ar, slug, description, description_ar, level, type, city, country, cover_url, member_count, is_verified, approval_status, is_private, created_by, owner_user_id, parent_community_id, created_at, updated_at')
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
        status_updated_at: new Date().toISOString(),
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
        parent_community_id: parentCommunityId,
      },
    })

    return created(community)
  } catch (err) {
    return handleApiError(err)
  }
}
