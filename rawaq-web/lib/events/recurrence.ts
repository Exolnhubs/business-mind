import type { EventFrequency } from '@/types/database'

type RecurringEventShape = {
  start_at: string
  end_at?: string | null
  event_frequency?: EventFrequency | null
  recurrence_until?: string | null
}

type ResolutionMode = 'display' | 'next_upcoming'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

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

function getLastValidWeeklyStart(anchor: Date, recurrenceUntil: Date) {
  if (anchor.getTime() > recurrenceUntil.getTime()) return anchor
  const elapsed = recurrenceUntil.getTime() - anchor.getTime()
  return new Date(anchor.getTime() + Math.floor(elapsed / WEEK_MS) * WEEK_MS)
}

function getLastValidMonthlyStart(anchor: Date, recurrenceUntil: Date) {
  let candidate = buildMonthlyOccurrence(anchor, recurrenceUntil.getUTCFullYear(), recurrenceUntil.getUTCMonth())
  while (candidate.getTime() > recurrenceUntil.getTime()) {
    candidate = addMonthlyOccurrence(anchor, candidate, -1)
  }
  while (candidate.getTime() < anchor.getTime()) {
    candidate = addMonthlyOccurrence(anchor, candidate)
  }
  return candidate
}

function resolveWeeklyWindow(anchor: Date, durationMs: number | null, now: Date, mode: ResolutionMode, recurrenceUntil: Date | null) {
  const nowMs = now.getTime()
  const anchorMs = anchor.getTime()

  if (anchorMs > nowMs) {
    return {
      start_at: new Date(anchorMs).toISOString(),
      end_at: durationMs !== null ? new Date(anchorMs + durationMs).toISOString() : null,
    }
  }

  let candidateMs = anchorMs + Math.floor((nowMs - anchorMs) / WEEK_MS) * WEEK_MS
  let candidateEndMs = durationMs !== null ? candidateMs + durationMs : null
  const isOngoing = durationMs !== null && candidateMs <= nowMs && candidateEndMs !== null && candidateEndMs > nowMs

  if (!(mode === 'display' && isOngoing) && candidateMs <= nowMs) {
    candidateMs += WEEK_MS
    candidateEndMs = durationMs !== null ? candidateMs + durationMs : null
  }

  if (recurrenceUntil && candidateMs > recurrenceUntil.getTime()) {
    candidateMs = getLastValidWeeklyStart(anchor, recurrenceUntil).getTime()
    candidateEndMs = durationMs !== null ? candidateMs + durationMs : null
  }

  return {
    start_at: new Date(candidateMs).toISOString(),
    end_at: candidateEndMs !== null ? new Date(candidateEndMs).toISOString() : null,
  }
}

function resolveMonthlyWindow(anchor: Date, durationMs: number | null, now: Date, mode: ResolutionMode, recurrenceUntil: Date | null) {
  const nowMs = now.getTime()
  const anchorMs = anchor.getTime()

  if (anchorMs > nowMs) {
    return {
      start_at: anchor.toISOString(),
      end_at: durationMs !== null ? new Date(anchorMs + durationMs).toISOString() : null,
    }
  }

  let candidate = buildMonthlyOccurrence(anchor, now.getUTCFullYear(), now.getUTCMonth())
  while (candidate.getTime() < anchorMs) {
    candidate = addMonthlyOccurrence(anchor, candidate)
  }

  let candidateEndMs = durationMs !== null ? candidate.getTime() + durationMs : null
  const isOngoing =
    durationMs !== null
    && candidate.getTime() <= nowMs
    && candidateEndMs !== null
    && candidateEndMs > nowMs

  if (!(mode === 'display' && isOngoing) && candidate.getTime() <= nowMs) {
    candidate = addMonthlyOccurrence(anchor, candidate)
    candidateEndMs = durationMs !== null ? candidate.getTime() + durationMs : null
  }

  if (recurrenceUntil && candidate.getTime() > recurrenceUntil.getTime()) {
    candidate = getLastValidMonthlyStart(anchor, recurrenceUntil)
    candidateEndMs = durationMs !== null ? candidate.getTime() + durationMs : null
  }

  return {
    start_at: candidate.toISOString(),
    end_at: candidateEndMs !== null ? new Date(candidateEndMs).toISOString() : null,
  }
}

export function getResolvedEventWindow(
  event: RecurringEventShape,
  now = new Date(),
  mode: ResolutionMode = 'display',
) {
  const start = parseDate(event.start_at)
  if (!start) {
    return {
      start_at: event.start_at,
      end_at: event.end_at ?? null,
    }
  }

  const end = parseDate(event.end_at ?? null)
  const recurrenceUntil = parseDate(event.recurrence_until ?? null)
  const durationMs = getDurationMs(start, end)
  const frequency = event.event_frequency ?? 'one_time'

  if (frequency === 'weekly') return resolveWeeklyWindow(start, durationMs, now, mode, recurrenceUntil)
  if (frequency === 'monthly') return resolveMonthlyWindow(start, durationMs, now, mode, recurrenceUntil)

  return {
    start_at: start.toISOString(),
    end_at: end?.toISOString() ?? null,
  }
}

export function applyResolvedEventWindow<T extends RecurringEventShape>(
  event: T,
  now = new Date(),
  mode: ResolutionMode = 'display',
): T {
  const window = getResolvedEventWindow(event, now, mode)
  if (window.start_at === event.start_at && window.end_at === (event.end_at ?? null)) {
    return event
  }
  return {
    ...event,
    start_at: window.start_at,
    end_at: window.end_at,
  }
}

export function compareEventsByResolvedStartAt<T extends RecurringEventShape>(
  left: T,
  right: T,
  now = new Date(),
) {
  return new Date(getResolvedEventWindow(left, now).start_at).getTime()
    - new Date(getResolvedEventWindow(right, now).start_at).getTime()
}

export function hasResolvedEventEnded(event: RecurringEventShape, now = new Date()) {
  const { end_at } = getResolvedEventWindow(event, now, 'display')
  if (!end_at) return false
  return new Date(end_at).getTime() < now.getTime()
}

export function getBookableEventStartAt(event: RecurringEventShape, now = new Date()) {
  return getResolvedEventWindow(event, now, 'next_upcoming').start_at
}
