import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, ok, created, NotFoundException, ForbiddenException } from '@/lib/errors'

const ReportSchema = z.object({
  reason:  z.enum(['spam', 'inappropriate', 'harassment', 'misinformation', 'other']),
  details: z.string().max(1000).optional(),
})

// POST /api/events/:id/report
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const ctx = await requireAuth()
    const body = await req.json()
    const input = ReportSchema.parse(body)

    const supabase = await createSupabaseServerClient()

    const { data: event } = await supabase
      .from('events').select('id').eq('id', eventId).single()
    if (!event) throw new NotFoundException('Event')

    // Prevent organizer from reporting their own event
    const { data: ev } = await supabase
      .from('events').select('organizer_id').eq('id', eventId).single()
    if (ev?.organizer_id === ctx.userId) {
      throw new ForbiddenException('Cannot report your own event')
    }

    const { data, error } = await supabase
      .from('event_reports')
      .insert({
        event_id:    eventId,
        reporter_id: ctx.userId,
        reason:      input.reason,
        details:     input.details ?? null,
        status:      'pending',
      } as any)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        // Already reported — return existing report
        const { data: existing } = await supabase
          .from('event_reports')
          .select()
          .eq('event_id', eventId)
          .eq('reporter_id', ctx.userId)
          .single()
        return ok(existing)
      }
      throw error
    }

    return created(data)
  } catch (err) {
    return handleApiError(err)
  }
}

// GET /api/events/:id/report — check if current user already reported
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const ctx = await requireAuth()
    const supabase = await createSupabaseServerClient()

    const { data } = await supabase
      .from('event_reports')
      .select('id, reason, status')
      .eq('event_id', eventId)
      .eq('reporter_id', ctx.userId)
      .maybeSingle()

    return ok({ reported: !!data, report: data ?? null })
  } catch (err) {
    return handleApiError(err)
  }
}
