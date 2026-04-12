import { createSupabaseAdminClient } from './supabase/admin'
import { ForbiddenException, NotFoundException } from './errors'

type AccountRole = 'user' | 'organizer' | 'admin'

export async function assignMembershipPlan(args: {
  userId: string
  role: AccountRole
  planId: string
  paymentRef: string | null
  isSimulated: boolean
}) {
  const { userId, role, planId, paymentRef, isSimulated } = args
  const admin = createSupabaseAdminClient()

  const { data: plan, error: planErr } = await admin
    .from('plan_definitions')
    .select('id, type, name, price_sar')
    .eq('id', planId)
    .eq('is_active', true)
    .single()

  if (planErr || !plan) throw new NotFoundException('Plan')

  const expectedType = role === 'organizer' ? 'organizer' : 'user'
  if (plan.type !== expectedType) {
    throw new ForbiddenException('This plan is not available for your account type')
  }

  if (role === 'organizer') {
    const { error } = await admin
      .from('organizer_profiles')
      .update({ plan_id: planId })
      .eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await admin
      .from('profiles')
      .update({ plan_id: planId })
      .eq('id', userId)
    if (error) throw error
  }

  await admin
    .from('subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active')

  if (plan.price_sar > 0) {
    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + 1)
    const { error: subErr } = await admin
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_id: planId,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString(),
        is_simulated: isSimulated,
        payment_ref: paymentRef,
      } as never)
    if (subErr) throw subErr
  }

  return { planId: plan.id, planName: plan.name }
}
