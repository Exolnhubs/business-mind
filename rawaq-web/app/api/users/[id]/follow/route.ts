import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, BadRequestException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

// POST /api/users/:id/follow — send a follow request (status = pending)
// If target already has a pending request to viewer, auto-accept both.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const ctx = await requireAuth()

    if (ctx.userId === targetId) throw new BadRequestException('Cannot follow yourself')

    const admin = createSupabaseAdminClient()

    const db = admin

    // Check if target has already sent viewer a pending request
    const { data: theirRow } = await db
      .from('user_follows')
      .select('id, status')
      .eq('follower_id', targetId)
      .eq('following_id', ctx.userId)
      .maybeSingle()

    if (theirRow?.status === 'pending') {
      // Auto-accept both directions
      const { error: updateErr } = await db
        .from('user_follows')
        .update({ status: 'accepted' })
        .eq('id', theirRow.id)
      if (updateErr) throw updateErr

      const { error: upsertErr } = await db
        .from('user_follows')
        .upsert(
          { follower_id: ctx.userId, following_id: targetId, status: 'accepted' },
          { onConflict: 'follower_id,following_id' }
        )
      if (upsertErr) throw upsertErr

      const { data: actor } = await admin.from('profiles').select('display_name').eq('id', ctx.userId).single()
      sendNotification({
        userId: targetId,
        type: 'follow_accepted',
        payload: { actor_id: ctx.userId, actor_name: actor?.display_name ?? 'Someone' },
      }).catch(() => {})

      return ok({ follow_state: 'accepted' })
    }

    // Normal path: insert pending row
    const { error } = await db
      .from('user_follows')
      .upsert(
        { follower_id: ctx.userId, following_id: targetId, status: 'pending' },
        { onConflict: 'follower_id,following_id' }
      )
    if (error) throw error

    const { data: actor } = await admin.from('profiles').select('display_name').eq('id', ctx.userId).single()
    sendNotification({
      userId: targetId,
      type: 'follow_request',
      payload: { actor_id: ctx.userId, actor_name: actor?.display_name ?? 'Someone' },
    }).catch(() => {})

    return ok({ follow_state: 'pending_sent' })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/users/:id/follow — cancel pending request OR unfollow accepted
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const ctx = await requireAuth()
    const admin = createSupabaseAdminClient()

    const { error } = await admin
      .from('user_follows')
      .delete()
      .eq('follower_id', ctx.userId)
      .eq('following_id', targetId)

    if (error) throw error
    return ok({ follow_state: 'none' })
  } catch (err) {
    return handleApiError(err)
  }
}
