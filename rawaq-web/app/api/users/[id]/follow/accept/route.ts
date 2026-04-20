import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, BadRequestException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

// POST /api/users/:id/follow/accept — accept an incoming pending request
// :id is the follower (person who sent the request)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: followerId } = await params
    const ctx = await requireAuth() // viewer = the one who received the request

    if (ctx.userId === followerId) throw new BadRequestException('Cannot follow yourself')

    const admin = createSupabaseAdminClient()
    const db = admin as any

    const { data: row, error: fetchErr } = await db
      .from('user_follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', ctx.userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!row) throw new NotFoundException('Follow request')

    // Accept their row
    const { error: updateErr } = await db
      .from('user_follows')
      .update({ status: 'accepted' })
      .eq('id', row.id)
    if (updateErr) throw updateErr

    // Insert the reverse accepted row so viewer also follows them back
    const { error: reverseErr } = await db
      .from('user_follows')
      .upsert(
        { follower_id: ctx.userId, following_id: followerId, status: 'accepted' },
        { onConflict: 'follower_id,following_id' }
      )
    if (reverseErr) throw reverseErr

    const { data: actor } = await admin.from('profiles').select('display_name').eq('id', ctx.userId).single()
    sendNotification({
      userId: followerId,
      type: 'follow_accepted',
      payload: { actor_id: ctx.userId, actor_name: actor?.display_name ?? 'Someone' },
    }).catch(() => {})

    return ok({ follow_state: 'accepted' })
  } catch (err) {
    return handleApiError(err)
  }
}
