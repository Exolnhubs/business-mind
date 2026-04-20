'use client'

import { useState, useTransition } from 'react'
import { Spinner } from '@/components/ui/Spinner'

export type FollowState = 'self' | 'none' | 'pending_sent' | 'pending_received' | 'accepted'

interface Props {
  targetId: string
  initialState: FollowState
}

export function UserFollowButton({ targetId, initialState }: Props) {
  const [state, setState] = useState<FollowState>(initialState)
  const [pending, setPending] = useState(false)
  const [, startTransition] = useTransition()

  async function call(url: string, method: string) {
    setPending(true)
    try {
      const res = await fetch(url, { method })
      if (res.ok) {
        const { data } = await res.json() as { data: { follow_state: FollowState } }
        setState(data.follow_state)
      }
    } finally {
      setPending(false)
    }
  }

  if (state === 'self') {
    return (
      <a href="/profile" className="btn-secondary text-sm">Edit Profile →</a>
    )
  }

  if (state === 'none') {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(() => call(`/api/users/${targetId}/follow`, 'POST'))}
        className="btn-brand text-sm disabled:opacity-60"
      >
        {pending ? <Spinner size="sm" /> : '+ Follow'}
      </button>
    )
  }

  if (state === 'pending_sent') {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(() => call(`/api/users/${targetId}/follow`, 'DELETE'))}
        className="px-4 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:border-red-200 hover:text-red-500 disabled:opacity-60 transition-colors"
      >
        {pending ? <Spinner size="sm" /> : 'Requested'}
      </button>
    )
  }

  if (state === 'pending_received') {
    return (
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => startTransition(() => call(`/api/users/${targetId}/follow/accept`, 'POST'))}
          className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
        >
          {pending ? <Spinner size="sm" /> : 'Accept'}
        </button>
        <button
          disabled={pending}
          onClick={() => startTransition(() => call(`/api/users/${targetId}/follow/decline`, 'POST'))}
          className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:border-red-200 hover:text-red-500 disabled:opacity-60 transition-colors"
        >
          Decline
        </button>
      </div>
    )
  }

  // accepted
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => call(`/api/users/${targetId}/follow`, 'DELETE'))}
      className="px-4 py-2 rounded-xl border border-green-200 text-green-700 text-sm font-medium hover:border-red-200 hover:text-red-500 disabled:opacity-60 transition-colors"
    >
      {pending ? <Spinner size="sm" /> : '✓ Following'}
    </button>
  )
}
