import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireEventOwnership } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { handleApiError, ForbiddenException, NotFoundException, ok } from '@/lib/errors'

const UpdateOccurrenceSchema = z.object({
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  status: z.enum(['scheduled', 'cancelled']).optional(),
})

interface RouteContext {
  params: Promise<{ id: string; occurrenceId: string }>
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id, occurrenceId } = await params
    const ctx = await requireAuth()
    await requireEventOwnership(id, ctx)

    const input = UpdateOccurrenceSchema.parse(await req.json())
    const admin = createSupabaseAdminClient()

    const [{ data: occurrence, error: occurrenceError }, { data: event, error: eventError }] = await Promise.all([
      admin
        .from('event_occurrences')
        .select('*')
        .eq('id', occurrenceId)
        .eq('event_id', id)
        .single(),
      admin
        .from('events')
        .select('id, is_cancelled')
        .eq('id', id)
        .single(),
    ])

    if (occurrenceError || !occurrence) throw new NotFoundException('Event occurrence')
    if (eventError || !event) throw new NotFoundException('Event')

    const now = new Date()
    if (new Date(occurrence.starts_at).getTime() <= now.getTime()) {
      throw new ForbiddenException('Past or ongoing occurrences can no longer be edited')
    }

    let nextStartsAt = input.starts_at ?? occurrence.starts_at
    let nextEndsAt = input.ends_at !== undefined ? input.ends_at : occurrence.ends_at

    if (input.starts_at && input.ends_at === undefined && occurrence.ends_at) {
      const currentStart = new Date(occurrence.starts_at).getTime()
      const currentEnd = new Date(occurrence.ends_at).getTime()
      const duration = currentEnd - currentStart
      if (duration > 0) {
        nextEndsAt = new Date(new Date(input.starts_at).getTime() + duration).toISOString()
      }
    }

    if (nextEndsAt && new Date(nextEndsAt).getTime() <= new Date(nextStartsAt).getTime()) {
      throw new ForbiddenException('Occurrence end time must be after the start time')
    }

    if (input.status === 'scheduled' && event.is_cancelled) {
      throw new ForbiddenException('Restore the parent event before restoring this occurrence')
    }

    const patch = {
      starts_at: nextStartsAt,
      ends_at: nextEndsAt,
      capacity: input.capacity !== undefined ? input.capacity : occurrence.capacity,
      status: input.status ?? occurrence.status,
      is_exception: true,
    }

    const { data, error } = await admin
      .from('event_occurrences')
      .update(patch)
      .eq('id', occurrenceId)
      .select('*')
      .single()

    if (error) throw error

    return ok(data)
  } catch (error) {
    return handleApiError(error)
  }
}
