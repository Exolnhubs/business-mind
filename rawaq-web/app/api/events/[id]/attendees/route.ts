import { NextRequest } from 'next/server'
import { requireAuth, requireEventOwnership } from '@/lib/auth'
import { handleApiError, ok, NotFoundException } from '@/lib/errors'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { resolveAttendanceOccurrence } from '@/lib/events/occurrences'

// GET /api/events/:id/attendees — organizer or admin only
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ctx = await requireAuth()
    await requireEventOwnership(id, ctx)

    const page = Number(req.nextUrl.searchParams.get('page') ?? 1)
    const perPage = Number(req.nextUrl.searchParams.get('per_page') ?? 50)
    const from = (page - 1) * perPage
    const requestedOccurrenceId = req.nextUrl.searchParams.get('occurrence_id')

    const admin = createSupabaseAdminClient()

    const { data: event } = await admin
      .from('events')
      .select('id, start_at, end_at, recurrence_until, event_frequency, capacity, is_cancelled')
      .eq('id', id)
      .single()

    if (!event) throw new NotFoundException('Event')

    const occurrence = requestedOccurrenceId
      ? await admin.from('event_occurrences').select('*').eq('id', requestedOccurrenceId).eq('event_id', id).single().then(({ data, error }) => {
          if (error || !data) throw new NotFoundException('Event occurrence')
          return data
        })
      : await resolveAttendanceOccurrence(admin, event)

    if (!occurrence) {
      return ok({ data: [], total: 0, page, per_page: perPage, occurrence: null })
    }

    const { data, count, error } = await admin
      .from('bookings')
      .select(
        `id, status, created_at, scanned_at, ticket_id,
         user:profiles!user_id(id, display_name, avatar_url, city)`,
        { count: 'exact' }
      )
      .eq('occurrence_id', occurrence.id)
      .order('created_at', { ascending: true })
      .range(from, from + perPage - 1)

    if (error) throw error

    return ok({ data, total: count ?? 0, page, per_page: perPage, occurrence })
  } catch (err) {
    return handleApiError(err)
  }
}
