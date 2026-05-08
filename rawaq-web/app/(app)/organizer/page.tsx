import type { Metadata } from 'next'
import Link from 'next/link'
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
      .select('business_name, verified, organizer_type, bio')
      .eq('user_id', user!.id)
      .single(),
    supabase
      .from('tips')
      .select('amount')
      .eq('organizer_id', user!.id),
    getOrganizerPlanAccess(user!.id),
  ])

  // Individual hosts manage sessions via community pages, not the company dashboard
  if ((orgProfile as { organizer_type?: string } | null)?.organizer_type === 'individual') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-5xl">🏠</div>
        <h1 className="text-xl font-bold text-gray-900">You&apos;re an Individual Host</h1>
        <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
          As an individual host, you create sessions directly from communities where you&apos;ve been assigned as a host.
          This organizer dashboard is for company organizers.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/communities"
            className="btn-primary px-6 py-2.5 text-sm"
          >
            Go to Communities
          </Link>
          <Link
            href="/organizer/earnings"
            className="btn-secondary px-6 py-2.5 text-sm"
          >
            My Earnings
          </Link>
        </div>
        <p className="text-xs text-gray-400 pt-2">
          Open a community where you are a host, then use &quot;+&quot; to create a session.
        </p>
      </div>
    )
  }

  const featuredLimit = getFeaturedPerMonth(plan)
  let featuredUsed = 0
  if (featuredLimit > 0) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { count } = await supabase
      .from('featured_events_log')
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
          events={(events ?? []) as never}
          featuredQuota={featuredQuota}
        />
      </div>
    </div>
  )
}