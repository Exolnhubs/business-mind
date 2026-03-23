import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { sendNotifications } from '@/lib/notifications'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

// DELETE /api/admin/events/:id — force remove event
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await requireAdmin()

    const adminClient = createSupabaseAdminClient()

    const { data: event } = await adminClient
      .from('events')
      .select('id, title')
      .eq('id', id)
      .single()

    if (!event) throw new NotFoundException('Event')

    // Notify confirmed attendees before deletion
    const { data: bookings } = await adminClient
      .from('bookings')
      .select('user_id')
      .eq('event_id', id)
      .eq('status', 'confirmed')

    if (bookings?.length) {
      await sendNotifications(
        bookings.map((b) => ({
          userId: b.user_id,
          type: 'event_cancelled' as const,
          payload: { event_id: id, event_title: event.title, reason: 'Removed by admin' },
        }))
      )
    }

    const { error } = await adminClient.from('events').delete().eq('id', id)
    if (error) throw error

    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
