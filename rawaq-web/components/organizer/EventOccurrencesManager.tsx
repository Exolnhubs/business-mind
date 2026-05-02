'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EventOccurrence } from '@/types/database'

type OrganizerOccurrence = EventOccurrence

interface EventOccurrencesManagerProps {
  eventId: string
  enabled: boolean
}

function toLocalInputValue(value: string | null) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 16)
}

function formatOccurrenceLabel(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function EventOccurrencesManager({ eventId, enabled }: EventOccurrencesManagerProps) {
  const [occurrences, setOccurrences] = useState<OrganizerOccurrence[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingOccurrenceId, setEditingOccurrenceId] = useState<string | null>(null)
  const [draftStartAt, setDraftStartAt] = useState('')
  const [draftEndAt, setDraftEndAt] = useState('')
  const [draftCapacity, setDraftCapacity] = useState('')
  const [savingOccurrenceId, setSavingOccurrenceId] = useState<string | null>(null)

  const loadOccurrences = useCallback(async () => {
    if (!enabled) {
      setOccurrences([])
      return
    }

    setLoading(true)
    setError(null)
    const response = await fetch(`/api/events/${eventId}/occurrences`, { cache: 'no-store' })
    const json = await response.json().catch(() => ({}))
    setLoading(false)

    if (!response.ok) {
      setError(json?.error ?? 'Failed to load event sessions')
      return
    }

    setOccurrences((json?.data ?? []) as OrganizerOccurrence[])
  }, [enabled, eventId])

  useEffect(() => {
    void loadOccurrences()
  }, [loadOccurrences])

  const upcomingOccurrences = useMemo(
    () => occurrences.filter((occurrence) => new Date(occurrence.starts_at).getTime() > Date.now()),
    [occurrences],
  )

  function beginEditing(occurrence: OrganizerOccurrence) {
    setEditingOccurrenceId(occurrence.id)
    setDraftStartAt(toLocalInputValue(occurrence.starts_at))
    setDraftEndAt(toLocalInputValue(occurrence.ends_at))
    setDraftCapacity(occurrence.capacity?.toString() ?? '')
  }

  function stopEditing() {
    setEditingOccurrenceId(null)
    setDraftStartAt('')
    setDraftEndAt('')
    setDraftCapacity('')
  }

  async function saveOccurrence(occurrenceId: string) {
    setSavingOccurrenceId(occurrenceId)
    setError(null)

    const response = await fetch(`/api/events/${eventId}/occurrences/${occurrenceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        starts_at: new Date(draftStartAt).toISOString(),
        ends_at: draftEndAt ? new Date(draftEndAt).toISOString() : null,
        capacity: draftCapacity ? Number(draftCapacity) : null,
      }),
    })
    const json = await response.json().catch(() => ({}))
    setSavingOccurrenceId(null)

    if (!response.ok) {
      setError(json?.error ?? 'Failed to update this session')
      return
    }

    setOccurrences((current) =>
      current.map((occurrence) => (occurrence.id === occurrenceId ? (json.data as OrganizerOccurrence) : occurrence)),
    )
    stopEditing()
  }

  async function updateOccurrenceStatus(occurrence: OrganizerOccurrence, status: 'scheduled' | 'cancelled') {
    setSavingOccurrenceId(occurrence.id)
    setError(null)

    const response = await fetch(`/api/events/${eventId}/occurrences/${occurrence.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const json = await response.json().catch(() => ({}))
    setSavingOccurrenceId(null)

    if (!response.ok) {
      setError(json?.error ?? 'Failed to update this session')
      return
    }

    setOccurrences((current) =>
      current.map((item) => (item.id === occurrence.id ? (json.data as OrganizerOccurrence) : item)),
    )
  }

  if (!enabled) return null

  return (
    <section id="occurrences" className="space-y-4 rounded-3xl border border-gray-200 bg-white p-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-gray-900">Manage Sessions</h3>
        <p className="text-sm text-gray-500">
          Session-level edits only affect that specific date. Edited or cancelled sessions are kept as series exceptions.
        </p>
      </div>

      {loading ? <p className="text-sm text-gray-500">Loading upcoming sessions...</p> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {!loading && upcomingOccurrences.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
          No generated upcoming sessions yet.
        </div>
      ) : null}

      <div className="space-y-3">
        {upcomingOccurrences.slice(0, 12).map((occurrence) => {
          const isEditing = editingOccurrenceId === occurrence.id
          const isSaving = savingOccurrenceId === occurrence.id

          return (
            <div key={occurrence.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">{formatOccurrenceLabel(occurrence.starts_at)}</p>
                  <p className="text-xs text-gray-500">
                    {occurrence.ends_at ? `Ends ${formatOccurrenceLabel(occurrence.ends_at)}` : 'No explicit end time'}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <span className={`rounded-full px-2.5 py-1 font-medium ${
                      occurrence.status === 'cancelled'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {occurrence.status === 'cancelled' ? 'Cancelled' : 'Scheduled'}
                    </span>
                    {occurrence.is_exception ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
                        Custom Session
                      </span>
                    ) : null}
                    <span className="rounded-full bg-white px-2.5 py-1 font-medium text-gray-600">
                      {occurrence.bookings_count} booked
                    </span>
                    {occurrence.capacity !== null ? (
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium text-gray-600">
                        Cap {occurrence.capacity}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => (isEditing ? stopEditing() : beginEditing(occurrence))}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
                  >
                    {isEditing ? 'Close' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void updateOccurrenceStatus(occurrence, occurrence.status === 'cancelled' ? 'scheduled' : 'cancelled')}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      occurrence.status === 'cancelled'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {occurrence.status === 'cancelled' ? 'Restore' : 'Cancel'}
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Start</span>
                    <input
                      type="datetime-local"
                      value={draftStartAt}
                      onChange={(event) => setDraftStartAt(event.target.value)}
                      className="input"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">End</span>
                    <input
                      type="datetime-local"
                      value={draftEndAt}
                      min={draftStartAt || undefined}
                      onChange={(event) => setDraftEndAt(event.target.value)}
                      className="input"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Capacity</span>
                    <input
                      type="number"
                      min={1}
                      value={draftCapacity}
                      onChange={(event) => setDraftCapacity(event.target.value)}
                      className="input"
                      placeholder="Unlimited"
                    />
                  </label>
                  <div className="sm:col-span-3 flex gap-2">
                    <button
                      type="button"
                      disabled={isSaving || !draftStartAt}
                      onClick={() => void saveOccurrence(occurrence.id)}
                      className="btn-primary"
                    >
                      {isSaving ? 'Saving...' : 'Save Session'}
                    </button>
                    <button type="button" onClick={stopEditing} className="btn-ghost">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
