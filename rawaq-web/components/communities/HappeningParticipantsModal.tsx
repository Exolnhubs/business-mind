'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { clientGetJson, isToastHandledError } from '@/lib/client-fetch'
import { formatDate } from '@/lib/utils'

type Participant = {
  id: string
  display_name: string
  avatar_url: string | null
  joined_at: string
  platform_joined_at: string
}

type ParticipantsResponse = {
  total: number
  participants: Participant[]
}

interface Props {
  open: boolean
  happeningId: string | null
  onClose: () => void
}

const PAGE_SIZE = 15

export function HappeningParticipantsModal({ open, happeningId, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !happeningId) return
    let active = true
    const id = happeningId

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
    return () => {
      active = false
    }
  }, [open, happeningId])

  return (
    <Modal open={open} onClose={onClose} title="Participants">
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
                    ? <Image src={p.avatar_url} alt="" fill sizes="36px" className="object-cover" />
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
    </Modal>
  )
}
