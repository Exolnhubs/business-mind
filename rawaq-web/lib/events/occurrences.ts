import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Event, EventOccurrence } from '@/types/database'
import { ForbiddenException, NotFoundException } from '@/lib/errors'

type AdminClient = SupabaseClient<Database>

type EventOccurrenceSource = Pick<
  Event,
  'id' | 'start_at' | 'end_at' | 'event_frequency' | 'capacity' | 'is_cancelled'
>

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function getDurationMs(start: Date, end: Date | null) {
  if (!end) return null
  const diff = end.getTime() - start.getTime()
  return diff > 0 ? diff : null
}

function getDaysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function buildMonthlyOccurrence(anchor: Date, year: number, monthIndex: number) {
  return new Date(Date.UTC(
    year,
    monthIndex,
    Math.min(anchor.getUTCDate(), getDaysInUtcMonth(year, monthIndex)),
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  ))
}

function addMonthlyOccurrence(anchor: Date, current: Date, stepMonths = 1) {
  const nextMonthIndex = current.getUTCMonth() + stepMonths
  const nextYear = current.getUTCFullYear() + Math.floor(nextMonthIndex / 12)
  const normalizedMonth = ((nextMonthIndex % 12) + 12) % 12
  return buildMonthlyOccurrence(anchor, nextYear, normalizedMonth)
}

function getCurrentOrNextWeekly(anchor: Date, durationMs: number | null, now: Date) {
  if (anchor.getTime() >= now.getTime()) return anchor
  const elapsed = now.getTime() - anchor.getTime()
  let candidate = new Date(anchor.getTime() + Math.floor(elapsed / WEEK_MS) * WEEK_MS)
  const candidateEnd = durationMs !== null ? candidate.getTime() + durationMs : null
  if (candidateEnd === null || candidateEnd <= now.getTime()) {
    candidate = new Date(candidate.getTime() + WEEK_MS)
  }
  return candidate
}

function getCurrentOrNextMonthly(anchor: Date, durationMs: number | null, now: Date) {
  if (anchor.getTime() >= now.getTime()) return anchor
  let candidate = buildMonthlyOccurrence(anchor, now.getUTCFullYear(), now.getUTCMonth())
  while (candidate.getTime() < anchor.getTime()) {
    candidate = addMonthlyOccurrence(anchor, candidate)
  }
  const candidateEnd = durationMs !== null ? candidate.getTime() + durationMs : null
  if (candidateEnd === null || candidateEnd <= now.getTime()) {
    candidate = addMonthlyOccurrence(anchor, candidate)
  }
  return candidate
}

function buildOccurrenceWindows(
  event: EventOccurrenceSource,
  now = new Date(),
  horizonDays = 180,
) {
  const anchor = parseDate(event.start_at)
  if (!anchor) return []

  const anchorEnd = parseDate(event.end_at ?? null)
  const durationMs = getDurationMs(anchor, anchorEnd)
  const horizon = new Date(now.getTime() + horizonDays * DAY_MS)
  const windows: Array<Pick<EventOccurrence, 'starts_at' | 'ends_at' | 'capacity' | 'status'>> = []
  const status: EventOccurrence['status'] = event.is_cancelled ? 'cancelled' : 'scheduled'

  if (event.event_frequency === 'one_time') {
    windows.push({
      starts_at: anchor.toISOString(),
      ends_at: durationMs !== null ? new Date(anchor.getTime() + durationMs).toISOString() : null,
      capacity: event.capacity,
      status,
    })
    return windows
  }

  let cursor =
    event.event_frequency === 'weekly'
      ? getCurrentOrNextWeekly(anchor, durationMs, now)
      : getCurrentOrNextMonthly(anchor, durationMs, now)

  while (cursor.getTime() <= horizon.getTime()) {
    windows.push({
      starts_at: cursor.toISOString(),
      ends_at: durationMs !== null ? new Date(cursor.getTime() + durationMs).toISOString() : null,
      capacity: event.capacity,
      status,
    })

    cursor =
      event.event_frequency === 'weekly'
        ? new Date(cursor.getTime() + WEEK_MS)
        : addMonthlyOccurrence(anchor, cursor)
  }

  return windows
}

export async function ensureEventOccurrences(
  admin: AdminClient,
  event: EventOccurrenceSource,
  now = new Date(),
  horizonDays = 180,
) {
  const windows = buildOccurrenceWindows(event, now, horizonDays)
  if (windows.length === 0) return []

  const { error: upsertError } = await admin
    .from('event_occurrences')
    .upsert(
      windows.map((window) => ({
        event_id: event.id,
        ...window,
      })),
      { onConflict: 'event_id,starts_at' },
    )

  if (upsertError) throw upsertError

  const earliestStart = windows[0]?.starts_at ?? event.start_at
  const { data, error } = await admin
    .from('event_occurrences')
    .select('*')
    .eq('event_id', event.id)
    .gte('starts_at', earliestStart)
    .order('starts_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as EventOccurrence[]
}

export async function resolveTargetOccurrence(
  admin: AdminClient,
  event: EventOccurrenceSource,
  userId: string,
  requestedOccurrenceId?: string | null,
  now = new Date(),
) {
  const occurrences = await ensureEventOccurrences(admin, event, now)

  if (requestedOccurrenceId) {
    const requested = occurrences.find((occurrence) => occurrence.id === requestedOccurrenceId)
    if (!requested) {
      throw new NotFoundException('Event occurrence')
    }
    if (requested.status !== 'scheduled') {
      throw new ForbiddenException('This event occurrence is not bookable')
    }
    if (new Date(requested.starts_at).getTime() <= now.getTime()) {
      throw new ForbiddenException('This event occurrence has already started')
    }
    return requested
  }

  const candidates = occurrences.filter((occurrence) =>
    occurrence.status === 'scheduled' && new Date(occurrence.starts_at).getTime() > now.getTime(),
  )

  if (candidates.length === 0) {
    throw new ForbiddenException('No upcoming event occurrences are available to book')
  }

  const { data: existingBookings, error } = await admin
    .from('bookings')
    .select('occurrence_id, status')
    .eq('user_id', userId)
    .in('occurrence_id', candidates.map((occurrence) => occurrence.id))
    .eq('status', 'confirmed')

  if (error) throw error

  const confirmedOccurrenceIds = new Set((existingBookings ?? []).map((booking) => booking.occurrence_id))
  const nextAvailable = candidates.find((occurrence) => !confirmedOccurrenceIds.has(occurrence.id))

  if (!nextAvailable) {
    throw new ForbiddenException('You already have bookings for all upcoming occurrences in the current booking window')
  }

  return nextAvailable
}

export async function resolveAttendanceOccurrence(
  admin: AdminClient,
  event: EventOccurrenceSource,
  now = new Date(),
) {
  const occurrences = await ensureEventOccurrences(admin, event, now)
  const activeOrUpcoming = occurrences.filter((occurrence) => {
    if (occurrence.status !== 'scheduled') return false
    const startsAt = new Date(occurrence.starts_at).getTime()
    const endsAt = occurrence.ends_at ? new Date(occurrence.ends_at).getTime() : null
    return endsAt !== null ? endsAt > now.getTime() : startsAt > now.getTime()
  })

  return activeOrUpcoming[0] ?? occurrences[0] ?? null
}

