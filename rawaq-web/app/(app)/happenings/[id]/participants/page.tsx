'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
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

const PAGE_SIZE = 15

export default function HappeningParticipantsPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? null
  const [participants, setParticipants] = useState<Participant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async (offset: number, replace: boolean) => {
    if (!id) return
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const data = await clientGetJson<ParticipantsResponse>(
        `/api/happenings/${id}/participants?limit=${PAGE_SIZE}&offset=${offset}`,
        { force: replace },
      )
      setTotal(data.total)
      setParticipants((prev) => (replace ? data.participants : [...prev, ...data.participants]))
    } catch (err) {
      if (!isToastHandledError(err)) setError('Could not load participants.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [id])

  useEffect(() => {
    void fetchPage(0, true)
  }, [fetchPage])

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Participants</h1>
      <p className="mb-6 text-sm text-gray-500">{total} joined</p>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="py-12 text-center text-sm text-red-500">{error}</div>
      ) : participants.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No one has joined yet.</div>
      ) : (
        <>
          <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm">
            {participants.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/user/${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
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

          {participants.length < total && (
            <div className="mt-6 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchPage(participants.length, false)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : `Load more (${total - participants.length} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
