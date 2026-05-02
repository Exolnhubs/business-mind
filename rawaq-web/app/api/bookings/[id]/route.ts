import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException, ApiException } from '@/lib/errors'
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

    if (isInternalTrigger) {
      supabase = createSupabaseAdminClient()
    } else {
      const ctx = await requireAuth()
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
      if (ctx.role === 'user' && input.status !== undefined && input.status !== 'cancelled') {
        throw new ForbiddenException('Users can only cancel bookings')
      }
    }

    // Fetch booking + event title for notification
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        event_id,
        occurrence_id,
        status,
        group_size,
        event:events(id, title),
        occurrence:event_occurrences!occurrence_id(starts_at)
      `)
      .eq('id', id)
      .single()

    if (fetchErr || !booking) throw new NotFoundException('Booking')

    if (input.holders !== undefined) {
      const groupSize = (booking as { group_size?: number | null }).group_size ?? 1
      const expectedHolderCount = Math.max(0, groupSize - 1)

      if (input.holders.length !== expectedHolderCount) {
        throw new ApiException(`Expected ${expectedHolderCount} companion holder records for this booking`, 422)
      }

      if (booking.status === 'cancelled' || booking.status === 'waitlisted') {
        throw new ForbiddenException('This booking can no longer be updated')
      }

      const occurrenceStartsAt = (booking as {
        occurrence?: { starts_at?: string | null } | null
      }).occurrence?.starts_at ?? null

      if (occurrenceStartsAt && new Date(occurrenceStartsAt) <= new Date()) {
        throw new ForbiddenException('Tickets can only be updated before the session starts')
      }

      const { error: deleteErr } = await supabase
        .from('booking_holders')
        .delete()
        .eq('booking_id', id)

      if (deleteErr) throw deleteErr

      if (input.holders.length > 0) {
        const holderRows = input.holders.map((holder, index) => ({
          booking_id: id,
          full_name: holder.full_name,
          date_of_birth: holder.date_of_birth,
          relation: holder.relation,
          position: holder.position ?? index + 2,
        }))

        const { error: insertErr } = await supabase
          .from('booking_holders')
          .insert(holderRows as never)

        if (insertErr) throw insertErr
      }
    }

    let data: unknown = booking
    if (input.status !== undefined) {
      const { data: updatedBooking, error } = await supabase
        .from('bookings')
        .update({ status: input.status })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      data = updatedBooking
    }

    // Fire booking_cancelled notification when status changes to cancelled
    if (input.status === 'cancelled') {
      const event = (booking.event as unknown as { id: string; title: string } | null)
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
