import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { NotFoundException, handleApiError, ok } from '@/lib/errors'

export async function DELETE(
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

    const { error } = await admin
      .from('community_follows')
      .delete()
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)

    if (error) throw error

    return ok({ is_following: false })
  } catch (err) {
    return handleApiError(err)
  }
}
