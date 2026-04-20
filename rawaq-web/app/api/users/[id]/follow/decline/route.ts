import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// POST /api/users/:id/follow/decline — delete incoming pending request
// :id is the follower (person who sent the request)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: followerId } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    await (admin as any)
      .from('user_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', ctx.userId)
      .eq('status', 'pending')

    return ok({ follow_state: 'none' })
  } catch (err) {
    return handleApiError(err)
  }
}
