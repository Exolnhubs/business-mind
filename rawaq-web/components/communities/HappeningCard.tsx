'use client'

import { useState } from 'react'
import { SafeImage } from '@/components/ui/SafeImage'
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
  onShowParticipants?: (h: HappeningWithAuthor) => void
}

export function HappeningCard({ happening: h, onRsvp, onReact, onDelete, onReport, onShowParticipants }: Props) {
  const { user } = useAuth()
  const meta = TYPE_META[h.type]
  const [ttl] = useState(() => timeLeft(h.expires_at))
  const isExpired   = new Date(h.expires_at) < new Date()
  const isAuthor    = user?.id === h.author_id
  const avatarChar  = h.author.display_name.slice(0, 1).toUpperCase()

  // RSVP state
  const isOpenInvite   = h.type === 'open_invite'
  const capacity       = h.capacity ?? 10
  const isPending      = h.user_rsvp_status === 'pending'
  const isJoined       = h.user_has_rsvp || h.user_rsvp_status === 'approved'
  const isFull         = isOpenInvite && !h.requires_approval && h.rsvp_count >= capacity && !isJoined && !isPending
  const pendingCount   = h.pending_count ?? 0
  const showManage     = isAuthor && isOpenInvite && h.requires_approval

  function joinLabel() {
    if (isJoined)  return "I'm in"
    if (isPending) return '⏳ Pending'
    if (isFull)    return 'Full'
    return 'Join'
  }

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-opacity ${isExpired ? 'opacity-50' : ''}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {h.author.avatar_url
              ? <SafeImage src={h.author.avatar_url} alt="" fill sizes="36px" className="object-cover" />
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
          {isOpenInvite && (
            <span className="text-xs text-gray-400">{h.rsvp_count}/{capacity}</span>
          )}
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

      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (h.rsvp_count > 0 || showManage) onShowParticipants?.(h)
          }}
          disabled={h.rsvp_count === 0 && !showManage}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors enabled:hover:text-brand-700 disabled:cursor-default"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {h.rsvp_count > 0 ? `${h.rsvp_count} joined` : 'No one joined yet'}
          {h.rsvp_count > 0 && <span aria-hidden>›</span>}
        </button>

        {showManage && pendingCount > 0 && (
          <button
            type="button"
            onClick={() => onShowParticipants?.(h)}
            className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-200"
          >
            ⏳ {pendingCount} pending
          </button>
        )}
      </div>

      {!isExpired && user && (
        <div className="flex items-center gap-3 border-t border-gray-50 pt-3">
          <button
            onClick={() => !isFull && onRsvp(h)}
            disabled={isFull}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              isJoined
                ? 'bg-brand-600 text-white'
                : isPending
                ? 'bg-orange-100 text-orange-700'
                : isFull
                ? 'bg-gray-100 text-gray-400'
                : 'bg-gray-100 text-gray-700 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            🙋 {joinLabel()} - {h.rsvp_count}
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
