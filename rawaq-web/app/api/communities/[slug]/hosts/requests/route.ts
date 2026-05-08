import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok } from '@/lib/errors'
import { requireCommunityManager } from '@/lib/community-governance'

// GET /api/communities/[slug]/hosts/requests — owner/manager lists pending host requests
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const ctx = await requireAuth()
    const gov = await requireCommunityManager(slug, ctx.userId, ctx.role)
    const admin = createSupabaseAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: requests, error } = await (admin as any)
      .from('community_host_requests')
      .select('id, community_id, user_id, message, status, responded_by, responded_at, created_at')
      .eq('community_id', gov.community.id)
      .eq('status', 'pending')
      .order('created_at')

    if (error) throw error

    type HostRequestRow = {
      id: string; community_id: string; user_id: string; message: string | null
      status: string; responded_by: string | null; responded_at: string | null; created_at: string
    }
    const rows = (requests ?? []) as HostRequestRow[]
    const userIds = rows.map((r) => r.user_id)
    if (userIds.length === 0) return ok([])

    const [{ data: profiles }, { data: orgProfiles }] = await Promise.all([
      admin
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds),
      admin
        .from('organizer_profiles')
        .select('user_id, plan_id, bio')
        .in('user_id', userIds),
    ])

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
    const orgProfileByUserId = new Map((orgProfiles ?? []).map((p) => [p.user_id, p]))

    const enriched = rows.map((r) => ({
      ...r,
      profile: profileById.get(r.user_id) ?? null,
      organizer_profile: orgProfileByUserId.get(r.user_id) ?? null,
    }))

    return ok(enriched)
  } catch (err) {
    return handleApiError(err)
  }
}
