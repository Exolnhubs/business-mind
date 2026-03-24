import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { z } from 'zod'

const AssignPlanSchema = z.object({
  plan_id: z.string().min(1),
})

// PATCH /api/admin/plans/[userId] — assign a plan to a user or organizer
// The plan_id must match the target's role type:
//   users       → user_free | user_premium
//   organizers  → org_basic | org_pro | org_elite
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdmin()
    const { userId } = await params
    const body = await req.json()
    const { plan_id } = AssignPlanSchema.parse(body)

    const admin = createSupabaseAdminClient()

    // Validate plan exists
    const { data: plan, error: planErr } = await admin
      .from('plan_definitions')
      .select('id, type, price_sar, name')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single()

    if (planErr || !plan) throw new NotFoundException('Plan')

    // Resolve target user's role
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single()

    if (profileErr || !profile) throw new NotFoundException('User')

    const isOrganizer = profile.role === 'organizer'
    const isUser      = profile.role === 'user'

    if (isOrganizer && plan.type !== 'organizer') {
      throw new ForbiddenException('Cannot assign a user plan to an organizer')
    }
    if (isUser && plan.type !== 'user') {
      throw new ForbiddenException('Cannot assign an organizer plan to a user')
    }

    // Update the plan column on the appropriate profile table
    if (isOrganizer) {
      const { error } = await admin
        .from('organizer_profiles')
        .update({ plan_id })
        .eq('user_id', userId)
      if (error) throw error
    } else {
      const { error } = await admin
        .from('profiles')
        .update({ plan_id })
        .eq('id', userId)
      if (error) throw error
    }

    // Upsert a subscription record (for audit trail)
    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    // Cancel any existing active subscription
    await admin
      .from('subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')

    if (plan_id !== 'user_free' && plan_id !== 'org_basic') {
      // Create a new active subscription for paid plans
      const { error: subErr } = await admin
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd.toISOString(),
          is_simulated: true,
          payment_ref: `admin_assigned_${Date.now()}`,
        })
      if (subErr) throw subErr
    }

    return ok({ user_id: userId, plan_id, plan_name: plan.name })
  } catch (err) {
    return handleApiError(err)
  }
}
