import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// POST /api/events/:id/save — save an event
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('saved_events')
      .upsert({ user_id: ctx.userId, event_id: id }, { onConflict: 'user_id,event_id' })

    if (error) throw error
    return ok({ saved: true })
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/events/:id/save — unsave an event
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('saved_events')
      .delete()
      .eq('user_id', ctx.userId)
      .eq('event_id', id)

    if (error) throw error
    return ok({ saved: false })
  } catch (err) {
    return handleApiError(err)
  }
}
