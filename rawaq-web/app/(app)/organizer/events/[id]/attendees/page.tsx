import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Attendees' }

export const dynamic = 'force-dynamic'

interface AttendeeRow {
  id: string
  status: string
  created_at: string
  group_size: number
  user: {
    display_name: string
    avatar_url: string | null
    city: string | null
  } | null
  holders: {
    id: string
    full_name: string
    date_of_birth: string
    relation: string
    position: number
  }[]
}

export default async function AttendeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Verify the event belongs to this organizer
  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_at, capacity, bookings_count')
    .eq('id', id)
    .eq('organizer_id', user!.id)
    .single()

  if (!event) notFound()

  // Use admin client so RLS doesn't restrict reading booking_holders (organizer access)
  const admin = createSupabaseAdminClient()

  const { data: rawBookings } = await admin
    .from('bookings')
    .select('id, status, created_at, group_size, user:profiles!user_id(display_name, avatar_url, city)')
    .eq('event_id', id)
    .order('created_at', { ascending: true })

  const baseBookings = (rawBookings ?? []) as unknown as Omit<AttendeeRow, 'holders'>[]

  // Fetch holders separately — resilient if migration 00068 hasn't been applied yet
  type HolderRow = { id: string; booking_id: string; full_name: string; date_of_birth: string; relation: string; position: number }
  let holdersByBookingId: Record<string, HolderRow[]> = {}
  try {
    const bookingIds = baseBookings.map((b) => b.id)
    if (bookingIds.length > 0) {
      const { data: holderRows } = await admin
        .from('booking_holders' as any)
        .select('id, booking_id, full_name, date_of_birth, relation, position')
        .in('booking_id', bookingIds)
      ;((holderRows ?? []) as unknown as HolderRow[]).forEach((h: HolderRow) => {
        if (!holdersByBookingId[h.booking_id]) holdersByBookingId[h.booking_id] = []
        holdersByBookingId[h.booking_id].push(h)
      })
    }
  } catch {
    // booking_holders table may not exist yet (migration pending) — silently skip
  }

  const bookings: AttendeeRow[] = baseBookings.map((b) => ({
    ...b,
    group_size: (b as any).group_size ?? 1,
    holders: holdersByBookingId[b.id] ?? [],
  }))
  const confirmed = bookings.filter((b) => b.status === 'confirmed')
  const cancelled  = bookings.filter((b) => b.status === 'cancelled')

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/organizer" className="text-gray-400 hover:text-gray-600 mt-1 text-sm">← Back</Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{event.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatDate(event.start_at)}
            {event.capacity && (
              <span className="ml-2 text-gray-400">
                · {confirmed.length} / {event.capacity} spots filled
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Confirmed attendees */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
            Confirmed Attendees
          </h2>
          <Badge variant="green">{confirmed.length}</Badge>
        </div>

        {confirmed.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">No confirmed bookings yet.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendee</th>
                  <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">City</th>
                  <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Booked</th>
                  <th className="text-start px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {confirmed.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                          {(booking.user?.display_name ?? '?')[0]}
                        </div>
                        <div>
                          <p className="font-medium">{booking.user?.display_name ?? '—'}</p>
                          {booking.group_size > 1 && (
                            <p className="text-xs text-brand-600 font-medium mt-0.5">
                              👥 +{booking.group_size - 1} guest{booking.group_size > 2 ? 's' : ''}
                            </p>
                          )}
                          {booking.holders.map((h) => (
                            <p key={h.id} className="text-xs text-gray-500 mt-0.5">
                              {h.position}. {h.full_name} · {h.relation} · {h.date_of_birth}
                            </p>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                      {booking.user?.city ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                      {formatDate(booking.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-mono">
                        {booking.id.slice(-8).toUpperCase()}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Cancelled (collapsed summary) */}
      {cancelled.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-400 text-sm uppercase tracking-wide mb-3">
            Cancelled ({cancelled.length})
          </h2>
          <div className="card overflow-hidden opacity-60">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {cancelled.map((booking) => (
                  <tr key={booking.id} className="px-4">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                          {(booking.user?.display_name ?? '?')[0]}
                        </div>
                        <span className="text-gray-500 text-sm line-through">
                          {booking.user?.display_name ?? 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-300 text-xs">
                      <code>{booking.id.slice(-8).toUpperCase()}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
