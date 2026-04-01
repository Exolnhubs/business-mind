/**
 * POST /api/bookings/:id/refund
 *
 * User requests a refund for a paid, confirmed booking.
 *
 * Flow:
 *   1. Validate booking belongs to the requesting user and is confirmed
 *   2. Find the succeeded payment_transaction for this booking
 *   3. Guard against duplicate refund requests
 *   4. Cancel the booking → triggers capacity decrement (existing DB trigger)
 *   5. Insert a refunds row with status 'pending'
 *   6. Admin later approves → completes → sets payment_transaction.status = 'refunded'
 *      which triggers organizer wallet debit (existing DB trigger)
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, created, ForbiddenException, BadRequestException, NotFoundException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

const RequestRefundSchema = z.object({
  user_note: z.string().max(500).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx        = await requireAuth()
    const { id }     = await params
    const body       = await req.json().catch(() => ({}))
    const input      = RequestRefundSchema.parse(body)

    const admin = createSupabaseAdminClient()

    // ── 1. Load booking ───────────────────────────────────────────────────────
    const { data: booking, error: bookingErr } = await (admin as any)
      .from('bookings')
      .select('id, user_id, event_id, status, ticket_type_id, event:events(id, title, title_ar, is_free)')
      .eq('id', id)
      .maybeSingle()

    if (bookingErr || !booking) throw new NotFoundException('Booking')

    if (booking.user_id !== ctx.userId) throw new ForbiddenException()

    if (booking.status !== 'confirmed') {
      throw new BadRequestException('Only confirmed bookings can be refunded.')
    }

    const event = booking.event as { id: string; title: string; title_ar: string | null; is_free: boolean } | null

    if (event?.is_free) {
      throw new BadRequestException('Free bookings cannot be refunded — just cancel instead.')
    }

    // ── 2. Find succeeded payment transaction ─────────────────────────────────
    const { data: tx } = await (admin as any)
      .from('payment_transactions')
      .select('id, amount, organizer_net, currency, status, organizer_id')
      .eq('booking_id', id)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!tx) {
      throw new BadRequestException('No completed payment found for this booking.')
    }

    // ── 3. Guard duplicate ────────────────────────────────────────────────────
    const { data: existing } = await (admin as any)
      .from('refunds')
      .select('id, status')
      .eq('booking_id', id)
      .not('status', 'eq', 'rejected')
      .maybeSingle()

    if (existing) {
      throw new BadRequestException(
        existing.status === 'completed'
          ? 'This booking has already been refunded.'
          : 'A refund request is already in progress for this booking.',
      )
    }

    // ── 4. Cancel booking (triggers capacity decrement) ───────────────────────
    const { error: cancelErr } = await (admin as any)
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)

    if (cancelErr) throw cancelErr

    // ── 5. Insert refund row ──────────────────────────────────────────────────
    const { data: refund, error: refundErr } = await (admin as any)
      .from('refunds')
      .insert({
        payment_transaction_id: tx.id,
        booking_id:             id,
        requested_by:           ctx.userId,
        amount:                 tx.amount,
        user_note:              input.user_note ?? null,
        status:                 'pending',
        is_simulated:           false,
      })
      .select()
      .single()

    if (refundErr) {
      // If refund insert fails, re-confirm the booking to avoid capacity leak
      await (admin as any)
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', id)
      throw refundErr
    }

    // ── 6. Notify user ────────────────────────────────────────────────────────
    sendNotification({
      userId: ctx.userId,
      type:   'booking_cancelled',
      payload: {
        booking_id:  id,
        event_id:    booking.event_id,
        event_title: event?.title ?? '',
      },
    }).catch(() => {})

    return created({ refund })
  } catch (err) {
    return handleApiError(err)
  }
}
