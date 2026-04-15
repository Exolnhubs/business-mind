import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException, BadRequestException } from '@/lib/errors'
import { resolveTargetOccurrence } from '@/lib/events/occurrences'

const JoinWaitlistSchema = z.object({
  event_id: z.string().uuid(),
  occurrence_id: z.string().uuid().optional().nullable(),
})

// POST /api/waitlist — join the waitlist for a full event
export async function POST(req: NextRequest) {
  try {
    const ctx   = await requireAuth()
    const body  = await req.json()
    const input = JoinWaitlistSchema.parse(body)

    const supabase = await createSupabaseServerClient()
    const admin = createSupabaseAdminClient()

    // Verify event exists, is published, and is actually full
    const { data: event } = await supabase
      .from('events')
      .select('id, start_at, end_at, event_frequency, capacity, is_published, is_cancelled')
      .eq('id', input.event_id)
      .single()

    if (!event) throw new NotFoundException('Event')
    if (!event.is_published || event.is_cancelled) {
      throw new ForbiddenException('Event is not available')
    }
    const occurrence = await resolveTargetOccurrence(admin, event, ctx.userId, input.occurrence_id ?? null)
    if (occurrence.capacity === null || occurrence.bookings_count < occurrence.capacity) {
      throw new BadRequestException('Event is not full yet — book directly instead')
    }

    // Check user doesn't already have a confirmed booking
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('user_id', ctx.userId)
      .eq('occurrence_id', occurrence.id)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (existingBooking) {
      throw new BadRequestException('You already have a booking for this event occurrence')
    }

    // position is assigned by DB trigger fn_assign_waitlist_position
    const { data, error } = await supabase
      .from('waitlist')
      .insert({ event_id: input.event_id, occurrence_id: occurrence.id, user_id: ctx.userId, position: 0 } as any)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('You are already on the waitlist for this event occurrence')
      }
      throw error
    }

    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/waitlist?event_id=xxx — leave the waitlist
export async function DELETE(req: NextRequest) {
  try {
    const ctx     = await requireAuth()
    const eventId = req.nextUrl.searchParams.get('event_id')
    let occurrenceId = req.nextUrl.searchParams.get('occurrence_id')

    if (!eventId) throw new BadRequestException('event_id is required')

    const supabase = await createSupabaseServerClient()
    const admin = createSupabaseAdminClient()

    if (!occurrenceId) {
      const { data: existingWaitlist } = await supabase
        .from('waitlist')
        .select('occurrence_id')
        .eq('event_id', eventId)
        .eq('user_id', ctx.userId)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingWaitlist?.occurrence_id) {
        occurrenceId = existingWaitlist.occurrence_id
      } else {
        const { data: event } = await supabase
        .from('events')
        .select('id, start_at, end_at, event_frequency, capacity, is_cancelled')
        .eq('id', eventId)
        .single()

        if (!event) throw new NotFoundException('Event')
        occurrenceId = (await resolveTargetOccurrence(admin, event, ctx.userId)).id
      }
    }

    const { error } = await supabase
      .from('waitlist')
      .update({ status: 'cancelled' })
      .eq('occurrence_id', occurrenceId)
      .eq('user_id', ctx.userId)
      .eq('status', 'waiting')

    if (error) throw error

    return ok({ message: 'Removed from waitlist' })
  } catch (err) {
    return handleApiError(err)
  }
}
