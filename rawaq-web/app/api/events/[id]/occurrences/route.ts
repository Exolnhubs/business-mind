import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, NotFoundException, ForbiddenException, ok } from '@/lib/errors'
import { ensureEventOccurrences } from '@/lib/events/occurrences'
import { optionalAuth } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const admin = createSupabaseAdminClient()
    const ctx = await optionalAuth()

    const { data: event, error } = await admin
      .from('events')
      .select('id, organizer_id, start_at, end_at, event_frequency, recurrence_until, capacity, is_cancelled, is_published')
      .eq('id', id)
      .single()

    if (error || !event) throw new NotFoundException('Event')
    const isOwner = ctx?.role === 'admin' || ctx?.userId === event.organizer_id
    if (!event.is_published && !isOwner) throw new ForbiddenException('Event is not published')

    const occurrences = await ensureEventOccurrences(admin, event)

    return ok(
      occurrences
        .filter((occurrence) => isOwner || occurrence.status === 'scheduled')
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
