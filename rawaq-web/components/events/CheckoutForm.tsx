'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'
import { formatCurrency } from '@/lib/utils'
import type { TicketType, PromoValidationResult } from '@/types/database'
import { PaymentMethodSelector } from './PaymentMethodSelector'
import type { PaymentOption } from '@/lib/gateways/types'

// ── Ticket selector ──────────────────────────────────────────────────────────
function TicketSelector({
  tickets,
  currency,
  selectedId,
  onSelect,
}: {
  tickets: TicketType[]
  currency: string
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (tickets.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select ticket type</p>
      {tickets.map((t) => {
        const now         = new Date()
        const saleStarted = !t.sale_starts_at || new Date(t.sale_starts_at) <= now
        const saleEnded   = t.sale_ends_at ? new Date(t.sale_ends_at) < now : false
        const soldOut     = t.capacity !== null && t.sold_count >= t.capacity
        const spotsLeft   = t.capacity !== null ? t.capacity - t.sold_count : null
        const unavailable = saleEnded || soldOut || !saleStarted
        const selected    = selectedId === t.id

        return (
          <button
            key={t.id}
            type="button"
            disabled={unavailable}
            onClick={() => onSelect(t.id)}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${unavailable ? 'text-gray-400' : 'text-gray-900'}`}>{t.name}</span>
                  {!saleStarted && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Coming soon</span>}
                  {saleEnded    && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Sales ended</span>}
                  {soldOut      && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Sold out</span>}
                </div>
                {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                {spotsLeft !== null && spotsLeft <= 10 && !soldOut && (
                  <p className="text-xs text-amber-600 font-medium mt-0.5">Only {spotsLeft} left!</p>
                )}
              </div>
              <span className={`text-sm font-bold shrink-0 ${unavailable ? 'text-gray-400' : 'text-brand-700'}`}>
                {t.is_free ? 'Free' : formatCurrency(t.price, currency)}
              </span>
            </div>
            {selected && <p className="mt-1.5 text-xs text-brand-600 font-medium">✓ Selected</p>}
          </button>
        )
      })}
    </div>
  )
}

// ── Promo code input ─────────────────────────────────────────────────────────
function PromoInput({
  eventId,
  orderAmount,
  currency,
  onApplied,
  onCleared,
}: {
  eventId: string
  orderAmount: number
  currency: string
  onApplied: (r: PromoValidationResult) => void
  onCleared: () => void
}) {
  const [code,   setCode]          = useState('')
  const [result, setResult]        = useState<PromoValidationResult | null>(null)
  const [pending, startTransition] = useTransition()

  function validate() {
    if (!code.trim()) return
    startTransition(async () => {
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
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Promo code</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setResult(null); onCleared() }}
          onKeyDown={(e) => e.key === 'Enter' && validate()}
          placeholder="Enter code"
          maxLength={32}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300 font-mono uppercase"
        />
        {result?.valid ? (
          <button type="button" onClick={clear} className="text-sm px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
            Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={validate}
            disabled={pending || !code.trim()}
            className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {pending ? <Spinner size="sm" /> : 'Apply'}
          </button>
        )}
      </div>
      {result && (
        <p className={`text-xs font-medium ${result.valid ? 'text-green-600' : 'text-red-500'}`}>
          {result.valid
            ? `✓ ${result.discount_type === 'percent' ? `${result.discount_value}% off` : `${formatCurrency(result.discount_amount ?? 0, currency)} off`}`
            : `✗ ${result.reason}`}
        </p>
      )}
    </div>
  )
}

// ── Price breakdown ──────────────────────────────────────────────────────────
function PriceBreakdown({
  basePrice,
  discountAmount,
  currency,
  promoCode,
}: {
  basePrice: number
  discountAmount: number
  currency: string
  promoCode?: string | null
}) {
  const total = Math.max(0, basePrice - discountAmount)

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Price breakdown</p>
      <div className="flex justify-between text-gray-700">
        <span>Ticket price</span>
        <span>{basePrice === 0 ? 'Free' : formatCurrency(basePrice, currency)}</span>
      </div>
      {discountAmount > 0 && (
        <div className="flex justify-between text-green-600 font-medium">
          <span>Promo{promoCode ? ` (${promoCode})` : ''}</span>
          <span>−{formatCurrency(discountAmount, currency)}</span>
        </div>
      )}
      <div className="flex justify-between text-gray-500">
        <span>Platform fee</span>
        <span>Free</span>
      </div>
      <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900 text-base">
        <span>Total</span>
        <span className={total === 0 ? 'text-green-600' : 'text-gray-900'}>
          {total === 0 ? 'Free' : formatCurrency(total, currency)}
        </span>
      </div>
    </div>
  )
}

// ── Fawry payment reference card ─────────────────────────────────────────────
function FawryReferenceCard({ reference }: { reference: string }) {
  return (
    <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 space-y-2 text-center">
      <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Fawry Reference</p>
      <p className="text-2xl font-mono font-bold text-orange-800 tracking-widest">{reference}</p>
      <p className="text-xs text-orange-600">
        Pay at any Fawry outlet, ATM, or kiosk using this reference number.
        Your ticket will be confirmed once payment is received.
      </p>
    </div>
  )
}

// ── Main checkout form ───────────────────────────────────────────────────────
interface CheckoutFormProps {
  eventId: string
  eventTitle: string
  currency: string
  ticketTypes: TicketType[]
  preSelectedTypeId: string | null
  isFree: boolean
  eventPrice: number | null
  isLoggedIn: boolean
}

export function CheckoutForm({
  eventId,
  eventTitle,
  currency,
  ticketTypes,
  preSelectedTypeId,
  isFree,
  eventPrice,
  isLoggedIn,
}: CheckoutFormProps) {
  const router = useRouter()

  const hasTypes = ticketTypes.length > 0
  const [selectedTypeId,    setSelectedTypeId]   = useState<string | null>(preSelectedTypeId)
  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId) ?? null

  const [promo,          setPromo]         = useState<PromoValidationResult | null>(null)
  const [loading,        setLoading]       = useState(false)
  const [error,          setError]         = useState<string | null>(null)
  const [needsProfile,   setNeedsProfile]  = useState(false)
  const [booked,         setBooked]        = useState(false)
  const [fawryRef,       setFawryRef]      = useState<string | null>(null)

  // Payment method options fetched from API
  const [paymentOptions,  setPaymentOptions] = useState<PaymentOption[]>([])
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/payments/options?currency=${encodeURIComponent(currency)}`)
      .then((r) => r.json())
      .then((j) => {
        const opts: PaymentOption[] = j.data ?? j
        setPaymentOptions(opts)
        if (opts.length > 0) setSelectedOptionId(opts[0].id)
      })
      .catch(() => {})
  }, [currency])

  const basePrice     = selectedType ? selectedType.price  : (eventPrice ?? 0)
  const isFreeTicket  = selectedType ? selectedType.is_free : isFree
  const discountAmt   = promo?.discount_amount ?? 0
  const total         = Math.max(0, basePrice - discountAmt)
  const isPaid        = !isFreeTicket && total > 0

  async function confirmBooking() {
    if (!isLoggedIn) { router.push('/login'); return }
    if (hasTypes && !selectedTypeId) { setError('Please select a ticket type'); return }
    setError(null)
    setNeedsProfile(false)
    setLoading(true)

    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id:          eventId,
          ticket_type_id:    selectedTypeId ?? null,
          promo_code:        promo?.valid ? promo.code : null,
          payment_option_id: selectedOptionId ?? 'simulated',
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msg: string = json.error ?? json.message ?? 'Failed to book event.'
        if (msg.toLowerCase().includes('complete your profile')) setNeedsProfile(true)
        else setError(msg)
        return
      }

      const data = json.data ?? json

      if (data.free) {
        // Free booking — confirmed immediately
        setBooked(true)
        return
      }

      if (data.fawry_reference_number) {
        // Fawry — show reference number to user
        setFawryRef(data.fawry_reference_number)
        return
      }

      if (data.redirect_url) {
        // Card / Apple Pay / Google Pay — redirect to hosted payment page
        window.location.href = data.redirect_url
        return
      }

      // Simulated paid — also confirmed immediately
      setBooked(true)
    } finally {
      setLoading(false)
    }
  }

  // ── Fawry reference display ────────────────────────────────────────────────
  if (fawryRef) {
    return (
      <div className="space-y-4">
        <FawryReferenceCard reference={fawryRef} />
        <button onClick={() => router.push(`/events/${eventId}`)} className="w-full btn-primary">
          Back to Event
        </button>
      </div>
    )
  }

  // ── Booking confirmed ──────────────────────────────────────────────────────
  if (booked) {
    return (
      <div className="text-center space-y-4 py-6">
        <div className="text-5xl">🎉</div>
        <h2 className="text-xl font-bold text-gray-900">You&apos;re in!</h2>
        <p className="text-gray-500 text-sm">Your booking for <strong>{eventTitle}</strong> has been confirmed.</p>
        <button onClick={() => router.push(`/events/${eventId}`)} className="btn-primary">
          View Event
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Ticket selector */}
      {hasTypes && (
        <TicketSelector
          tickets={ticketTypes}
          currency={currency}
          selectedId={selectedTypeId}
          onSelect={(id) => { setSelectedTypeId(id); setPromo(null); setError(null) }}
        />
      )}

      {/* Promo code — only for paid tickets */}
      {(selectedType ? !isFreeTicket && basePrice > 0 : !isFree && (eventPrice ?? 0) > 0) && (
        <PromoInput
          eventId={eventId}
          orderAmount={basePrice}
          currency={currency}
          onApplied={setPromo}
          onCleared={() => setPromo(null)}
        />
      )}

      {/* Price breakdown */}
      {(!hasTypes || selectedType) && (
        <PriceBreakdown
          basePrice={isFreeTicket ? 0 : basePrice}
          discountAmount={discountAmt}
          currency={currency}
          promoCode={promo?.valid ? promo.code : null}
        />
      )}

      {/* Payment method selector — only for paid tickets */}
      {isPaid && paymentOptions.length > 1 && (
        <PaymentMethodSelector
          options={paymentOptions}
          selected={selectedOptionId}
          onSelect={setSelectedOptionId}
        />
      )}

      {/* Errors */}
      {needsProfile && (
        <div className="text-sm rounded-xl px-4 py-3 bg-yellow-50 text-yellow-800 border border-yellow-200">
          Please{' '}
          <a href="/profile" className="font-semibold underline">complete your profile</a>
          {' '}(name, gender, city) before booking.
        </div>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

      {/* Confirm button */}
      <button
        onClick={confirmBooking}
        disabled={loading || (hasTypes && !selectedTypeId)}
        className={`w-full btn-primary text-base py-3 ${hasTypes && !selectedTypeId ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : !hasTypes || isFreeTicket || total === 0 ? (
          'Confirm Booking — Free'
        ) : (
          `Pay ${formatCurrency(total, currency)}`
        )}
      </button>

      {!isLoggedIn && (
        <p className="text-center text-xs text-gray-500">
          You&apos;ll be asked to log in before completing your booking.
        </p>
      )}

      {isPaid && (
        <div className="flex items-center justify-center gap-4 pt-1">
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span>🔒</span> Secured payment
          </p>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span>💳</span> Visa · Mastercard
          </p>
          {currency === 'EGP' && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <span>🏪</span> Fawry
            </p>
          )}
        </div>
      )}
    </div>
  )
}
