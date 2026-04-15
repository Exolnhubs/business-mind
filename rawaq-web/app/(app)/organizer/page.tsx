import Link from 'next/link'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { EventFrequency } from '@/types/database'

export const metadata: Metadata = { title: 'Organizer Dashboard' }

const EVENT_FREQUENCY_LABELS: Record<EventFrequency, string> = {
  one_time: 'One Time',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

export default async function OrganizerDashboard() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: events }, { data: orgProfile }, { data: tipsData }] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, start_at, event_frequency, is_published, is_cancelled, bookings_count, capacity, tips_total')
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
  ])

  const totalTips = tipsData?.reduce((sum, t) => sum + t.amount, 0) ?? 0
  const totalBookings = events?.reduce((sum, e) => sum + e.bookings_count, 0) ?? 0
  const publishedCount = events?.filter((e) => e.is_published && !e.is_cancelled).length ?? 0

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {orgProfile?.business_name ?? 'Organizer Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your events and track performance</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/organizer/promo-codes" className="btn-secondary text-sm">
            🏷 Promo Codes
          </Link>
          <Link href="/organizer/earnings" className="btn-secondary text-sm">
            💰 Earnings
          </Link>
          <Link href="/organizer/events/new" className="btn-primary">
            + Create Event
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Events', value: publishedCount, icon: '📅' },
          { label: 'Total Bookings', value: totalBookings, icon: '🎟️' },
          { label: 'Donations Received', value: formatCurrency(totalTips), icon: '💝' },
          { label: 'Total Events', value: events?.length ?? 0, icon: '📊' },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Events table */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Your Events</h2>

        {!events?.length ? (
          <div className="card p-8 text-center text-gray-500">
            <div className="text-4xl mb-2">📭</div>
            <p className="font-medium">No events yet</p>
            <p className="text-sm mt-1">Create your first event to get started.</p>
            <Link href="/organizer/events/new" className="btn-primary mt-4 inline-flex">
              Create Event
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Date</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Bookings</th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">
                      {event.title}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                      <div className="flex flex-col gap-1">
                        <span>{formatDate(event.start_at)}</span>
                        <span className="text-xs text-gray-400">{EVENT_FREQUENCY_LABELS[(event.event_frequency ?? 'one_time') as EventFrequency]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {event.bookings_count}{event.capacity ? `/${event.capacity}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={event.is_cancelled ? 'red' : event.is_published ? 'green' : 'gray'}>
                        {event.is_cancelled ? 'Cancelled' : event.is_published ? 'Live' : 'Draft'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/organizer/events/${event.id}/ticket-types`}
                          className="text-xs text-gray-500 font-medium hover:underline"
                        >
                          🎟 Tickets
                        </Link>
                        <Link
                          href={`/organizer/events/${event.id}/attendees`}
                          className="text-xs text-gray-500 font-medium hover:underline"
                        >
                          Attendees {event.bookings_count > 0 && `(${event.bookings_count})`}
                        </Link>
                        <Link
                          href={`/organizer/events/${event.id}/analytics`}
                          className="text-xs text-gray-500 font-medium hover:underline"
                        >
                          📊 Analytics
                        </Link>
                        <Link
                          href={`/organizer/events/${event.id}/edit`}
                          className="text-xs text-brand-600 font-medium hover:underline"
                        >
                          Edit
                        </Link>
                        {event.event_frequency !== 'one_time' ? (
                          <Link
                            href={`/organizer/events/${event.id}/edit#occurrences`}
                            className="text-xs text-gray-500 font-medium hover:underline"
                          >
                            Sessions
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

