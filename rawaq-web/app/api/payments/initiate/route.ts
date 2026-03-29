/**
 * POST /api/payments/initiate
 *
 * Creates a pending payment_transaction and initiates the gateway checkout.
 * Returns a redirect URL (or Fawry reference) for the client to act on.
 *
 * For free bookings the booking is created directly (no payment initiation).
 * For paid bookings:
 *   1. Booking is created with status='pending' (held for payment confirmation)
 *   2. Payment transaction is inserted with status='pending'
 *   3. Gateway is called → returns redirect URL
 *   4. Client redirects user to the hosted payment page
 *   5. On success: gateway webhook → confirm booking
 *
 * Body:
 *   {
 *     event_id: string
 *     ticket_type_id?: string
 *     promo_code?: string
 *     notes?: string
 *     payment_option_id: string   // e.g. 'stripe_card', 'paymob_card', 'fawry'
 *   }
 */

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException, ConflictException } from '@/lib/errors'
import { CreateBookingSchema } from '@/lib/validations/bookings'
import { z } from 'zod'
import { getPaymentOptions, resolveGateway } from '@/lib/gateways/selector'
import { initiatePaymob } from '@/lib/gateways/paymob'
import { initiateStripe } from '@/lib/gateways/stripe-gw'
import type { InitiatePaymentParams } from '@/lib/gateways/types'
import { sendNotification } from '@/lib/notifications'

