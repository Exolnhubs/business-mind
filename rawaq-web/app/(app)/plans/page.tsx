import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getResolvedPlanCatalog } from '@/lib/plans'
import { PlanSelector } from '@/components/plans/PlanSelector'
import type { ResolvedPlanDefinition, Subscription } from '@/types/plans'

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

  let currentPlanId = profile.plan_id
  if (isOrganizer) {
    const { data: op } = await supabase
      .from('organizer_profiles')
      .select('plan_id')
      .eq('user_id', user.id)
      .single()
    if (op) currentPlanId = op.plan_id
  }

  const [{ plans }, { data: subscription }] = await Promise.all([
    getResolvedPlanCatalog(user.id, isOrganizer ? 'organizer' : 'user'),
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  let usage: { events_created: number; month: string } | null = null
  if (isOrganizer) {
    const monthStr = new Date().toISOString().slice(0, 7) + '-01'
    const { data: usageData } = await supabase
      .from('organizer_monthly_usage')
      .select('events_created')
      .eq('organizer_id', user.id)
      .eq('month', monthStr)
      .maybeSingle()
    usage = { events_created: usageData?.events_created ?? 0, month: monthStr }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <PlanSelector
        plans={plans as ResolvedPlanDefinition[]}
        currentPlanId={currentPlanId}
        subscription={subscription as Subscription | null}
        usage={usage}
        isOrganizer={isOrganizer}
      />
    </div>
  )
}
