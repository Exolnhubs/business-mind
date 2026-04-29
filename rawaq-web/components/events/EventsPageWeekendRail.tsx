'use client'

import { EventCard } from '@/components/events/EventCard'
import { HorizontalDragScroll } from '@/components/ui/HorizontalDragScroll'
import { useLocale } from '@/contexts/locale-context'
import type { EventWithOrganizer } from '@/types/database'

function getWeekendLabel(locale: 'en' | 'ar', todayLabel: string): string {
  const now = new Date()
  const day = now.getDay()
  if (day === 0) return todayLabel

  const daysToSat = day === 6 ? 0 : (6 - day + 7) % 7
  const sat = new Date(now)
  sat.setDate(now.getDate() + daysToSat)
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)

  const formatLocale = locale === 'ar' ? 'ar-EG' : 'en'
  const fmt = (d: Date) => d.toLocaleDateString(formatLocale, { month: 'short', day: 'numeric' })
  return `${fmt(sat)} - ${fmt(sun)}`
}

export function EventsPageWeekendRail({
  events,
  city,
  hasCoordinates,
  radiusKm,
}: {
  events: EventWithOrganizer[]
  city?: string
  hasCoordinates: boolean
  radiusKm: number
}) {
  const { locale, t } = useLocale()

  const locationLabel = hasCoordinates
    ? t('events.weekend.within').replace('{km}', String(radiusKm))
    : t('events.weekend.in_city').replace('{city}', city ?? '')

  return (
    <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
      <div className="mb-3">
        <h2 className="text-base font-bold text-gray-900">{t('events.weekend.nearby_title')}</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          <span className="font-medium text-green-700">{locationLabel}</span>
          {' · '}{getWeekendLabel(locale, t('events.weekend.today'))}
        </p>
      </div>
      <HorizontalDragScroll
        ariaLabel={t('events.weekend.nearby_title')}
        contentClassName="gap-3 pb-1 px-1"
        style={{ marginInline: -4 }}
      >
        {events.map((event) => (
          <div key={event.id} className="shrink-0 w-56">
            <EventCard event={event} />
          </div>
        ))}
      </HorizontalDragScroll>
    </div>
  )
}
