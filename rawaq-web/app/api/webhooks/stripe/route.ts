/**
 * POST /api/webhooks/stripe
 *
 * Stripe Checkout webhook handler.
 *
 * Events handled:
 *   checkout.session.completed          — payment succeeded
 *   checkout.session.async_payment_failed — async payment (bank transfer, etc.) failed
 *
 * On success:
 *   1. Verify Stripe-Signature header
 *   2. Find matching payment_transaction by gateway_order_id (session.id)
 *   3. Update transaction → succeeded
 *   4. Confirm booking
 *   5. Send notifications
 */

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { verifyStripeSignature, parseStripeWebhook } from '@/lib/gateways/stripe-gw'
import { sendNotification } from '@/lib/notifications'
import { finalizeDonationPayment } from '@/lib/donations'

function getDonationMessage(payload: Record<string, unknown> | null): string | null {
  const message = payload?.message
  return typeof message === 'string' && message.trim().length > 0
    ? message.trim()
    : null
}

export async function POST(req: NextRequest) {
  try {
    const rawBody   = await req.text()
    const signature = req.headers.get('stripe-signature') ?? ''

    if (!verifyStripeSignature(rawBody, signature)) {
      console.error('[webhooks/stripe] signature verification failed')
      return new Response('invalid signature', { status: 401 })
    }

    const body  = JSON.parse(rawBody) as Record<string, unknown>
    const event = parseStripeWebhook(body)

    if (!event) {
      // Unknown event type — acknowledge to prevent retries
      return new Response('ok', { status: 200 })
    }

    if (event.status === 'pending') {
      return new Response('ok', { status: 200 })
    }

    const admin = createSupabaseAdminClient()

    // ── Find matching transaction by Stripe session ID ────────────────────────
    const { data: tx, error: txErr } = await (admin as any)
      .from('payment_transactions')
      .select('id, type, booking_id, tip_id, user_id, event_id, organizer_id, status, amount, currency, platform_fee, gateway_payload')
      .eq('gateway_order_id', event.gatewayOrderId)
      .single()

    if (txErr || !tx) {
      console.error('[webhooks/stripe] transaction not found for session', event.gatewayOrderId)
      return new Response('not found', { status: 200 })
    }

    // Idempotency
    const needsDonationRecovery =
      tx.type === 'tip' &&
      event.status === 'succeeded' &&
      tx.status === 'succeeded' &&
      !tx.tip_id

    if (tx.status !== 'pending' && !needsDonationRecovery) {
      return new Response('already processed', { status: 200 })
    }

    // ── Update transaction ────────────────────────────────────────────────────
    const donationMessage = getDonationMessage(tx.gateway_payload)

    const { error: txUpdateErr } = await (admin as any)
      .from('payment_transactions')
      .update({
        status:          event.status,
        gateway_ref:     event.gatewayRef,
        gateway_payload: event.gatewayPayload,
        payment_method:  event.paymentMethod,
        is_simulated:    false,
        failure_reason:  event.failureReason ?? null,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', tx.id)

    if (txUpdateErr) {
      console.error('[webhooks/stripe] FAILED to update transaction', tx.id, 'err:', txUpdateErr.message)
      return new Response('db error', { status: 500 })
    }

    if (event.status === 'succeeded' && tx.type === 'tip' && !tx.tip_id) {
      let tipId: string
      try {
        tipId = await finalizeDonationPayment(admin, tx, event.gatewayRef, donationMessage)
      } catch (tipErr) {
        console.error('[webhooks/stripe] FAILED to finalize donation', tx.id, tipErr)
        return new Response('donation finalize failed', { status: 500 })
      }

      const { error: tipLinkErr } = await (admin as any)
        .from('payment_transactions')
        .update({ tip_id: tipId, updated_at: new Date().toISOString() })
        .eq('id', tx.id)

      if (tipLinkErr) {
        console.error('[webhooks/stripe] FAILED to link donation tip_id', tx.id, 'err:', tipLinkErr.message)
        return new Response('tip link failed', { status: 500 })
      }
    }

    // ── Update booking ────────────────────────────────────────────────────────
    if (tx.booking_id) {
      const newBookingStatus = event.status === 'succeeded' ? 'confirmed' : 'cancelled'
      await admin
        .from('bookings')
        .update({ status: newBookingStatus as any, payment_pending_until: null } as any)
        .eq('id', tx.booking_id)

      if (event.status === 'succeeded') {
        const { data: ev } = await admin.from('events').select('title, organizer_id').eq('id', tx.event_id).single()

        sendNotification({
          userId:  tx.user_id,
          type:    'booking_confirmed',
          payload: { event_id: tx.event_id, event_title: ev?.title ?? '', booking_id: tx.booking_id },
        }).catch(() => {})

        sendNotification({
          userId:  tx.organizer_id,
          type:    'new_attendee',
          payload: { event_id: tx.event_id, event_title: ev?.title ?? '', booking_id: tx.booking_id, actor_id: tx.user_id, actor_name: 'Customer' },
        }).catch(() => {})
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('[webhooks/stripe] unexpected error:', err)
    return new Response('internal error', { status: 500 })
  }
}
