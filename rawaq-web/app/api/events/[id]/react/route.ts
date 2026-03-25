import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

const ReactSchema = z.object({
  type: z.enum(['like', 'interested']),
})

// POST /api/events/:id/react  — add or switch reaction
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const ctx = await requireAuth()
    const input = ReactSchema.parse(await req.json())
    const supabase = await createSupabaseServerClient()

    // upsert — if row exists, update the type; if not, insert
    const { error } = await supabase
      .from('event_reactions')
      .upsert(
        { user_id: ctx.userId, event_id: eventId, type: input.type },
        { onConflict: 'user_id,event_id' }
      )

    if (error) throw error
    return ok({ reacted: true, type: input.type })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/events/:id/react  — remove reaction
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('event_reactions')
      .delete()
      .eq('user_id', ctx.userId)
      .eq('event_id', eventId)

    if (error) throw error
    return ok({ reacted: false })
  } catch (err) {
    return handleApiError(err)
  }
}
