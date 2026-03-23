import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

export const metadata: Metadata = { title: 'Admin Dashboard' }

async function getStats(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const [
    { count: totalUsers },
    { count: totalOrganizers },
    { count: activeEvents },
    { count: pendingOrganizers },
    { count: flaggedComments },
    { data: tipsData },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'organizer'),
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('is_published', true).eq('is_cancelled', false),
    supabase.from('organizer_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('is_flagged', true).eq('is_deleted', false),
    supabase.from('tips').select('amount'),
  ])

  const totalTips = tipsData?.reduce((sum, t) => sum + t.amount, 0) ?? 0

  return {
    totalUsers: totalUsers ?? 0,
    totalOrganizers: totalOrganizers ?? 0,
    activeEvents: activeEvents ?? 0,
    pendingOrganizers: pendingOrganizers ?? 0,
    flaggedComments: flaggedComments ?? 0,
    totalTips,
  }
}

export default async function AdminDashboard() {
  const supabase = await createSupabaseServerClient()
  const stats = await getStats(supabase)

  const statCards = [
    { label: 'Total Users',          value: stats.totalUsers,        icon: '👥', color: 'blue' },
    { label: 'Organizers',           value: stats.totalOrganizers,   icon: '🏢', color: 'purple' },
    { label: 'Active Events',        value: stats.activeEvents,      icon: '📅', color: 'green' },
    { label: 'Pending Approvals',    value: stats.pendingOrganizers, icon: '⏳', color: stats.pendingOrganizers > 0 ? 'orange' : 'gray' },
    { label: 'Flagged Comments',     value: stats.flaggedComments,   icon: '🚩', color: stats.flaggedComments > 0 ? 'red' : 'gray' },
    { label: 'Total Tips',           value: formatCurrency(stats.totalTips), icon: '💝', color: 'brand' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="card p-5">
              <div className="text-3xl mb-2">{card.icon}</div>
              <div className="text-2xl font-bold text-gray-900">{card.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
            </div>
          ))}
        </div>
      </div>

      {stats.pendingOrganizers > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⏳</span>
          <div>
            <p className="font-semibold text-amber-800">
              {stats.pendingOrganizers} organizer{stats.pendingOrganizers > 1 ? 's' : ''} awaiting approval
            </p>
            <a href="/admin/organizers" className="text-sm text-amber-700 underline mt-0.5 inline-block">
              Review now →
            </a>
          </div>
        </div>
      )}

      {stats.flaggedComments > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">🚩</span>
          <div>
            <p className="font-semibold text-red-800">
              {stats.flaggedComments} flagged comment{stats.flaggedComments > 1 ? 's' : ''} need review
            </p>
            <a href="/admin/comments" className="text-sm text-red-700 underline mt-0.5 inline-block">
              Review now →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
