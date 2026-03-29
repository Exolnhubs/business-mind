'use client'

import { useEffect, useState, useCallback } from 'react'

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

interface Ticket {
  id: string
  ticket_number: string
  category: string
  subject: string
  description: string
  status: TicketStatus
  admin_notes: string | null
  created_at: string
  updated_at: string
  user: { id: string; display_name: string } | null
}

const STATUS_TABS: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed']

const CATEGORY_LABELS: Record<string, string> = {
  general:    '💬 General',
  refund:     '💰 Refund',
  harassment: '🚨 Harassment',
  legal:      '⚖️ Legal',
  technical:  '🔧 Technical',
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  open:        'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-gray-100 text-gray-500',
}

export default function AdminSupportPage() {
  const [status,    setStatus]    = useState<TicketStatus>('open')
  const [tickets,   setTickets]   = useState<Ticket[]>([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [noteMap,   setNoteMap]   = useState<Record<string, string>>({})
  const [updating,  setUpdating]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/admin/support?status=${status}`)
      const json = await res.json()
      setTickets(json.data?.data ?? [])
      setTotal(json.data?.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  async function updateTicket(id: string, updates: { status?: TicketStatus; admin_notes?: string }) {
    setUpdating(id)
    try {
      await fetch(`/api/admin/support/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(updates),
      })
      await load()
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">🎧 Support Tickets</h2>
        <span className="text-sm text-gray-500">{total} ticket{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${
              status === s
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">🎉</p>
          <p>No {status.replace('_', ' ')} tickets</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header row */}
              <button
                className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded((e) => e === ticket.id ? null : ticket.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                      {ticket.ticket_number}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${STATUS_COLORS[ticket.status]}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 mt-1">{ticket.subject}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {ticket.user?.display_name ?? 'Unknown user'} ·{' '}
                    {new Date(ticket.created_at).toLocaleDateString('en-SA', { dateStyle: 'medium' })}
                  </p>
                </div>
                <span className="text-gray-400 shrink-0">{expanded === ticket.id ? '▲' : '▼'}</span>
              </button>

              {/* Expanded detail */}
              {expanded === ticket.id && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                  {/* Description */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">User description</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
                  </div>

                  {/* Admin notes */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Admin notes</p>
                    <textarea
                      className="w-full border border-gray-200 rounded-lg p-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
                      rows={3}
                      placeholder="Add internal notes…"
                      value={noteMap[ticket.id] ?? (ticket.admin_notes ?? '')}
                      onChange={(e) => setNoteMap((m) => ({ ...m, [ticket.id]: e.target.value }))}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {ticket.status === 'open' && (
                      <button
                        onClick={() => updateTicket(ticket.id, {
                          status: 'in_progress',
                          admin_notes: noteMap[ticket.id] ?? ticket.admin_notes ?? undefined,
                        })}
                        disabled={updating === ticket.id}
                        className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                      >
                        Mark In Progress
                      </button>
                    )}
                    {(ticket.status === 'open' || ticket.status === 'in_progress') && (
                      <button
                        onClick={() => updateTicket(ticket.id, {
                          status: 'resolved',
                          admin_notes: noteMap[ticket.id] ?? ticket.admin_notes ?? undefined,
                        })}
                        disabled={updating === ticket.id}
                        className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    )}
                    {ticket.status !== 'closed' && (
                      <button
                        onClick={() => updateTicket(ticket.id, {
                          status: 'closed',
                          admin_notes: noteMap[ticket.id] ?? ticket.admin_notes ?? undefined,
                        })}
                        disabled={updating === ticket.id}
                        className="px-4 py-2 text-sm font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                      >
                        Close
                      </button>
                    )}
                    {noteMap[ticket.id] !== undefined && noteMap[ticket.id] !== ticket.admin_notes && (
                      <button
                        onClick={() => updateTicket(ticket.id, { admin_notes: noteMap[ticket.id] })}
                        disabled={updating === ticket.id}
                        className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                      >
                        Save Notes
                      </button>
                    )}
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
