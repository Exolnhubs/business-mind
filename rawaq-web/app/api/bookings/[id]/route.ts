import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { UpdateBookingSchema } from '@/lib/validations/bookings'
import { sendNotification } from '@/lib/notifications'

// PATCH /api/bookings/:id — cancel or update booking status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const input = UpdateBookingSchema.parse(body)

    // Internal DB trigger path — skip auth, use admin client
    const isInternalTrigger = req.headers.get('x-supabase-trigger') === '1'

    let supabase: ReturnType<typeof createSupabaseAdminClient>
    let actingUserId: string | null = null

    if (isInternalTrigger) {
      supabase = createSupabaseAdminClient()
    } else {
      const ctx = await requireAuth()
      actingUserId = ctx.userId
      // requireAuth returns a server client via cookies; use admin for consistency
      supabase = createSupabaseAdminClient()

      // Non-admins can only cancel their own bookings
      const { data: check } = await supabase
        .from('bookings')
        .select('user_id')
        .eq('id', id)
        .single()

      if (check && ctx.role !== 'admin' && check.user_id !== ctx.userId) {
        throw new ForbiddenException()
      }
      if (ctx.role === 'user' && input.status !== 'cancelled') {
        throw new ForbiddenException('Users can only cancel bookings')
      }
    }

    // Fetch booking + event title for notification
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, user_id, event_id, status, event:events(id, title)')
      .eq('id', id)
      .single()

    if (fetchErr || !booking) throw new NotFoundException('Booking')

    const { data, error } = await supabase
      .from('bookings')
      .update({ status: input.status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Fire booking_cancelled notification when status changes to cancelled
    if (input.status === 'cancelled') {
      const event = (booking.event as { id: string; title: string } | null)
      sendNotification({
        userId: booking.user_id,
        type: 'booking_cancelled',
        payload: {
          booking_id: id,
          event_id: event?.id ?? booking.event_id,
          event_title: event?.title ?? '',
        },
      }).catch(() => {})
    }

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
