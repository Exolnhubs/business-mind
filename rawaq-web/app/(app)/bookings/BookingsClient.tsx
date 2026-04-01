'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import type { BookingRow } from './page'

export default function BookingsClient({ initialBookings }: { initialBookings: BookingRow[] }) {
  const router   = useRouter()
  const [bookings, setBookings] = useState(initialBookings)

  // Refund modal state
  const [refundTarget, setRefundTarget] = useState<BookingRow | null>(null)
  const [userNote,     setUserNote]     = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [refundMsg,    setRefundMsg]    = useState<{ ok: boolean; text: string } | null>(null)

  async function submitRefund() {
    if (!refundTarget) return
    setSubmitting(true)
    setRefundMsg(null)

    const res  = await fetch(`/api/bookings/${refundTarget.id}/refund`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_note: userNote.trim() || undefined }),
    })
    const json = await res.json()
    setSubmitting(false)

    if (res.ok) {
      setBookings((prev) =>
        prev.map((b) => b.id === refundTarget.id ? { ...b, status: 'cancelled' } : b),
      )
      setRefundTarget(null)
      setUserNote('')
      setRefundMsg({ ok: true, text: 'Refund requested. You will be notified once it is processed.' })
    } else {
      setRefundMsg({ ok: false, text: json.error ?? 'Refund request failed.' })
    }
  }

  const upcoming = bookings.filter(
    (b) => b.status === 'confirmed' && b.event && new Date(b.event.start_at) > new Date(),
  )
  const past = bookings.filter(
    (b) => b.event && new Date(b.event.start_at) <= new Date(),
  )
  const cancelled = bookings.filter((b) => b.status === 'cancelled')

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>

      {refundMsg && (
        <div className={`text-sm rounded-xl px-4 py-3 ${
          refundMsg.ok
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>{refundMsg.text}</div>
      )}

      <BookingSection
        title="Upcoming"
        bookings={upcoming}
        emptyIcon="📅"
        emptyText="No upcoming bookings"
        onRefund={(b) => { setRefundTarget(b); setRefundMsg(null) }}
      />
      <BookingSection
        title="Past Events"
        bookings={past}
        emptyIcon="🕰️"
        emptyText="No past events"
      />
      {cancelled.length > 0 && (
        <BookingSection title="Cancelled" bookings={cancelled} />
      )}

      {/* Refund modal */}
      {refundTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Cancel & Request Refund</h2>
            <p className="text-sm text-gray-600">
              Your ticket for{' '}
              <span className="font-semibold">{refundTarget.event?.title}</span>{' '}
              will be cancelled and a refund request will be submitted for review.
            </p>

            <div>
              <label className="label">Reason for cancellation (optional)</label>
              <textarea
                className="input resize-none"
                rows={3}
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                placeholder="e.g. Change of plans, unable to attend…"
                maxLength={500}
              />
            </div>

            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
              ℹ️ Refunds are reviewed within 1–3 business days. Your ticket will be released immediately for others.
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
                {submitting ? <Spinner size="sm" /> : 'Confirm Cancellation'}
              </button>
              <button
                onClick={() => { setRefundTarget(null); setRefundMsg(null) }}
                className="flex-1 btn-secondary"
              >
                Keep Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BookingSection({
  title,
  bookings,
  emptyIcon,
  emptyText,
  onRefund,
}: {
  title: string
  bookings: BookingRow[]
  emptyIcon?: string
  emptyText?: string
  onRefund?: (b: BookingRow) => void
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
            const isUpcoming  = booking.event ? new Date(booking.event.start_at) > new Date() : false
            const isPaid      = !booking.event?.is_free && (booking.event?.price ?? 0) > 0
            const canRefund   = booking.status === 'confirmed' && !booking.event?.is_cancelled && isPaid && isUpcoming

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
                      {booking.event?.title ?? 'Event'}
                    </p>
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {booking.event ? `${formatDate(booking.event.start_at)} · ${booking.event.city}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <Badge
                    variant={
                      booking.status === 'cancelled' ? 'red' :
                      booking.event?.is_cancelled    ? 'red' :
                      'green'
                    }
                  >
                    {booking.event?.is_cancelled ? 'Event Cancelled' : booking.status}
                  </Badge>
                  {booking.status === 'confirmed' && !booking.event?.is_cancelled && (
                    <Link
                      href={`/bookings/${booking.id}/ticket`}
                      className="text-xs font-semibold text-brand-600 border border-brand-200 px-2.5 py-1 rounded-lg hover:bg-brand-50 transition"
                    >
                      🎟️ Ticket
                    </Link>
                  )}
                  {canRefund && onRefund && (
                    <button
                      onClick={() => onRefund(booking)}
                      className="text-xs font-semibold text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition"
                    >
                      ↩️ Refund
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
