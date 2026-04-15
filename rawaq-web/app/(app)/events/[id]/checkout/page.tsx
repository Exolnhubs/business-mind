import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { CheckoutForm } from '@/components/events/CheckoutForm'
import { formatDate, formatTime } from '@/lib/utils'
import type { TicketType } from '@/types/database'
import { ensureEventOccurrences } from '@/lib/events/occurrences'

interface Props {
  params:      Promise<{ id: string }>
  searchParams: Promise<{ ticket_type_id?: string; occurrence_id?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('events').select('title').eq('id', id).single()
  return { title: `Checkout — ${data?.title ?? 'Event'}` }
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { id } = await params
  const { ticket_type_id, occurrence_id } = await searchParams
  const supabase = await createSupabaseServerClient()
  const admin = createSupabaseAdminClient()

  // Must be logged in
  const { data: { user } } = await supabase.auth.getUser()
  const nextQuery = new URLSearchParams()
  if (ticket_type_id) nextQuery.set('ticket_type_id', ticket_type_id)
  if (occurrence_id) nextQuery.set('occurrence_id', occurrence_id)
  if (!user) redirect(`/login?next=/events/${id}/checkout${nextQuery.size ? `?${nextQuery.toString()}` : ''}`)

  // Fetch event
  const { data: event } = await supabase
    .from('events')
    .select('id, title, start_at, end_at, event_frequency, venue_name, city, country, cover_image_url, is_free, price, currency, is_cancelled, is_published, capacity, bookings_count')
    .eq('id', id)
    .single()

  if (!event || event.is_cancelled || !event.is_published) notFound()

  const occurrences = event.event_frequency !== 'one_time'
    ? await ensureEventOccurrences(admin, {
        id: event.id,
        start_at: event.start_at,
        end_at: event.end_at,
        event_frequency: event.event_frequency,
        capacity: event.capacity,
        is_cancelled: event.is_cancelled,
      })
    : []

  const selectedOccurrence = event.event_frequency === 'one_time'
    ? null
    : (occurrence_id
        ? occurrences.find((occurrence) => occurrence.id === occurrence_id) ?? null
        : (occurrences[0] ?? null))

  if (event.event_frequency !== 'one_time' && !selectedOccurrence) {
    redirect(`/events/${id}`)
  }

  // Already booked?
  let existingQuery = supabase
    .from('bookings')
    .select('id')
    .eq('event_id', id)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')

  if (selectedOccurrence) {
    existingQuery = existingQuery.eq('occurrence_id', selectedOccurrence.id)
  }

  const { data: existing } = await existingQuery.maybeSingle()

  if (selectedOccurrence && existing) redirect(`/events/${id}`)

  // Sold out?
  const startsAt = selectedOccurrence?.starts_at ?? event.start_at
  const endsAt = selectedOccurrence?.ends_at ?? event.end_at
  const capacity = selectedOccurrence?.capacity ?? event.capacity
  const bookingsCount = selectedOccurrence?.bookings_count ?? event.bookings_count
  const spotsLeft = capacity ? capacity - bookingsCount : null
  const isFull    = spotsLeft !== null && spotsLeft <= 0
  if (isFull) redirect(`/events/${id}`)

  // Ticket types
  const { data: rawTypes } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', id)
    .eq('is_active', true)
    .order('sort_order')

  const ticketTypes = (rawTypes ?? []) as TicketType[]

  // Validate pre-selected ticket type
  const validPreselect = ticket_type_id
    ? ticketTypes.find((t) => t.id === ticket_type_id)?.id ?? null
    : null

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Back link */}
      <Link href={`/events/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 group">
        <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
        Back to event
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

      <div className="space-y-5">
        {/* Event summary card */}
        <div className="card p-4 flex gap-4">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center shrink-0">
            {event.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.cover_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl">📅</span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 text-sm line-clamp-2">{event.title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDate(startsAt)} · {formatTime(startsAt)}
              {endsAt ? ` – ${formatTime(endsAt)}` : ''}
            </p>
            <p className="text-xs text-gray-500">
              {event.venue_name ? `${event.venue_name} · ` : ''}{event.city}
            </p>
            {selectedOccurrence && (
              <p className="mt-1 text-xs font-medium text-brand-600">Selected session</p>
            )}
          </div>
        </div>

        {/* Interactive checkout form */}
        <CheckoutForm
          eventId={id}
          eventTitle={event.title}
          occurrenceId={selectedOccurrence?.id ?? null}
          currency={event.currency ?? 'SAR'}
          ticketTypes={ticketTypes}
          preSelectedTypeId={validPreselect}
          isFree={event.is_free}
          eventPrice={event.price}
          isLoggedIn={!!user}
        />
      </div>
    </div>
  )
}
