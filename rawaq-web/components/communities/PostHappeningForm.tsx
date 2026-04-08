'use client'

import { useState } from 'react'
import type { HappeningType } from '@/types/database'
import { LocationPickerModal } from '@/components/communities/LocationPickerModal'

const TYPES: { key: HappeningType; label: string; icon: string; placeholder: string }[] = [
  { key: 'open_invite', label: 'Open invite', icon: '🎉', placeholder: "Who's free to join right now?" },
  { key: 'info', label: 'Update', icon: '📣', placeholder: 'Share a quick update with the community.' },
  { key: 'question', label: 'Ping', icon: '👋', placeholder: 'Ask who is around or interested.' },
  { key: 'alert', label: 'Meetup alert', icon: '📍', placeholder: 'Call out an urgent meetup spot or heads-up.' },
]

const EXPIRY_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 3, label: '3 hours' },
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
]

type PickedLocation = {
  lat: number
  lng: number
  label: string
}

interface Props {
  posting: boolean
  onPost: (data: { type: HappeningType; body: string; expires_in_hours: number; lat?: number; lng?: number; location_label?: string }) => Promise<boolean>
  onCancel: () => void
}

export function PostHappeningForm({ posting, onPost, onCancel }: Props) {
  const [type, setType] = useState<HappeningType>('open_invite')
  const [body, setBody] = useState('')
  const [expiry, setExpiry] = useState(6)
  const [selectedLocation, setSelectedLocation] = useState<PickedLocation | null>(null)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const activeType = TYPES.find((item) => item.key === type) ?? TYPES[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return

    const ok = await onPost({
      type,
      body: body.trim(),
      expires_in_hours: expiry,
      ...(selectedLocation
        ? {
            lat: selectedLocation.lat,
            lng: selectedLocation.lng,
            location_label: selectedLocation.label,
          }
        : {}),
    })

    if (ok) {
      setBody('')
      setType('open_invite')
      setExpiry(6)
      setSelectedLocation(null)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                type === t.key ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:border-brand-300'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 280))}
          placeholder={activeType.placeholder}
          rows={3}
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Expires in:</span>
            <select
              value={expiry}
              onChange={(e) => setExpiry(Number(e.target.value))}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">{body.length}/280</span>

            <button
              type="button"
              onClick={() => setShowLocationPicker(true)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 transition-colors hover:text-brand-600"
            >
              {selectedLocation ? 'Edit meetup spot' : 'Pick meetup spot'}
            </button>

            {selectedLocation && (
              <button
                type="button"
                onClick={() => setSelectedLocation(null)}
                className="rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700"
              >
                {selectedLocation.label} x
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <button
              type="submit"
              disabled={posting || !body.trim()}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      </form>

      <LocationPickerModal
        open={showLocationPicker}
        initialLocation={selectedLocation}
        onClose={() => setShowLocationPicker(false)}
        onConfirm={(location) => {
          setSelectedLocation(location)
          setShowLocationPicker(false)
        }}
      />
    </>
  )
}
