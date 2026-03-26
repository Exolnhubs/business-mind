import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { z } from 'zod'

// GET /api/subscriptions — current user's plan + active subscription + (organizer) usage
export async function GET() {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

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

      return ok({
        plan: op?.plan ?? null,
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

    return ok({
      plan: profile?.plan ?? null,
      subscription: sub ?? null,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

const ChangePlanSchema = z.object({
  plan_id: z.string().min(1),
})

// POST /api/subscriptions — self-service plan change (MVP: simulated)
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const { plan_id } = ChangePlanSchema.parse(body)

    const admin  = createSupabaseAdminClient()
    const supabase = await createSupabaseServerClient()

    // Validate plan exists and matches role type
    const { data: plan, error: planErr } = await admin
      .from('plan_definitions')
      .select('id, type, name, price_sar')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single()

    if (planErr || !plan) throw new NotFoundException('Plan')

    const expectedType = ctx.role === 'organizer' ? 'organizer' : 'user'
    if (plan.type !== expectedType) {
      throw new ForbiddenException('This plan is not available for your account type')
    }

    // Update plan on the appropriate profile table
    if (ctx.role === 'organizer') {
      const { error } = await supabase
        .from('organizer_profiles')
        .update({ plan_id })
        .eq('user_id', ctx.userId)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('profiles')
        .update({ plan_id })
        .eq('id', ctx.userId)
      if (error) throw error
    }

    // Cancel existing active subscription
    await admin
      .from('subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('user_id', ctx.userId)
      .eq('status', 'active')

    // Create new subscription record for paid plans (free tiers have no record)
    if (plan.price_sar > 0) {
      const periodEnd = new Date()
      periodEnd.setMonth(periodEnd.getMonth() + 1)
      const { error: subErr } = await admin
        .from('subscriptions')
        .insert({
          user_id: ctx.userId,
          plan_id,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd.toISOString(),
          is_simulated: true,
          payment_ref: `self_${Date.now()}`,
        } as any)
      if (subErr) throw subErr
    }

    return ok({ plan_id, plan_name: plan.name })
  } catch (err) {
    return handleApiError(err)
  }
}
