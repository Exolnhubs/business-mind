'use client'

import { useLocale } from '@/contexts/locale-context'

export function TicketBackLink() {
  const { t } = useLocale()
  return (
    <a href="/bookings" className="text-sm text-brand-600 hover:underline">{t('ticket.back')}</a>
  )
}

export function TicketBandLabel() {
  const { t } = useLocale()
  return <p className="text-xs text-amber-100 font-medium">{t('ticket.label')}</p>
}

export function TicketGuestLabel({ position }: { position: number }) {
  const { t } = useLocale()
  return (
    <p className="text-xs text-gray-200 font-medium">
      {t('ticket.guest_label').replace('{n}', String(position))}
    </p>
  )
}

export function TicketQrHint() {
  const { t } = useLocale()
  return <p className="mt-1 text-xs text-gray-400 text-center">{t('ticket.qr_hint')}</p>
}

export function TicketCompanionRef({ ref: ticketRef }: { ref: string }) {
  const { t } = useLocale()
  return (
    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
      {t('ticket.companion').replace('{ref}', ticketRef)}
    </p>
  )
}

export function TicketViewEventBtn({ href }: { href: string }) {
  const { t } = useLocale()
  return (
    <a
      href={href}
      className="px-5 py-2.5 text-sm font-semibold text-brand-600 border border-brand-200 rounded-xl hover:bg-brand-50 transition"
    >
      {t('ticket.view_event')}
    </a>
  )
}

export function PrintButton() {
  const { t } = useLocale()
  return (
    <button
      onClick={() => window.print()}
      className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition"
    >
      {t('ticket.print')}
    </button>
  )
}

export function TicketInfoRowLabel({ labelKey }: { labelKey: string }) {
  const { t } = useLocale()
  return (
    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide leading-none mb-0.5">
      {t(labelKey)}
    </p>
  )
}
