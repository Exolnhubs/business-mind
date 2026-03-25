import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, ForbiddenException } from '@/lib/errors'

// POST /api/organizer/:id/follow
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizerId } = await params
    const ctx = await requireAuth()

    if (ctx.userId === organizerId) {
      throw new ForbiddenException('You cannot follow yourself')
    }

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('organizer_follows')
      .upsert(
        { follower_id: ctx.userId, organizer_id: organizerId },
        { onConflict: 'follower_id,organizer_id' }
      )

    if (error) throw error
    return ok({ following: true })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/organizer/:id/follow
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizerId } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('organizer_follows')
      .delete()
      .eq('follower_id', ctx.userId)
      .eq('organizer_id', organizerId)

    if (error) throw error
    return ok({ following: false })
  } catch (err) {
    return handleApiError(err)
  }
}
