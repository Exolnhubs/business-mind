import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { getResolvedPlanCatalog } from '@/lib/plans'
import { assignMembershipPlan } from '@/lib/subscriptions'
import { getPaymentOptions, resolveGateway } from '@/lib/gateways/selector'
import { initiatePaymob } from '@/lib/gateways/paymob'
import { initiateStripe } from '@/lib/gateways/stripe-gw'
import type { InitiatePaymentParams } from '@/lib/gateways/types'
import { z } from 'zod'

// GET /api/subscriptions — current user's plan + active subscription + (organizer) usage
export async function GET() {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    let planType: 'user' | 'organizer' | 'individual' = ctx.role === 'organizer' ? 'organizer' : 'user'
    if (ctx.role === 'organizer') {
      const { data: op } = await supabase
        .from('organizer_profiles')
        .select('organizer_type')
        .eq('user_id', ctx.userId)
        .single()
      if (op?.organizer_type === 'individual') planType = 'individual'
    }

    const catalog = await getResolvedPlanCatalog(ctx.userId, planType)

    if (ctx.role === 'organizer') {
      // Organizer: return plan from organizer_profiles + this month's quota usage
      const [
        { data: op, error: opErr },
        { data: sub },
      ] = await Promise.all([
        supabase
          .from('organizer_profiles')
          .select('plan_id, plan:plan_definitions(*)')
          .eq('user_id', ctx.userId)
          .single(),
        supabase
          .from('subscriptions')
          .select('*, plan:plan_definitions(*)')
          .eq('user_id', ctx.userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (opErr) throw opErr

      // Current month's first day (UTC)
      const monthStr = new Date().toISOString().slice(0, 7) + '-01'

      const { data: usage } = await supabase
        .from('organizer_monthly_usage')
        .select('events_created')
        .eq('organizer_id', ctx.userId)
        .eq('month', monthStr)
        .maybeSingle()

      const plan = catalog.plans.find((item) => item.id === op?.plan_id) ?? null

      return ok({
        plan,
        plans: catalog.plans,
        pricing_country_code: catalog.countryCode,
        pricing_source: catalog.source,
        subscription: sub ?? null,
        usage: {
          events_created: usage?.events_created ?? 0,
          month: monthStr,
        },
      })
    }

    // Regular user: return plan from profiles
    const [
      { data: profile, error: profileErr },
      { data: sub },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('plan_id, plan:plan_definitions(*)')
        .eq('id', ctx.userId)
        .single(),
      supabase
        .from('subscriptions')
        .select('*, plan:plan_definitions(*)')
        .eq('user_id', ctx.userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (profileErr) throw profileErr

    const plan = catalog.plans.find((item) => item.id === profile?.plan_id) ?? null

    return ok({
      plan,
      plans: catalog.plans,
      pricing_country_code: catalog.countryCode,
      pricing_source: catalog.source,
      subscription: sub ?? null,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

const ChangePlanSchema = z.object({
  plan_id: z.string().min(1),
  payment_option_id: z.string().min(1).optional(),
  source: z.enum(['web', 'mobile']).default('web'),
})

// POST /api/subscriptions — self-service membership change
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const { plan_id, payment_option_id, source } = ChangePlanSchema.parse(body)

    const admin = createSupabaseAdminClient()

    let planType: 'user' | 'organizer' | 'individual' = ctx.role === 'organizer' ? 'organizer' : 'user'
    if (ctx.role === 'organizer') {
      const { data: op } = await admin
        .from('organizer_profiles')
        .select('organizer_type')
        .eq('user_id', ctx.userId)
        .single()
      if (op?.organizer_type === 'individual') planType = 'individual'
    }

    const catalog = await getResolvedPlanCatalog(ctx.userId, planType)
    const plan = catalog.plans.find((item) => item.id === plan_id)

    if (!plan) throw new NotFoundException('Plan')

    if (plan.price_amount <= 0) {
      const result = await assignMembershipPlan({
        userId: ctx.userId,
        role: ctx.role,
        planId: plan.id,
        paymentRef: `free_${Date.now()}`,
        isSimulated: true,
      })
      return ok({ plan_id: result.planId, plan_name: result.planName, free: true })
    }

    const paymentOptions = getPaymentOptions(plan.price_currency)
    const selectedPaymentOptionId = payment_option_id ?? paymentOptions[0]?.id
    if (!selectedPaymentOptionId) {
      throw new ForbiddenException('No payment methods are currently available for this plan')
    }

    const { gateway, method } = resolveGateway(plan.price_currency, selectedPaymentOptionId)
    const organizerId = ctx.userId

    const { data: existingPendingTx } = await admin
      .from('payment_transactions')
      .select('id')
      .eq('user_id', ctx.userId)
      .eq('type', 'subscription')
      .eq('subscription_plan_id', plan.id)
      .eq('status', 'pending')
      .maybeSingle()

    const { data: txRow, error: txErr } = await admin
      .from('payment_transactions')
      .upsert({
        id: existingPendingTx?.id,
        user_id: ctx.userId,
        organizer_id: organizerId,
        event_id: null,
        booking_id: null,
        tip_id: null,
        subscription_plan_id: plan.id,
        type: 'subscription',
        status: 'pending',
        amount: plan.price_amount,
        platform_fee: 0,
        organizer_net: 0,
        currency: plan.price_currency,
        gateway,
        source,
        payment_method: method,
        is_simulated: gateway === 'simulated',
        gateway_payload: { source, entity: 'subscription' },
        gateway_ref: null,
        gateway_order_id: null,
        failure_reason: null,
        fawry_reference_number: null,
      })
      .select('id')
      .single()

    if (txErr) throw txErr

    if (gateway === 'simulated') {
      await admin
        .from('payment_transactions')
        .update({
          status: 'succeeded',
          gateway_ref: `sim_sub_${Date.now()}`,
          is_simulated: true,
        })
        .eq('id', txRow.id)

      const result = await assignMembershipPlan({
        userId: ctx.userId,
        role: ctx.role,
        planId: plan.id,
        paymentRef: txRow.id,
        isSimulated: true,
      })

      return ok({
        plan_id: result.planId,
        plan_name: result.planName,
        free: false,
        transaction_id: txRow.id,
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rawaq.app'
    const successUrl = source === 'mobile'
      ? `${appUrl}/api/payments/mobile-return?transaction_id=${txRow.id}&entity=subscription&status=success`
      : `${appUrl}/plans?payment=success&transaction_id=${txRow.id}`
    const cancelUrl = source === 'mobile'
      ? `${appUrl}/api/payments/mobile-return?transaction_id=${txRow.id}&entity=subscription&status=cancelled`
      : `${appUrl}/plans?payment=cancelled&transaction_id=${txRow.id}`

    const initParams: InitiatePaymentParams = {
      transactionId: txRow.id,
      amount: plan.price_amount,
      currency: plan.price_currency,
      userId: ctx.userId,
      organizerId,
      eventId: ctx.userId,
      eventTitle: `Rawaq ${plan.name} membership`,
      platformFeePct: 0,
      method,
      kind: 'subscription',
      successUrl,
      cancelUrl,
    }

    const gatewayResult = gateway === 'paymob'
      ? await initiatePaymob(initParams)
      : await initiateStripe(initParams)

    const { error: gwUpdateErr } = await admin
      .from('payment_transactions')
      .update({
        gateway_order_id: gatewayResult.gatewayOrderId ?? null,
        fawry_reference_number: gatewayResult.fawryReferenceNumber ?? null,
      })
      .eq('id', txRow.id)

    if (gwUpdateErr) {
      console.error('[subscriptions] Failed to store gateway metadata', gwUpdateErr)
    }

    return ok({
      transaction_id: txRow.id,
      plan_id: plan.id,
      plan_name: plan.name,
      redirect_url: gatewayResult.redirectUrl,
      fawry_reference_number: gatewayResult.fawryReferenceNumber ?? null,
      expires_at: gatewayResult.expiresAt ?? null,
      free: false,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
