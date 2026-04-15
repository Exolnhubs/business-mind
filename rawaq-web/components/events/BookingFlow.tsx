'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/auth-context'
import { formatCurrency, formatDate, formatTime } from '@/lib/utils'
import type { EventOccurrence, TicketType } from '@/types/database'

// ── Ticket type card ────────────────────────────────────────────────────────
function TicketCard({
  ticket,
  currency,
  selected,
  onSelect,
}: {
  ticket: TicketType
  currency: string
  selected: boolean
  onSelect: () => void
}) {
  const now          = new Date()
  const saleStarted  = !ticket.sale_starts_at || new Date(ticket.sale_starts_at) <= now
  const saleEnded    = ticket.sale_ends_at ? new Date(ticket.sale_ends_at) < now : false
  const soldOut      = ticket.capacity !== null && ticket.sold_count >= ticket.capacity
  const spotsLeft    = ticket.capacity !== null ? ticket.capacity - ticket.sold_count : null
  const unavailable  = saleEnded || soldOut || !saleStarted

  return (
    <button
      type="button"
      disabled={unavailable}
      onClick={onSelect}
      className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${
        unavailable
          ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
          : selected
            ? 'border-brand-500 bg-brand-50'
            : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${unavailable ? 'text-gray-400' : 'text-gray-900'}`}>
              {ticket.name}
            </span>
            {!saleStarted && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Coming soon</span>}
            {saleEnded    && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Sales ended</span>}
            {soldOut      && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Sold out</span>}
          </div>
          {ticket.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ticket.description}</p>}
          {spotsLeft !== null && spotsLeft <= 10 && !soldOut && (
            <p className="text-xs text-amber-600 font-medium mt-0.5">Only {spotsLeft} left!</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-sm font-bold ${unavailable ? 'text-gray-400' : 'text-brand-700'}`}>
            {ticket.is_free ? 'Free' : formatCurrency(ticket.price, currency)}
          </span>
        </div>
      </div>
      {selected && <div className="mt-1.5 text-xs text-brand-600 font-medium">✓ Selected</div>}
    </button>
  )
}

// ── Main BookingFlow ────────────────────────────────────────────────────────
interface BookingFlowProps {
  eventId: string
  isBooked: boolean
  isFull: boolean
  isFree: boolean
  eventPrice: number | null
  currency: string
  ticketTypes: TicketType[]
  isOnWaitlist?: boolean
  occurrences?: EventOccurrence[]
  initialOccurrenceId?: string | null
  confirmedOccurrenceIds?: string[]
  pendingOccurrenceIds?: string[]
  waitlistedOccurrenceIds?: string[]
}

