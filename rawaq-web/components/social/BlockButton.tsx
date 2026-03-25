'use client'

import { useState, useTransition } from 'react'

interface Props {
  userId: string
  initialBlocking: boolean
}

export function BlockButton({ userId, initialBlocking }: Props) {
  const [blocking, setBlocking] = useState(initialBlocking)
  const [showConfirm, setShowConfirm] = useState(false)
  const [, startTransition] = useTransition()

  function handleConfirm() {
    const next = !blocking
    setBlocking(next)
    setShowConfirm(false)
    startTransition(async () => {
      try {
        await fetch(`/api/users/${userId}/block`, {
          method: next ? 'POST' : 'DELETE',
        })
      } catch {
        setBlocking(!next)
      }
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowConfirm((o) => !o)}
        className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
          blocking
            ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-red-500'
        }`}
        title={blocking ? 'Unblock user' : 'Block user'}
      >
        {blocking ? '🚫 Blocked' : '⋯'}
      </button>

      {showConfirm && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowConfirm(false)} />
          <div className="absolute end-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden animate-fade-in">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-700">
                {blocking ? 'Unblock this user?' : 'Block this user?'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {blocking
                  ? 'They will be able to interact with you again.'
                  : 'They will not be able to interact with you.'}
              </p>
            </div>
            <button
              onClick={handleConfirm}
              className={`w-full px-4 py-2.5 text-xs font-medium text-start transition-colors ${
                blocking
                  ? 'text-green-700 hover:bg-green-50'
                  : 'text-red-600 hover:bg-red-50'
              }`}
            >
              {blocking ? '✓ Unblock' : '🚫 Confirm Block'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="w-full px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 text-start border-t border-gray-100"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
