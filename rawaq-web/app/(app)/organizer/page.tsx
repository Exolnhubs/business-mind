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
    const { data: hostGrants } = await supabase
      .from('community_hosts')
      .select('community:communities(id, name, name_ar, slug, level, cover_url, member_count)')
      .eq('user_id', user!.id)

    type HostCommunity = { id: string; name: string; name_ar: string | null; slug: string; level: string; cover_url: string | null; member_count: number }
    const hostCommunities = ((hostGrants ?? []) as unknown as { community: HostCommunity }[])
      .map((g) => g.community)
      .filter(Boolean)

    const LEVEL_ICON: Record<string, string> = {
      micro: '🏘️', interest: '🎯', district: '🏙️', city: '🌆', country: '🌍',
    }

    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Your Host Communities</h1>
            <p className="text-sm text-gray-500 mt-0.5">Communities where you can create sessions</p>
          </div>
          <Link href="/organizer/earnings" className="btn-secondary text-sm px-4 py-2">
            My Earnings
          </Link>
        </div>

        {hostCommunities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center space-y-3">
            <div className="text-4xl">🏘️</div>
            <p className="text-base font-semibold text-gray-700">No host communities yet</p>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Join a community and request to become a host, or wait for a community owner to assign you.
            </p>
            <Link href="/communities" className="btn-primary inline-block text-sm px-6 py-2.5 mt-2">
              Explore Communities
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {hostCommunities.map((c) => (
              <Link
                key={c.id}
                href={`/communities/${c.slug}`}
                className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-violet-200 transition-all flex items-center gap-4"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-2xl">
                  {LEVEL_ICON[c.level] ?? '🏠'}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate group-hover:text-violet-700 transition-colors">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.member_count.toLocaleString()} members · {c.level}</p>
                </div>
                <svg className="ml-auto h-4 w-4 text-gray-300 group-hover:text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}

        {hostCommunities.length > 0 && (
          <p className="text-xs text-center text-gray-400">
            Open a community and tap &quot;+ Create session&quot; to add a session.
          </p>
        )}
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