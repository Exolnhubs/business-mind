'use client'

import { useEffect, useState, useCallback } from 'react'
import type { AuditAction } from '@/types/database'

type LogEntry = {
  id: string
  action: AuditAction
  target_type: string
  target_id: string
  meta: Record<string, unknown>
  created_at: string
  admin: { id: string; display_name: string; avatar_url: string | null } | null
}

const ACTION_ICONS: Record<string, string> = {
  ban_user:           '🚫',
  unban_user:         '✅',
  warn_user:          '⚠️',
  delete_user:        '🗑️',
  approve_organizer:  '✅',
  reject_organizer:   '❌',
  suspend_organizer:  '⏸️',
  publish_event:      '📢',
  unpublish_event:    '📭',
  cancel_event:       '🚫',
  resolve_report:     '✅',
  dismiss_report:     '🚫',
  assign_plan:        '💎',
}

const ACTION_LABELS: Record<string, string> = {
  ban_user:           'Banned user',
  unban_user:         'Unbanned user',
  warn_user:          'Warned user',
  delete_user:        'Deleted user',
  approve_organizer:  'Approved organizer',
  reject_organizer:   'Rejected organizer',
  suspend_organizer:  'Suspended organizer',
  publish_event:      'Published event',
  unpublish_event:    'Unpublished event',
  cancel_event:       'Cancelled event',
  resolve_report:     'Resolved report',
  dismiss_report:     'Dismissed report',
  assign_plan:        'Assigned plan',
}

const ALL_ACTIONS = Object.keys(ACTION_LABELS) as AuditAction[]

export default function AdminAuditLogsPage() {
  const [logs, setLogs]       = useState<LogEntry[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [action, setAction]   = useState<string>('')
  const [page, setPage]       = useState(1)
  const PER = 30

  const load = useCallback(async () => {
    setLoading(true)
    const qs  = new URLSearchParams({ page: String(page) })
    if (action) qs.set('action', action)
    const res  = await fetch(`/api/admin/audit-logs?${qs}`)
    const json = await res.json()
    setLogs(json.data?.data ?? [])
    setTotal(json.data?.total ?? 0)
    setLoading(false)
  }, [action, page])

  useEffect(() => { load() }, [load])

  function metaSummary(entry: LogEntry): string {
    const m = entry.meta
    if (m.display_name)     return String(m.display_name)
    if (m.event_title)      return String(m.event_title)
    if (m.business_name)    return String(m.business_name)
    if (m.reason)           return `Reason: ${m.reason}`
    return entry.target_id.slice(0, 8) + '…'
  }

  const totalPages = Math.ceil(total / PER)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Audit Log</h2>
        <div className="flex items-center gap-2">
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All actions</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">{total} entries</span>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No audit log entries</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {logs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <span className="text-xl mt-0.5 shrink-0">{ACTION_ICONS[entry.action] ?? '📋'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{entry.admin?.display_name ?? 'Admin'}</span>
                    {' '}<span className="text-gray-500">{ACTION_LABELS[entry.action] ?? entry.action}:</span>
                    {' '}<span className="font-medium">{metaSummary(entry)}</span>
                  </p>
                  {entry.meta.severity && (
                    <span className={`inline-block text-xs px-1.5 py-0.5 rounded mt-0.5 font-medium ${
                      entry.meta.severity === 'high'   ? 'bg-red-100 text-red-700' :
                      entry.meta.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                         'bg-gray-100 text-gray-600'
                    }`}>
                      {String(entry.meta.severity)} severity
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ← Prev
              </button>
              <span className="px-3 py-1 text-sm text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
