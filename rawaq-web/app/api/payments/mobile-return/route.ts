/**
 * GET /api/payments/mobile-return
 *
 * Stripe mobile payment relay.
 *
 * Stripe requires HTTPS success/cancel URLs — custom URL schemes (rawaq://)
 * are not accepted directly. This handler acts as a server-side relay:
 *   Stripe → /api/payments/mobile-return?booking_id=...&status=success
 *          → rawaq://payment-result?booking_id=...&status=success
 *
 * The Expo WebBrowser.openAuthSessionAsync watching for rawaq:// then
 * intercepts the deep link and closes the browser, returning control
 * to the mobile app.
 *
 * Stripe appends ?session_id={CHECKOUT_SESSION_ID} to successUrl — that
 * extra param is simply ignored here.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const bookingId = req.nextUrl.searchParams.get('booking_id')
  const status    = req.nextUrl.searchParams.get('status') ?? 'success'

  if (!bookingId) {
    return NextResponse.redirect(`${appUrl}/?payment=error`)
  }

  return NextResponse.redirect(
    `rawaq://payment-result?booking_id=${bookingId}&status=${status}`
  )
}
