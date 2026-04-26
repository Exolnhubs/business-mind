'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import { SaveButton } from '@/components/events/SaveButton'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { EventWithOrganizer } from '@/types/database'

// ── Price helper (identical logic to original EventCard) ──────
function effectiveTicketPrice(tt: {
  price: number
  is_hot_offer: boolean
  hot_offer_price: number | null
  hot_offer_ends_at: string | null
}): number {
  if (
    tt.is_hot_offer &&
    tt.hot_offer_price != null &&
    tt.hot_offer_ends_at &&
    new Date(tt.hot_offer_ends_at) > new Date()
  ) return tt.hot_offer_price
  return tt.price
}

function getPriceDisplay(
  event: EventWithOrganizer,
  locale: string,
  t: (key: string) => string,
): { label: string; isFree: boolean; hasHotOffer: boolean } {
  const active = (event.ticket_types ?? []).filter((tt) => tt.is_active)
  const now = new Date()
  const hasHotOffer = active.some(
    (tt) => tt.is_hot_offer && !!tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at) > now,
  )
  if (active.length > 0) {
    const paid = active.filter((tt) => !tt.is_free)
    if (paid.length === 0) return { label: t('events.free'), isFree: true, hasHotOffer }
    const prices = paid.map(effectiveTicketPrice)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min === max) return { label: formatCurrency(min, event.currency, locale), isFree: false, hasHotOffer }
    return {
      label: t('events.card.from').replace('{price}', formatCurrency(min, event.currency, locale)),
      isFree: false,
      hasHotOffer,
    }
  }
  if (event.is_free || !event.price) return { label: t('events.free'), isFree: true, hasHotOffer }
  return { label: formatCurrency(event.price, event.currency, locale), isFree: false, hasHotOffer }
}

// ── Category color map ────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  sports: '#e85d3a', fitness: '#e85d3a',
  music: '#f5a623', entertainment: '#f5a623',
  tech: '#2ab8a0', technology: '#2ab8a0', business: '#2ab8a0',
  art: '#8b6be8', arts: '#8b6be8', culture: '#8b6be8',
  food: '#f5a623', wellness: '#3dba6a', education: '#8b6be8',
}

function getCatColor(nameEn?: string): string {
  if (!nameEn) return '#f5a623'
  return CAT_COLORS[nameEn.toLowerCase()] ?? '#f5a623'
}

// ── Avatar stack ──────────────────────────────────────────────
function AvatarStack() {
  return (
    <div className="flex">
      {['#e85d3a', '#2ab8a0', '#f5a623'].map((c, i) => (
        <div
          key={i}
          style={{
            width: 18, height: 18, borderRadius: '50%', background: c,
            border: '2px solid oklch(0.14 0.022 68)',
            marginInlineStart: i > 0 ? -5 : 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, fontWeight: 700, color: '#0f0d0a', flexShrink: 0,
          }}
        >
          {String.fromCharCode(65 + i)}
        </div>
      ))}
    </div>
  )
}

// ── Dark EventCard ────────────────────────────────────────────
interface EventCardDarkProps {
  event: EventWithOrganizer
  isSaved?: boolean
  showSave?: boolean
  priority?: boolean
}

