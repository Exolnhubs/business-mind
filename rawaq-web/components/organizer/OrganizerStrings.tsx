'use client'

import { useState } from 'react'
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
  featured_until: string | null
}

interface FeaturedQuota {
  used: number
  limit: number
}

function daysLeft(featuredUntil: string): number {
  return Math.max(0, Math.ceil((new Date(featuredUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

function FeatureButton({
  event,
  quota,
  onToggle,
}: {
  event: OrgEvent
  quota: FeaturedQuota | null
  onToggle: (eventId: string, newFeaturedUntil: string | null, newQuota: FeaturedQuota) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const now = new Date()
  const isFeatured = !!event.featured_until && new Date(event.featured_until) > now
  const canFeature = quota !== null && (isFeatured || quota.used < quota.limit)
  const disabled = loading || !event.is_published || event.is_cancelled || (!isFeatured && !canFeature)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/${event.id}/feature`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to update featured status')
        return
      }
      onToggle(event.id, json.data.featured_until, json.data.quota)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (quota === null) return null

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={handleClick}
        disabled={disabled}
        title={
          !event.is_published ? 'Publish event to feature it' :
          event.is_cancelled ? 'Cancelled events cannot be featured' :
          !canFeature && !isFeatured ? `Quota reached (${quota.used}/${quota.limit})` :
          isFeatured ? 'Click to unfeature' : 'Feature for 7 days'
        }
        className={`text-xs font-medium px-2 py-1 rounded-lg border transition-colors ${
          isFeatured
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : disabled
            ? 'border-gray-200 text-gray-300 cursor-not-allowed'
            : 'border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600'
        }`}
      >
        {loading ? '…' : isFeatured ? `★ ${daysLeft(event.featured_until!)}d left` : '☆ Feature'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function OrganizerEventsSection({
  events: initialEvents,
  featuredQuota,
}: {
  events: OrgEvent[]
  featuredQuota: FeaturedQuota | null
}) {
  const { t } = useLocale()
  const [events, setEvents] = useState(initialEvents)
  const [quota, setQuota] = useState(featuredQuota)

  function handleToggle(eventId: string, newFeaturedUntil: string | null, newQuota: FeaturedQuota) {
    setEvents((prev) =>
      prev.map((e) => e.id === eventId ? { ...e, featured_until: newFeaturedUntil } : e)
    )
    setQuota(newQuota)
  }

  const freqLabel = (f: string | null) =>
    f === 'weekly' ? t('org.freq_weekly') :
    f === 'monthly' ? t('org.freq_monthly') :
    t('org.freq_one_time')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">{t('org.your_events')}</h2>
        {quota !== null && (
          <span className="text-xs text-gray-500">
            ⭐ {quota.used}/{quota.limit} featured this month
          </span>
        )}
      </div>

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
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px]">
                    <div className="truncate">{event.title}</div>
                  </td>
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
                      <FeatureButton event={event} quota={quota} onToggle={handleToggle} />
                      <Link href={`/organizer/events/${event.id}/ticket-types`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.tickets')}
                      </Link>
                      <Link href={`/organizer/events/${event.id}/attendees`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.attendees')}{event.bookings_count > 0 && ` (${event.bookings_count})`}
                      </Link>
                      <Link href={`/organizer/events/${event.id}/analytics`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.analytics')}
                      </Link>
                      <Link href={`/organizer/events/${event.id}/blog`} className="text-xs text-gray-500 font-medium hover:underline">
                        {t('org.blog')}
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