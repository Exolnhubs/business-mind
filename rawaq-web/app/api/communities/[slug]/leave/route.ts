import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'

// DELETE /api/communities/:slug/leave
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const ctx      = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { data: community, error: cErr } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', slug)
      .single()

    if (cErr || !community) throw new NotFoundException('Community not found')

    await supabase
      .from('community_memberships')
      .delete()
      .eq('community_id', community.id)
      .eq('user_id', ctx.userId)

    return ok({ left: true })
  } catch (err) {
    return handleApiError(err)
  }
}
