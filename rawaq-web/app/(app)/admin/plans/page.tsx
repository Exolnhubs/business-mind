import type { Metadata } from 'next'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { PlanManagement } from '@/components/admin/PlanManagement'

export const metadata: Metadata = { title: 'Plan Management' }

export default async function AdminPlansPage() {
  const admin = createSupabaseAdminClient()

  const [
    { data: plans },
    { data: organizers },
    { data: users },
  ] = await Promise.all([
    admin
      .from('plan_definitions')
      .select('*')
      .order('type')
      .order('sort_order'),

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

    admin
      .from('profiles')
      .select('id, display_name, avatar_url, plan_id, is_banned, created_at, plan:plan_definitions(id, name, name_ar, price_sar)')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Plan Management</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Assign plans to users and organizers. Prices and quotas are defined in the plan catalogue below.
        </p>
      </div>

      <PlanManagement
        plans={(plans ?? []) as any}
        organizers={(organizers ?? []) as any}
        users={(users ?? []) as any}
      />
    </div>
  )
}
