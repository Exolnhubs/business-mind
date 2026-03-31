/**
 * POST /api/webhooks/paymob
 *
 * Paymob Transaction Processed Callback.
 *
 * Paymob sends a POST with JSON body containing:
 *   { type: "TRANSACTION", obj: { ... transaction fields ... } }
 *
 * The HMAC is passed as a query param: ?hmac=<sha512-hex>
 *
 * On success:
 *   1. Verify HMAC
 *   2. Find matching payment_transaction by paymob order ID
 *   3. Update transaction status + gateway_ref + gateway_payload
 *   4. Confirm/fail the booking
 *   5. Send notification to attendee if confirmed
 */

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { verifyPaymobHmac, parsePaymobWebhook } from '@/lib/gateways/paymob'
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
    const hmac = req.nextUrl.searchParams.get('hmac') ?? ''
    const body = await req.json() as Record<string, unknown>

    // Paymob sends different event types; only process TRANSACTION events
    if ((body.type as string) !== 'TRANSACTION') {
      return new Response('ok', { status: 200 })
    }

    const obj = body.obj as Record<string, unknown> | undefined
    if (!obj) {
      return new Response('missing obj', { status: 400 })
    }

    // ── HMAC verification ────────────────────────────────────────────────────
    if (!verifyPaymobHmac(obj, hmac)) {
      console.error('[webhooks/paymob] HMAC verification failed')
      return new Response('invalid hmac', { status: 401 })
    }

    const event = parsePaymobWebhook(body)
    if (!event) {
      return new Response('unrecognised event', { status: 200 })
    }

    // Ignore pending callbacks (3DS intermediate step)
    if (event.status === 'pending') {
      return new Response('ok', { status: 200 })
    }

    const admin = createSupabaseAdminClient()

    // ── Find matching transaction by gateway order ID ─────────────────────────
    const { data: tx, error: txErr } = await (admin as any)
      .from('payment_transactions')
      .select('id, type, booking_id, tip_id, user_id, event_id, organizer_id, status, amount, currency, platform_fee, gateway_payload')
      .eq('gateway_order_id', event.gatewayOrderId)
      .single()

    if (txErr || !tx) {
      console.error('[webhooks/paymob] transaction not found for gateway_order_id:', event.gatewayOrderId, 'dbErr:', txErr?.message)
      // Return 200 to stop Paymob from retrying — we don't own this order
      return new Response('not found', { status: 200 })
    }

    // Idempotency: allow retrying donation finalization if the transaction was
    // already marked succeeded but tip_id was not written yet.
    const needsDonationRecovery =
      tx.type === 'tip' &&
      event.status === 'succeeded' &&
      tx.status === 'succeeded' &&
      !tx.tip_id

    if (tx.status !== 'pending' && !needsDonationRecovery) {
      console.log('[webhooks/paymob] skipping already-processed transaction', tx.id, 'status:', tx.status)
      return new Response('already processed', { status: 200 })
    }

    console.log('[webhooks/paymob] processing transaction', tx.id, 'booking', tx.booking_id, 'event status:', event.status)
    const donationMessage = getDonationMessage(tx.gateway_payload)

    // ── Update payment transaction ────────────────────────────────────────────
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
      console.error('[webhooks/paymob] FAILED to update transaction', tx.id, 'err:', txUpdateErr.message)
      return new Response('db error', { status: 500 })
    }

    if (event.status === 'succeeded' && tx.type === 'tip' && !tx.tip_id) {
      let tipId: string
      try {
        tipId = await finalizeDonationPayment(admin, tx, event.gatewayRef, donationMessage)
      } catch (tipErr) {
        console.error('[webhooks/paymob] FAILED to finalize donation', tx.id, tipErr)
        return new Response('donation finalize failed', { status: 500 })
      }

      const { error: tipLinkErr } = await (admin as any)
        .from('payment_transactions')
        .update({ tip_id: tipId, updated_at: new Date().toISOString() })
        .eq('id', tx.id)

      if (tipLinkErr) {
        console.error('[webhooks/paymob] FAILED to link donation tip_id', tx.id, 'err:', tipLinkErr.message)
        return new Response('tip link failed', { status: 500 })
      }
    }

    // ── Update booking ────────────────────────────────────────────────────────
    if (tx.booking_id) {
      const newBookingStatus = event.status === 'succeeded' ? 'confirmed' : 'cancelled'
      console.log('[webhooks/paymob] updating booking', tx.booking_id, '→', newBookingStatus)
      const { error: bookingUpdateErr } = await admin
        .from('bookings')
        .update({ status: newBookingStatus as any, payment_pending_until: null } as any)
        .eq('id', tx.booking_id)
      if (bookingUpdateErr) {
        console.error('[webhooks/paymob] FAILED to update booking', tx.booking_id, 'err:', (bookingUpdateErr as any).message)
        // Return 500 so Paymob retries — the transaction is already updated but
        // the booking didn't flip. Without this, Paymob marks the webhook as
        // delivered and never retries, leaving the booking stuck in pending.
        return new Response('booking update failed', { status: 500 })
      }

      // Notify attendee and organizer on success
      if (event.status === 'succeeded') {
        const { data: ev } = await admin.from('events').select('title, organizer_id').eq('id', tx.event_id).single()

        sendNotification({
          userId: tx.user_id,
          type:   'booking_confirmed',
          payload: { event_id: tx.event_id, event_title: ev?.title ?? '', booking_id: tx.booking_id },
        }).catch(() => {})

        sendNotification({
          userId: tx.organizer_id,
          type:   'new_attendee',
          payload: { event_id: tx.event_id, event_title: ev?.title ?? '', booking_id: tx.booking_id, actor_id: tx.user_id, actor_name: 'Customer' },
        }).catch(() => {})
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('[webhooks/paymob] unexpected error:', err)
    return new Response('internal error', { status: 500 })
  }
}
