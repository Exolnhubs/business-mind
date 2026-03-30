/**
 * GET /payments/callback
 *
 * Paymob Transaction Response Callback — alternate URL (same logic as
 * /api/payments/callback). Keep both in sync; configure ONE of them in
 * the Paymob dashboard.
 *
 * Behaviour:
 *   - Mobile payment → redirect to rawaq://payment-result?booking_id=:id&status=success|failed
 *     (iOS/Android intercepts rawaq:// and brings the user back into the app)
 *   - Web payment    → redirect to https://your-app/bookings/:id?payment=success|failed
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { verifyPaymobHmac } from '@/lib/gateways/paymob'

export async function GET(req: NextRequest) {
  const p      = req.nextUrl.searchParams
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  // Use Paymob's own numeric order ID to look up our transaction.
  // merchant_order_id is now a randomUUID per attempt and cannot be used as bookingId.
  const paymobOrderId = p.get('order')
  const success       = p.get('success') === 'true'
  const pending       = p.get('pending') === 'true'
  const hmac          = p.get('hmac') ?? ''

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
      console.error('[payments/callback] HMAC verification failed')
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
      .select('booking_id, gateway_payload')
      .eq('gateway_order_id', paymobOrderId)
      .single()

    if (!tx?.booking_id) {
      console.error('[payments/callback] No transaction found for gateway_order_id', paymobOrderId)
      return NextResponse.redirect(`${appUrl}/?payment=error`)
    }

    const bookingId = tx.booking_id as string
    const isMobile  = (tx.gateway_payload as { source?: string } | null)?.source === 'mobile'

    if (isMobile) {
      return NextResponse.redirect(
        `rawaq://payment-result?booking_id=${bookingId}&status=${status}`
      )
    }

    return NextResponse.redirect(`${appUrl}/bookings/${bookingId}?payment=${status}`)
  } catch (err) {
    console.error('[payments/callback] DB lookup failed', err)
    return NextResponse.redirect(`${appUrl}/?payment=error`)
  }
}
