import type { Metadata } from 'next'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { PlanEditor } from '@/components/owner/PlanEditor'
import type { PlanDefinition, PlanCountryPrice } from '@/types/plans'

export const metadata: Metadata = { title: 'Owner — Plan Catalog' }

export default async function OwnerPlansPage() {
  const admin = createSupabaseAdminClient()

  const [{ data: plans }, { data: prices }] = await Promise.all([
    admin.from('plan_definitions').select('*').order('type').order('sort_order'),
    admin.from('plan_country_prices').select('*').order('plan_id').order('country_code'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Plan Catalog</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Create and edit plan definitions — pricing, limits, platform fees, and country overrides.
          Assigning plans to users/organizers is done in the{' '}
          <a href="/admin/plans" className="text-amber-700 hover:underline">Admin → Plans</a> panel.
        </p>
      </div>

      <PlanEditor
        initialPlans={(plans ?? []) as PlanDefinition[]}
        initialCountryPrices={(prices ?? []) as PlanCountryPrice[]}
      />
    </div>
  )
}
