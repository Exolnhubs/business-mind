import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, NotFoundException, ForbiddenException, ok } from '@/lib/errors'
import { listEventOccurrences, getBookableOccurrences } from '@/lib/events/occurrences'
import { optionalAuth } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const admin = createSupabaseAdminClient()
    const ctx = await optionalAuth()
    const now = new Date()

    const { data: event, error } = await admin
      .from('events')
      .select('id, organizer_id, start_at, end_at, event_frequency, recurrence_until, capacity, is_cancelled, is_published')
      .eq('id', id)
      .single()

    if (error || !event) throw new NotFoundException('Event')
    const isOwner = ctx?.role === 'admin' || ctx?.userId === event.organizer_id
    if (!event.is_published && !isOwner) throw new ForbiddenException('Event is not published')

    const occurrences = await listEventOccurrences(admin, event.id)
    const visibleOccurrences = isOwner ? occurrences : getBookableOccurrences(occurrences, now)

    return ok(
      visibleOccurrences
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
