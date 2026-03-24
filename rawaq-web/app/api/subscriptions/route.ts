import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

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
