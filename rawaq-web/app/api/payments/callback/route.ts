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
 *   ?id=<tx_id>
 *   &pending=false
 *   &amount_cents=10000
 *   &success=true
 *   &is_auth=false
 *   &is_capture=false
 *   &is_voided=false
 *   &is_refunded=false
 *   &order=<paymob_order_id>   ← we stored this as gateway_order_id
 *   &merchant_order_id=<our_booking_id>   ← we set this to bookingId
 *   &source_data.type=card
 *   &data.message=Approved
 *   &hmac=<sha512>
 *
 * This handler:
 *   1. Reads merchant_order_id (= our booking ID) from query params
 *   2. Verifies the HMAC to prevent spoofing the redirect
 *   3. Redirects user to /bookings/:id?payment=success|failed
 *
 * NOTE: Never trust this redirect to confirm a booking — that's the job
 * of the server-side webhook at /api/webhooks/paymob.
 * This is purely a UX redirect so the user lands on the right page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyPaymobHmac } from '@/lib/gateways/paymob'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  // Extract what we need from Paymob's query string
  const bookingId  = params.get('merchant_order_id')
  const success    = params.get('success') === 'true'
  const pending    = params.get('pending') === 'true'
  const hmac       = params.get('hmac') ?? ''

  // Build the raw obj Paymob uses for HMAC (same fields as webhook)
  const obj: Record<string, unknown> = {
    amount_cents:              params.get('amount_cents'),
    created_at:                params.get('created_at'),
    currency:                  params.get('currency'),
    error_occured:             params.get('error_occured'),
    has_parent_transaction:    params.get('has_parent_transaction'),
    id:                        params.get('id'),
    integration_id:            params.get('integration_id'),
    is_3d_secure:              params.get('is_3d_secure'),
    is_auth:                   params.get('is_auth'),
    is_capture:                params.get('is_capture'),
    is_refunded:               params.get('is_refunded'),
    is_standalone_payment:     params.get('is_standalone_payment'),
    is_voided:                 params.get('is_voided'),
    order:                     { id: params.get('order') },
    owner:                     params.get('owner'),
    pending:                   params.get('pending'),
    source_data: {
      pan:      params.get('source_data.pan')      ?? '',
      sub_type: params.get('source_data.sub_type') ?? '',
      type:     params.get('source_data.type')     ?? '',
    },
    success: params.get('success'),
  }

  // If HMAC_SECRET is configured, verify the redirect wasn't spoofed
  if (process.env.PAYMOB_HMAC_SECRET) {
    if (!verifyPaymobHmac(obj, hmac)) {
      // HMAC mismatch — redirect to home rather than showing a fake success
      console.error('[payments/callback] Paymob HMAC verification failed on redirect')
      return NextResponse.redirect(`${appUrl}/?payment=invalid`)
    }
  }

  // No booking ID in params → something went wrong, go home
  if (!bookingId) {
    return NextResponse.redirect(`${appUrl}/?payment=error`)
  }

  // Redirect user to their booking page with a status hint
  // The page polls /api/payments/status/:bookingId to get the real status
  // (the webhook may or may not have fired yet at this point)
  const status = pending ? 'pending' : success ? 'success' : 'failed'
  return NextResponse.redirect(`${appUrl}/bookings/${bookingId}?payment=${status}`)
}
