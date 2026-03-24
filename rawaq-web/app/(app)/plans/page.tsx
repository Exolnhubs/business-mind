import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PlanSelector } from '@/components/plans/PlanSelector'
import type { PlanDefinition } from '@/types/plans'

export const metadata: Metadata = { title: 'My Plan' }

export default async function PlansPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, plan_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const isOrganizer = profile.role === 'organizer'

  // Get current plan_id — organizers have it on organizer_profiles
  let currentPlanId = profile.plan_id
  if (isOrganizer) {
    const { data: op } = await supabase
      .from('organizer_profiles')
      .select('plan_id')
      .eq('user_id', user.id)
      .single()
    if (op) currentPlanId = op.plan_id
  }

  // Fetch relevant plans (type-filtered)
  const { data: plans } = await supabase
    .from('plan_definitions')
    .select('*')
    .eq('type', isOrganizer ? 'organizer' : 'user')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isOrganizer ? 'Organizer Plan' : 'My Plan'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isOrganizer
            ? 'Choose the plan that fits your event volume. Lower platform fees as you grow.'
            : 'Upgrade to Premium for early access, exclusive events, and more.'}
        </p>
      </div>

      <PlanSelector
        plans={(plans ?? []) as PlanDefinition[]}
        currentPlanId={currentPlanId}
      />
    </div>
  )
}
