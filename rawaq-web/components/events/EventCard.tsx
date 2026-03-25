import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { SaveButton } from '@/components/events/SaveButton'
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
}

function getPriceDisplay(event: EventWithOrganizer, locale: string): { label: string; isFree: boolean } {
  const active = (event.ticket_types ?? []).filter((t) => t.is_active)
  if (active.length > 0) {
    const paid = active.filter((t) => !t.is_free)
    if (paid.length === 0) return { label: 'Free', isFree: true }
    const prices = paid.map((t) => t.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min === max) return { label: formatCurrency(min, locale), isFree: false }
    return { label: `From ${formatCurrency(min, locale)}`, isFree: false }
  }
  if (event.is_free || !event.price) return { label: 'Free', isFree: true }
  return { label: formatCurrency(event.price, locale), isFree: false }
}

export function EventCard({ event, locale = 'en', isSaved = false, showSave = false }: EventCardProps) {
  const icon = CATEGORY_EMOJI[event.category?.name_en?.toLowerCase() ?? ''] ?? '📅'
  const spotsLeft = event.capacity ? event.capacity - event.bookings_count : null
  const isFull = spotsLeft !== null && spotsLeft <= 0
  const priceDisplay = getPriceDisplay(event, locale)

  return (
    <Link
      href={`/events/${event.id}`}
      className="card group flex flex-col overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Cover */}
      <div className="relative h-36 bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center">
        {event.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover_image_url} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-5xl">{icon}</span>
        )}
        {showSave && <SaveButton eventId={event.id} initialSaved={isSaved} />}

        <div className="absolute top-3 start-3 flex flex-wrap gap-1.5 z-10">
          {priceDisplay.isFree && <Badge variant="green">Free</Badge>}
          {event.is_family_friendly && <Badge variant="blue">👨‍👩‍👧 Family</Badge>}
          {event.gender_restriction !== 'mixed' && (
            <Badge variant="yellow">
              {event.gender_restriction === 'male' ? '♂ Men' : '♀ Women'}
            </Badge>
          )}
        </div>

        {isFull && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Badge variant="red" className="text-sm px-3 py-1">Full</Badge>
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4 gap-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-brand-600 transition-colors">
          {locale === 'ar' && event.title_ar ? event.title_ar : event.title}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>📅</span>
          <span>{formatDate(event.start_at, locale)}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>📍</span>
          <span className="truncate">
            {event.city}{event.venue_name ? ` · ${locale === 'ar' && event.venue_name_ar ? event.venue_name_ar : event.venue_name}` : ''}
          </span>
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
          <span className="text-xs text-gray-500 truncate max-w-[120px]">
            {event.organizer?.organizer_profile?.business_name ?? event.organizer?.display_name ?? 'Organizer'}
          </span>
          <span className={`text-sm font-semibold ${priceDisplay.isFree ? 'text-green-600' : 'text-brand-600'}`}>
            {priceDisplay.label}
          </span>
        </div>

        {spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 10 && (
          <p className="text-xs text-orange-500 font-medium">⚡ {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</p>
        )}
      </div>
    </Link>
  )
}

export function EventCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton h-36 rounded-none" />
      <div className="p-4 space-y-3">
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
