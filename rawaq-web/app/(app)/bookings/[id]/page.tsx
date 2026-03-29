'use client'

/**
 * /bookings/:id — Payment result page
 *
 * Landed on after returning from a payment gateway (Paymob/Stripe redirect).
 * Reads ?payment=success|failed|pending from the URL and polls
 * /api/payments/status/:id until the booking is confirmed or failed.
 *
 * Also serves as a generic booking detail / confirmation page.
 */

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'

type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'waitlisted' | null

interface StatusResponse {
  booking_id: string
  booking_status: BookingStatus
  payment_pending_until: string | null
  transaction: {
    status: string
    gateway: string
    payment_method: string
    amount: number
    currency: string
    failure_reason: string | null
  } | null
}

export default function BookingResultPage() {
  const { id }          = useParams<{ id: string }>()
  const searchParams    = useSearchParams()
  const router          = useRouter()
  const paymentHint     = searchParams.get('payment') // success | failed | pending | null

  const [status,   setStatus]   = useState<BookingStatus>(null)
  const [tx,       setTx]       = useState<StatusResponse['transaction']>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null)
  const attemptsRef             = useRef(0)

  async function fetchStatus() {
    try {
      const res  = await fetch(`/api/payments/status/${id}`)
      const json = await res.json()
      if (!res.ok) { setError('Could not load booking details.'); setLoading(false); return }

      const data: StatusResponse = json.data ?? json
      setStatus(data.booking_status)
      setTx(data.transaction)
      setLoading(false)

      // Stop polling once the booking is no longer pending
      if (data.booking_status !== 'pending') {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    } catch {
      setLoading(false)
      setError('Network error. Please refresh.')
    }
  }

  useEffect(() => {
    fetchStatus()

    // If payment hint says success/pending, poll until booking status settles
    if (paymentHint === 'success' || paymentHint === 'pending') {
      pollRef.current = setInterval(() => {
        attemptsRef.current += 1
        if (attemptsRef.current >= 20) {
          // Stop after ~40 seconds of polling
          if (pollRef.current) clearInterval(pollRef.current)
          return
        }
        fetchStatus()
      }, 2000)
    }

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">
          {paymentHint === 'success' ? 'Confirming your payment…' : 'Loading booking…'}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="text-4xl">⚠️</div>
        <p className="text-gray-700">{error}</p>
        <button onClick={() => router.push('/bookings')} className="btn-primary">
          My Bookings
        </button>
      </div>
    )
  }

  // ── Pending — webhook not yet fired ───────────────────────────────────────
  if (status === 'pending') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="text-5xl">⏳</div>
        <h1 className="text-2xl font-bold text-gray-900">Payment pending</h1>
        <p className="text-gray-500 max-w-sm">
          {tx?.gateway === 'paymob' && tx?.payment_method === 'fawry'
            ? 'Pay at any Fawry outlet using the reference you received. Your ticket will appear here once payment is confirmed.'
            : 'Your payment is being processed. This page will update automatically — please keep it open.'}
        </p>
        <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-500 rounded-full animate-spin mt-2" />
        <button onClick={fetchStatus} className="text-sm text-brand-600 underline mt-2">
          Refresh now
        </button>
      </div>
    )
  }

  // ── Cancelled / failed ─────────────────────────────────────────────────────
  if (status === 'cancelled') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="text-5xl">❌</div>
        <h1 className="text-2xl font-bold text-gray-900">Payment failed</h1>
        <p className="text-gray-500 max-w-sm">
          {tx?.failure_reason ?? 'Your payment was not completed. No charge was made.'}
        </p>
        <div className="flex gap-3 mt-2">
          <button onClick={() => router.back()} className="btn-primary">
            Try again
          </button>
          <button onClick={() => router.push('/bookings')} className="btn-secondary">
            My Bookings
          </button>
        </div>
      </div>
    )
  }

  // ── Confirmed ──────────────────────────────────────────────────────────────
  if (status === 'confirmed') {
    const gatewayLabel: Record<string, string> = {
      paymob:    'Paymob',
      stripe:    'Stripe',
      fawry:     'Fawry',
      simulated: 'Test',
    }
    const methodLabel: Record<string, string> = {
      card:       'Card',
      apple_pay:  'Apple Pay',
      google_pay: 'Google Pay',
      fawry:      'Fawry',
      wallet:     'Wallet',
    }

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 text-center p-8">
        <div className="text-6xl">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900">You&apos;re in!</h1>
        <p className="text-gray-500 max-w-sm">
          Your booking is confirmed
          {tx && tx.gateway !== 'simulated' && (
            <> · paid {tx.amount} {tx.currency} via {methodLabel[tx.payment_method] ?? tx.payment_method} ({gatewayLabel[tx.gateway] ?? tx.gateway})</>
          )}
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/bookings/${id}/ticket`)}
            className="btn-primary"
          >
            🎟️ View Ticket
          </button>
          <button
            onClick={() => router.push('/bookings')}
            className="btn-secondary"
          >
            My Bookings
          </button>
        </div>
      </div>
    )
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="text-4xl">📋</div>
      <p className="text-gray-500">Booking #{id}</p>
      <button onClick={() => router.push(`/bookings/${id}/ticket`)} className="btn-primary">
        View Ticket
      </button>
    </div>
  )
}
