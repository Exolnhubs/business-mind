import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, ForbiddenException } from '@/lib/errors'

type HostCommunityRow = {
  community_id: string
  community: {
    id: string
    name: string
    name_ar: string | null
    slug: string
    level: string
    cover_url: string | null
    member_count: number
  }
}

// GET /api/individual-host/communities — list communities where viewer is an assigned host
export async function GET() {
  try {
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { data: orgProfile } = await admin
      .from('organizer_profiles')
      .select('organizer_type, status')
      .eq('user_id', ctx.userId)
      .maybeSingle<{ organizer_type: string; status: string }>()

    if (!orgProfile || orgProfile.organizer_type !== 'individual' || orgProfile.status !== 'approved') {
      throw new ForbiddenException('Only approved individual hosts can access this endpoint')
    }

    const { data: grants, error } = await admin
      .from('community_hosts')
      .select('community_id, community:communities(id, name, name_ar, slug, level, cover_url, member_count)')
      .eq('user_id', ctx.userId)
      .returns<HostCommunityRow[]>()

    if (error) throw error

    const communities = (grants ?? []).map((g) => g.community).filter(Boolean)

    return ok(communities)
  } catch (err) {
    return handleApiError(err)
  }
}
