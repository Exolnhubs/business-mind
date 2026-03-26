import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, ForbiddenException, ConflictException } from '@/lib/errors'

const CreatePromoSchema = z.object({
  code:             z.string().min(3).max(32).regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase alphanumeric'),
  event_id:         z.string().uuid().optional().nullable(),
  discount_type:    z.enum(['percent', 'fixed']),
  discount_value:   z.number().positive().max(100, 'Percent discount cannot exceed 100'),
  max_uses:         z.number().int().positive().optional().nullable(),
  min_order_amount: z.number().min(0).default(0),
  expires_at:       z.string().datetime().optional().nullable(),
})

// GET /api/promo-codes — list codes for organizer (their events) or admin (all)
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const page    = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1))
    const perPage = 20
    const from    = (page - 1) * perPage
    const eventId = req.nextUrl.searchParams.get('event_id')

    let query = supabase
      .from('promo_codes')
      .select('*, event:events(id, title)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (ctx.role === 'admin') {
      // Admin can see all, optionally filtered by event
      if (eventId) query = query.eq('event_id', eventId)
    } else {
      // Organizer sees only codes for their events
      query = query.eq('created_by', ctx.userId)
    }

    const { data, count, error } = await query
    if (error) throw error

    return ok({ data: data ?? [], total: count ?? 0, page, per_page: perPage })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST /api/promo-codes — create a new promo code
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth()
    const body = await req.json()
    const input = CreatePromoSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    // Platform-wide codes (event_id = null) require admin
    if (!input.event_id && ctx.role !== 'admin') {
      throw new ForbiddenException('Only admins can create platform-wide promo codes')
    }

    // For event-specific codes, verify organizer owns the event
    if (input.event_id) {
      const { data: event } = await supabase
        .from('events').select('organizer_id').eq('id', input.event_id).single()
      if (!event) throw new ForbiddenException('Event not found')
      if (event.organizer_id !== ctx.userId && ctx.role !== 'admin') {
        throw new ForbiddenException('Not your event')
      }
    }

    const { data, error } = await supabase
      .from('promo_codes')
      .insert({ ...input, created_by: ctx.userId } as any)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') throw new ConflictException('Promo code already exists for this event')
      throw error
    }

    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}
