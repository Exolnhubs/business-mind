import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOrganizer } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { canUseTicketScanner, getOrganizerPlanAccess } from '@/lib/plans'
import { z } from 'zod'
import { hasResolvedEventEnded } from '@/lib/events/recurrence'

const ScanSchema = z.object({
  ticket_id: z.string().min(1),
})

// POST /api/bookings/scan
// Organizer scans a QR code to check in an attendee.
// Body: { ticket_id: string }
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrganizer()
    const body = await req.json()
    const { ticket_id } = ScanSchema.parse(body)

    const admin = createSupabaseAdminClient()

    if (ctx.role !== 'admin') {
      const plan = await getOrganizerPlanAccess(ctx.userId)
      if (!canUseTicketScanner(plan)) {
        throw new ForbiddenException('QR scanning is available on Pro and Elite organizer plans.')
      }
    }

    // Look up the booking by ticket_id
    const { data: booking, error } = await admin
      .from('bookings')
      .select('id, status, scanned_at, event_id, user_id, events!inner(id, organizer_id, title, start_at, end_at, event_frequency)')
      .eq('ticket_id', ticket_id)
      .single()

    if (error || !booking) throw new NotFoundException('Ticket')

    // Verify organizer owns the event (admins bypass)
    const event = (booking as any).events
    if (ctx.role !== 'admin' && event.organizer_id !== ctx.userId) {
      throw new ForbiddenException('You do not own this event')
    }

    if (hasResolvedEventEnded(event)) {
      throw new ForbiddenException('QR scanning is closed because this event has already ended.')
    }

    if (booking.status !== 'confirmed') {
      return ok({
        valid: false,
        reason: 'booking_not_confirmed',
        message: `Booking status is "${booking.status}" — not valid for entry`,
        booking_id: booking.id,
        event_title: event.title,
      })
    }

    if (booking.scanned_at) {
      return ok({
        valid: false,
        already_scanned: true,
        reason: 'already_scanned',
        message: 'Ticket was already scanned',
        scanned_at: booking.scanned_at,
        booking_id: booking.id,
        event_title: event.title,
      })
    }

    // Mark as scanned
    await admin
      .from('bookings')
      .update({ scanned_at: new Date().toISOString() } as any)
      .eq('id', booking.id)

    return ok({
      valid: true,
      booking_id: booking.id,
      event_id: event.id,
      event_title: event.title,
      scanned_at: new Date().toISOString(),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
