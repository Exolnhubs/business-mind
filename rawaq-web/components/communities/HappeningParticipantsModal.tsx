'use client'

import { useEffect, useState } from 'react'
import { SafeImage } from '@/components/ui/SafeImage'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { clientGetJson, isToastHandledError } from '@/lib/client-fetch'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import type { HappeningWithAuthor } from '@/types/database'

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

type PendingParticipant = {
  user_id: string
  display_name: string
  avatar_url: string | null
  requested_at: string
}

type ParticipantsResponse = {
  total: number
  participants: Participant[]
}

interface Props {
  open: boolean
  happeningId: string | null
  happening?: HappeningWithAuthor | null
  onClose: () => void
}

const PAGE_SIZE = 15

export function HappeningParticipantsModal({ open, happeningId, happening, onClose }: Props) {
  const { user } = useAuth()
  const isAuthor        = !!user && !!happening && happening.author_id === user.id
  const requiresApproval = happening?.requires_approval ?? false
  const showTabs        = isAuthor && requiresApproval

  const [activeTab, setActiveTab]   = useState<'approved' | 'pending'>('approved')
  const [loading, setLoading]       = useState(false)
  const [total, setTotal]           = useState(0)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [error, setError]           = useState<string | null>(null)

  const [loadingPending, setLoadingPending] = useState(false)
  const [pendingList, setPendingList]       = useState<PendingParticipant[]>([])
  const [actionPending, setActionPending]   = useState<string | null>(null)

  // Load approved list
  useEffect(() => {
    if (!open || !happeningId || activeTab !== 'approved') return
    let active = true
    const id   = happeningId

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const json = await clientGetJson<{ data: ParticipantsResponse }>(
          `/api/happenings/${id}/participants?limit=${PAGE_SIZE}`,
        )
        if (!active) return
        setTotal(json.data.total)
        setParticipants(json.data.participants ?? [])
      } catch (err) {
        if (!active) return
        if (!isToastHandledError(err)) setError('Could not load participants.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [open, happeningId, activeTab])

  // Load pending list
  useEffect(() => {
    if (!open || !happeningId || !showTabs || activeTab !== 'pending') return
    let active = true
    const id   = happeningId

    async function load() {
      setLoadingPending(true)
      try {
        const json = await clientGetJson<{ data: { pending: PendingParticipant[] } }>(
          `/api/happenings/${id}/approve`,
        )
        if (!active) return
        setPendingList(json.data.pending ?? [])
      } catch {
        // silent
      } finally {
        if (active) setLoadingPending(false)
      }
    }

    void load()
    return () => { active = false }
  }, [open, happeningId, showTabs, activeTab])

  async function handleApproveAction(userId: string, action: 'approve' | 'reject') {
    if (!happeningId) return
    setActionPending(userId)
    try {
      const res = await fetch(`/api/happenings/${happeningId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, action }),
      })
      if (res.ok) {
        setPendingList((prev) => prev.filter((p) => p.user_id !== userId))
        if (action === 'approve') {
          setTotal((t) => t + 1)
        }
      }
    } finally {
      setActionPending(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Participants">
      {showTabs && (
        <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
          <button
            onClick={() => setActiveTab('approved')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'approved' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Approved ({total})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Pending ({pendingList.length})
          </button>
        </div>
      )}

      {activeTab === 'approved' ? (
        <>
          <p className="mb-3 text-xs text-gray-500">{total} joined</p>

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-500">{error}</div>
          ) : participants?.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No one has joined yet.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {participants.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/user/${p.id}`}
                    onClick={onClose}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:bg-gray-50 rounded-md px-2 -mx-2"
                  >
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                      {p.avatar_url
                        ? <SafeImage src={p.avatar_url} alt="" fill sizes="36px" className="object-cover" />
                        : p.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900">{p.display_name}</span>
                      <span className="block truncate text-xs text-gray-500">
                        Joined Rawaq · {formatDate(p.platform_joined_at)}
                      </span>
                    </span>
                    <span aria-hidden className="text-gray-300">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {total > PAGE_SIZE && happeningId && (
            <div className="mt-4 border-t border-gray-100 pt-3 text-center">
              <Link
                href={`/happenings/${happeningId}/participants`}
                onClick={onClose}
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                View all {total} participants
                <span aria-hidden>›</span>
              </Link>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-500">{pendingList.length} pending request{pendingList.length !== 1 ? 's' : ''}</p>

          {loadingPending ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : pendingList.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No pending requests.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pendingList.map((p) => (
                <li key={p.user_id} className="flex items-center gap-3 py-2.5">
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                    {p.avatar_url
                      ? <SafeImage src={p.avatar_url} alt="" fill sizes="36px" className="object-cover" />
                      : p.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{p.display_name}</span>
                    <span className="block truncate text-xs text-gray-500">
                      Requested · {formatDate(p.requested_at)}
                    </span>
                  </span>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => handleApproveAction(p.user_id, 'approve')}
                      disabled={actionPending === p.user_id}
                      className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleApproveAction(p.user_id, 'reject')}
                      disabled={actionPending === p.user_id}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  )
}
