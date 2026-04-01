import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import BookingsClient from './BookingsClient'

export const metadata: Metadata = { title: 'My Bookings' }

export type BookingRow = {
  id: string
  status: string
  ticket_id: string | null
  event: {
    id: string
    title: string
    start_at: string
    city: string
    is_free: boolean
    price: number | null
    is_cancelled: boolean
  } | null
}

export default async function BookingsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: bookingsRaw } = await supabase
    .from('bookings')
    .select(`
      id, status, ticket_id,
      event:events!event_id(id, title, start_at, city, is_free, price, is_cancelled)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const bookings = (bookingsRaw ?? []) as unknown as BookingRow[]

  return <BookingsClient initialBookings={bookings} />
}
