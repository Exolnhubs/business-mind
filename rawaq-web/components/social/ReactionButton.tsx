'use client'

import { useState, useTransition } from 'react'
import type { ReactionType } from '@/types/database'

interface Props {
  eventId: string
  initialReaction: ReactionType | null
  reactionsCount: number
}

const REACTIONS: { type: ReactionType; label: string; icon: string }[] = [
  { type: 'like',       label: 'Like',       icon: '👍' },
  { type: 'interested', label: 'Interested',  icon: '⭐' },
]

export function ReactionButton({ eventId, initialReaction, reactionsCount }: Props) {
  const [reaction, setReaction] = useState<ReactionType | null>(initialReaction)
  const [count, setCount]       = useState(reactionsCount)
  const [open, setOpen]         = useState(false)
  const [, startTransition]     = useTransition()

  function pick(type: ReactionType) {
    setOpen(false)
    const isSame = reaction === type
    const prev   = reaction

    setReaction(isSame ? null : type)
    setCount((c) => {
      if (isSame)    return Math.max(0, c - 1) // remove
      if (prev)      return c                   // switch type — count stays
      return c + 1                              // new reaction
    })

    startTransition(async () => {
      try {
        if (isSame) {
          await fetch(`/api/events/${eventId}/react`, { method: 'DELETE' })
        } else {
          await fetch(`/api/events/${eventId}/react`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type }),
          })
        }
      } catch {
        setReaction(prev)
        setCount((c) => {
          if (isSame) return c + 1
          if (prev)   return c
          return Math.max(0, c - 1)
        })
      }
    })
  }

  const active = REACTIONS.find((r) => r.type === reaction)

  return (
    <div className="relative flex items-center gap-2">
      {/* Main button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors ${
          reaction
            ? 'bg-brand-50 border-brand-200 text-brand-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
        title="React to this event"
      >
        <span>{active?.icon ?? '👍'}</span>
        <span className="hidden sm:inline">{active?.label ?? 'React'}</span>
        {count > 0 && <span className="text-xs text-gray-400 ml-0.5">{count}</span>}
      </button>

      {/* Picker popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 start-0 z-20 bg-white rounded-xl shadow-lg border border-gray-100 p-1.5 flex gap-1 animate-fade-in">
            {REACTIONS.map((r) => (
              <button
                key={r.type}
                onClick={() => pick(r.type)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-brand-50 ${
                  reaction === r.type ? 'bg-brand-50 text-brand-700' : 'text-gray-600'
                }`}
              >
                <span className="text-lg">{r.icon}</span>
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
