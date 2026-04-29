/**
 * POST /api/payments/initiate
 *
 * Creates a pending payment_transaction and initiates the gateway checkout.
 * Returns a redirect URL (or Fawry reference) for the client to act on.
 */

import { NextRequest } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { ApiException, handleApiError, ok, created, ForbiddenException, ConflictException } from '@/lib/errors'
import { CreateBookingSchema } from '@/lib/validations/bookings'
import { z } from 'zod'
import { resolveGateway } from '@/lib/gateways/selector'
import { initiatePaymob } from '@/lib/gateways/paymob'
import { initiateStripe } from '@/lib/gateways/stripe-gw'
import type { InitiatePaymentParams } from '@/lib/gateways/types'
import { sendNotification } from '@/lib/notifications'
import { limiters, checkRateLimit } from '@/lib/rate-limit'
import { validateBookingInput } from '@/lib/bookings/validate'

const BodySchema = CreateBookingSchema.extend({
  payment_option_id: z.string().min(1).default('simulated'),
  source: z.enum(['web', 'mobile']).default('web'),
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    await checkRateLimit(limiters.payments, ctx.userId)
    const body = await req.json()
    const input = BodySchema.parse(body)

    const admin = createSupabaseAdminClient()
    const {
      event,
      occurrence,
      profile,
      ticketType,
      promoCodeId,
      discountAmount,
      primaryPrice,
      platformFeePct,
    } = await validateBookingInput(admin, ctx, input)

    if (
      occurrence.capacity !== null &&
      occurrence.bookings_count + input.group_size > occurrence.capacity
    ) {
      throw new ForbiddenException('Not enough spots available for your group size')
    }

    const extraPrice = ticketType
      ? ticketType.price * (input.group_size - 1)
      : (event.price ?? 0) * (input.group_size - 1)
    const effectivePrice = primaryPrice + extraPrice
    const isFreeBooking = effectivePrice === 0

    const platformFeeAmount = !isFreeBooking && effectivePrice > 0
      ? round2(effectivePrice * platformFeePct)
      : 0

    const { data: anyExisting } = await (admin as any)
      .from('bookings')
      .select('id, status')
      .eq('user_id', ctx.userId)
      .eq('occurrence_id', occurrence.id)
      .maybeSingle()

    const existingStatus: string | null = anyExisting ? (anyExisting as any).status : null

    if (existingStatus === 'confirmed') {
      throw new ConflictException('You already have an active booking for this session')
    }

    if (anyExisting && existingStatus === 'pending') {
      await (admin as any)
        .from('payment_transactions')
        .update({ status: 'failed', failure_reason: 'superseded_by_new_attempt' })
        .eq('booking_id', (anyExisting as any).id)
        .eq('status', 'pending')
    }

    const bookingStatus = isFreeBooking ? 'confirmed' : 'pending'
    const paymentPendingUntil = isFreeBooking ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const bookingFields = {
      status: bookingStatus,
      notes: input.notes ?? null,
      group_size: input.group_size,
      ticket_type_id: input.ticket_type_id ?? null,
      promo_code_id: promoCodeId,
      discount_amount: discountAmount,
      platform_fee_pct: platformFeePct,
      platform_fee_amount: platformFeeAmount,
      payment_pending_until: paymentPendingUntil,
    }

    let booking: Record<string, unknown>
    if (anyExisting) {
      const { data, error } = await admin
        .from('bookings')
        .update(bookingFields as any)
        .eq('id', (anyExisting as any).id)
        .select()
        .single()
      if (error) throw error
      booking = data as Record<string, unknown>
    } else {
      const { data, error } = await admin
        .from('bookings')
        .insert({
          user_id: ctx.userId,
          event_id: input.event_id,
          occurrence_id: occurrence.id,
          ...bookingFields,
        } as any)
        .select()
        .single()
      if (error) throw error
      booking = data as Record<string, unknown>
    }

    if (input.holders.length > 0) {
      const holderRows = input.holders.map((holder) => ({
        booking_id: booking.id,
        full_name: holder.full_name,
        date_of_birth: holder.date_of_birth,
        relation: holder.relation,
        position: holder.position,
      }))
      const { error: holderErr } = await admin.from('booking_holders').insert(holderRows as never)
      if (holderErr) throw holderErr
    }

    if (isFreeBooking) {
      queueBookingNotifications({
        userId: ctx.userId,
        organizerId: event.organizer_id,
        eventId: event.id,
        eventTitle: event.title,
        bookingId: booking.id as string,
        actorName: profile.display_name ?? 'Someone',
      })
      return created({ booking, payment: null, free: true })
    }

    const organizerNet = round2(effectivePrice - platformFeeAmount)
    const { gateway, method } = resolveGateway(event.currency ?? 'SAR', input.payment_option_id)

    const { data: txRow, error: txErr } = await (admin as any)
      .from('payment_transactions')
      .upsert({
        user_id: ctx.userId,
        organizer_id: event.organizer_id,
        event_id: event.id,
        occurrence_id: occurrence.id,
        booking_id: booking.id,
        type: 'ticket',
        status: 'pending',
        amount: effectivePrice,
        platform_fee: platformFeeAmount,
        organizer_net: organizerNet,
        currency: event.currency ?? 'SAR',
        gateway,
        source: input.source,
        payment_method: method,
        is_simulated: gateway === 'simulated',
        gateway_payload: { source: input.source },
        gateway_ref: null,
        gateway_order_id: null,
        failure_reason: null,
      }, { onConflict: 'booking_id' })
      .select('id')
      .single()

    if (txErr) throw txErr

    if (gateway === 'simulated') {
      await (admin as any)
        .from('payment_transactions')
        .update({ status: 'succeeded', gateway_ref: `sim_${Date.now()}` })
        .eq('id', txRow.id)
      await admin
        .from('bookings')
        .update({ status: 'confirmed', payment_pending_until: null } as any)
        .eq('id', booking.id as string)

      queueBookingNotifications({
        userId: ctx.userId,
        organizerId: event.organizer_id,
        eventId: event.id,
        eventTitle: event.title,
        bookingId: booking.id as string,
        actorName: profile.display_name ?? 'Someone',
      })

      return created({ booking, payment: { gateway: 'simulated', free: false }, free: false })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rawaq.app'
    const isMobile = input.source === 'mobile'

    const successUrl = isMobile
      ? `${appUrl}/api/payments/mobile-return?booking_id=${booking.id as string}&status=success`
      : `${appUrl}/bookings/${booking.id as string}?payment=success`
    const cancelUrl = isMobile
      ? `${appUrl}/api/payments/mobile-return?booking_id=${booking.id as string}&status=cancelled`
      : `${appUrl}/events/${event.id}?payment=cancelled`

    const initParams: InitiatePaymentParams = {
      bookingId: booking.id as string,
      transactionId: txRow.id,
      amount: effectivePrice,
      currency: event.currency ?? 'SAR',
      userId: ctx.userId,
      organizerId: event.organizer_id,
      eventId: event.id,
      eventTitle: event.title,
      platformFeePct,
      method,
      userEmail: undefined,
      successUrl,
      cancelUrl,
    }

    let gatewayResult
    try {
      if (gateway === 'paymob') {
        gatewayResult = await initiatePaymob(initParams)
      } else {
        gatewayResult = await initiateStripe(initParams)
      }
    } catch (gatewayError) {
      if (gateway === 'paymob') {
        const message = gatewayError instanceof Error
          ? gatewayError.message
          : 'Paymob is temporarily unavailable. Please try again in a moment.'
        const timedOut = /timed out|could not be reached/i.test(message)
        throw new ApiException(
          message,
          timedOut ? 504 : 502,
          timedOut ? 'PAYMENT_GATEWAY_TIMEOUT' : 'PAYMENT_GATEWAY_ERROR',
        )
      }
      throw gatewayError
    }

    const { error: gwUpdateErr } = await (admin as any)
      .from('payment_transactions')
      .update({ gateway_order_id: gatewayResult.gatewayOrderId })
      .eq('id', txRow.id)
    if (gwUpdateErr) {
      console.error(
        '[payments/initiate] Failed to store gateway_order_id:',
        gwUpdateErr,
        'txId:',
        txRow.id,
        'orderId:',
        gatewayResult.gatewayOrderId,
      )
    }

    return ok({
      booking_id: booking.id,
      transaction_id: txRow.id,
      gateway: gatewayResult.gateway,
      redirect_url: gatewayResult.redirectUrl,
      fawry_reference_number: gatewayResult.fawryReferenceNumber ?? null,
      expires_at: gatewayResult.expiresAt ?? null,
      free: false,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

function queueBookingNotifications({
  userId,
  organizerId,
  eventId,
  eventTitle,
  bookingId,
  actorName,
}: {
  userId: string
  organizerId: string
  eventId: string
  eventTitle: string
  bookingId: string
  actorName: string
}) {
  waitUntil(
    sendNotification({
      userId,
      type: 'booking_confirmed',
      payload: { event_id: eventId, event_title: eventTitle, booking_id: bookingId },
    }).catch((error) => console.error('[payments/initiate] booking_confirmed notification failed:', error))
  )
  waitUntil(
    sendNotification({
      userId: organizerId,
      type: 'new_attendee',
      payload: { event_id: eventId, event_title: eventTitle, booking_id: bookingId, actor_id: userId, actor_name: actorName },
    }).catch((error) => console.error('[payments/initiate] new_attendee notification failed:', error))
  )
}