export function EventCardDark({
  event,
  isSaved = false,
  showSave = false,
  priority = false,
}: EventCardDarkProps) {
  const { locale, t } = useLocale()
  const color = getCatColor(event.category?.name_en)
  const priceDisplay = getPriceDisplay(event, locale, t)
  const spotsLeft = event.capacity ? event.capacity - event.bookings_count : null
  const isFull = spotsLeft !== null && spotsLeft <= 0
  const title = locale === 'ar' && event.title_ar ? event.title_ar : event.title
  const catLabel = locale === 'ar' && event.category?.name_ar
    ? event.category.name_ar
    : event.category?.name_en ?? ''

  return (
    <Link
      href={`/events/${event.id}`}
      className="dark-event-card group"
      style={{ '--card-color': color } as React.CSSProperties}
    >
      {/* Image */}
      <div
        className="dark-event-card-img"
        style={{
          background: `linear-gradient(135deg, ${color}28, ${color}08)`,
          borderBottom: `1px solid ${color}1a`,
        }}
      >
        {event.cover_image_url ? (
          <Image
            src={event.cover_image_url}
            alt={title}
            fill
            unoptimized
            className="object-cover"
            priority={priority}
          />
        ) : (
          <span
            style={{
              fontFamily: 'monospace', fontSize: 11, color: `${color}50`,
              textAlign: 'center', padding: '0 16px', lineHeight: 1.7,
            }}
          >
            [ event photo ]<br />{title}
          </span>
        )}

        {/* Save button */}
        {showSave && <SaveButton eventId={event.id} initialSaved={isSaved} />}

        {/* Featured badge */}
        {event.featured_at && (
          <div style={{
            position: 'absolute', top: 10, insetInlineStart: 10,
            background: 'var(--c-gold)', color: 'var(--c-ink)',
            fontSize: 10, fontWeight: 700, padding: '3px 10px',
            borderRadius: 20, letterSpacing: '0.04em',
            fontFamily: 'var(--font-display)',
          }}>
            {t('landing.ev_featured')}
          </div>
        )}

        {/* Price */}
        <div style={{
          position: 'absolute', top: 10, insetInlineEnd: 10,
          background: 'oklch(0.10 0.02 68 / 0.85)',
          backdropFilter: 'blur(8px)',
          color: priceDisplay.isFree ? '#3dba6a' : 'oklch(0.94 0.01 82)',
          fontSize: 12, fontWeight: 700, padding: '4px 12px',
          borderRadius: 20, fontFamily: 'var(--font-display)',
        }}>
          {priceDisplay.hasHotOffer && '🔥 '}{priceDisplay.label}
        </div>

        {/* Family friendly */}
        {event.is_family_friendly && (
          <div style={{
            position: 'absolute', bottom: 10, insetInlineStart: 10,
            background: '#2ab8a018', border: '1px solid #2ab8a035',
            fontSize: 10, fontWeight: 600, padding: '3px 8px',
            borderRadius: 20, color: '#2ab8a0',
          }}>
            👨‍👩‍👧 {t('events.filter.family_friendly')}
          </div>
        )}

        {/* Full overlay */}
        {isFull && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'oklch(0 0 0 / 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              background: '#e85d3a', color: '#fff',
              fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20,
            }}>
              {t('events.full')}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col" style={{ padding: '14px 16px' }}>
        <div className="flex items-center justify-between mb-2">
          <span
            className="dark-event-card-cat"
            style={{ background: `${color}18`, color }}
          >
            {catLabel}
          </span>
          <span style={{ fontSize: 11, color: 'oklch(0.52 0.015 72)' }}>
            📍 {event.city}
          </span>
        </div>

        <div className="dark-event-card-title">{title}</div>

        <div className="flex items-center justify-between mt-auto">
          <span style={{ fontSize: 11, color: 'oklch(0.52 0.015 72)' }}>
            📅 {formatDate(event.start_at, locale)}
          </span>
          <div className="flex items-center gap-1.5">
            <AvatarStack />
            <span style={{ fontSize: 11, color: 'oklch(0.52 0.015 72)' }}>
              {event.bookings_count}
            </span>
          </div>
        </div>

        {spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 10 && (
          <p style={{ fontSize: 11, fontWeight: 600, color: '#f5a623', marginTop: 6 }}>
            ⚡{' '}
            {t(spotsLeft === 1 ? 'events.card.spot_left' : 'events.card.spots_left').replace(
              '{n}', String(spotsLeft),
            )}
          </p>
        )}
      </div>
    </Link>
  )
}

// ── Skeleton ──────────────────────────────────────────────────
export function EventCardDarkSkeleton() {
  return (
    <div
      className="dark-event-card"
      style={{ opacity: 0.6 }}
    >
      <div style={{
        height: 148,
        background: 'linear-gradient(135deg, oklch(0.20 0.02 68), oklch(0.16 0.02 68))',
        animation: 'skeleton-pulse 1.5s ease-in-out infinite',
      }} />
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ height: 10, width: '40%', background: 'oklch(0.22 0.02 68)', borderRadius: 20, animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: 14, width: '90%', background: 'oklch(0.22 0.02 68)', borderRadius: 6, animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: 14, width: '70%', background: 'oklch(0.22 0.02 68)', borderRadius: 6, animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: 10, width: '50%', background: 'oklch(0.22 0.02 68)', borderRadius: 20, animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
      </div>
    </div>
  )
}
