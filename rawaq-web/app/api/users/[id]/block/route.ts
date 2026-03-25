import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ForbiddenException } from '@/lib/errors'

// POST /api/users/:id/block
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: blockedId } = await params
    const ctx = await requireAuth()

    if (ctx.userId === blockedId) {
      throw new ForbiddenException('You cannot block yourself')
    }

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('user_blocks')
      .upsert(
        { blocker_id: ctx.userId, blocked_id: blockedId },
        { onConflict: 'blocker_id,blocked_id' }
      )

    if (error) throw error
    return ok({ blocked: true })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/users/:id/block
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: blockedId } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', ctx.userId)
      .eq('blocked_id', blockedId)

    if (error) throw error
    return ok({ blocked: false })
  } catch (err) {
    return handleApiError(err)
  }
}

// GET /api/users/:id/block — check if blocking
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: blockedId } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { data } = await supabase
      .from('user_blocks')
      .select('id')
      .eq('blocker_id', ctx.userId)
      .eq('blocked_id', blockedId)
      .maybeSingle()

    return ok({ blocked: !!data })
  } catch (err) {
    return handleApiError(err)
  }
}
