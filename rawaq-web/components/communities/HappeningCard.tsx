'use client'

import { useState } from 'react'
import type { HappeningWithAuthor, HappeningType } from '@/types/database'
import { useAuth } from '@/contexts/auth-context'

const TYPE_META: Record<HappeningType, { label: string; emoji: string; bg: string; text: string }> = {
  open_invite: { label: 'Open Invite', emoji: '🙋', bg: 'bg-brand-50',  text: 'text-brand-700' },
  info:        { label: 'Info',        emoji: 'ℹ️', bg: 'bg-blue-50',   text: 'text-blue-700'  },
  question:    { label: 'Question',    emoji: '❓', bg: 'bg-yellow-50', text: 'text-yellow-700'},
  alert:       { label: 'Alert',       emoji: '🚨', bg: 'bg-red-50',    text: 'text-red-700'   },
}

function timeLeft(expiresAt: string): string {
  const ms   = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h    = Math.floor(ms / 3_600_000)
  const m    = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

interface Props {
  happening:    HappeningWithAuthor
  onRsvp:       (h: HappeningWithAuthor) => void
  onReact:      (h: HappeningWithAuthor) => void
  onDelete?:    (id: string) => void
}

export function HappeningCard({ happening: h, onRsvp, onReact, onDelete }: Props) {
  const { user }   = useAuth()
  const meta       = TYPE_META[h.type]
  const [ttl]      = useState(() => timeLeft(h.expires_at))
  const isExpired  = new Date(h.expires_at) < new Date()
  const isAuthor   = user?.id === h.author_id
  const avatarChar = h.author.display_name.slice(0, 1).toUpperCase()

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-opacity ${isExpired ? 'opacity-50' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700 shrink-0">
            {h.author.avatar_url
              ? <img src={h.author.avatar_url} alt="" className="h-full w-full object-cover" />
              : avatarChar
            }
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">{h.author.display_name}</p>
            <p className="text-xs text-gray-400">{ttl}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
            {meta.emoji} {meta.label}
          </span>
          {isAuthor && onDelete && (
            <button
              onClick={() => onDelete(h.id)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Delete"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <p className="text-sm text-gray-800 leading-relaxed mb-3">{h.body}</p>

      {/* Location hint */}
      {h.lat && h.lng && (
        <p className="text-xs text-gray-400 mb-3">📍 Location attached</p>
      )}

      {/* Actions */}
      {!isExpired && user && (
        <div className="flex items-center gap-3 border-t border-gray-50 pt-3">
          <button
            onClick={() => onRsvp(h)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              h.user_has_rsvp
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            🙋 {h.user_has_rsvp ? "I'm in" : 'Join'} · {h.rsvp_count}
          </button>
          <button
            onClick={() => onReact(h)}
            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              h.user_has_reacted
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-700 hover:bg-yellow-50 hover:text-yellow-700'
            }`}
          >
            👍 {h.reaction_count}
          </button>
        </div>
      )}
    </div>
  )
}
