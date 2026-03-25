'use client'

import { useState } from 'react'
import type { ReportReason } from '@/types/database'

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam',           label: 'Spam or misleading' },
  { value: 'inappropriate',  label: 'Inappropriate content' },
  { value: 'harassment',     label: 'Harassment or hate' },
  { value: 'misinformation', label: 'False information' },
  { value: 'other',          label: 'Other' },
]

export function ReportEventButton({ eventId }: { eventId: string }) {
  const [open, setOpen]       = useState(false)
  const [reason, setReason]   = useState<ReportReason>('spam')
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  async function submit() {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/events/${eventId}/report`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason, details: details.trim() || undefined }),
    })
    if (res.ok || res.status === 200) {
      setDone(true)
      setOpen(false)
    } else if (res.status === 401) {
      setError('Please sign in to report an event.')
    } else {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Failed to submit report.')
    }
    setLoading(false)
  }

  if (done) {
    return (
      <p className="text-xs text-gray-500 text-center py-1">
        ✅ Report submitted. Thank you.
      </p>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-xs text-gray-400 hover:text-red-500 py-1 transition-colors"
      >
        🚩 Report this event
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-20 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Report Event</p>

          <div className="space-y-1.5">
            {REASONS.map((r) => (
              <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="accent-red-500"
                />
                <span className="text-sm text-gray-700">{r.label}</span>
              </label>
            ))}
          </div>

          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Additional details (optional)"
            maxLength={500}
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
          />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={loading}
              className="flex-1 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Submitting…' : 'Submit Report'}
            </button>
            <button
              onClick={() => { setOpen(false); setError('') }}
              className="px-3 py-1.5 border border-gray-200 text-xs text-gray-600 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
