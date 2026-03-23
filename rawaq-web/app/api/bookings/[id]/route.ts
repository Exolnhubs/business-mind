import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'
import { UpdateBookingSchema } from '@/lib/validations/bookings'

// PATCH /api/bookings/:id — cancel or update booking status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    const body = await req.json()
    const input = UpdateBookingSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    // Fetch booking — RLS ensures only owner can see their booking
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, user_id, event_id, status')
      .eq('id', id)
      .single()

    if (fetchErr || !booking) throw new NotFoundException('Booking')

    // Non-admins can only cancel their own bookings
    if (ctx.role !== 'admin' && booking.user_id !== ctx.userId) {
      throw new ForbiddenException()
    }

    // Regular users can only cancel
    if (ctx.role === 'user' && input.status !== 'cancelled') {
      throw new ForbiddenException('Users can only cancel bookings')
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({ status: input.status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}
