'use client'

import { useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  targetId: string
  initialAvailable: boolean
}

export function SayHiButton({ targetId, initialAvailable }: Props) {
  const [available, setAvailable] = useState(initialAvailable)
  const [pending, setPending]     = useState(false)

  if (!available) {
    return (
      <button disabled className="px-4 py-2 rounded-xl border border-gray-100 text-gray-400 text-sm cursor-default">
        👋 Said hi today
      </button>
    )
  }

  async function sayHi() {
    setPending(true)
    try {
      const res = await fetch(`/api/users/${targetId}/say-hi`, { method: 'POST' })
      if (res.ok) setAvailable(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={sayHi}
      disabled={pending}
      className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
    >
      {pending ? <Spinner size="sm" /> : 'Say Hi 👋'}
    </button>
  )
}
