import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, NotFoundException, ForbiddenException } from '@/lib/errors'

const UpdateTicketTypeSchema = z.object({
  name:              z.string().min(1).max(100).optional(),
  name_ar:           z.string().max(100).optional().nullable(),
  description:       z.string().max(500).optional().nullable(),
  price:             z.number().min(0).optional(),
  capacity:          z.number().int().positive().optional().nullable(),
  is_free:           z.boolean().optional(),
  sale_starts_at:    z.string().datetime().optional().nullable(),
  sale_ends_at:      z.string().datetime().optional().nullable(),
  sort_order:        z.number().int().optional(),
  is_active:         z.boolean().optional(),
  is_hot_offer:      z.boolean().optional(),
  hot_offer_price:   z.number().min(0).optional().nullable(),
  hot_offer_ends_at: z.string().datetime().optional().nullable(),
})

type Ctx = { params: Promise<{ id: string; typeId: string }> }

// PATCH /api/events/[id]/ticket-types/[typeId]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id: eventId, typeId } = await params
    const ctx = await requireAuth()
    const supabase = createSupabaseAdminClient()

    const { data: event } = await supabase
      .from('events').select('organizer_id').eq('id', eventId).single()
    if (!event) throw new NotFoundException('Event')
    if (event.organizer_id !== ctx.userId && ctx.role !== 'admin') {
      throw new ForbiddenException('Not your event')
    }

    const body  = await req.json()
    const input = UpdateTicketTypeSchema.parse(body)

    const { data, error } = await supabase
      .from('ticket_types')
      .update(input)
      .eq('id', typeId)
      .eq('event_id', eventId)
      .select()
      .single()

    if (error) throw error
    if (!data) throw new NotFoundException('Ticket type')

    return ok(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// DELETE /api/events/[id]/ticket-types/[typeId]
// Soft-deletes by setting is_active = false (preserves sold bookings)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id: eventId, typeId } = await params
    const ctx = await requireAuth()
    const supabase = createSupabaseAdminClient()

    const { data: event } = await supabase
      .from('events').select('organizer_id').eq('id', eventId).single()
    if (!event) throw new NotFoundException('Event')
    if (event.organizer_id !== ctx.userId && ctx.role !== 'admin') {
      throw new ForbiddenException('Not your event')
    }

    // Check if any confirmed bookings use this type — soft-delete only
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_type_id', typeId)
      .eq('status', 'confirmed')

    if ((count ?? 0) > 0) {
      // Deactivate instead of deleting to preserve booking history
      const { error } = await supabase
        .from('ticket_types')
        .update({ is_active: false })
        .eq('id', typeId)
        .eq('event_id', eventId)
      if (error) throw error
      return ok({ deleted: false, deactivated: true, reason: 'Has confirmed bookings — deactivated instead' })
    }

    const { error } = await supabase
      .from('ticket_types')
      .delete()
      .eq('id', typeId)
      .eq('event_id', eventId)

    if (error) throw error
    return ok({ deleted: true })
  } catch (err) {
    return handleApiError(err)
  }
}
