import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException, BadRequestException } from '@/lib/errors'

const JoinWaitlistSchema = z.object({
  event_id: z.string().uuid(),
})

// POST /api/waitlist — join the waitlist for a full event
export async function POST(req: NextRequest) {
  try {
    const ctx   = await requireAuth()
    const body  = await req.json()
    const input = JoinWaitlistSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    // Verify event exists, is published, and is actually full
    const { data: event } = await supabase
      .from('events')
      .select('id, is_published, is_cancelled, capacity, bookings_count')
      .eq('id', input.event_id)
      .single()

    if (!event) throw new NotFoundException('Event')
    if (!event.is_published || event.is_cancelled) {
      throw new ForbiddenException('Event is not available')
    }
    if (event.capacity === null || event.bookings_count < event.capacity) {
      throw new BadRequestException('Event is not full yet — book directly instead')
    }

    // Check user doesn't already have a confirmed booking
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('user_id', ctx.userId)
      .eq('event_id', input.event_id)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (existingBooking) {
      throw new BadRequestException('You already have a booking for this event')
    }

    // position is assigned by DB trigger fn_assign_waitlist_position
    const { data, error } = await supabase
      .from('waitlist')
      .insert({ event_id: input.event_id, user_id: ctx.userId, position: 0 })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('You are already on the waitlist for this event')
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

    if (!eventId) throw new BadRequestException('event_id is required')

    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
      .from('waitlist')
      .update({ status: 'cancelled' })
      .eq('event_id', eventId)
      .eq('user_id', ctx.userId)
      .eq('status', 'waiting')

    if (error) throw error

    return ok({ message: 'Removed from waitlist' })
  } catch (err) {
    return handleApiError(err)
  }
}
