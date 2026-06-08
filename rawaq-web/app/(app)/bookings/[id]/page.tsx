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
import { useLocale } from '@/contexts/locale-context'
import { useNavigate } from '@/hooks/useNavigate'
import { HostCommunityJoinPrompt } from '@/components/community/HostCommunityJoinPrompt'

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
  const { navigate, isNavigating } = useNavigate()
  const { t }           = useLocale()
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
      if (!res.ok) { setError(t('booking.error_load')); setLoading(false); return }

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
      setError(t('booking.error_network'))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, paymentHint])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">
          {paymentHint === 'success' ? t('booking.confirming') : t('booking.loading')}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="text-4xl">⚠️</div>
        <p className="text-gray-700">{error}</p>
        <button onClick={() => navigate('/bookings')} disabled={isNavigating} className="btn-primary">
          {t('booking.my_bookings')}
        </button>
      </div>
    )
  }

  // ── Pending — webhook not yet fired ───────────────────────────────────────
  if (status === 'pending') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="text-5xl">⏳</div>
        <h1 className="text-2xl font-bold text-gray-900">{t('booking.pending_title')}</h1>
        <p className="text-gray-500 max-w-sm">
          {tx?.gateway === 'paymob' && tx?.payment_method === 'fawry'
            ? t('booking.pending_fawry')
            : t('booking.pending_generic')}
        </p>
        <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-500 rounded-full animate-spin mt-2" />
        <button onClick={fetchStatus} className="text-sm text-brand-600 underline mt-2">
          {t('booking.refresh_now')}
        </button>
      </div>
    )
  }

  // ── Cancelled / failed ─────────────────────────────────────────────────────
  if (status === 'cancelled') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="text-5xl">❌</div>
        <h1 className="text-2xl font-bold text-gray-900">{t('booking.failed_title')}</h1>
        <p className="text-gray-500 max-w-sm">
          {tx?.failure_reason ?? t('booking.failed_body')}
        </p>
        <div className="flex gap-3 mt-2">
          <button onClick={() => router.back()} className="btn-primary">
            {t('booking.try_again')}
          </button>
          <button onClick={() => navigate('/bookings')} disabled={isNavigating} className="btn-secondary">
            {t('booking.my_bookings')}
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
        <h1 className="text-2xl font-bold text-gray-900">{t('booking.confirmed_title')}</h1>
        <p className="text-gray-500 max-w-sm">
          {t('booking.confirmed_body')}
          {tx && tx.gateway !== 'simulated' && (
            <> · {t('booking.confirmed_paid')
              .replace('{amount}', String(tx.amount))
              .replace('{currency}', tx.currency)
              .replace('{method}', methodLabel[tx.payment_method] ?? tx.payment_method)
              .replace('{gateway}', gatewayLabel[tx.gateway] ?? tx.gateway)}</>
          )}
        </p>

        <div className="flex gap-3">
          <button onClick={() => navigate(`/bookings/${id}/ticket`)} disabled={isNavigating} className="btn-primary">
            {t('booking.view_ticket')}
          </button>
          <button onClick={() => navigate('/bookings')} disabled={isNavigating} className="btn-secondary">
            {t('booking.my_bookings')}
          </button>
        </div>

        <HostCommunityJoinPrompt bookingId={id} />
      </div>
    )
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="text-4xl">📋</div>
      <p className="text-gray-500">Booking #{id}</p>
      <button onClick={() => navigate(`/bookings/${id}/ticket`)} disabled={isNavigating} className="btn-primary">
        {t('booking.view_ticket_plain')}
      </button>
    </div>
  )
}
