'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/auth-context'
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils'
import type { EventOccurrence, TicketType } from '@/types/database'

// ── Helpers ─────────────────────────────────────────────────────────────────
function getEffectivePrice(ticket: TicketType): number {
  if (ticket.is_hot_offer && ticket.hot_offer_price != null && ticket.hot_offer_ends_at && new Date(ticket.hot_offer_ends_at) > new Date()) {
    return ticket.hot_offer_price
  }
  return ticket.price
}

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
  const now = new Date()
  const saleStarted = !ticket.sale_starts_at || new Date(ticket.sale_starts_at) <= now
  const saleEnded = ticket.sale_ends_at ? new Date(ticket.sale_ends_at) < now : false
  const soldOut = ticket.capacity !== null && ticket.sold_count >= ticket.capacity
  const spotsLeft = ticket.capacity !== null ? ticket.capacity - ticket.sold_count : null
  const unavailable = saleEnded || soldOut || !saleStarted

  return (
    <button
      type="button"
      disabled={unavailable}
      onClick={onSelect}
      className={cn(
        'w-full text-start rounded-2xl border-2 px-4 py-3.5 transition-all duration-150',
        unavailable
          ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
          : selected
            ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-300/40 ring-offset-1'
            : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-amber-50/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${unavailable ? 'text-gray-400' : 'text-gray-900'}`}>
              {ticket.name}
            </span>
            {!saleStarted && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Coming soon</span>}
            {saleEnded && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Sales ended</span>}
            {soldOut && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Sold out</span>}
          </div>
          {ticket.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ticket.description}</p>}
          {spotsLeft !== null && spotsLeft <= 10 && !soldOut && (
            <p className="text-xs text-amber-600 font-medium mt-0.5">Only {spotsLeft} left!</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {(() => {
            const effective = getEffectivePrice(ticket)
            const hotActive = ticket.is_hot_offer && ticket.hot_offer_price != null && !!ticket.hot_offer_ends_at && new Date(ticket.hot_offer_ends_at) > new Date()
            if (ticket.is_free) return <span className={`text-sm font-bold ${unavailable ? 'text-gray-400' : 'text-brand-700'}`}>Free</span>
            if (hotActive) return (
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-xs text-gray-400 line-through">{formatCurrency(ticket.price, currency)}</span>
                <span className={`text-sm font-bold ${unavailable ? 'text-gray-400' : 'text-orange-600'}`}>🔥 {formatCurrency(effective, currency)}</span>
              </span>
            )
            return <span className={`text-sm font-bold ${unavailable ? 'text-gray-400' : 'text-brand-700'}`}>{formatCurrency(effective, currency)}</span>
          })()}
        </div>
      </div>
      {selected && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-700">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="5.5" fill="oklch(0.78 0.18 72)" />
            <path d="M3.5 6l1.75 1.75L8.5 4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Selected
        </div>
      )}
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
  const { user } = useAuth()
  const router = useRouter()

  const [waitlistedIds, setWaitlistedIds] = useState(waitlistedOccurrenceIds)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasTypes = ticketTypes.length > 0
  const hasOccurrences = occurrences.length > 0
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(initialOccurrenceId ?? occurrences[0]?.id ?? null)
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId) ?? null
  const selectedOccurrence = occurrences.find((occurrence) => occurrence.id === selectedOccurrenceId) ?? null
  const booked = selectedOccurrenceId ? confirmedOccurrenceIds.includes(selectedOccurrenceId) : initialBooked
  const bookingPending = selectedOccurrenceId ? pendingOccurrenceIds.includes(selectedOccurrenceId) : false
  const onWaitlist = selectedOccurrenceId ? waitlistedIds.includes(selectedOccurrenceId) : initialWaitlist
  const occurrenceIsFull = selectedOccurrence
    ? selectedOccurrence.capacity !== null && selectedOccurrence.bookings_count >= selectedOccurrence.capacity
    : isFull


  // Price preview for the CTA button label — use hot offer price if active
  const basePrice = selectedType ? getEffectivePrice(selectedType) : (eventPrice ?? 0)
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
          <p style={{ fontFamily: 'var(--font-display)' }}
             className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-2">
            Choose Session
          </p>
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
                  className={cn(
                    'w-full rounded-2xl border px-3.5 py-3 text-start transition-all duration-150',
                    selected
                      ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-300/40 ring-offset-1'
                      : full
                        ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                        : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-amber-50/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{formatDate(occurrence.starts_at)}</p>
                      <p className="text-xs text-gray-500">
                        {formatTime(occurrence.starts_at)}
                        {occurrence.ends_at ? ` - ${formatTime(occurrence.ends_at)}` : ''}
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
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center space-y-1.5">
          <p className="text-sm font-medium text-blue-700">Your previous payment attempt is still pending.</p>
          <button
            type="button"
            onClick={goToCheckout}
            disabled={loading}
            className="text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-900 disabled:opacity-50"
          >
            Retry payment →
          </button>
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
              <p style={{ fontFamily: 'var(--font-display)' }}
                 className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-2">
                Select Ticket
              </p>
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
            className={cn(
              'w-full rounded-2xl py-3.5 px-6 font-bold text-sm tracking-wide uppercase transition-all duration-150',
              'bg-[var(--c-gold)] text-[var(--c-ink)] hover:brightness-105 active:scale-[0.98]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {loading ? (
              <Spinner size="sm" />
            ) : effectiveFree && !selectedType ? (
              'Join Event — Free'
            ) : effectiveFree ? (
              'Proceed — Free'
            ) : (
              `Book Now${selectedType ? ` — ${formatCurrency(basePrice, currency)}` : ''}`
            )}
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {hasOccurrences && !selectedOccurrenceId && <p className="text-xs text-red-600">Please choose a session before continuing.</p>}
    </div>
  )
}
