'use client'

import { useState, useTransition } from 'react'

interface Props {
  eventId: string
  initialSaved: boolean
  /** if size="lg" render a larger standalone button */
  size?: 'sm' | 'lg'
}

export function SaveButton({ eventId, initialSaved, size = 'sm' }: Props) {
  const [saved, setSaved] = useState(initialSaved)
  const [, startTransition] = useTransition()

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = !saved
    setSaved(next)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/save`, {
          method: next ? 'POST' : 'DELETE',
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error((json as { error?: string }).error ?? 'Could not update saved events')
        }
      } catch {
        setSaved(!next) // revert on error
        if (next && typeof window !== 'undefined') {
          window.alert('You have reached your saved-events limit for the current membership plan.')
        }
      }
    })
  }

  if (size === 'lg') {
    return (
      <button
        onClick={toggle}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
          saved
            ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
        title={saved ? 'Remove from saved' : 'Save event'}
      >
        <span>{saved ? '❤️' : '🤍'}</span>
        {saved ? 'Saved' : 'Save'}
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className="absolute top-2 end-2 z-10 w-7 h-7 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
      title={saved ? 'Remove from saved' : 'Save event'}
      aria-label={saved ? 'Unsave event' : 'Save event'}
    >
      <span className="text-sm">{saved ? '❤️' : '🤍'}</span>
    </button>
  )
}
