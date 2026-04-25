'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale } from '@/contexts/locale-context'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { clientPostJson, isToastHandledError } from '@/lib/client-fetch'
import { formatDate } from '@/lib/utils'
import type { BookingRow } from './page'

function getBookingStartAt(booking: BookingRow) {
  return booking.occurrence?.starts_at ?? booking.event?.start_at ?? null
}

export default function BookingsClient({ initialBookings }: { initialBookings: BookingRow[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLocale()
  const [bookings, setBookings] = useState(initialBookings)

  // Refund modal state
  const [refundTarget, setRefundTarget] = useState<BookingRow | null>(null)
  const [userNote, setUserNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refundMsg, setRefundMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const refundBookingId = searchParams.get('refund')
    if (!refundBookingId) return

    const target = bookings.find((booking) => booking.id === refundBookingId) ?? null
    if (target && canRefundBooking(target)) {
      setRefundTarget(target)
      setRefundMsg(null)
    } else {
      setRefundMsg({
        ok: false,
        text: t('bookings.refund_err_not_eligible'),
      })
    }

    router.replace('/bookings')
  }, [bookings, router, searchParams])

  async function submitRefund() {
    if (!refundTarget) return
    setSubmitting(true)
    setRefundMsg(null)

    try {
      const json = await clientPostJson<{ data?: { auto_refunded?: boolean } }>(
        `/api/bookings/${refundTarget.id}/refund`,
        { user_note: userNote.trim() || undefined },
      )
      setBookings((prev) =>
        prev.map((b) => b.id === refundTarget.id ? { ...b, status: 'cancelled' } : b),
      )
      setRefundTarget(null)
      setUserNote('')
      const autoRefunded = json.data?.auto_refunded === true
      setRefundMsg({
        ok: true,
        text: autoRefunded ? t('bookings.refund_ok_auto') : t('bookings.refund_ok_queued'),
      })
    } catch (error) {
      if (!isToastHandledError(error)) {
        setRefundMsg({
          ok: false,
          text: error instanceof Error ? error.message : t('bookings.refund_err_generic'),
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const upcoming = bookings.filter((b) => {
    const startAt = getBookingStartAt(b)
    return b.status === 'confirmed' && !!b.event && !!startAt && new Date(startAt) > new Date()
  })
  const past = bookings.filter((b) => {
    const startAt = getBookingStartAt(b)
    return !!b.event && !!startAt && new Date(startAt) <= new Date()
  })
  const cancelled = bookings.filter((b) => b.status === 'cancelled')

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">{t('bookings.title')}</h1>

      {refundMsg && (
        <div className={`text-sm rounded-xl px-4 py-3 ${refundMsg.ok
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
          }`}>{refundMsg.text}</div>
      )}

      <BookingSection
        title={t('bookings.upcoming')}
        bookings={upcoming}
        emptyIcon="📅"
        emptyText={t('bookings.empty_upcoming')}
        onRefund={(b) => { setRefundTarget(b); setRefundMsg(null) }}
        t={t}
      />
      <BookingSection
        title={t('bookings.past')}
        bookings={past}
        emptyIcon="🕰️"
        emptyText={t('bookings.empty_past')}
        t={t}
      />
      {cancelled.length > 0 && (
        <BookingSection title={t('bookings.cancelled')} bookings={cancelled} t={t} />
      )}

      {/* Refund modal */}
      {refundTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">{t('bookings.refund_modal_title')}</h2>
            <p className="text-sm text-gray-600">
              {t('bookings.refund_modal_body').replace('{event}', refundTarget.event?.title ?? '')}
            </p>

            <div>
              <label className="label">{t('bookings.refund_reason_label')}</label>
              <textarea
                className="input resize-none"
                rows={3}
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                placeholder={t('bookings.refund_reason_placeholder')}
                maxLength={500}
              />
            </div>

            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
              {t('bookings.refund_policy')}
            </p>

            {refundMsg && !refundMsg.ok && (
              <div className="text-sm rounded-xl px-4 py-3 bg-red-50 border border-red-200 text-red-700">
                {refundMsg.text}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={submitRefund}
                disabled={submitting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                {submitting ? <Spinner size="sm" /> : t('bookings.confirm_cancel')}
              </button>
              <button
                onClick={() => { setRefundTarget(null); setRefundMsg(null) }}
                className="flex-1 btn-secondary"
              >
                {t('bookings.keep_ticket')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function canRefundBooking(booking: BookingRow) {
  const startAt = getBookingStartAt(booking)
  const isUpcoming = !!startAt && new Date(startAt) > new Date()
  const isPaid = !booking.event?.is_free && (booking.event?.price ?? 0) > 0
  return booking.status === 'confirmed' && !booking.event?.is_cancelled && isPaid && isUpcoming
}

function BookingSection({
  title,
  bookings,
  emptyIcon,
  emptyText,
  onRefund,
  t,
}: {
  title: string
  bookings: BookingRow[]
  emptyIcon?: string
  emptyText?: string
  onRefund?: (b: BookingRow) => void
  t: (k: string) => string
}) {
  return (
    <section>
      <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">
        {title} ({bookings.length})
      </h2>

      {bookings.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyIcon} {emptyText}</p>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const canRefund = canRefundBooking(booking)
            const startAt = getBookingStartAt(booking)

            return (
              <div
                key={booking.id}
                className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
              >
                <Link
                  href={`/events/${booking.event?.id}`}
                  className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center text-2xl shrink-0"
                >
                  📅
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/events/${booking.event?.id}`}>
                    <p className="text-sm font-semibold text-gray-900 truncate hover:underline">
                      {booking.event?.title ?? t('bookings.event_fallback')}
                    </p>
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {booking.event && startAt ? `${formatDate(startAt)} · ${booking.event.city}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <Badge
                    variant={
                      booking.status === 'cancelled' ? 'red' :
                        booking.event?.is_cancelled ? 'red' :
                          'green'
                    }
                  >
                    {booking.event?.is_cancelled ? t('bookings.event_cancelled') : booking.status}
                  </Badge>
                  {booking.status === 'confirmed' && !booking.event?.is_cancelled && (
                    <Link
                      href={`/bookings/${booking.id}/ticket`}
                      className="text-xs font-semibold text-brand-600 border border-brand-200 px-2.5 py-1 rounded-lg hover:bg-brand-50 transition"
                    >
                      {t('bookings.ticket_link')}
                    </Link>
                  )}
                  {canRefund && onRefund && (
                    <button
                      onClick={() => onRefund(booking)}
                      className="text-xs font-semibold text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition"
                    >
                      {t('bookings.refund_btn')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
