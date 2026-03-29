/**
 * GET /payments/callback
 *
 * Paymob Transaction Response Callback — browser redirect handler.
 *
 * Register this URL in Paymob dashboard:
 *   Accept → Settings → Transaction response callback
 *   → https://your-app.vercel.app/payments/callback
 *
 * Paymob appends all transaction fields as query params, including:
 *   merchant_order_id  — our booking ID (set during initiation)
 *   success            — "true" / "false"
 *   pending            — "true" / "false"
 *   order              — Paymob's order ID
 *   hmac               — SHA-512 signature for verification
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyPaymobHmac } from '@/lib/gateways/paymob'

export async function GET(req: NextRequest) {
  const p      = req.nextUrl.searchParams
  // Derive origin from the request itself so this works on any domain
  // without needing NEXT_PUBLIC_APP_URL set correctly in every environment
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  const bookingId = p.get('merchant_order_id')
  const success   = p.get('success')   === 'true'
  const pending   = p.get('pending')   === 'true'
  const hmac      = p.get('hmac')      ?? ''

  // Reconstruct the obj Paymob uses for HMAC verification
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
    order:                  { id: p.get('order') },
    owner:                  p.get('owner'),
    pending:                p.get('pending'),
    source_data: {
      pan:      p.get('source_data.pan')      ?? '',
      sub_type: p.get('source_data.sub_type') ?? '',
      type:     p.get('source_data.type')     ?? '',
    },
    success: p.get('success'),
  }

  // Verify HMAC when secret is configured
  if (process.env.PAYMOB_HMAC_SECRET) {
    if (!verifyPaymobHmac(obj, hmac)) {
      console.error('[payments/callback] HMAC verification failed')
      return NextResponse.redirect(`${appUrl}/?payment=invalid`)
    }
  }

  if (!bookingId) {
    return NextResponse.redirect(`${appUrl}/?payment=error`)
  }

  const status = pending ? 'pending' : success ? 'success' : 'failed'
  return NextResponse.redirect(`${appUrl}/bookings/${bookingId}?payment=${status}`)
}
