'use client'

import { useState, useTransition } from 'react'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  organizerId: string
  initialFollowing: boolean
  followersCount: number
}

export function FollowButton({ organizerId, initialFollowing, followersCount }: Props) {
  const [following, setFollowing] = useState(initialFollowing)
  const [count, setCount]         = useState(followersCount)
  const [, startTransition]       = useTransition()
  const [pending, setPending]     = useState(false)

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = !following
    setFollowing(next)
    setCount((c) => next ? c + 1 : Math.max(0, c - 1))
    setPending(true)
    startTransition(async () => {
      try {
        await fetch(`/api/organizer/${organizerId}/follow`, {
          method: next ? 'POST' : 'DELETE',
        })
      } catch {
        // revert on error
        setFollowing(!next)
        setCount((c) => next ? Math.max(0, c - 1) : c + 1)
      } finally {
        setPending(false)
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        disabled={pending}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors disabled:opacity-60 ${
          following
            ? 'bg-brand-50 border-brand-200 text-brand-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
            : 'bg-white border-gray-200 text-gray-700 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700'
        }`}
      >
        {pending ? <Spinner size="sm" /> : (following ? '✓ Following' : '+ Follow')}
      </button>
      {count > 0 && (
        <span className="text-xs text-gray-400">
          {count.toLocaleString()} follower{count !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
