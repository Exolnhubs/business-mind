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
      .select('id, booking_id, user_id, event_id, organizer_id, status')
      .eq('gateway_order_id', event.gatewayOrderId)
      .single()

    if (txErr || !tx) {
      console.error('[webhooks/paymob] transaction not found for order', event.gatewayOrderId)
      // Return 200 to stop Paymob from retrying — we don't own this order
      return new Response('not found', { status: 200 })
    }

    // Idempotency: already processed
    if (tx.status !== 'pending') {
      return new Response('already processed', { status: 200 })
    }

    // ── Update payment transaction ────────────────────────────────────────────
    await (admin as any)
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

    // ── Update booking ────────────────────────────────────────────────────────
    if (tx.booking_id) {
      const newBookingStatus = event.status === 'succeeded' ? 'confirmed' : 'cancelled'
      await admin
        .from('bookings')
        .update({ status: newBookingStatus as any, payment_pending_until: null } as any)
        .eq('id', tx.booking_id)

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
