'use client'

import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'

export function EventCoverBadgeFree() {
  const { t } = useLocale()
  return <>{t('events.free')}</>
}

export function EventBadgeFamilyFriendly() {
  const { t } = useLocale()
  return <>{t('event.family_friendly')}</>
}

export function EventBadgeMenOnly() {
  const { t } = useLocale()
  return <>{t('event.men_only')}</>
}

export function EventBadgeWomenOnly() {
  const { t } = useLocale()
  return <>{t('event.women_only')}</>
}

export function EventBadgeCancelled() {
  const { t } = useLocale()
  return <>{t('event.cancelled_badge')}</>
}

export function InfoBlockLabel({ labelKey }: { labelKey: string }) {
  const { t } = useLocale()
  return <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">{t(labelKey)}</p>
}

export function EventVenueName({ name }: { name: string | null }) {
  const { t } = useLocale()
  return <p className="text-sm font-medium">{name ?? t('event.venue_tba')}</p>
}

export function EventAttendingCount({ count }: { count: number }) {
  const { t } = useLocale()
  return <p className="text-sm font-medium">{t('event.attending').replace('{n}', String(count))}</p>
}

export function EventCapacityRow({ spotsLeft, capacity, isFull }: { spotsLeft: number; capacity: number; isFull: boolean }) {
  const { t } = useLocale()
  const spotsText = isFull
    ? t('event.fully_booked')
    : t('event.spots_left').replace('{n}', String(spotsLeft))
  return (
    <p className="text-xs text-gray-500">
      {spotsText} {t('event.spots_of').replace('{total}', String(capacity))}
    </p>
  )
}

export function EventFreeLabel() {
  const { t } = useLocale()
  return <span className="text-green-600">{t('events.free')}</span>
}

export function EventAboutHeading() {
  const { t } = useLocale()
  return <h2 className="font-semibold text-gray-900 mb-2">{t('event.about')}</h2>
}

export function EventOrganizerRole() {
  const { t } = useLocale()
  return <p className="text-xs text-gray-500">{t('event.organizer_role')}</p>
}

export function SidebarPriceFrom({ hasHot }: { hasHot: boolean }) {
  const { t } = useLocale()
  return <span className="text-xs text-gray-400 font-medium uppercase tracking-wide block">{hasHot ? `🔥 ${t('event.price_from')}` : t('event.price_from')}</span>
}

export function SidebarSpotsLeft({ n }: { n: number }) {
  const { t } = useLocale()
  return <span className="text-xs text-gray-500">{t('event.spots_left_short').replace('{n}', String(n))}</span>
}

export function EventViewOrganizerLink({ organizerId }: { organizerId: string }) {
  const { t } = useLocale()
  return (
    <Link
      href={`/organizer/${organizerId}`}
      className="block card p-3 text-xs text-brand-600 font-medium hover:bg-brand-50 text-center"
    >
      {t('event.view_organizer')}
    </Link>
  )
}

export function EventCommentsHeading({ count }: { count: number }) {
  const { t } = useLocale()
  return (
    <h2 className="font-semibold text-gray-900 mb-4">
      {t('event.comments_count').replace('{n}', String(count))}
    </h2>
  )
}

export function EventCategoryName({ nameEn, nameAr, icon }: { nameEn: string; nameAr: string | null; icon: string | null }) {
  const { locale } = useLocale()
  const name = locale === 'ar' && nameAr ? nameAr : nameEn
  return (
    <span className="text-sm text-brand-600 font-medium mt-1 inline-block">
      {icon} {name}
    </span>
  )
}

export function EventCommunityChip({ id, name, nameAr, slug }: { id: string; name: string; nameAr: string | null; slug: string }) {
  const { locale } = useLocale()
  const label = locale === 'ar' && nameAr ? nameAr : name
  return (
    <Link
      key={id}
      href={`/communities/${slug}`}
      className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
    >
      {label}
    </Link>
  )
}

export function EventOrganizerName({ businessName, businessNameAr, displayName }: { businessName: string | null; businessNameAr: string | null; displayName: string | null }) {
  const { locale } = useLocale()
  const name = locale === 'ar' && businessNameAr
    ? businessNameAr
    : (businessName ?? displayName ?? 'Organizer')
  return <p className="text-sm font-semibold text-gray-900">{name}</p>
}
