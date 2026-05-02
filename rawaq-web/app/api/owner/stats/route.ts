import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'

export async function GET() {
  try {
    await requireOwner()
    const admin = createSupabaseAdminClient()

    const [
      { count: totalUsers },
      { count: approvedOrganizers },
      { count: activeSubscriptions },
      { data: activeSubs },
    ] = await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      admin.from('organizer_profiles').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      admin.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      admin
        .from('subscriptions')
        .select('plan:plan_definitions(price_sar)')
        .eq('status', 'active')
        .eq('is_simulated', false),
    ])

    const mrr = (activeSubs ?? []).reduce((sum, row) => {
      const price = (row as { plan?: { price_sar?: number | null } | null }).plan?.price_sar ?? 0
      return sum + Number(price)
    }, 0)

    return ok({
      totalUsers:          totalUsers ?? 0,
      approvedOrganizers:  approvedOrganizers ?? 0,
      activeSubscriptions: activeSubscriptions ?? 0,
      mrr,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
