/**
 * GET /api/payments/callback
 *
 * Paymob Transaction Response Callback — browser redirect handler.
 *
 * Configure this EXACT URL in Paymob dashboard:
 *   Accept → Settings → Transaction response callback
 *   → https://your-app.vercel.app/api/payments/callback
 *
 * Paymob appends query params to this URL after the user pays:
 *   ?id=<paymob_tx_id>
 *   &pending=false
 *   &amount_cents=10000
 *   &success=true
 *   &order=<paymob_order_id>   ← we store this as gateway_order_id
 *   &merchant_order_id=<uuid>  ← now a randomUUID per attempt (not bookingId)
 *   &source_data.type=card
 *   &hmac=<sha512>
 *
 * This handler:
 *   1. Verifies the HMAC to prevent spoofed redirects
 *   2. Looks up the payment_transaction via Paymob's order ID (gateway_order_id)
 *      to retrieve the real booking_id and the originating source (web|mobile)
 *   3. Mobile → redirect to rawaq://payment-result deep link (app intercepts it)
 *      Web    → redirect to /bookings/:id?payment=success|failed
 *
 * NOTE: Never trust this redirect to confirm a booking — that is the job of
 * the server-side webhook at /api/webhooks/paymob.
 * This is purely a UX redirect so the user lands on the right page/screen.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { verifyPaymobHmac } from '@/lib/gateways/paymob'

export async function GET(req: NextRequest) {
  const p      = req.nextUrl.searchParams
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  // merchant_order_id is no longer a bookingId — it is a randomUUID generated
  // per payment attempt to prevent Paymob 422 "duplicate order" errors on retry.
  // Use Paymob's own numeric order ID (the `order` param) to look up our
  // payment_transaction row via gateway_order_id.
  const paymobOrderId = p.get('order')
  const success       = p.get('success') === 'true'
  const pending       = p.get('pending') === 'true'
  const hmac          = p.get('hmac') ?? ''

  // Build the obj Paymob uses for HMAC (same fields as the webhook)
  const obj: Record<string, unknown> = {
    amount_cents:           p.get('amount_cents'),
    created_at:             p.get('created_at'),
    currency:               p.get('currency'),
    error_occured:          p.get('error_occured'),
    has_parent_transaction: p.get('has_parent_transaction'),
    id:                     p.get('id'),
    integration_id:         p.get('integration_id'),
    is_3d_secure:           p.get('is_3d_secure'),
    is_auth:                p.get('is_auth'),
    is_capture:             p.get('is_capture'),
    is_refunded:            p.get('is_refunded'),
    is_standalone_payment:  p.get('is_standalone_payment'),
    is_voided:              p.get('is_voided'),
    order:                  { id: paymobOrderId },
    owner:                  p.get('owner'),
    pending:                p.get('pending'),
    source_data: {
      pan:      p.get('source_data.pan')      ?? '',
      sub_type: p.get('source_data.sub_type') ?? '',
      type:     p.get('source_data.type')     ?? '',
    },
    success: p.get('success'),
  }

  if (process.env.PAYMOB_HMAC_SECRET) {
    if (!verifyPaymobHmac(obj, hmac)) {
      console.error('[payments/callback] Paymob HMAC verification failed on redirect')
      return NextResponse.redirect(`${appUrl}/?payment=invalid`)
    }
  }

  if (!paymobOrderId) {
    return NextResponse.redirect(`${appUrl}/?payment=error`)
  }

  const status = pending ? 'pending' : success ? 'success' : 'failed'

  // ── Look up booking + source via Paymob's order ID ───────────────────────
  try {
    const admin = createSupabaseAdminClient()
    const { data: tx } = await (admin as any)
      .from('payment_transactions')
      .select('id, type, booking_id, event_id, source')
      .eq('gateway_order_id', paymobOrderId)
      .single()

    if (!tx?.id) {
      console.error('[payments/callback] No transaction found for gateway_order_id', paymobOrderId)
      return NextResponse.redirect(`${appUrl}/?payment=error`)
    }

    const isMobile  = tx.source === 'mobile'

    if (isMobile) {
      if (tx.type === 'tip') {
        return NextResponse.redirect(
          `rawaq://payment-result?transaction_id=${tx.id as string}&entity=donation&status=${status}`
        )
      }

      // Redirect to the app deep link — iOS/Android intercepts rawaq://
      // and brings the user back into the app automatically, closing the browser.
      return NextResponse.redirect(
        `rawaq://payment-result?booking_id=${tx.booking_id as string}&status=${status}`
      )
    }

    if (tx.type === 'tip') {
      return NextResponse.redirect(`${appUrl}/events/${tx.event_id as string}?donation=${status}`)
    }

    return NextResponse.redirect(`${appUrl}/bookings/${tx.booking_id as string}?payment=${status}`)
  } catch (err) {
    console.error('[payments/callback] DB lookup failed', err)
    return NextResponse.redirect(`${appUrl}/?payment=error`)
  }
}
