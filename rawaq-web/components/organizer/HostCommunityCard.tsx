'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { clientGetJson, clientPostJson, clientPatchJson, isToastHandledError } from '@/lib/client-fetch'
import { useLocale } from '@/contexts/locale-context'

type CommunitySummary = {
  id: string
  slug: string
  name: string
  name_ar: string | null
  cover_url: string | null
  member_count: number
}

type State = { enabled: boolean; community: CommunitySummary | null }

export function HostCommunityCard() {
  const { t, locale } = useLocale()
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    clientGetJson<{ data: State }>('/api/organizer/host-community')
      .then((res) => { if (active) setState(res.data ?? { enabled: false, community: null }) })
      .catch((err) => { if (active && !isToastHandledError(err)) setState({ enabled: false, community: null }) })
    return () => { active = false }
  }, [])

  async function toggle() {
    if (busy) return
    setBusy(true)
    try {
      const res = state?.enabled
        ? await clientPatchJson<{ data: State }>('/api/organizer/host-community')
        : await clientPostJson<{ data: State }>('/api/organizer/host-community')
      setState(res.data)
    } catch {
      // Errors surface as toasts via client-fetch; keep current state.
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null

  const community = state.community
  const displayName = community
    ? (locale === 'ar' && community.name_ar ? community.name_ar : community.name)
    : null

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-2xl">
            🏠
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{t('host_comm.title')}</h3>
              {state.enabled && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {t('host_comm.active_badge')}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{t('host_comm.desc')}</p>
          </div>
        </div>
      </div>

      {community && (
        <Link
          href={`/communities/${community.slug}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-violet-200 transition-colors"
        >
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{displayName}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {t('host_comm.members').replace('{n}', community.member_count.toLocaleString())}
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-violet-700">{t('host_comm.view')}</span>
        </Link>
      )}

      {!state.enabled && community && (
        <p className="text-xs text-gray-400">{t('host_comm.disabled_note')}</p>
      )}

      <button
        onClick={toggle}
        disabled={busy}
        className={state.enabled ? 'btn-secondary text-sm px-4 py-2' : 'btn-primary text-sm px-4 py-2'}
      >
        {busy
          ? (state.enabled ? t('host_comm.disabling') : t('host_comm.enabling'))
          : (state.enabled ? t('host_comm.disable') : t('host_comm.create'))}
      </button>
    </section>
  )
}
