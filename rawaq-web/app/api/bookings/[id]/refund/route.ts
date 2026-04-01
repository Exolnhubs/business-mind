/**
 * POST /api/bookings/:id/refund
 *
 * Cancels a paid confirmed booking and automatically processes the refund
 * through the original payment gateway (Paymob or Stripe).
 *
 * Flow:
 *   1. Validate booking ownership, status, and that a succeeded payment exists
 *   2. Guard against duplicate refund requests
 *   3. Cancel booking → triggers capacity decrement (existing DB trigger)
 *   4. Call gateway refund API automatically
 *   5a. Gateway success → refunds.status = 'completed', tx.status = 'refunded'
 *       (trg_payment_wallet_sync trigger debits organizer wallet automatically)
 *   5b. Gateway failure / simulated / unknown gateway → refunds.status = 'pending'
 *       (falls into admin manual queue)
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, created, ForbiddenException, BadRequestException, NotFoundException } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { refundPaymob } from '@/lib/gateways/paymob'
import { refundStripe } from '@/lib/gateways/stripe-gw'

const RequestRefundSchema = z.object({
  user_note: z.string().max(500).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx    = await requireAuth()
    const { id } = await params
    const body   = await req.json().catch(() => ({}))
    const input  = RequestRefundSchema.parse(body)

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
      .select('id, amount, organizer_net, currency, status, gateway, gateway_ref, is_simulated, organizer_id')
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

    // ── 5. Attempt automatic gateway refund ──────────────────────────────────
    let refundStatus: 'pending' | 'completed' = 'pending'
    let gatewayRefundRef: string | null = null
    let autoRefundError: string | null = null

    if (!tx.is_simulated && tx.gateway_ref) {
      let result: { success: boolean; gatewayRefundRef?: string; error?: string }

      if (tx.gateway === 'paymob' || tx.gateway === 'fawry') {
        result = await refundPaymob(tx.gateway_ref, tx.amount)
      } else if (tx.gateway === 'stripe') {
        result = await refundStripe(tx.gateway_ref, tx.amount)
      } else {
        // Unknown gateway — fall to manual queue
        result = { success: false, error: `Auto-refund not supported for gateway: ${tx.gateway}` }
      }

      if (result.success) {
        refundStatus     = 'completed'
        gatewayRefundRef = result.gatewayRefundRef ?? null
      } else {
        autoRefundError = result.error ?? null
        console.error('[bookings/refund] Gateway refund failed, falling back to manual queue:', autoRefundError, 'bookingId:', id, 'txId:', tx.id)
      }
    } else if (tx.is_simulated) {
      // Simulated transactions: auto-complete without gateway call
      refundStatus = 'completed'
      gatewayRefundRef = `sim_refund_${Date.now()}`
    }
    // else: no gateway_ref — goes to manual queue

    // ── 6. Insert refund row ──────────────────────────────────────────────────
    const { data: refund, error: refundErr } = await (admin as any)
      .from('refunds')
      .insert({
        payment_transaction_id: tx.id,
        booking_id:             id,
        requested_by:           ctx.userId,
        amount:                 tx.amount,
        user_note:              input.user_note ?? null,
        status:                 refundStatus,
        refund_method:          refundStatus === 'completed' && !tx.is_simulated ? 'original_payment' : 'manual',
        gateway_ref:            gatewayRefundRef,
        processed_at:           refundStatus === 'completed' ? new Date().toISOString() : null,
        is_simulated:           tx.is_simulated,
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

    // ── 7. On auto-completed refund: mark transaction as refunded ─────────────
    // This triggers fn_sync_wallet_on_payment → debits organizer wallet.
    if (refundStatus === 'completed') {
      const { error: txErr } = await (admin as any)
        .from('payment_transactions')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('id', tx.id)

      if (txErr) {
        // Non-fatal: refund row is already created, wallet debit may be missed.
        // Log for manual reconciliation.
        console.error('[bookings/refund] Failed to mark tx as refunded:', txErr.message, 'txId:', tx.id)
      }
    }

    // ── 8. Notify user ────────────────────────────────────────────────────────
    sendNotification({
      userId: ctx.userId,
      type:   'booking_cancelled',
      payload: {
        booking_id:  id,
        event_id:    booking.event_id,
        event_title: event?.title ?? '',
      },
    }).catch(() => {})

    return created({
      refund,
      auto_refunded: refundStatus === 'completed' && !tx.is_simulated,
      message: refundStatus === 'completed'
        ? 'Your ticket has been cancelled and the refund has been processed to your original payment method.'
        : 'Your ticket has been cancelled. The refund is queued for manual processing and will be completed within 1–3 business days.',
    })
  } catch (err) {
    return handleApiError(err)
  }
}
