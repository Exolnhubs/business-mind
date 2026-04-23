import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { getOrganizerPlanAccess, getFeaturedPerMonth } from '@/lib/plans'
import {
  OrganizerDashboardHeader,
  OrganizerDashboardActions,
  OrganizerStatGrid,
  OrganizerEventsSection,
} from '@/components/organizer/OrganizerStrings'

export const metadata: Metadata = { title: 'Organizer Dashboard' }

export default async function OrganizerDashboard() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: events }, { data: orgProfile }, { data: tipsData }, plan] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_at, event_frequency, is_published, is_cancelled, bookings_count, capacity, tips_total, featured_until')
      .eq('organizer_id', user!.id)
      .order('start_at', { ascending: false })
      .limit(20),
    supabase
      .from('organizer_profiles')
      .select('business_name, verified')
      .eq('user_id', user!.id)
      .single(),
    supabase
      .from('tips')
      .select('amount')
      .eq('organizer_id', user!.id),
    getOrganizerPlanAccess(user!.id),
  ])

  const featuredLimit = getFeaturedPerMonth(plan)
  let featuredUsed = 0
  if (featuredLimit > 0) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { count } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('organizer_id', user!.id)
      .gte('featured_at', monthStart)
    featuredUsed = count ?? 0
  }

  const featuredQuota = featuredLimit > 0 ? { used: featuredUsed, limit: featuredLimit } : null

  const totalTips = tipsData?.reduce((sum, t) => sum + t.amount, 0) ?? 0
  const totalBookings = events?.reduce((sum, e) => sum + e.bookings_count, 0) ?? 0
  const publishedCount = events?.filter((e) => e.is_published && !e.is_cancelled).length ?? 0

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <OrganizerDashboardHeader businessName={orgProfile?.business_name ?? null} />
        <OrganizerDashboardActions />
      </div>

      <OrganizerStatGrid
        publishedCount={publishedCount}
        totalBookings={totalBookings}
        tipsFormatted={formatCurrency(totalTips)}
        totalEvents={events?.length ?? 0}
      />

      <div>
        <OrganizerEventsSection
          events={(events ?? []) as any}
          featuredQuota={featuredQuota}
        />
      </div>
    </div>
  )
}