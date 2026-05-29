import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireOrganizer } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { checkRateLimit, limiters } from '@/lib/rate-limit'
import { canUseTicketScanner, getOrganizerPlanAccess } from '@/lib/plans'
import { z } from 'zod'

const ScanSchema = z.object({
  ticket_id: z.string().min(1),
})

function getScanOpensAt(startsAt: string) {
  return new Date(new Date(startsAt).getTime() - 3 * 60 * 60 * 1000)
}

function formatScanOpensAt(value: Date) {
  return value.toLocaleString('en-SA-u-ca-gregory', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function isScannableOccurrenceStatus(status: string | null | undefined) {
  return status === 'scheduled' || status === 'completed'
}

// POST /api/bookings/scan
// Organizer scans a QR code to check in an attendee.
// Body: { ticket_id: string }
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrganizer()
    await checkRateLimit(limiters.scan, ctx.userId)
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
      .select('id, status, scanned_at, event_id, occurrence_id, user_id, events!inner(id, organizer_id, title), occurrence:event_occurrences!occurrence_id(id, starts_at, ends_at, status)')
      .eq('ticket_id', ticket_id)
      .single()

    if (error || !booking) throw new NotFoundException('Ticket')

    // Verify organizer owns the event (admins bypass)
    const event = (booking as unknown as { events: { id: string; organizer_id: string; title: string } }).events
    const occurrence = (booking as unknown as {
      occurrence: { id: string; starts_at: string; ends_at: string | null; status: string | null } | null
    }).occurrence
    if (ctx.role !== 'admin' && event.organizer_id !== ctx.userId) {
      throw new ForbiddenException('You do not own this event')
    }

    if (!occurrence || !isScannableOccurrenceStatus(occurrence.status)) {
      throw new ForbiddenException('QR scanning is not available for this event occurrence.')
    }

    const scanOpensAt = getScanOpensAt(occurrence.starts_at)
    if (Date.now() < scanOpensAt.getTime()) {
      return ok({
        valid: false,
        reason: 'scan_not_open_yet',
        message: `Scanning for this event is valid at ${formatScanOpensAt(scanOpensAt)}.`,
        booking_id: booking.id,
        occurrence_id: occurrence.id,
        event_title: event.title,
      })
    }

    if (booking.status !== 'confirmed') {
      return ok({
        valid: false,
        reason: 'booking_not_confirmed',
        message: `Booking status is "${booking.status}" — not valid for entry`,
        booking_id: booking.id,
        occurrence_id: occurrence.id,
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
        occurrence_id: occurrence.id,
        event_title: event.title,
      })
    }

    // Mark as scanned
    await admin
      .from('bookings')
      .update({ scanned_at: new Date().toISOString() } as never)
      .eq('id', booking.id)

    return ok({
      valid: true,
      booking_id: booking.id,
      event_id: event.id,
      occurrence_id: occurrence.id,
      event_title: event.title,
      scanned_at: new Date().toISOString(),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
