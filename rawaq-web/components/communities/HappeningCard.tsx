'use client'

import { useState } from 'react'
import type { HappeningWithAuthor, HappeningType } from '@/types/database'
import { useAuth } from '@/contexts/auth-context'
import { PlanBadge } from '@/components/ui/PlanBadge'

const TYPE_META: Record<HappeningType, { label: string; icon: string; bg: string; text: string }> = {
  open_invite: { label: 'Open invite', icon: '🎉', bg: 'bg-brand-50', text: 'text-brand-700' },
  info: { label: 'Update', icon: '📣', bg: 'bg-blue-50', text: 'text-blue-700' },
  question: { label: 'Ping', icon: '👋', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  alert: { label: 'Meetup alert', icon: '📍', bg: 'bg-red-50', text: 'text-red-700' },
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

interface Props {
  happening: HappeningWithAuthor
  onRsvp: (h: HappeningWithAuthor) => void
  onReact: (h: HappeningWithAuthor) => void
  onDelete?: (id: string) => void
  onReport?: (id: string, reason: string) => void
}

export function HappeningCard({ happening: h, onRsvp, onReact, onDelete, onReport }: Props) {
  const { user } = useAuth()
  const meta = TYPE_META[h.type]
  const [ttl] = useState(() => timeLeft(h.expires_at))
  const isExpired = new Date(h.expires_at) < new Date()
  const isAuthor = user?.id === h.author_id
  const avatarChar = h.author.display_name.slice(0, 1).toUpperCase()

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-opacity ${isExpired ? 'opacity-50' : ''}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {h.author.avatar_url
              ? <img src={h.author.avatar_url} alt="" className="h-full w-full object-cover" />
              : avatarChar}
          </div>
          <div>
            <p className="leading-tight text-sm font-semibold text-gray-900 flex items-center gap-1">
              {h.author.display_name}
              <PlanBadge planId={h.author.plan_id} size={14} />
            </p>
            <p className="text-xs text-gray-400">{ttl}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.bg} ${meta.text}`}>
            {meta.icon} {meta.label}
          </span>
          {isAuthor && onDelete && (
            <button
              onClick={() => onDelete(h.id)}
              className="text-xs text-gray-400 transition-colors hover:text-red-500"
              title="Delete"
            >
              x
            </button>
          )}
        </div>
      </div>

      <p className="mb-3 text-sm leading-relaxed text-gray-800">{h.body}</p>

      {h.lat && h.lng && (
        <a
          href={`https://maps.google.com/?q=${h.lat},${h.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          Location: {h.location_label?.trim() || 'View on map'}
        </a>
      )}

      {!isExpired && user && (
        <div className="flex items-center gap-3 border-t border-gray-50 pt-3">
          <button
            onClick={() => onRsvp(h)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${h.user_has_rsvp
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-brand-50 hover:text-brand-700'
              }`}
          >
            🙋 {h.user_has_rsvp ? "I'm in" : 'Join'} - {h.rsvp_count}
          </button>
          <button
            onClick={() => onReact(h)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${h.user_has_reacted
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-700 hover:bg-yellow-50 hover:text-yellow-700'
              }`}
          >
            Like 👍 {h.reaction_count}
          </button>
          {!isAuthor && onReport && (
            <button
              onClick={() => onReport(h.id, 'spam')}
              className="ml-auto px-2 py-1.5 text-xs text-gray-400 transition-colors hover:text-red-500"
              title="Report"
            >
              Report
            </button>
          )}
        </div>
      )}
    </div>
  )
}
