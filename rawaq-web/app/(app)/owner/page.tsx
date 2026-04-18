import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Owner — Overview' }

async function getStats() {
  const admin = createSupabaseAdminClient()

  const [
    { count: totalUsers },
    { count: approvedOrganizers },
    { count: activeSubscriptions },
    { count: pendingOrganizers },
    { data: activeSubs },
    { data: recentPlans },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
    admin.from('organizer_profiles').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    admin.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('organizer_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin
      .from('subscriptions')
      .select('plan:plan_definitions(price_sar)')
      .eq('status', 'active')
      .eq('is_simulated', false),
    admin.from('plan_definitions').select('id, name, type, price_sar, is_active').order('type').order('sort_order'),
  ])

  const mrr = (activeSubs ?? []).reduce((sum, row) => {
    const price = (row as any).plan?.price_sar ?? 0
    return sum + Number(price)
  }, 0)

  return {
    totalUsers:          totalUsers ?? 0,
    approvedOrganizers:  approvedOrganizers ?? 0,
    activeSubscriptions: activeSubscriptions ?? 0,
    pendingOrganizers:   pendingOrganizers ?? 0,
    mrr,
    plans:               (recentPlans ?? []) as Array<{ id: string; name: string; type: string; price_sar: number; is_active: boolean }>,
  }
}

export default async function OwnerOverviewPage() {
  const stats = await getStats()

  const kpis = [
    { label: 'Registered Users',       value: stats.totalUsers.toLocaleString(),          icon: '👥', color: 'bg-blue-50 border-blue-100' },
    { label: 'Approved Organizers',     value: stats.approvedOrganizers.toLocaleString(),  icon: '🏢', color: 'bg-green-50 border-green-100' },
    { label: 'Active Subscriptions',    value: stats.activeSubscriptions.toLocaleString(), icon: '💎', color: 'bg-purple-50 border-purple-100' },
    { label: 'Pending Organizer Apps',  value: stats.pendingOrganizers.toLocaleString(),   icon: '⏳', color: 'bg-yellow-50 border-yellow-100' },
    {
      label: 'Monthly Revenue (MRR)',
      value: `SAR ${stats.mrr.toLocaleString('en', { minimumFractionDigits: 0 })}`,
      icon: '💰',
      color: 'bg-amber-50 border-amber-100',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Platform Overview</h2>
        <p className="text-sm text-gray-500 mt-0.5">Live snapshot of platform activity.</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border p-4 ${kpi.color}`}>
            <div className="text-2xl mb-2">{kpi.icon}</div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{kpi.value}</div>
            <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          href="/owner/plans"
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          💎 Manage Plans
        </Link>
        <Link
          href="/owner/settings"
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          ⚙️ Platform Settings
        </Link>
        <Link
          href="/admin/organizers"
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          🏢 Review Organizers
        </Link>
      </div>

      {/* Plan catalog snapshot */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Active Plan Catalog</h3>
          <Link href="/owner/plans" className="text-xs text-amber-700 hover:underline">Edit plans →</Link>
        </div>
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Plan</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Type</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Price (SAR)</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{plan.name}</td>
                  <td className="px-4 py-2.5 text-gray-500 capitalize">{plan.type}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                    {plan.price_sar === 0 ? 'Free' : plan.price_sar.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
