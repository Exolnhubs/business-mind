'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import Link from 'next/link'

interface BookingButtonProps {
  eventId: string
  isFull: boolean
  isBooked: boolean
  isFree: boolean
  price: number | null
}

export function BookingButton({ eventId, isFull, isBooked: initialBooked, isFree, price }: BookingButtonProps) {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [booked, setBooked] = useState(initialBooked)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsProfile, setNeedsProfile] = useState(false)

  async function handleBook() {
    if (!user) { router.push('/login'); return }
    setError(null)
    setNeedsProfile(false)
    setLoading(true)

    if (booked) {
      // Fetch the booking id, then cancel via API so notification fires
      const { data: booking } = await supabase
        .from('bookings')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .single()

      if (!booking) { setLoading(false); return }

      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Failed to cancel.'); setLoading(false); return }
      setBooked(false)
      router.refresh()
    } else {
      // Create booking via API so server-side profile/gender checks run
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId }),
      })

      if (res.ok) {
        setBooked(true)
        router.refresh()
      } else {
        const json = await res.json().catch(() => ({}))
        const msg: string = json.error ?? 'Failed to book event.'
        if (msg.toLowerCase().includes('complete your profile')) {
          setNeedsProfile(true)
        } else {
          setError(msg)
        }
      }
    }

    setLoading(false)
  }

  if (isFull && !booked) {
    return (
      <button disabled className="btn-secondary w-full opacity-60 cursor-not-allowed">
        Fully Booked
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={handleBook}
        disabled={loading}
        className={`w-full ${booked ? 'btn-secondary' : 'btn-primary'}`}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : booked ? (
          '✓ Cancel Booking'
        ) : isFree ? (
          'Join Event — Free'
        ) : (
          `Book Now — SAR ${price ?? 0}`
        )}
      </button>

      {needsProfile && (
        <div className="mt-2 text-sm rounded-xl px-4 py-3 bg-yellow-50 text-yellow-800 border border-yellow-200">
          Please{' '}
          <Link href="/profile" className="font-semibold underline">
            complete your profile
          </Link>{' '}
          (name, gender, city) before booking.
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
