'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'

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

  async function handleBook() {
    if (!user) { router.push('/login'); return }
    setError(null)
    setLoading(true)

    if (booked) {
      // Cancel booking
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')

      if (error) { setError(error.message); setLoading(false); return }
      setBooked(false)
      router.refresh()
    } else {
      // Create booking
      const { error } = await supabase
        .from('bookings')
        .upsert({ event_id: eventId, user_id: user.id, status: 'confirmed' }, { onConflict: 'event_id,user_id' })

      if (error) { setError(error.message); setLoading(false); return }
      setBooked(true)
      router.refresh()
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
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
