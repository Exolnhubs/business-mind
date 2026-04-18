import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException } from '@/lib/errors'
import { CreateTipSchema } from '@/lib/validations/tips'
import { sendNotification } from '@/lib/notifications'
import { resolveGateway } from '@/lib/gateways/selector'
import { initiatePaymob } from '@/lib/gateways/paymob'
import { initiateStripe } from '@/lib/gateways/stripe-gw'
import type { InitiatePaymentParams } from '@/lib/gateways/types'
import { limiters, checkRateLimit } from '@/lib/rate-limit'

// GET /api/tips — tips sent by current user (or received, for organizers)
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const direction = req.nextUrl.searchParams.get('direction') ?? 'sent'
    const page = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const perPage = Number(req.nextUrl.searchParams.get('per_page') ?? 20)
    const from = (page - 1) * perPage

    let query = supabase
      .from('tips')
      .select(
        `id, amount, currency, message, created_at,
         event:events(id, title, title_ar),
         sender:profiles!user_id(id, display_name, avatar_url)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (direction === 'received' && ctx.role === 'organizer') {
      query = query.eq('organizer_id', ctx.userId)
    } else {
      query = query.eq('user_id', ctx.userId)
    }

    const { data, count, error } = await query
    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/tips
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    await checkRateLimit(limiters.tips, ctx.userId)
    const body = await req.json()
    const input = CreateTipSchema.parse(body)

    const supabase = createSupabaseAdminClient()

    // Verify event and get organizer
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('id, title, organizer_id, is_published, is_cancelled, currency')
      .eq('id', input.event_id)
      .single()

    if (eventErr || !event) throw new NotFoundException('Event')
    if (!event.is_published || event.is_cancelled) {
      throw new ForbiddenException('Cannot donate to an inactive event')
    }
    if (event.organizer_id === ctx.userId) {
      throw new ForbiddenException('Cannot donate to your own event')
    }
    if ((event.currency ?? 'SAR').toUpperCase() !== input.currency.toUpperCase()) {
      throw new ForbiddenException('Donation currency must match the event currency')
    }

    // Look up organizer's platform fee from their plan
    const { data: orgProfile } = await supabase
      .from('organizer_profiles')
      .select('plan:plan_definitions(platform_fee_pct)')
      .eq('user_id', event.organizer_id)
      .single()

    const feePct: number = (orgProfile?.plan as { platform_fee_pct?: number } | null)?.platform_fee_pct ?? 0.10
    const feeAmount = Math.round(input.amount * feePct * 100) / 100
    const organizerNet = Math.round((input.amount - feeAmount) * 100) / 100

    if (input.payment_option_id === 'simulated') {
      const { data: tip, error } = await supabase
        .from('tips')
        .insert({
          user_id:             ctx.userId,
          event_id:            input.event_id,
          organizer_id:        event.organizer_id,
          amount:              input.amount,
          currency:            input.currency,
          message:             input.message,
          payment_ref:         null,
          is_simulated:        true,
          platform_fee_pct:    feePct,
          platform_fee_amount: feeAmount,
        } as any)
        .select()
        .single()

      if (error) throw error

      sendNotification({
        userId: event.organizer_id,
        type: 'tip_received',
        payload: {
          event_id: event.id,
          event_title: event.title,
          amount: input.amount,
          currency: input.currency,
          tipper_id: ctx.userId,
        },
      }).catch(() => {})

      return created(tip)
    }

    const { gateway, method } = resolveGateway(input.currency, input.payment_option_id)
    const { data: txRow, error: txErr } = await (supabase as any)
      .from('payment_transactions')
      .insert({
        user_id:             ctx.userId,
        event_id:            input.event_id,
        organizer_id:        event.organizer_id,
        amount:              input.amount,
        currency:            input.currency,
        type:                'tip',
        status:              'pending',
        platform_fee:        feeAmount,
        organizer_net:       organizerNet,
        gateway,
        source:              input.source,
        payment_method:      method,
        is_simulated:        false,
        gateway_ref:         null,
        gateway_order_id:    null,
        failure_reason:      null,
        gateway_payload:     {
          message: input.message?.trim() || null,
          source: input.source,
        },
      } as any)
      .select('id')
      .single()

    if (txErr) throw txErr

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rawaq.app'
    const isMobile = input.source === 'mobile'
    const successUrl = isMobile
      ? `${appUrl}/api/payments/mobile-return?transaction_id=${txRow.id as string}&entity=donation&status=success`
      : `${appUrl}/events/${event.id}?donation=success`
    const cancelUrl = isMobile
      ? `${appUrl}/api/payments/mobile-return?transaction_id=${txRow.id as string}&entity=donation&status=cancelled`
      : `${appUrl}/events/${event.id}?donation=cancelled`

    const initParams: InitiatePaymentParams = {
      transactionId: txRow.id as string,
      amount: input.amount,
      currency: input.currency,
      userId: ctx.userId,
      organizerId: event.organizer_id,
      eventId: event.id,
      eventTitle: event.title,
      platformFeePct: feePct,
      method,
      successUrl,
      cancelUrl,
      kind: 'donation',
    }

    const gatewayResult = gateway === 'paymob'
      ? await initiatePaymob(initParams)
      : await initiateStripe(initParams)

    const { error: gwUpdateErr } = await (supabase as any)
      .from('payment_transactions')
      .update({ gateway_order_id: gatewayResult.gatewayOrderId })
      .eq('id', txRow.id)

    if (gwUpdateErr) {
      console.error('[tips] Failed to store gateway_order_id:', gwUpdateErr, 'txId:', txRow.id)
    }

    return ok({
      transaction_id:         txRow.id,
      gateway:                gatewayResult.gateway,
      redirect_url:           gatewayResult.redirectUrl,
      fawry_reference_number: gatewayResult.fawryReferenceNumber ?? null,
      expires_at:             gatewayResult.expiresAt ?? null,
      immediate:              false,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
