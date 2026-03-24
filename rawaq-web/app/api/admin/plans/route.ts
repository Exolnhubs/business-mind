import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

// GET /api/admin/plans — all plan definitions + organizer plan overview
export async function GET() {
  try {
    await requireAdmin()
    const admin = createSupabaseAdminClient()

    const [
      { data: plans, error: plansErr },
      { data: organizers, error: orgsErr },
      { data: users, error: usersErr },
    ] = await Promise.all([
      admin
        .from('plan_definitions')
        .select('*')
        .order('type')
        .order('sort_order'),

      // All organizers with their current plan
      admin
        .from('organizer_profiles')
        .select(`
          user_id,
          plan_id,
          business_name,
          status,
          plan:plan_definitions(id, name, name_ar, price_sar, platform_fee_pct),
          user:profiles!user_id(id, display_name, avatar_url, is_banned)
        `)
        .order('created_at', { ascending: false }),

      // All users with their current plan (non-organizer, non-admin)
      admin
        .from('profiles')
        .select('id, display_name, avatar_url, plan_id, is_banned, created_at, plan:plan_definitions(id, name, name_ar, price_sar)')
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (plansErr) throw plansErr
    if (orgsErr)  throw orgsErr
    if (usersErr) throw usersErr

    return ok({ plans, organizers, users })
  } catch (err) {
    return handleApiError(err)
  }
}
