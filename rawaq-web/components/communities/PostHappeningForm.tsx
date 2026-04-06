'use client'

import { useState } from 'react'
import type { HappeningType } from '@/types/database'

const TYPES: { key: HappeningType; label: string; emoji: string }[] = [
  { key: 'open_invite', label: 'Open Invite', emoji: '🙋' },
  { key: 'info',        label: 'Info',        emoji: 'ℹ️' },
  { key: 'question',    label: 'Question',    emoji: '❓' },
  { key: 'alert',       label: 'Alert',       emoji: '🚨' },
]

const EXPIRY_OPTIONS = [
  { value: 1,  label: '1 hour'  },
  { value: 3,  label: '3 hours' },
  { value: 6,  label: '6 hours' },
  { value: 12, label: '12 hours'},
  { value: 24, label: '24 hours'},
]

interface Props {
  posting:  boolean
  onPost:   (data: { type: HappeningType; body: string; expires_in_hours: number; lat?: number; lng?: number }) => Promise<boolean>
  onCancel: () => void
}

export function PostHappeningForm({ posting, onPost, onCancel }: Props) {
  const [type, setType]         = useState<HappeningType>('open_invite')
  const [body, setBody]         = useState('')
  const [expiry, setExpiry]     = useState(6)
  const [locState, setLocState] = useState<'idle' | 'loading' | 'attached' | 'denied'>('idle')
  const [coords, setCoords]     = useState<{ lat: number; lng: number } | null>(null)

  function attachLocation() {
    if (!navigator.geolocation) { setLocState('denied'); return }
    setLocState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocState('attached')
      },
      () => setLocState('denied'),
      { timeout: 8000 }
    )
  }

  function removeLocation() {
    setCoords(null)
    setLocState('idle')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const ok = await onPost({
      type,
      body: body.trim(),
      expires_in_hours: expiry,
      ...(coords ?? {}),
    })
    if (ok) { setBody(''); setType('open_invite'); setExpiry(6); setCoords(null); setLocState('idle') }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-brand-200 bg-brand-50 p-4 mb-6">
      {/* Type chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setType(t.key)}
            className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
              type === t.key ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-brand-300'
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 280))}
        placeholder="What's happening? (e.g. Anyone for padel in 30 min?)"
        rows={3}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 resize-none"
      />

      <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Expires in:</span>
          <select
            value={expiry}
            onChange={(e) => setExpiry(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">{body.length}/280</span>

          {/* Location toggle */}
          {locState === 'idle' && (
            <button type="button" onClick={attachLocation} className="text-xs text-gray-500 hover:text-brand-600 px-2 py-1 rounded-lg border border-gray-200 bg-white transition-colors">
              📍 Add location
            </button>
          )}
          {locState === 'loading' && (
            <span className="text-xs text-gray-400">📍 Getting location…</span>
          )}
          {locState === 'attached' && coords && (
            <button type="button" onClick={removeLocation} className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">
              📍 {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} ✕
            </button>
          )}
          {locState === 'denied' && (
            <span className="text-xs text-red-500">📍 Location unavailable</span>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">
            Cancel
          </button>
          <button
            type="submit"
            disabled={posting || !body.trim()}
            className="text-xs font-semibold bg-brand-600 text-white px-4 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  )
}
