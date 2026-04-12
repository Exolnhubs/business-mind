import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { requireAuth } from '@/lib/auth'
import { canUseTicketScanner, getOrganizerPlanAccess } from '@/lib/plans'

type BookingGetShape = {
  id: string; status: string; ticket_id: string | null; seat: string | null; scanned_at: string | null
  event: { id: string; title: string; start_at: string; venue_name: string | null; city: string } | null
  profile: { display_name: string; avatar_url: string | null } | null
}

type BookingPostShape = {
  id: string; status: string; ticket_id: string | null; seat: string | null; scanned_at: string | null
  event: { id: string; organizer_id: string; title: string; start_at: string; venue_name: string | null; city: string } | null
  profile: { display_name: string } | null
}

/**
 * GET /api/tickets/verify?t=RWQ-XXXXXXXX
 *
 * Quick lookup — returns event + attendee info for the ticket.
 * Used when a QR code is scanned: scanner navigates here and sees a confirmation page.
 */
export async function GET(req: NextRequest) {
  try {
    const ticketId = req.nextUrl.searchParams.get('t')
    if (!ticketId) throw new NotFoundException('Ticket ID')

    const supabase = await createSupabaseServerClient()

    const { data: raw, error } = await supabase
      .from('bookings')
      .select(`
        id, status, ticket_id, seat, scanned_at,
        event:events!event_id(id, title, start_at, venue_name, city),
        profile:profiles!user_id(display_name, avatar_url)
      `)
      .eq('ticket_id', ticketId)
      .single()

    const booking = raw as BookingGetShape | null
    if (error || !booking) throw new NotFoundException('Ticket')
    if (booking.status !== 'confirmed') {
      throw new ForbiddenException(`Ticket is ${booking.status}`)
    }

    return ok({
      ticket_id: booking.ticket_id,
      status: booking.status,
      scanned_at: booking.scanned_at,
      seat: booking.seat,
      event: booking.event,
      attendee: booking.profile,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

/**
 * POST /api/tickets/verify
 * Body: { ticket_id: string }
 *
 * Marks the ticket as scanned. Only organizers/admins of the event may call this.
 * Idempotent — scanning twice returns the original scan timestamp.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const { ticket_id } = await req.json()
    if (!ticket_id) throw new NotFoundException('Ticket ID')

    const admin = createSupabaseAdminClient()

    if (ctx.role !== 'admin') {
      const plan = await getOrganizerPlanAccess(ctx.userId)
      if (!canUseTicketScanner(plan)) {
        throw new ForbiddenException('QR scanning is available on Pro and Elite organizer plans.')
      }
    }

    // Fetch booking + event to check organizer ownership
    const { data: raw, error } = await admin
      .from('bookings')
      .select(`
        id, status, ticket_id, seat, scanned_at,
        event:events!event_id(id, organizer_id, title, start_at, venue_name, city),
        profile:profiles!user_id(display_name)
      `)
      .eq('ticket_id', ticket_id)
      .single()

    const booking = raw as BookingPostShape | null
    if (error || !booking) throw new NotFoundException('Ticket')

    const event = booking.event

    // Check caller is the event organizer or an admin
    const { data: callerRaw } = await admin
      .from('profiles')
      .select('role')
      .eq('id', ctx.userId)
      .single()

    const callerProfile = callerRaw as { role: string } | null

    if (callerProfile?.role !== 'admin' && event?.organizer_id !== ctx.userId) {
      throw new ForbiddenException('Only the event organizer can scan tickets')
    }

    if (booking.status !== 'confirmed') {
      throw new ForbiddenException(`Ticket is ${booking.status}`)
    }

    // Already scanned — idempotent, return existing scan info
    if (booking.scanned_at) {
      return ok({
        already_scanned: true,
        scanned_at: booking.scanned_at,
        ticket_id: booking.ticket_id,
        seat: booking.seat,
        attendee: booking.profile,
        event,
      })
    }

    // Mark as scanned
    const now = new Date().toISOString()
    const { error: updateErr } = await admin
      .from('bookings')
      .update({ scanned_at: now } as never)
      .eq('id', booking.id)

    if (updateErr) throw updateErr

    return ok({
      already_scanned: false,
      scanned_at: now,
      ticket_id: booking.ticket_id,
      seat: booking.seat,
      attendee: booking.profile,
      event,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