export function BookingFlow({
  eventId,
  isBooked: initialBooked,
  isFull,
  isFree,
  eventPrice,
  currency,
  ticketTypes,
  isOnWaitlist: initialWaitlist = false,
  occurrences = [],
  initialOccurrenceId = null,
  confirmedOccurrenceIds = [],
  pendingOccurrenceIds = [],
  waitlistedOccurrenceIds = [],
}: BookingFlowProps) {
  const { user }  = useAuth()
  const router    = useRouter()

  const [waitlistedIds, setWaitlistedIds] = useState(waitlistedOccurrenceIds)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const hasTypes      = ticketTypes.length > 0
  const hasOccurrences = occurrences.length > 0
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(initialOccurrenceId ?? occurrences[0]?.id ?? null)
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const selectedType  = ticketTypes.find((t) => t.id === selectedTypeId) ?? null
  const selectedOccurrence = occurrences.find((occurrence) => occurrence.id === selectedOccurrenceId) ?? null
  const booked = selectedOccurrenceId ? confirmedOccurrenceIds.includes(selectedOccurrenceId) : initialBooked
  const bookingPending = selectedOccurrenceId ? pendingOccurrenceIds.includes(selectedOccurrenceId) : false
  const onWaitlist = selectedOccurrenceId ? waitlistedIds.includes(selectedOccurrenceId) : initialWaitlist
  const occurrenceIsFull = selectedOccurrence
    ? selectedOccurrence.capacity !== null && selectedOccurrence.bookings_count >= selectedOccurrence.capacity
    : isFull
  const spotsLeft = selectedOccurrence && selectedOccurrence.capacity !== null
    ? selectedOccurrence.capacity - selectedOccurrence.bookings_count
    : null

  // Price preview for the CTA button label
  const basePrice     = selectedType ? selectedType.price : (eventPrice ?? 0)
  const effectiveFree = selectedType ? selectedType.is_free : isFree

  // ── Cancel booking ──────────────────────────────────────────────────────
  async function handleManageBooking() {
    if (!user) return
    setLoading(true)
    setError(null)

    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createSupabaseBrowserClient()
    let query = supabase
      .from('bookings').select('id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')

    query = selectedOccurrenceId ? query.eq('occurrence_id', selectedOccurrenceId) : query

    const { data: booking } = await query.single()

    if (!booking) {
      setError('Booking not found.')
      setLoading(false)
      return
    }

    router.push(`/bookings?refund=${booking.id}`)
    setLoading(false)
  }

  // ── Waitlist ────────────────────────────────────────────────────────────
  async function handleJoinWaitlist() {
    if (!user) { router.push('/login'); return }
    setLoading(true)
    setError(null)
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, occurrence_id: selectedOccurrenceId }),
    })
    if (res.ok) {
      if (selectedOccurrenceId) {
        setWaitlistedIds((current) => current.includes(selectedOccurrenceId) ? current : [...current, selectedOccurrenceId])
      }
      router.refresh()
    }
    else { const j = await res.json().catch(() => ({})); setError(j.error ?? j.message ?? 'Failed to join waitlist') }
    setLoading(false)
  }

  async function handleLeaveWaitlist() {
    setLoading(true)
    const query = new URLSearchParams({ event_id: eventId })
    if (selectedOccurrenceId) query.set('occurrence_id', selectedOccurrenceId)
    const res = await fetch(`/api/waitlist?${query.toString()}`, { method: 'DELETE' })
    if (res.ok) {
      if (selectedOccurrenceId) {
        setWaitlistedIds((current) => current.filter((id) => id !== selectedOccurrenceId))
      }
      router.refresh()
    }
    setLoading(false)
  }

  // ── Proceed to checkout ─────────────────────────────────────────────────
  function goToCheckout() {
    if (!user) { router.push('/login'); return }
    if (hasOccurrences && !selectedOccurrenceId) { setError('Please choose a session'); return }
    if (hasTypes && !selectedTypeId) { setError('Please select a ticket type'); return }
    const query = new URLSearchParams()
    if (selectedTypeId) query.set('ticket_type_id', selectedTypeId)
    if (selectedOccurrenceId) query.set('occurrence_id', selectedOccurrenceId)
    router.push(`/events/${eventId}/checkout${query.size ? `?${query.toString()}` : ''}`)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {hasOccurrences && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Choose session</p>
          <div className="space-y-2">
            {occurrences.slice(0, 8).map((occurrence) => {
              const selected = selectedOccurrenceId === occurrence.id
              const full = occurrence.capacity !== null && occurrence.bookings_count >= occurrence.capacity
              const occurrenceSpotsLeft = occurrence.capacity !== null ? occurrence.capacity - occurrence.bookings_count : null

              return (
                <button
                  key={occurrence.id}
                  type="button"
                  onClick={() => {
                    setSelectedOccurrenceId(occurrence.id)
                    setError(null)
                  }}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    selected
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{formatDate(occurrence.starts_at)}</p>
                      <p className="text-xs text-gray-500">
                        {formatTime(occurrence.starts_at)}
                        {occurrence.ends_at ? ` – ${formatTime(occurrence.ends_at)}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      {selected && <p className="text-xs font-medium text-brand-600">Selected</p>}
                      {occurrenceSpotsLeft !== null && (
                        <p className={`text-xs ${full ? 'text-red-500' : 'text-gray-500'}`}>
                          {full ? 'Sold out' : `${occurrenceSpotsLeft} left`}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          {selectedOccurrence && (
            <p className="text-xs text-gray-500">
              Booking this event will reserve the selected session only.
            </p>
          )}
        </div>
      )}

      {booked ? (
        <div className="space-y-2">
          <button onClick={handleManageBooking} disabled={loading} className="btn-secondary w-full">
            {loading ? <Spinner size="sm" /> : 'Open in My Bookings'}
          </button>
          <p className="text-center text-xs text-gray-500">
            Cancellations and refunds are handled from My Bookings.
          </p>
        </div>
      ) : bookingPending ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-medium text-blue-700">
          Your payment is still processing for this session.
        </div>
      ) : occurrenceIsFull ? (
        onWaitlist ? (
          <div className="space-y-2">
            <div className="text-center text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 font-medium">
              ⏳ You&apos;re on the waitlist
            </div>
            <button onClick={handleLeaveWaitlist} disabled={loading} className="btn-secondary w-full text-sm">
              {loading ? <Spinner size="sm" /> : 'Leave Waitlist'}
            </button>
          </div>
        ) : (
          <button onClick={handleJoinWaitlist} disabled={loading} className="btn-primary w-full bg-amber-500 hover:bg-amber-600">
            {loading ? <Spinner size="sm" /> : '⏳ Join Waitlist'}
          </button>
        )
      ) : (
        <>
          {/* Ticket type selector */}
          {hasTypes && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select ticket</p>
              {ticketTypes.map((tt) => (
                <TicketCard
                  key={tt.id}
                  ticket={tt}
                  currency={currency}
                  selected={selectedTypeId === tt.id}
                  onSelect={() => { setSelectedTypeId(tt.id); setError(null) }}
                />
              ))}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={goToCheckout}
            disabled={loading || (hasOccurrences && !selectedOccurrenceId) || (hasTypes && !selectedTypeId)}
            className={`w-full btn-primary ${(hasOccurrences && !selectedOccurrenceId) || (hasTypes && !selectedTypeId) ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <Spinner size="sm" />
            ) : effectiveFree && !selectedType ? (
              'Join Event — Free'
            ) : effectiveFree ? (
              'Proceed — Free'
            ) : (
              `Proceed to Checkout${selectedType ? ` — ${formatCurrency(basePrice, currency)}` : ''}`
            )}
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {hasOccurrences && !selectedOccurrenceId && <p className="text-xs text-red-600">Please choose a session before continuing.</p>}
    </div>
  )
}
