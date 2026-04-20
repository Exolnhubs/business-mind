'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { SaveButton } from '@/components/events/SaveButton'
import { useLocale } from '@/contexts/locale-context'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { EventWithOrganizer } from '@/types/database'

const CATEGORY_EMOJI: Record<string, string> = {
  sports: '⚽', art: '🎨', music: '🎵', tech: '💻', food: '🍽️',
  community: '🤝', education: '📚', health: '💪', business: '💼', entertainment: '🎭',
}


interface EventCardProps {
  event: EventWithOrganizer
  locale?: string
  isSaved?: boolean
  showSave?: boolean
  priority?: boolean
}

function effectiveTicketPrice(tt: { price: number; is_hot_offer: boolean; hot_offer_price: number | null; hot_offer_ends_at: string | null }): number {
  if (tt.is_hot_offer && tt.hot_offer_price != null && tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at) > new Date()) {
    return tt.hot_offer_price
  }
  return tt.price
}

function getPriceDisplay(
  event: EventWithOrganizer,
  locale: string,
  t: (key: string) => string,
): { label: string; isFree: boolean; hasHotOffer: boolean } {
  const active = (event.ticket_types ?? []).filter((ticket) => ticket.is_active)
  const now = new Date()
  const hasHotOffer = active.some(
    (tt) => tt.is_hot_offer && !!tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at) > now,
  )
  if (active.length > 0) {
    const paid = active.filter((ticket) => !ticket.is_free)
    if (paid.length === 0) return { label: t('events.free'), isFree: true, hasHotOffer }
    const prices = paid.map((ticket) => effectiveTicketPrice(ticket))
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min === max) return { label: formatCurrency(min, event.currency, locale), isFree: false, hasHotOffer }
    return { label: t('events.card.from').replace('{price}', formatCurrency(min, event.currency, locale)), isFree: false, hasHotOffer }
  }
  if (event.is_free || !event.price) return { label: t('events.free'), isFree: true, hasHotOffer }
  return { label: formatCurrency(event.price, event.currency, locale), isFree: false, hasHotOffer }
}

export function EventCard({ event, locale, isSaved = false, showSave = false, priority = false }: EventCardProps) {
  const { locale: contextLocale, t } = useLocale()
  const resolvedLocale = locale ?? contextLocale
  const icon = CATEGORY_EMOJI[event.category?.name_en?.toLowerCase() ?? ''] ?? '📅'
  const spotsLeft = event.capacity ? event.capacity - event.bookings_count : null
  const isFull = spotsLeft !== null && spotsLeft <= 0
  const priceDisplay = getPriceDisplay(event, resolvedLocale, t)

  return (
    <Link
      href={`/events/${event.id}`}
      className="card group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-brand-100 to-brand-200">
        {event.cover_image_url ? (
          <Image
            src={event.cover_image_url}
            alt={event.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            priority={priority}
          />
        ) : (
          <span className="text-5xl">{icon}</span>
        )}
        {showSave && <SaveButton eventId={event.id} initialSaved={isSaved} />}

        <div className="absolute top-3 start-3 z-10 flex flex-wrap gap-1.5">
          {priceDisplay.isFree && <Badge variant="green">{t('events.free')}</Badge>}
          {priceDisplay.hasHotOffer && <Badge variant="orange">🔥 Hot Offer</Badge>}
          {event.is_family_friendly && <Badge variant="blue"> {t('events.card.family')}</Badge>}
          {event.gender_restriction !== 'mixed' && (
            <Badge variant="yellow">
              {event.gender_restriction === 'male' ? `? ${t('events.card.men')}` : ` ${t('events.card.women')}`}
            </Badge>
          )}
        </div>

        {isFull && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Badge variant="red" className="px-3 py-1 text-sm">{t('events.full')}</Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 transition-colors group-hover:text-brand-600">
          {resolvedLocale === 'ar' && event.title_ar ? event.title_ar : event.title}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>📅</span>
          <span>{formatDate(event.start_at, resolvedLocale)}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>📍</span>
          <span className="truncate">
            {event.city}
            {event.venue_name
              ? ` - ${resolvedLocale === 'ar' && event.venue_name_ar ? event.venue_name_ar : event.venue_name}`
              : ''}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-gray-50 pt-2">
          <span className="max-w-[120px] truncate text-xs text-gray-500">
            {event.organizer?.organizer_profile?.business_name ?? event.organizer?.display_name ?? t('events.card.organizer')}
          </span>
          <span className={`text-sm font-semibold ${priceDisplay.isFree ? 'text-green-600' : 'text-brand-600'}`}>
            {priceDisplay.label}
          </span>
        </div>

        {spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 10 && (
          <p className="text-xs font-medium text-orange-500">
            ⚡ {t(spotsLeft === 1 ? 'events.card.spot_left' :  'events.card.spots_left').replace('{n}', String(spotsLeft))}
          </p>
        )}
      </div>
    </Link>
  )
}

export function EventCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton h-36 rounded-none" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
        <div className="flex justify-between pt-2">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-3 w-12 rounded" />
        </div>
      </div>
    </div>
  )
}
