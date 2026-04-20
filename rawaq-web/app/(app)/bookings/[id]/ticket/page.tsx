import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { generateTicketQR } from '@/lib/qr'
import { formatDate, formatTime } from '@/lib/utils'
import {
  TicketBackLink,
  TicketBandLabel,
  TicketGuestLabel,
  TicketQrHint,
  TicketCompanionRef,
  TicketViewEventBtn,
  PrintButton,
  TicketInfoRowLabel,
} from '@/components/bookings/TicketStrings'

export const metadata: Metadata = { title: 'Your Ticket' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function TicketPage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  type EventShape = {
    id: string; title: string; title_ar: string | null; start_at: string; end_at: string | null
    venue_name: string | null; venue_name_ar: string | null; address: string | null; city: string
    cover_image_url: string | null; organizer: { display_name: string } | null
  }
  type BookingShape = {
    id: string; status: string; ticket_id: string | null; seat: string | null; created_at: string
    group_size: number
    occurrence: { starts_at: string; ends_at: string | null } | null
    event: EventShape | null
  }

  const { data: bookingRaw } = await supabase
    .from('bookings')
    .select(`
      id, status, ticket_id, seat, created_at,
      occurrence:event_occurrences!occurrence_id(starts_at, ends_at),
      event:events!event_id(
        id, title, title_ar, start_at, end_at,
        venue_name, venue_name_ar, address, city, cover_image_url,
        organizer:profiles!organizer_id(display_name)
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const booking = bookingRaw as BookingShape | null

  if (!booking || !booking.ticket_id) notFound()

  const event = booking.event!
  const displayStartAt = booking.occurrence?.starts_at ?? event.start_at
  const displayEndAt = booking.occurrence?.ends_at ?? event.end_at

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  // profile type assertion
  const profileData = profile as { display_name: string } | null

  // Fetch group_size and dependent holders — resilient if migration pending
  type HolderShape = { id: string; full_name: string; date_of_birth: string; relation: string; position: number }
  let groupSize = 1
  let holders: HolderShape[] = []
  try {
    const admin = createSupabaseAdminClient()
    const { data: bookingMeta } = await admin
      .from('bookings')
      .select('group_size')
      .eq('id', id)
      .single()
    groupSize = (bookingMeta as any)?.group_size ?? 1

    if (groupSize > 1) {
      const { data: holderRows } = await admin
        .from('booking_holders' as any)
        .select('id, full_name, date_of_birth, relation, position')
        .eq('booking_id', id)
        .order('position')
      holders = (holderRows ?? []) as unknown as HolderShape[]
    }
  } catch {
    // booking_holders table may not exist yet (migration pending)
  }

  const qrDataUrl = await generateTicketQR(booking.ticket_id)

  const isActive = booking.status === 'confirmed'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      {/* Print/Download hint */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <TicketBackLink />
        <button
          onClick={undefined}
          className="text-sm text-brand-600 hover:underline print:hidden"
          id="print-btn"
        />
      </div>

      {/* Ticket card */}
      <div
        className={`w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden ticket-card ${!isActive ? 'opacity-60' : ''}`}
        id="ticket"
      >
        {/* Top band */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 px-8 py-6 text-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-lg font-bold tracking-tight">Rawaq 🌟</span>
            {!isActive && (
              <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                {booking.status}
              </span>
            )}
          </div>
          <TicketBandLabel />
        </div>

        {/* Event info */}
        <div className="px-8 pt-6 pb-4">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{event.title}</h1>
          {event.title_ar && (
            <p className="text-sm text-gray-500 mt-0.5 text-right font-medium" dir="rtl">{event.title_ar}</p>
          )}

          <div className="mt-5 space-y-3 text-sm">
            <InfoRow icon="📅" labelKey="ticket.info.date" value={formatDate(displayStartAt)} />
            <InfoRow icon="🕐" labelKey="ticket.info.time" value={formatTime(displayStartAt) + (displayEndAt ? ` - ${formatTime(displayEndAt)}` : '')} />
            <InfoRow icon="📍" labelKey="ticket.info.venue" value={event.venue_name ?? event.city} />
            {event.address && <InfoRow icon="🗺️" labelKey="ticket.info.address" value={event.address} />}
            <InfoRow icon="👤" labelKey="ticket.info.attendee" value={profileData?.display_name ?? user.email ?? ''} />
            {booking.seat && <InfoRow icon="💺" labelKey="ticket.info.seat" value={booking.seat} />}
          </div>
        </div>

        {/* Divider with cut-out effect */}
        <div className="relative my-2 flex items-center px-4">
          <div className="absolute -left-4 w-8 h-8 rounded-full bg-gray-50" />
          <div className="flex-1 border-t-2 border-dashed border-gray-200 mx-6" />
          <div className="absolute -right-4 w-8 h-8 rounded-full bg-gray-50" />
        </div>

        {/* QR section */}
        <div className="px-8 pt-4 pb-8 flex flex-col items-center">
          <div className="p-3 bg-white border-2 border-gray-100 rounded-2xl shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Ticket QR Code" width={200} height={200} className="block" />
          </div>
          <p className="mt-3 font-mono text-base font-bold text-gray-800 tracking-widest">
            {booking.ticket_id}
          </p>
          <TicketQrHint />
        </div>
      </div>

      {/* Dependent holder tickets */}
      {holders.map((holder) => (
        <div
          key={holder.id}
          className="w-full max-w-md bg-white rounded-3xl shadow-lg overflow-hidden mt-4"
        >
          <div className="bg-gradient-to-r from-gray-500 to-gray-400 px-8 py-4 text-white">
            <TicketGuestLabel position={holder.position} />
            <p className="text-lg font-bold tracking-tight mt-0.5">Rawaq 🌟</p>
          </div>
          <div className="px-8 py-5 space-y-3 text-sm">
            <InfoRow icon="📅" labelKey="ticket.info.date" value={formatDate(displayStartAt)} />
            <InfoRow icon="🕐" labelKey="ticket.info.time" value={formatTime(displayStartAt) + (displayEndAt ? ` - ${formatTime(displayEndAt)}` : '')} />
            <InfoRow icon="📍" labelKey="ticket.info.venue" value={event.venue_name ?? event.city} />
            <InfoRow icon="👤" labelKey="ticket.info.attendee" value={holder.full_name} />
            <InfoRow icon="🎂" labelKey="ticket.info.dob" value={holder.date_of_birth} />
            <InfoRow icon="👥" labelKey="ticket.info.relation" value={holder.relation} />
          </div>
          <div className="px-8 pb-6 text-center">
            <TicketCompanionRef ref={booking.ticket_id?.slice(-8).toUpperCase() ?? ''} />
          </div>
        </div>
      ))}

      {/* Action buttons */}
      <div className="mt-6 flex gap-3 print:hidden">
        <PrintButton />
        <TicketViewEventBtn href={`/events/${event.id}`} />
      </div>

      <style>{`
        @media print {
          body > *:not(#ticket) { display: none !important; }
          #ticket { box-shadow: none !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  )
}

function InfoRow({ icon, labelKey, value }: { icon: string; labelKey: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-base shrink-0 w-5 text-center">{icon}</span>
      <div className="min-w-0">
        <TicketInfoRowLabel labelKey={labelKey} />
        <p className="text-gray-800 font-medium truncate">{value}</p>
      </div>
    </div>
  )
}