const BodySchema = CreateBookingSchema.extend({
  payment_option_id: z.string().min(1).default('simulated'),
  source: z.enum(['web', 'mobile']).default('web'),
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(req: NextRequest) {
  try {
    const ctx   = await requireAuth()
    const body  = await req.json()
    const input = BodySchema.parse(body)

    const admin = createSupabaseAdminClient()

    // ── Fetch event ───────────────────────────────────────────────────────────
    const { data: event, error: eventErr } = await admin
      .from('events')
      .select('id, title, is_published, is_cancelled, start_at, organizer_id, gender_restriction, is_premium_only, is_free, price, currency, capacity')
      .eq('id', input.event_id)
      .single()

    if (eventErr || !event) throw new NotFoundException('Event')
    if (!event.is_published) throw new ForbiddenException('Event is not published')
    if (event.is_cancelled)  throw new ForbiddenException('Event has been cancelled')
    if (new Date(event.start_at) < new Date()) throw new ForbiddenException('Event has already started')

    // ── Fetch user profile ────────────────────────────────────────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, gender, city, plan_id, email:id')
      .eq('id', ctx.userId)
      .single()

    if (!profile?.display_name || !profile?.gender || !profile?.city) {
      throw new ForbiddenException('Please complete your profile (name, gender, city) before booking.')
    }
    if (event.gender_restriction === 'male'   && profile.gender !== 'male')   throw new ForbiddenException('This event is for men only.')
    if (event.gender_restriction === 'female' && profile.gender !== 'female') throw new ForbiddenException('This event is for women only.')
    if (event.is_premium_only && profile.plan_id !== 'user_premium') {
      throw new ForbiddenException('This event is for Premium members only.')
    }

    // ── Ticket type ───────────────────────────────────────────────────────────
    let ticketType: { id: string; price: number; is_free: boolean; capacity: number | null; sold_count: number; sale_starts_at: string | null; sale_ends_at: string | null } | null = null
    if (input.ticket_type_id) {
      const { data: tt } = await admin
        .from('ticket_types')
        .select('id, price, is_free, capacity, sold_count, sale_starts_at, sale_ends_at, is_active')
        .eq('id', input.ticket_type_id)
        .eq('event_id', input.event_id)
        .single()

      if (!tt || !(tt as { is_active: boolean }).is_active) throw new ForbiddenException('Ticket type not available')
      const now = new Date()
      if (tt.sale_starts_at && new Date(tt.sale_starts_at) > now) throw new ForbiddenException('Ticket sales not started')
      if (tt.sale_ends_at   && new Date(tt.sale_ends_at)   < now) throw new ForbiddenException('Ticket sales ended')
      if (tt.capacity !== null && tt.sold_count >= tt.capacity)    throw new ForbiddenException('Ticket sold out')
      ticketType = tt
    }

    // ── Promo code ────────────────────────────────────────────────────────────
    let promoCodeId   : string | null = null
    let discountAmount: number        = 0
    if (input.promo_code) {
      const code = input.promo_code.toUpperCase().trim()
      const { data: promos } = await admin
        .from('promo_codes')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .or(`event_id.eq.${input.event_id},event_id.is.null`)
        .order('event_id', { nullsFirst: false })
        .limit(2)

      const promo = promos?.find((p) => p.event_id === input.event_id) ?? promos?.find((p) => !p.event_id)
      if (!promo) throw new ForbiddenException('Invalid or inactive promo code')
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) throw new ForbiddenException('Promo code expired')
      if (promo.max_uses !== null && promo.used_count >= promo.max_uses) throw new ForbiddenException('Promo code usage limit reached')

      const orderPrice = ticketType ? ticketType.price : (event.price ?? 0)
      if (orderPrice < (promo.min_order_amount ?? 0)) throw new ForbiddenException(`Minimum order: ${promo.min_order_amount}`)

      promoCodeId = promo.id
      discountAmount = promo.discount_type === 'percent'
        ? round2(orderPrice * (promo.discount_value / 100))
        : Math.min(promo.discount_value, orderPrice)
    }

    // ── Effective price ───────────────────────────────────────────────────────
    const effectivePrice = ticketType
      ? Math.max(0, ticketType.price - discountAmount)
      : event.price ? Math.max(0, event.price - discountAmount) : 0
    const isFreeBooking  = ticketType
      ? ticketType.is_free || effectivePrice === 0
      : event.is_free || effectivePrice === 0

    // ── Platform fee ──────────────────────────────────────────────────────────
    let platformFeePct    = 0
    let platformFeeAmount = 0
    if (!isFreeBooking && effectivePrice > 0) {
      const { data: orgProfile } = await admin
        .from('organizer_profiles')
        .select('plan:plan_definitions(platform_fee_pct)')
        .eq('user_id', event.organizer_id)
        .single()
      platformFeePct    = (orgProfile?.plan as { platform_fee_pct?: number } | null)?.platform_fee_pct ?? 0.10
      platformFeeAmount = round2(effectivePrice * platformFeePct)
    }

    // ── Resolve existing booking row (any status) ────────────────────────────
    // The UNIQUE (user_id, event_id) constraint means there is at most one row.
    // Fetch it unconditionally so we never attempt a blind INSERT against an
    // existing row, which would hit the constraint regardless of status.
    const { data: anyExisting } = await (admin as any)
      .from('bookings')
      .select('id, status')
      .eq('user_id', ctx.userId)
      .eq('event_id', input.event_id)
      .maybeSingle()

    const existingStatus: string | null = anyExisting ? (anyExisting as any).status : null

    // Block if already confirmed — the booking was paid and is active.
    if (existingStatus === 'confirmed') {
      throw new ConflictException('You already have an active booking for this event')
    }

    // If a pending/cancelled/waitlisted row exists, void any orphaned pending
    // payment transactions so the audit trail stays clean before we reuse it.
    if (anyExisting && existingStatus === 'pending') {
      await (admin as any)
        .from('payment_transactions')
        .update({ status: 'failed', failure_reason: 'superseded_by_new_attempt' })
        .eq('booking_id', (anyExisting as any).id)
        .eq('status', 'pending')
    }

    // For free bookings → status 'confirmed' immediately (same as before)
    // For paid bookings → status 'pending' until webhook fires
    const bookingStatus          = isFreeBooking ? 'confirmed' : 'pending'
    const paymentPendingUntil    = isFreeBooking ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const bookingFields = {
      status:               bookingStatus,
      notes:                input.notes ?? null,
      ticket_type_id:       input.ticket_type_id ?? null,
      promo_code_id:        promoCodeId,
      discount_amount:      discountAmount,
      platform_fee_pct:     platformFeePct,
      platform_fee_amount:  platformFeeAmount,
      payment_pending_until: paymentPendingUntil,
    }

    let booking: Record<string, unknown>
    if (anyExisting) {
      // Reuse the existing row — UPDATE avoids the UNIQUE constraint entirely.
      const { data, error } = await admin.from('bookings').update(bookingFields as any).eq('id', (anyExisting as any).id).select().single()
      if (error) throw error
      booking = data as Record<string, unknown>
    } else {
      const { data, error } = await admin.from('bookings').insert({ user_id: ctx.userId, event_id: input.event_id, ...bookingFields } as any).select().single()
      if (error) throw error
      booking = data as Record<string, unknown>
    }

    // ── Free booking: confirm immediately ────────────────────────────────────
    if (isFreeBooking) {
      sendNotification({ userId: ctx.userId, type: 'booking_confirmed', payload: { event_id: event.id, event_title: event.title, booking_id: booking.id as string } }).catch(() => {})
      sendNotification({ userId: event.organizer_id, type: 'new_attendee', payload: { event_id: event.id, event_title: event.title, booking_id: booking.id as string, actor_id: ctx.userId, actor_name: profile.display_name ?? 'Someone' } }).catch(() => {})
      return created({ booking, payment: null, free: true })
    }

    // ── Paid booking: create pending payment_transaction ─────────────────────
    const organizerNet  = round2(effectivePrice - platformFeeAmount)
    const { gateway, method } = resolveGateway(event.currency ?? 'SAR', input.payment_option_id)

    const { data: txRow, error: txErr } = await (admin as any)
      .from('payment_transactions')
      .insert({
        user_id:       ctx.userId,
        organizer_id:  event.organizer_id,
        event_id:      event.id,
        booking_id:    booking.id,
        type:          'ticket',
        status:        'pending',
        amount:        effectivePrice,
        platform_fee:  platformFeeAmount,
        organizer_net: organizerNet,
        currency:      event.currency ?? 'SAR',
        gateway,
        payment_method:  method,
        is_simulated:    gateway === 'simulated',
        gateway_payload: { source: input.source }, // track mobile vs web for callback redirect
      })
      .select('id')
      .single()

    if (txErr) throw txErr

    // ── Simulated: confirm immediately ────────────────────────────────────────
    if (gateway === 'simulated') {
      await (admin as any)
        .from('payment_transactions')
        .update({ status: 'succeeded', gateway_ref: `sim_${Date.now()}` })
        .eq('id', txRow.id)
      await admin.from('bookings').update({ status: 'confirmed', payment_pending_until: null } as any).eq('id', booking.id as string)
      sendNotification({ userId: ctx.userId, type: 'booking_confirmed', payload: { event_id: event.id, event_title: event.title, booking_id: booking.id as string } }).catch(() => {})
      sendNotification({ userId: event.organizer_id, type: 'new_attendee', payload: { event_id: event.id, event_title: event.title, booking_id: booking.id as string, actor_id: ctx.userId, actor_name: profile.display_name ?? 'Someone' } }).catch(() => {})
      return created({ booking, payment: { gateway: 'simulated', free: false }, free: false })
    }

    // ── Real gateway: initiate checkout ──────────────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rawaq.app'
    const initParams: InitiatePaymentParams = {
      bookingId:      booking.id as string,
      transactionId:  txRow.id,
      amount:         effectivePrice,
      currency:       event.currency ?? 'SAR',
      userId:         ctx.userId,
      organizerId:    event.organizer_id,
      eventId:        event.id,
      eventTitle:     event.title,
      platformFeePct,
      method,
      userEmail:      undefined, // profile.email not available via this select
      successUrl:     `${appUrl}/bookings/${booking.id as string}?payment=success`,
      cancelUrl:      `${appUrl}/events/${event.id}?payment=cancelled`,
    }

    let gatewayResult
    if (gateway === 'paymob') {
      gatewayResult = await initiatePaymob(initParams)
    } else {
      gatewayResult = await initiateStripe(initParams)
    }

    // Store gateway order ID for webhook correlation
    await (admin as any)
      .from('payment_transactions')
      .update({ gateway_order_id: gatewayResult.gatewayOrderId })
      .eq('id', txRow.id)

    return ok({
      booking_id:              booking.id,
      transaction_id:          txRow.id,
      gateway:                 gatewayResult.gateway,
      redirect_url:            gatewayResult.redirectUrl,
      fawry_reference_number:  gatewayResult.fawryReferenceNumber ?? null,
      expires_at:              gatewayResult.expiresAt ?? null,
      free:                    false,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
