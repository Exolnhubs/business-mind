'use client'

import { useEffect, useState } from 'react'
import { clientGetJson, clientPostJson, isToastHandledError } from '@/lib/client-fetch'
import { useLocale } from '@/contexts/locale-context'

type Suggested = {
  id: string
  slug: string
  name: string
  name_ar: string | null
  cover_url: string | null
  member_count: number
}

/**
 * Booking-confirmation join prompt. Fetches the host-community suggestion for a
 * confirmed booking (server-gated on status='confirmed') and, when present,
 * offers join-or-discard. Discard is transient — local dismiss only.
 */
export function HostCommunityJoinPrompt({ bookingId }: { bookingId: string }) {
  const { t, locale } = useLocale()
  const [community, setCommunity] = useState<Suggested | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    let active = true
    clientGetJson<{ data: { suggested_community: Suggested | null } }>(
      `/api/bookings/${bookingId}/host-community-suggestion`,
    )
      .then((res) => { if (active) setCommunity(res.data?.suggested_community ?? null) })
      .catch((err) => { if (active && !isToastHandledError(err)) setCommunity(null) })
    return () => { active = false }
  }, [bookingId])

  if (!community || dismissed) return null

  const displayName = locale === 'ar' && community.name_ar ? community.name_ar : community.name

  async function join() {
    if (joining || !community) return
    setJoining(true)
    try {
      await clientPostJson(`/api/communities/${community.slug}/join`)
      setDismissed(true)
    } catch {
      // Errors surface as toasts via client-fetch; keep the prompt open to retry.
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-violet-100 bg-violet-50/60 p-4 text-start space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
          🏠
        </div>
        <p className="text-sm text-gray-700">
          {t('host_comm.join_prompt').replace('{name}', displayName)}
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={join} disabled={joining} className="btn-primary text-sm px-4 py-2">
          {joining ? t('host_comm.joining') : t('host_comm.join')}
        </button>
        <button onClick={() => setDismissed(true)} className="btn-secondary text-sm px-4 py-2">
          {t('host_comm.join_dismiss')}
        </button>
      </div>
    </div>
  )
}
