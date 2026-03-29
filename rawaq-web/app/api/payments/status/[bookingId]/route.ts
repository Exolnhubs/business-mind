/**
 * GET /api/payments/status/:bookingId
 *
 * Poll booking + payment status for the post-checkout redirect.
 * The client polls this after returning from a gateway redirect to know
 * if the booking has been confirmed or is still pending/failed.
 */

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const { bookingId } = await params
    const ctx            = await requireAuth()
    const admin          = createSupabaseAdminClient()

    const { data: booking, error } = await (admin as any)
      .from('bookings')
      .select('id, user_id, status, payment_pending_until, event_id, ticket_type_id, created_at')
      .eq('id', bookingId)
      .single()

    if (error || !booking) throw new NotFoundException('Booking')
    if (booking.user_id !== ctx.userId) throw new ForbiddenException('Not your booking')

    // Fetch latest payment transaction for this booking
    const { data: tx } = await (admin as any)
      .from('payment_transactions')
      .select('id, status, gateway, gateway_ref, gateway_order_id, payment_method, amount, currency, failure_reason, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return ok({
      booking_id:            booking.id,
      booking_status:        booking.status,
      payment_pending_until: booking.payment_pending_until,
      transaction:           tx ?? null,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
