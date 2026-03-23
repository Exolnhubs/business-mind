import { requireAdmin } from '@/lib/auth'
import { handleApiError, ok } from '@/lib/errors'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

// GET /api/admin/stats — platform overview stats
export async function GET() {
  try {
    await requireAdmin()
    const admin = createSupabaseAdminClient()

    const [
      { count: totalUsers },
      { count: totalOrganizers },
      { count: totalEvents },
      { count: activeEvents },
      { count: totalBookings },
      { data: recentTips },
    ] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'organizer'),
      admin.from('events').select('id', { count: 'exact', head: true }),
      admin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true)
        .eq('is_cancelled', false)
        .gte('start_at', new Date().toISOString()),
      admin.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
      admin.from('tips').select('amount').eq('is_simulated', false),
    ])

    const tipsRevenue = (recentTips ?? []).reduce((sum, t) => sum + (t.amount as number), 0)

    // Pending organizer applications
    const { count: pendingOrganizers } = await admin
      .from('organizer_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    // Flagged comments awaiting moderation
    const { count: flaggedComments } = await admin
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('is_flagged', true)
      .eq('is_deleted', false)

    return ok({
      users: { total: totalUsers ?? 0 },
      organizers: { total: totalOrganizers ?? 0, pending: pendingOrganizers ?? 0 },
      events: { total: totalEvents ?? 0, active: activeEvents ?? 0 },
      bookings: { confirmed: totalBookings ?? 0 },
      tips: { total_revenue: tipsRevenue },
      moderation: { flagged_comments: flaggedComments ?? 0 },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
