'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'

const QUICK_AMOUNTS = [5, 10, 25, 50]

interface PaymentOption {
  id: string
  gateway: string
  method: string
  label: string
  description: string
  icon: string
}

interface TipPanelProps {
  eventId: string
  organizerId: string
  currency?: string
}

export function TipPanel({ eventId, organizerId, currency = 'SAR' }: TipPanelProps) {
  const { user } = useAuth()
  const router = useRouter()

  const [amount, setAmount] = useState<number | ''>('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([])
  const [selectedPaymentOptionId, setSelectedPaymentOptionId] = useState('simulated')

  useEffect(() => {
    fetch(`/api/payments/options?currency=${encodeURIComponent(currency)}`)
      .then((res) => res.json())
      .then((json) => {
        const options = (json?.data ?? []) as PaymentOption[]
        setPaymentOptions(options)
        if (options[0]?.id) setSelectedPaymentOptionId(options[0].id)
      })
      .catch(() => {})
  }, [currency])

  async function sendDonation() {
    if (!user) { router.push('/login'); return }
    if (!amount || amount <= 0) return

    setLoading(true)
    setError(null)

    const body: Record<string, unknown> = {
      event_id: eventId,
      amount: Number(amount),
      currency,
      payment_option_id: selectedPaymentOptionId || 'simulated',
      source: 'web',
    }
    if (message) body.message = message

    const res = await fetch('/api/tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error ?? 'Failed to send donation.')
      setLoading(false)
      return
    }

    const data = json.data as { redirect_url?: string } | undefined
    if (data?.redirect_url) {
      window.location.href = data.redirect_url
      return
    }

    setSuccess(true)
    setLoading(false)
    router.refresh()
  }

  if (success) {
    return (
      <div className="card p-5 text-center space-y-1">
        <div className="text-3xl">Donation</div>
        <p className="font-semibold text-gray-900">Donation sent!</p>
        <p className="text-sm text-gray-500">Thank you for supporting the organizer.</p>
      </div>
    )
  }

  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold text-gray-900 text-sm">Donate to the Organizer</h3>

      <div className="flex gap-2">
        {QUICK_AMOUNTS.map((a) => (
          <button
            key={a}
            onClick={() => setAmount(a)}
            className={`flex-1 text-sm py-2 rounded-xl border font-medium transition-colors ${
              amount === a
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="relative">
        <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">{currency}</span>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
          className="input ps-12"
          placeholder="Custom amount"
        />
      </div>

      {paymentOptions.length > 1 && (
        <select
          value={selectedPaymentOptionId}
          onChange={(e) => setSelectedPaymentOptionId(e.target.value)}
          className="input"
        >
          {paymentOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="input"
        placeholder="Leave a message (optional)"
        maxLength={200}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={sendDonation}
        disabled={!amount || loading}
        className="btn-primary w-full"
      >
        {loading ? <Spinner size="sm" /> : `Send ${amount ? `${currency} ${amount}` : ''} Donation`}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Your donation will be processed through the selected payment method.
      </p>
    </div>
  )
}

