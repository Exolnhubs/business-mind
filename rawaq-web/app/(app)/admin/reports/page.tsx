'use client'

import { useEffect, useState, useCallback } from 'react'
import { clientPatchJson, isToastHandledError } from '@/lib/client-fetch'
import type { ReportStatus } from '@/types/database'

type Report = {
  id: string
  reason: string
  details: string | null
  status: ReportStatus
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
  event:    { id: string; title: string; is_published: boolean; is_cancelled: boolean } | null
  reporter: { id: string; display_name: string } | null
  resolver: { id: string; display_name: string } | null
}

const STATUS_TABS: ReportStatus[] = ['pending', 'resolved', 'dismissed']

const REASON_LABELS: Record<string, string> = {
  spam:           'Spam',
  inappropriate:  'Inappropriate',
  harassment:     'Harassment',
  misinformation: 'Misinformation',
  other:          'Other',
}

export default function AdminReportsPage() {
  const [status, setStatus]   = useState<ReportStatus>('pending')
  const [reports, setReports] = useState<Report[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/admin/reports?status=${status}`)
      const json = await res.json()
      const rows = json.data?.data
      setReports(Array.isArray(rows) ? rows : [])
      setTotal(json.data?.total ?? 0)
    } catch {
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  async function handleAction(id: string, action: 'resolve' | 'dismiss') {
    setResolving(id)
    try {
      await clientPatchJson(`/api/admin/reports/${id}`, { action, resolution_note: noteMap[id] })
      await load()
    } catch (error) {
      if (!isToastHandledError(error)) {
        window.alert(error instanceof Error ? error.message : 'Action failed')
      }
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Event Reports</h2>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              status === s
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No {status} reports</div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'pending'  ? 'bg-yellow-100 text-yellow-800' :
                      r.status === 'resolved' ? 'bg-green-100  text-green-800'  :
                                                'bg-gray-100   text-gray-600'
                    }`}>
                      {r.status}
                    </span>
                    <span className="text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                      {REASON_LABELS[r.reason] ?? r.reason}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    Event:{' '}
                    <a
                      href={`/events/${r.event?.id}`}
                      target="_blank"
                      className="text-indigo-600 hover:underline"
                    >
                      {r.event?.title ?? r.event?.id ?? '—'}
                    </a>
                    {r.event?.is_cancelled && <span className="ml-1 text-red-500 text-xs">(cancelled)</span>}
                    {!r.event?.is_published && !r.event?.is_cancelled && <span className="ml-1 text-gray-400 text-xs">(unpublished)</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    Reported by <strong>{r.reporter?.display_name ?? '—'}</strong>
                    {' · '}{new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Details */}
              {r.details && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  &ldquo;{r.details}&rdquo;
                </p>
              )}

              {/* Resolution info */}
              {r.status !== 'pending' && (
                <p className="text-xs text-gray-500">
                  {r.status === 'resolved' ? '✅ Resolved' : '🚫 Dismissed'} by{' '}
                  <strong>{r.resolver?.display_name ?? '—'}</strong>
                  {r.resolved_at ? ` · ${new Date(r.resolved_at).toLocaleDateString()}` : ''}
                  {r.resolution_note && (
                    <span className="block mt-0.5 text-gray-600 italic">{r.resolution_note}</span>
                  )}
                </p>
              )}

              {/* Actions */}
              {r.status === 'pending' && (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Resolution note (optional)"
                    value={noteMap[r.id] ?? ''}
                    onChange={(e) => setNoteMap((m) => ({ ...m, [r.id]: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(r.id, 'resolve')}
                      disabled={resolving === r.id}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      ✅ Resolve
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'dismiss')}
                      disabled={resolving === r.id}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
