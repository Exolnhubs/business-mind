import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException } from '@/lib/errors'

const TicketTypeSchema = z.object({
  name:              z.string().min(1).max(100),
  name_ar:           z.string().max(100).optional().nullable(),
  description:       z.string().max(500).optional().nullable(),
  price:             z.number().min(0),
  capacity:          z.number().int().positive().optional().nullable(),
  is_free:           z.boolean().default(false),
  sale_starts_at:    z.string().datetime().optional().nullable(),
  sale_ends_at:      z.string().datetime().optional().nullable(),
  sort_order:        z.number().int().default(0),
  is_hot_offer:      z.boolean().default(false),
  hot_offer_price:   z.number().min(0).optional().nullable(),
  hot_offer_ends_at: z.string().datetime().optional().nullable(),
})

// GET /api/events/[id]/ticket-types
// Public: returns active tickets only.
// Organizer: add ?organizer=1 to get all tickets (including inactive). Requires auth + ownership.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const isOrganizerView = req.nextUrl.searchParams.get('organizer') === '1'
    const supabase = await createSupabaseServerClient()

    if (isOrganizerView) {
      const ctx = await requireAuth()
      const { data: event } = await supabase
        .from('events').select('organizer_id').eq('id', eventId).single()
      if (!event) throw new NotFoundException('Event')
      if (event.organizer_id !== ctx.userId && ctx.role !== 'admin') {
        throw new ForbiddenException('Not your event')
      }

      const { data, error } = await supabase
        .from('ticket_types')
        .select('*')
        .eq('event_id', eventId)
        .order('sort_order')
      if (error) throw error
      return ok(data ?? [])
    }

    const { data, error } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw error
    return ok(data ?? [])
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/events/[id]/ticket-types — organizer only
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth()
    const { id: eventId } = await params
    const supabase = await createSupabaseServerClient()

    const { data: event } = await supabase
      .from('events').select('id, organizer_id').eq('id', eventId).single()
    if (!event) throw new NotFoundException('Event')
    if (event.organizer_id !== ctx.userId && ctx.role !== 'admin') {
      throw new ForbiddenException('Not your event')
    }

    const body  = await req.json()
    const input = TicketTypeSchema.parse(body)

    const { data, error } = await supabase
      .from('ticket_types')
      .insert({ ...input, event_id: eventId } as any)
      .select()
      .single()
    if (error) throw error
    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}
