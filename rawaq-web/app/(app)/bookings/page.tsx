import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatTime } from '@/lib/utils'

export const metadata: Metadata = { title: 'My Bookings' }

export default async function BookingsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  type BookingRow = {
    id: string; status: string; ticket_id: string | null
    event: { id: string; title: string; start_at: string; city: string; is_free: boolean; price: number | null; is_cancelled: boolean } | null
  }

  const { data: bookingsRaw } = await supabase
    .from('bookings')
    .select(`
      id, status, ticket_id,
      event:events!event_id(id, title, start_at, city, is_free, price, is_cancelled)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const bookings = (bookingsRaw ?? []) as unknown as BookingRow[]

  const upcoming = bookings.filter(
    (b) => b.status === 'confirmed' && b.event && new Date(b.event.start_at) > new Date(),
  )
  const past = bookings.filter(
    (b) => b.event && new Date(b.event.start_at) <= new Date(),
  )
  const cancelled = bookings.filter((b) => b.status === 'cancelled')

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>

      <BookingSection title="Upcoming" bookings={upcoming} emptyIcon="📅" emptyText="No upcoming bookings" />
      <BookingSection title="Past Events" bookings={past} emptyIcon="🕰️" emptyText="No past events" />
      {cancelled.length > 0 && (
        <BookingSection title="Cancelled" bookings={cancelled} />
      )}
    </div>
  )
}

function BookingSection({
  title,
  bookings,
  emptyIcon,
  emptyText,
}: {
  title: string
  bookings: Array<{ id: string; status: string; ticket_id?: string | null; event: { id: string; title: string; start_at: string; city: string; is_free: boolean; price: number | null; is_cancelled: boolean } | null }>
  emptyIcon?: string
  emptyText?: string
}) {
  return (
    <section>
      <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">{title} ({bookings.length})</h2>

      {bookings.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyIcon} {emptyText}</p>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
            >
              <Link href={`/events/${booking.event?.id}`} className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center text-2xl shrink-0">
                📅
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/events/${booking.event?.id}`}>
                  <p className="text-sm font-semibold text-gray-900 truncate hover:underline">
                    {booking.event?.title ?? 'Event'}
                  </p>
                </Link>
                <p className="text-xs text-gray-500 mt-0.5">
                  {booking.event ? `${formatDate(booking.event.start_at)} · ${booking.event.city}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={
                    booking.status === 'cancelled' ? 'red' :
                    booking.event?.is_cancelled ? 'red' :
                    'green'
                  }
                >
                  {booking.event?.is_cancelled ? 'Event Cancelled' : booking.status}
                </Badge>
                {booking.status === 'confirmed' && !booking.event?.is_cancelled && (
                  <Link
                    href={`/bookings/${booking.id}/ticket`}
                    className="text-xs font-semibold text-brand-600 border border-brand-200 px-2.5 py-1 rounded-lg hover:bg-brand-50 transition"
                  >
                    🎟️ Ticket
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
