import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { ForbiddenException, NotFoundException, handleApiError, ok } from '@/lib/errors'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()
    const admin = createSupabaseAdminClient()

    const { data: community, error: communityError } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', slug)
      .single()

    if (communityError || !community) throw new NotFoundException('Community not found')

    const { data: membership } = await admin
      .from('community_memberships')
      .select('status')
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)
      .maybeSingle()

    if (membership?.status === 'banned') {
      throw new ForbiddenException('You are banned from following this community')
    }

    const { error } = await admin
      .from('community_follows')
      .upsert({ community_id: community.id, user_id: ctx.userId } as never, { onConflict: 'community_id,user_id' })

    if (error) throw error

    return ok({ is_following: true })
  } catch (err) {
    return handleApiError(err)
  }
}
