import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { optionalAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import { z } from 'zod'

const ListCommunitiesSchema = z.object({
  level:    z.enum(['micro', 'interest', 'district', 'city', 'country']).optional(),
  type:     z.string().optional(),
  city:     z.string().optional(),
  q:        z.string().max(100).optional(),
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
    const ctx       = await optionalAuth()
    const from      = (params.page - 1) * params.per_page
    const to        = from + params.per_page - 1

    let query = supabase
      .from('communities')
      .select('id, name, name_ar, slug, description, description_ar, level, type, city, country, cover_url, member_count, is_verified, is_private', { count: 'exact' })
      .order('member_count', { ascending: false })
      .order('name')
      .range(from, to)

    if (params.level) query = query.eq('level', params.level)
    if (params.city)  query = query.ilike('city', `%${params.city}%`)
    if (params.type)  query = query.eq('type', params.type as any)
    if (params.q)     query = query.ilike('name', `%${params.q}%`)

    const { data, count, error } = await query
    if (error) throw error

    // If authenticated, annotate is_member for each community
    let memberSet = new Set<string>()
    if (ctx?.userId) {
      const { data: memberships } = await supabase
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', ctx.userId)
      memberSet = new Set((memberships ?? []).map((m) => m.community_id))
    }

    const enriched = (data ?? []).map((c) => ({ ...c, is_member: memberSet.has(c.id) }))

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
