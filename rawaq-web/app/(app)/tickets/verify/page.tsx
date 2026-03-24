import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatDate, formatTime } from '@/lib/utils'

export const metadata: Metadata = { title: 'Ticket Verification' }

interface Props {
  searchParams: Promise<{ t?: string }>
}

export default async function TicketVerifyPage({ searchParams }: Props) {
  const { t: ticketId } = await searchParams
  if (!ticketId) notFound()

  const supabase = await createSupabaseServerClient()

  type BookingShape = {
    id: string; status: string; ticket_id: string | null; seat: string | null; scanned_at: string | null
    event: { id: string; title: string; start_at: string; venue_name: string | null; city: string } | null
    profile: { display_name: string } | null
  }

  const { data: bookingRaw } = await supabase
    .from('bookings')
    .select(`
      id, status, ticket_id, seat, scanned_at,
      event:events!event_id(id, title, start_at, venue_name, city),
      profile:profiles!user_id(display_name)
    `)
    .eq('ticket_id', ticketId)
    .single()

  const booking = bookingRaw as BookingShape | null

  if (!booking) {
    return <VerifyResult ok={false} message="Ticket not found" ticketId={ticketId} />
  }

  const event = booking.event
  const attendee = booking.profile

  if (booking.status !== 'confirmed') {
    return (
      <VerifyResult
        ok={false}
        message={`Ticket is ${booking.status}`}
        ticketId={ticketId}
        attendee={attendee?.display_name}
        event={event?.title}
      />
    )
  }

  if (booking.scanned_at) {
    return (
      <VerifyResult
        ok={false}
        warn
        message="Already scanned"
        detail={`First scanned at ${new Date(booking.scanned_at).toLocaleString()}`}
        ticketId={ticketId}
        attendee={attendee?.display_name}
        event={event?.title}
        seat={booking.seat}
      />
    )
  }

  return (
    <VerifyResult
      ok={true}
      message="Valid Ticket ✅"
      ticketId={ticketId}
      attendee={attendee?.display_name}
      event={event?.title}
      eventDate={event?.start_at ? `${formatDate(event.start_at)} at ${formatTime(event.start_at)}` : undefined}
      venue={event?.venue_name ?? event?.city}
      seat={booking.seat}
    />
  )
}

function VerifyResult({
  ok,
  warn,
  message,
  detail,
  ticketId,
  attendee,
  event,
  eventDate,
  venue,
  seat,
}: {
  ok: boolean
  warn?: boolean
  message: string
  detail?: string
  ticketId: string
  attendee?: string | null
  event?: string | null
  eventDate?: string
  venue?: string | null
  seat?: string | null
}) {
  const bg = ok ? 'bg-green-50' : warn ? 'bg-amber-50' : 'bg-red-50'
  const border = ok ? 'border-green-200' : warn ? 'border-amber-200' : 'border-red-200'
  const icon = ok ? '✅' : warn ? '⚠️' : '❌'
  const textColor = ok ? 'text-green-800' : warn ? 'text-amber-800' : 'text-red-800'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className={`w-full max-w-sm rounded-3xl border-2 ${border} ${bg} p-8 text-center shadow-xl`}>
        <div className="text-5xl mb-4">{icon}</div>
        <h1 className={`text-xl font-bold ${textColor} mb-1`}>{message}</h1>
        {detail && <p className="text-sm text-gray-500 mb-4">{detail}</p>}

        {(attendee || event) && (
          <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-4 text-left space-y-2 shadow-sm">
            {attendee && <Row label="Attendee" value={attendee} />}
            {event && <Row label="Event" value={event} />}
            {eventDate && <Row label="Date" value={eventDate} />}
            {venue && <Row label="Venue" value={venue} />}
            {seat && <Row label="Seat" value={seat} />}
            <Row label="Ticket ID" value={ticketId} mono />
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={`text-gray-900 font-medium text-right ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</span>
    </div>
  )
}
