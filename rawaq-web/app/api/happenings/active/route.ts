import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { optionalAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/happenings/active
// Returns communities that have at least one active happening.
// Used to power the "Active Now" discovery rail on the home/events feed.
// If authenticated + has memberships, filters to the user's communities first,
// then pads with other active communities up to the limit.
export async function GET(req: NextRequest) {
  try {
    const ctx   = await optionalAuth()
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '10'), 20)
    const admin = createSupabaseAdminClient()

    const now = new Date().toISOString()

    // Get community_ids with active happenings (deduplicated)
    const { data: activeRows, error } = await admin
      .from('happenings')
      .select('community_id')
      .gt('expires_at', now)
      .limit(100) // enough to deduplicate

    if (error) throw error

    if (!activeRows?.length) return ok({ communities: [] })

    const activeCommunityIds = [...new Set((activeRows as { community_id: string }[]).map((r) => r.community_id))]

    // Fetch community details
    const { data: communities, error: cErr } = await admin
      .from('communities')
      .select('id, name, name_ar, slug, level, type, city, cover_url, member_count, is_verified')
      .in('id', activeCommunityIds)
      .limit(limit)

    if (cErr) throw cErr

    // Annotate is_member if authenticated
    let memberSet = new Set<string>()
    if (ctx?.userId) {
      const { data: memberships } = await admin
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', ctx.userId)
        .in('community_id', activeCommunityIds)
      memberSet = new Set((memberships ?? []).map((m: { community_id: string }) => m.community_id))
    }

    // Count active happenings per community
    const countMap = new Map<string, number>()
    for (const r of activeRows as { community_id: string }[]) {
      countMap.set(r.community_id, (countMap.get(r.community_id) ?? 0) + 1)
    }

    const result = (communities ?? []).map((c: { id: string }) => ({
      ...c,
      is_member:       memberSet.has((c as { id: string }).id),
      happening_count: countMap.get((c as { id: string }).id) ?? 0,
    }))

    // Sort: member communities first, then by happening_count desc
    result.sort((a: { is_member: boolean; happening_count: number }, b: { is_member: boolean; happening_count: number }) => {
      if (a.is_member !== b.is_member) return a.is_member ? -1 : 1
      return b.happening_count - a.happening_count
    })

    return ok({ communities: result })
  } catch (err) {
    return handleApiError(err)
  }
}
