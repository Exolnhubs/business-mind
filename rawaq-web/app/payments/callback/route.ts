/**
 * GET /payments/callback
 *
 * Paymob Transaction Response Callback — browser redirect handler.
 *
 * Register this URL in Paymob dashboard:
 *   Accept → Settings → Transaction response callback
 *   → https://your-app.vercel.app/payments/callback
 *
 * Behaviour:
 *   - Web payment  → redirect to https://your-app/bookings/:id?payment=success
 *   - Mobile payment → redirect to rawaq://payment-result?booking_id=:id&status=success
 *     (iOS/Android intercepts rawaq:// and brings the user back into the app)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { verifyPaymobHmac } from '@/lib/gateways/paymob'

export async function GET(req: NextRequest) {
  const p      = req.nextUrl.searchParams
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  const bookingId = p.get('merchant_order_id')
  const success   = p.get('success') === 'true'
  const pending   = p.get('pending') === 'true'
  const hmac      = p.get('hmac')    ?? ''

  // Reconstruct the obj Paymob uses for HMAC
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

  // ── Check if this was initiated from the mobile app ──────────────────────
  // We stored { source: 'mobile' | 'web' } in gateway_payload at initiation time.
  try {
    const admin = createSupabaseAdminClient()
    const { data: tx } = await (admin as any)
      .from('payment_transactions')
      .select('gateway_payload')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const isMobile = (tx?.gateway_payload as { source?: string } | null)?.source === 'mobile'

    if (isMobile) {
      // Redirect to the app's deep link — iOS/Android will intercept rawaq://
      // and bring the user back into the app automatically
      return NextResponse.redirect(
        `rawaq://payment-result?booking_id=${bookingId}&status=${status}`
      )
    }
  } catch {
    // DB lookup failed — fall through to web redirect
  }

  // ── Web: redirect to the booking result page ─────────────────────────────
  return NextResponse.redirect(`${appUrl}/bookings/${bookingId}?payment=${status}`)
}
