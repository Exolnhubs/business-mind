'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/auth-context'
import { formatCurrency } from '@/lib/utils'
import type { TicketType, PromoValidationResult } from '@/types/database'

// ── Ticket type card ───────────────────────────────────────────────────────
function TicketCard({
  ticket,
  selected,
  onSelect,
}: {
  ticket: TicketType
  selected: boolean
  onSelect: () => void
}) {
  const now = new Date()
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
            {!saleStarted && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Coming soon</span>
            )}
            {saleEnded && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Sales ended</span>
            )}
            {soldOut && (
              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Sold out</span>
            )}
          </div>
          {ticket.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ticket.description}</p>
          )}
          {spotsLeft !== null && spotsLeft <= 10 && !soldOut && (
            <p className="text-xs text-amber-600 font-medium mt-0.5">Only {spotsLeft} left!</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-sm font-bold ${unavailable ? 'text-gray-400' : 'text-brand-700'}`}>
            {ticket.is_free ? 'Free' : formatCurrency(ticket.price, ticket.currency)}
          </span>
        </div>
      </div>
      {selected && (
        <div className="mt-1.5 text-xs text-brand-600 font-medium">✓ Selected</div>
      )}
    </button>
  )
}

// ── Promo code input ──────────────────────────────────────────────────────
function PromoCodeInput({
  eventId,
  orderAmount,
  onApplied,
  onCleared,
}: {
  eventId: string
  orderAmount: number
  onApplied: (result: PromoValidationResult) => void
  onCleared: () => void
}) {
  const [code, setCode]               = useState('')
  const [result, setResult]           = useState<PromoValidationResult | null>(null)
  const [validating, startValidating] = useTransition()

  function validate() {
    if (!code.trim()) return
    startValidating(async () => {
      const res = await fetch(
        `/api/promo-codes/validate?code=${encodeURIComponent(code.toUpperCase())}&event_id=${eventId}&order_amount=${orderAmount}`
      )
      const json: PromoValidationResult = await res.json().then((j) => j.data ?? j)
      setResult(json)
      if (json.valid) onApplied(json)
      else onCleared()
    })
  }

  function clear() {
    setCode('')
    setResult(null)
    onCleared()
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setResult(null); onCleared() }}
          onKeyDown={(e) => e.key === 'Enter' && validate()}
          placeholder="Promo code"
          maxLength={32}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300 font-mono uppercase"
        />
        {result?.valid ? (
          <button type="button" onClick={clear} className="text-sm px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
            Clear
          </button>
        ) : (
          <button
            type="button"
            onClick={validate}
            disabled={validating || !code.trim()}
            className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {validating ? <Spinner size="sm" /> : 'Apply'}
          </button>
        )}
      </div>
      {result && (
        <p className={`text-xs font-medium ${result.valid ? 'text-green-600' : 'text-red-500'}`}>
          {result.valid
            ? `✓ ${result.discount_type === 'percent' ? `${result.discount_value}% off` : `SAR ${result.discount_amount} off`} — You pay ${formatCurrency(result.final_amount ?? orderAmount, 'SAR')}`
            : `✗ ${result.reason}`}
        </p>
      )}
    </div>
  )
}

// ── Main BookingFlow ──────────────────────────────────────────────────────
interface BookingFlowProps {
  eventId: string
  isBooked: boolean
  isFull: boolean
  isFree: boolean
  eventPrice: number | null
  currency: string
  ticketTypes: TicketType[]
  isOnWaitlist?: boolean
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
}: BookingFlowProps) {
  const { user } = useAuth()
  const router   = useRouter()

  const [booked, setBooked]         = useState(initialBooked)
  const [onWaitlist, setOnWaitlist] = useState(initialWaitlist)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [needsProfile, setNeedsProfile] = useState(false)

  // Ticket type selection
  const hasTypes           = ticketTypes.length > 0
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(
    hasTypes ? null : null
  )
  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId) ?? null

  // Promo code
  const [promo, setPromo] = useState<PromoValidationResult | null>(null)

  // Effective price for display + promo validation
  const basePrice    = selectedType ? selectedType.price : (eventPrice ?? 0)
  const discountAmt  = promo?.discount_amount ?? 0
  const finalPrice   = Math.max(0, basePrice - discountAmt)
  const effectiveFree = selectedType ? selectedType.is_free || finalPrice === 0 : isFree || finalPrice === 0

  // ── Actions ──────────────────────────────────────────────────────────────
  async function handleBook() {
    if (!user) { router.push('/login'); return }
    if (hasTypes && !selectedTypeId) { setError('Please select a ticket type'); return }
    setError(null)
    setNeedsProfile(false)
    setLoading(true)

    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id:       eventId,
        ticket_type_id: selectedTypeId ?? null,
        promo_code:     promo?.valid ? promo.code : null,
      }),
    })

    if (res.ok) {
      setBooked(true)
      router.refresh()
    } else {
      const json = await res.json().catch(() => ({}))
      const msg: string = json.error ?? json.message ?? 'Failed to book event.'
      if (msg.toLowerCase().includes('complete your profile')) setNeedsProfile(true)
      else setError(msg)
    }
    setLoading(false)
  }

  async function handleCancel() {
    if (!user) return
    setLoading(true)
    setError(null)

    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createSupabaseBrowserClient()
    const { data: booking } = await supabase
      .from('bookings').select('id')
      .eq('event_id', eventId).eq('user_id', user.id).eq('status', 'confirmed').single()

    if (!booking) { setLoading(false); return }

    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Failed to cancel.') }
    else { setBooked(false); router.refresh() }
    setLoading(false)
  }

  async function handleJoinWaitlist() {
    if (!user) { router.push('/login'); return }
    setLoading(true)
    setError(null)
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    })
    if (res.ok) { setOnWaitlist(true); router.refresh() }
    else { const j = await res.json().catch(() => ({})); setError(j.error ?? j.message ?? 'Failed to join waitlist') }
    setLoading(false)
  }

  async function handleLeaveWaitlist() {
    setLoading(true)
    const res = await fetch(`/api/waitlist?event_id=${eventId}`, { method: 'DELETE' })
    if (res.ok) { setOnWaitlist(false); router.refresh() }
    setLoading(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Already booked */}
      {booked ? (
        <button
          onClick={handleCancel}
          disabled={loading}
          className="btn-secondary w-full"
        >
          {loading ? <Spinner size="sm" /> : '✓ Cancel Booking'}
        </button>
      ) : isFull ? (
        /* Event is full */
        onWaitlist ? (
          <div className="space-y-2">
            <div className="text-center text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 font-medium">
              ⏳ You're on the waitlist
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
        /* Normal booking flow */
        <>
          {/* Ticket type selector */}
          {hasTypes && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select ticket</p>
              {ticketTypes.map((tt) => (
                <TicketCard
                  key={tt.id}
                  ticket={tt}
                  selected={selectedTypeId === tt.id}
                  onSelect={() => { setSelectedTypeId(tt.id); setPromo(null); setError(null) }}
                />
              ))}
            </div>
          )}

          {/* Promo code — show when there's a price to discount */}
          {(selectedType ? !selectedType.is_free && selectedType.price > 0 : !isFree && (eventPrice ?? 0) > 0) && (
            <PromoCodeInput
              eventId={eventId}
              orderAmount={basePrice}
              onApplied={setPromo}
              onCleared={() => setPromo(null)}
            />
          )}

          {/* Price summary */}
          {!effectiveFree && (
            <div className="text-xs text-gray-500 flex justify-between items-center px-0.5">
              <span>
                {discountAmt > 0 ? (
                  <>
                    <span className="line-through mr-1">{formatCurrency(basePrice, currency)}</span>
                    <span className="text-green-600 font-semibold">{formatCurrency(finalPrice, currency)}</span>
                  </>
                ) : (
                  formatCurrency(finalPrice, currency)
                )}
              </span>
              {discountAmt > 0 && <span className="text-green-600 font-medium">-{formatCurrency(discountAmt, currency)} discount</span>}
            </div>
          )}

          {/* Book button */}
          <button
            onClick={handleBook}
            disabled={loading || (hasTypes && !selectedTypeId)}
            className={`w-full btn-primary ${hasTypes && !selectedTypeId ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <Spinner size="sm" />
            ) : effectiveFree ? (
              'Join Event — Free'
            ) : (
              `Book Now — ${formatCurrency(finalPrice, currency)}`
            )}
          </button>
        </>
      )}

      {needsProfile && (
        <div className="text-sm rounded-xl px-4 py-3 bg-yellow-50 text-yellow-800 border border-yellow-200">
          Please{' '}
          <Link href="/profile" className="font-semibold underline">complete your profile</Link>{' '}
          (name, gender, city) before booking.
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
