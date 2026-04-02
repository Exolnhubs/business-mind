import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

// POST /api/communities/:slug/join
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx      = await requireAuth()
    const supabase = await createSupabaseServerClient()
    const admin    = createSupabaseAdminClient()

    const { data: community, error: cErr } = await supabase
      .from('communities')
      .select('id, name, member_count')
      .eq('slug', slug)
      .single()

    if (cErr || !community) throw new NotFoundException('Community not found')

    const { data: existingMembership } = await admin
      .from('community_memberships')
      .select('id')
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (existingMembership) {
      return ok({ community_id: community.id, member_count: community.member_count, is_member: true })
    }

    const { error: insertErr } = await admin
      .from('community_memberships')
      .insert({ community_id: community.id, user_id: ctx.userId } as any)

    if (insertErr) {
      throw insertErr
    }

    return ok({ community_id: community.id, member_count: community.member_count + 1, is_member: true })
  } catch (err) {
    return handleApiError(err)
  }
}
