'use client'

import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

export function OrganizerDashboardHeader({ businessName }: { businessName: string | null }) {
  const { t } = useLocale()
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{businessName ?? t('organizer.dashboard')}</h1>
      <p className="text-sm text-gray-500 mt-0.5">{t('org.subtitle')}</p>
    </div>
  )
}

export function OrganizerDashboardActions() {
  const { t } = useLocale()
  return (
    <div className="flex items-center gap-3">
      <Link href="/organizer/promo-codes" className="btn-secondary text-sm">{t('org.promo_codes')}</Link>
      <Link href="/organizer/earnings" className="btn-secondary text-sm">{t('org.earnings')}</Link>
      <Link href="/organizer/events/new" className="btn-primary">{t('org.create_event')}</Link>
    </div>
  )
}

export function OrganizerStatGrid({ publishedCount, totalBookings, tipsFormatted, totalEvents }: {
  publishedCount: number
  totalBookings: number
  tipsFormatted: string
  totalEvents: number
}) {
  const { t } = useLocale()
  const stats = [
    { label: t('org.active_events'), value: publishedCount, icon: '📅' },
    { label: t('org.total_bookings'), value: totalBookings, icon: '🎟️' },
    { label: t('org.donations'), value: tipsFormatted, icon: '💝' },
    { label: t('org.total_events'), value: totalEvents, icon: '📊' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="card p-4">
          <div className="text-2xl mb-1">{stat.icon}</div>
          <div className="text-xl font-bold text-gray-900">{stat.value}</div>
          <div className="text-xs text-gray-500">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}

interface OrgEvent {
  id: string
  title: string
  start_at: string
  event_frequency: string | null
  is_published: boolean
  is_cancelled: boolean
  bookings_count: number
  capacity: number | null
}

export function OrganizerEventsSection({ events }: { events: OrgEvent[] }) {
  const { t } = useLocale()

  const freqLabel = (f: string | null) =>
    f === 'weekly' ? t('org.freq_weekly') :
    f === 'monthly' ? t('org.freq_monthly') :
    t('org.freq_one_time')

  return (
    <div>
      <h2 className="font-semibold text-gray-900 mb-3">{t('org.your_events')}</h2>

      {!events.length ? (
        <div className="card p-8 text-center text-gray-500">
          <div className="text-4xl mb-2">📭</div>
          <p className="font-medium">{t('organizer.no_events')}</p>
          <p className="text-sm mt-1">{t('org.no_events_desc')}</p>
          <Link href="/organizer/events/new" className="btn-primary mt-4 inline-flex">{t('org.create_event')}</Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('org.table_event')}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">{t('org.table_date')}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">{t('org.table_bookings')}</th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('org.table_status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{event.title}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    <div className="flex flex-col gap-1">
                      <span>{formatDate(event.start_at)}</span>
                      <span className="text-xs text-gray-400">{freqLabel(event.event_frequency)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {event.bookings_count}{event.capacity ? `/${event.capacity}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={event.is_cancelled ? 'red' : event.is_published ? 'green' : 'gray'}>
                      {event.is_cancelled ? t('org.status_cancelled') : event.is_published ? t('org.status_live') : t('org.status_draft')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/organizer/events/${event.id}/ticket-types`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.tickets')}
                      </Link>
                      <Link href={`/organizer/events/${event.id}/attendees`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.attendees')}{event.bookings_count > 0 && ` (${event.bookings_count})`}
                      </Link>
                      <Link href={`/organizer/events/${event.id}/analytics`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.analytics')}
                      </Link>
                      <Link href={`/organizer/events/${event.id}/edit`} className="text-xs text-brand-600 font-medium hover:underline">
                        {t('org.edit')}
                      </Link>
                      {event.event_frequency !== 'one_time' && (
                        <Link href={`/organizer/events/${event.id}/edit#occurrences`} className="text-xs text-gray-500 font-medium hover:underline">
                          {t('org.sessions')}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
