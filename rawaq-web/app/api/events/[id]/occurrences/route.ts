import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, NotFoundException, ForbiddenException, ok } from '@/lib/errors'
import { ensureEventOccurrences } from '@/lib/events/occurrences'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const admin = createSupabaseAdminClient()

    const { data: event, error } = await admin
      .from('events')
      .select('id, start_at, end_at, event_frequency, capacity, is_cancelled, is_published')
      .eq('id', id)
      .single()

    if (error || !event) throw new NotFoundException('Event')
    if (!event.is_published) throw new ForbiddenException('Event is not published')

    const occurrences = await ensureEventOccurrences(admin, event)

    return ok(
      occurrences
        .filter((occurrence) => occurrence.status === 'scheduled')
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
