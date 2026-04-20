'use client'

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { clientFetchInvalidate, clientGetJson } from '@/lib/client-fetch'
import type { Community, CommunityLevel } from '@/types/database'

type CommunityWithMembership = Community & { is_member: boolean; event_count?: number }
type TrendingCommunity = CommunityWithMembership & { trending_score?: number }
type MembershipMutationResponse = { is_member?: boolean; member_count?: number }

const LEVEL_LABEL_KEYS: Record<CommunityLevel, string> = {
  micro:    'comm.level.micro',
  interest: 'comm.level.interest',
  district: 'comm.level.district',
  city:     'comm.level.city',
  country:  'comm.level.country',
}

const LEVEL_ICONS: Record<CommunityLevel, string> = {
  micro:    '🏘️',
  interest: '🎯',
  district: '🏙️',
  city:     '🌆',
  country:  '🌍',
}

const LEVEL_COLORS: Record<CommunityLevel, string> = {
  micro:    'bg-emerald-50 border-emerald-200 text-emerald-700',
  interest: 'bg-violet-50 border-violet-200 text-violet-700',
  district: 'bg-amber-50 border-amber-200 text-amber-700',
  city:     'bg-blue-50 border-blue-200 text-blue-700',
  country:  'bg-rose-50 border-rose-200 text-rose-700',
}

const ALL_LEVELS: CommunityLevel[] = ['micro', 'interest', 'district', 'city', 'country']

function CommunityCard({ community, onToggleMembership }: {
  community: CommunityWithMembership
  onToggleMembership: (slug: string, joined: boolean, memberCount?: number) => void
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { t } = useLocale()

  async function handleJoinLeave(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    setLoading(true)
    const method = community.is_member ? 'DELETE' : 'POST'
    const endpoint = community.is_member
      ? `/api/communities/${community.slug}/leave`
      : `/api/communities/${community.slug}/join`
    const res = await fetch(endpoint, { method })
    if (res.ok) {
      clientFetchInvalidate('/api/communities')
      const json = await res.json() as { data?: MembershipMutationResponse }
      onToggleMembership(
        community.slug,
        json.data?.is_member ?? !community.is_member,
        json.data?.member_count,
      )
    }
    setLoading(false)
  }

  return (
    <article
      className="group cursor-pointer overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
      onClick={() => router.push(`/communities/${community.slug}`)}
    >
      {community.cover_url ? (
        <img src={community.cover_url} alt="" width={384} height={128} className="h-32 w-full object-cover" />
      ) : (
        <div className={`flex h-32 w-full items-center justify-center text-4xl ${LEVEL_COLORS[community.level].split(' ')[0]}`}>
          {LEVEL_ICONS[community.level]}
        </div>
      )}
      <div className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-1 font-semibold text-gray-900 transition-colors group-hover:text-brand-600">
              {community.name}
            </h2>
            {community.name_ar && (
              <p className="mt-0.5 text-xs text-gray-400" dir="rtl">{community.name_ar}</p>
            )}
          </div>
          {community.is_verified && (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
              {t('comm.verified')}
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${LEVEL_COLORS[community.level]}`}>
            {LEVEL_ICONS[community.level]} {t(LEVEL_LABEL_KEYS[community.level])}
          </span>
          {community.is_member && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {t('comm.joined')}
            </span>
          )}
          {community.city && (
            <span className="text-xs text-gray-500">{community.city}</span>
          )}
        </div>

        {community.description && (
          <p className="mb-4 line-clamp-2 text-xs leading-5 text-gray-500">{community.description}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>{t('comm.member_count').replace('{n}', community.member_count.toLocaleString())}</span>
            <span>{t('comm.event_count').replace('{n}', String(community.event_count ?? 0))}</span>
          </div>
          <button
            onClick={handleJoinLeave}
            disabled={loading}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
              community.is_member
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {loading ? '...' : community.is_member ? t('comm.joined') : t('comm.join')}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function CommunitiesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { t } = useLocale()
  const cacheScopeKey = user?.id ?? null
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([])
  const [loading, setLoading]         = useState(true)
  const [level, setLevel]             = useState<CommunityLevel | 'all'>('all')
  const [search, setSearch]           = useState('')
  const [joinedOnly, setJoinedOnly]   = useState(false)
  const [page, setPage]               = useState(1)
  const [hasMore, setHasMore]         = useState(false)
  const [trending, setTrending]       = useState<TrendingCommunity[]>([])
  const [trendingLoaded, setTrendingLoaded] = useState(false)
  const [recommended, setRecommended] = useState<CommunityWithMembership[]>([])
  const [recommendedLoaded, setRecommendedLoaded] = useState(false)
  const [suggested, setSuggested]     = useState<CommunityWithMembership[]>([])
  const [suggestedJoining, setSuggestedJoining] = useState<string | null>(null)
  const levelsRef = useRef<HTMLDivElement>(null)
  const [levelFadeLeft,  setLevelFadeLeft]  = useState(false)
  const [levelFadeRight, setLevelFadeRight] = useState(false)
  const communitiesAbortRef = useRef<AbortController | null>(null)
  const latestCommunitiesRequestRef = useRef(0)
  const PER_PAGE = 18
  const deferredSearch = useDeferredValue(search)
  const suggestedCommunities = suggested.filter((community) => !recommended.some((item) => item.id === community.id))

  // Drag-to-scroll for level pills (document-level so drag survives leaving the row)
  useEffect(() => {
    const el = levelsRef.current
    if (!el) return
    let isDown = false, startX = 0, scrollLeft = 0, didDrag = false

    const updateFades = () => {
      setLevelFadeLeft(el.scrollLeft > 4)
      setLevelFadeRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
    }

    const onDocMouseMove = (e: MouseEvent) => {
      if (!isDown) return
      e.preventDefault()
      const walk = e.clientX - startX
      if (Math.abs(walk) > 4) didDrag = true
      el.scrollLeft = scrollLeft - walk * 1.4
    }
    const onDocMouseUp = () => {
      if (!isDown) return
      isDown = false
      el.classList.remove('cf-levels--dragging')
      document.removeEventListener('mousemove', onDocMouseMove)
      document.removeEventListener('mouseup', onDocMouseUp)
    }
    const onMouseDown = (e: MouseEvent) => {
      isDown = true; didDrag = false
      startX = e.clientX; scrollLeft = el.scrollLeft
      el.classList.add('cf-levels--dragging')
      document.addEventListener('mousemove', onDocMouseMove)
      document.addEventListener('mouseup', onDocMouseUp)
    }
    const onClickCapture = (e: MouseEvent) => { if (didDrag) { e.stopPropagation(); didDrag = false } }
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('scroll', updateFades, { passive: true })
    // Initial fade check
    requestAnimationFrame(updateFades)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('scroll', updateFades)
      document.removeEventListener('mousemove', onDocMouseMove)
      document.removeEventListener('mouseup', onDocMouseUp)
    }
  }, [])

  const fetchTrending = useCallback(async () => {
    try {
      const json = await clientGetJson<{ data: { data: TrendingCommunity[] } }>(
        '/api/communities/trending?per_page=6&page=1',
        { ttlMs: 60_000, scopeKey: cacheScopeKey },
      )
      setTrending(json.data.data ?? [])
    } catch {
      setTrending([])
    } finally {
      setTrendingLoaded(true)
    }
  }, [cacheScopeKey])

  const fetchRecommended = useCallback(async () => {
    if (!user) {
      setRecommended([])
      setRecommendedLoaded(true)
      return
    }

    try {
      const json = await clientGetJson<{ data: { data: CommunityWithMembership[] } }>(
        '/api/communities?recommended=true&per_page=6&page=1',
        { ttlMs: 60_000, scopeKey: cacheScopeKey },
      )
      setRecommended((json.data.data ?? []).filter((c) => !c.is_member))
    } catch {
      setRecommended([])
    } finally {
      setRecommendedLoaded(true)
    }
  }, [cacheScopeKey, user])

  const fetchSuggested = useCallback(async () => {
    if (!user) {
      setSuggested([])
      return
    }
    try {
      const json = await clientGetJson<{ data: { data: CommunityWithMembership[] } }>(
        '/api/communities?per_page=6&page=1',
        { ttlMs: 60_000, scopeKey: cacheScopeKey },
      )
      setSuggested((json.data.data ?? []).filter((c) => !c.is_member))
    } catch {
      setSuggested([])
    }
  }, [cacheScopeKey, user])

  useEffect(() => { fetchTrending() }, [fetchTrending])
  useEffect(() => { fetchRecommended() }, [fetchRecommended])
  useEffect(() => { fetchSuggested() }, [fetchSuggested])

  async function joinCommunityRecommendation(community: CommunityWithMembership) {
    setSuggestedJoining(community.slug)
    const res = await fetch(`/api/communities/${community.slug}/join`, { method: 'POST' })
    if (res.ok) {
      clientFetchInvalidate('/api/communities')
      setTrending((prev) => prev.filter((c) => c.slug !== community.slug))
      setRecommended((prev) => prev.filter((c) => c.slug !== community.slug))
      setSuggested((prev) => prev.filter((c) => c.slug !== community.slug))
      setCommunities((prev) =>
        prev.map((c) => c.slug === community.slug ? { ...c, is_member: true, member_count: c.member_count + 1 } : c)
      )
    }
    setSuggestedJoining(null)
  }

  const fetchCommunities = useCallback(async (p: number, lvl: CommunityLevel | 'all', q: string, memberOnly = false) => {
    const controller = new AbortController()
    communitiesAbortRef.current?.abort()
    communitiesAbortRef.current = controller
    const requestId = latestCommunitiesRequestRef.current + 1
    latestCommunitiesRequestRef.current = requestId
    setLoading(true)
    const sp = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) })
    if (lvl !== 'all') sp.set('level', lvl)
    if (q.trim()) sp.set('q', q.trim())
    if (memberOnly) sp.set('member_only', 'true')

    try {
      const json = await clientGetJson<{ data: { data: CommunityWithMembership[]; has_more: boolean } }>(
        `/api/communities?${sp}`,
        { ttlMs: 45_000, scopeKey: cacheScopeKey, signal: controller.signal },
      )
      if (latestCommunitiesRequestRef.current !== requestId) return
      if (p === 1) {
        setCommunities(json.data.data)
      } else {
        setCommunities((prev) => [...prev, ...json.data.data])
      }
      setHasMore(json.data.has_more)
      setPage(p)
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return
      }
      if (p === 1) {
        setCommunities([])
        setHasMore(false)
      }
    } finally {
      if (latestCommunitiesRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [cacheScopeKey])

  useEffect(() => {
    const t = setTimeout(() => fetchCommunities(1, level, deferredSearch, joinedOnly), deferredSearch ? 220 : 0)
    return () => clearTimeout(t)
  }, [level, deferredSearch, joinedOnly, fetchCommunities])

  useEffect(() => {
    return () => {
      communitiesAbortRef.current?.abort()
    }
  }, [])

  function handleToggleMembership(slug: string, joined: boolean, memberCount?: number) {
    setCommunities((prev) =>
      prev.map((c) =>
        c.slug === slug
          ? {
              ...c,
              is_member: joined,
              member_count: memberCount ?? (joined ? c.member_count + 1 : Math.max(c.member_count - 1, 0)),
            }
          : c
      ).filter((c) => !joinedOnly || c.is_member)
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8 rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-amber-50 px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">{t('comm.heading_eyebrow')}</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">{t('comm.heading_title')}</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">{t('comm.heading_sub')}</p>
          </div>
          {user && (
            <button
              onClick={() => setJoinedOnly((prev) => !prev)}
              className={`inline-flex items-center gap-2 self-start rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                joinedOnly
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-brand-200 bg-white text-brand-700 hover:border-brand-300'
              }`}
            >
              <span>{joinedOnly ? '✓' : '◎'}</span>
              {t('comm.my_communities')}
            </button>
          )}
        </div>
      </div>

      {/* Trending — skeleton shown while loading to prevent CLS */}
      {!joinedOnly && !search && (
        trendingLoaded ? (
          trending.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('comm.trending')}</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {trending.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => router.push(`/communities/${c.slug}`)}
                    className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4 text-left shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${LEVEL_COLORS[c.level].split(' ')[0]}`}>
                        {LEVEL_ICONS[c.level]}
                      </div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        {t('comm.trending_badge')}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-sm font-semibold text-gray-900">{c.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {c.city ? `${c.city} · ` : ''}{t('comm.members').replace('{n}', c.member_count.toLocaleString())}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="mb-6" aria-hidden="true">
            <div className="skeleton mb-3 h-3.5 w-28 rounded" />
            <div className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
            </div>
          </div>
        )
      )}

      {/* Recommended — skeleton shown while loading to prevent CLS */}
      {user && !joinedOnly && !search && (
        recommendedLoaded ? (
          recommended.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('comm.recommended')}</h2>
              <div className="flex flex-wrap gap-3">
                {recommended.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3 shadow-sm"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${LEVEL_COLORS[c.level].split(' ')[0]}`}>
                      {LEVEL_ICONS[c.level]}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-semibold text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        {t(LEVEL_LABEL_KEYS[c.level])}{c.city ? ` · ${c.city}` : ''} · {t('comm.members').replace('{n}', c.member_count.toLocaleString())}
                      </p>
                    </div>
                    <button
                      onClick={() => joinCommunityRecommendation(c)}
                      disabled={suggestedJoining === c.slug}
                      className="ml-2 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                    >
                      {suggestedJoining === c.slug ? '...' : t('comm.join')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="mb-6" aria-hidden="true">
            <div className="skeleton mb-3 h-3.5 w-40 rounded" />
            <div className="flex flex-wrap gap-3">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 w-56 rounded-2xl" />)}
            </div>
          </div>
        )
      )}

      {user && !joinedOnly && !search && suggestedCommunities.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('comm.popular')}</h2>
          <div className="flex flex-wrap gap-3">
            {suggestedCommunities.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${LEVEL_COLORS[c.level].split(' ')[0]}`}>
                  {LEVEL_ICONS[c.level]}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{t('comm.members').replace('{n}', c.member_count.toLocaleString())}</p>
                </div>
                <button
                  onClick={() => joinCommunityRecommendation(c)}
                  disabled={suggestedJoining === c.slug}
                  className="ml-2 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
                >
                  {suggestedJoining === c.slug ? '...' : t('comm.join')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {user && (
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => router.push('/communities/new')}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <span>+</span>
            {t('comm.create')}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="cf-wrap">
        {/* Dark header */}
        <div className="cf-header">
          <div className="ef-pattern" aria-hidden="true" />
          <div className="ef-header-inner" style={{ position: 'relative' }}>
            <div>
              <p className="ef-eyebrow">{t('comm.filter_eyebrow')}</p>
              <h3 className="ef-title">{t('comm.filter_title')}</h3>
            </div>
            {(search || level !== 'all') && (
              <button
                onClick={() => { setSearch(''); setLevel('all') }}
                className="ef-clear-btn"
                aria-label="Clear filters"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {t('comm.filter_clear')}
              </button>
            )}
          </div>
        </div>
        {/* Body */}
        <div className="cf-body">
          {/* Search */}
          <div className="cf-search-wrap">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: 'oklch(0.58 0.012 72)', flexShrink: 0 }}>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('comm.filter_search')}
              className="ef-search-input"
            />
          </div>
          {/* Level pills */}
          <div className="cf-levels-wrap">
            {levelFadeLeft  && <div className="cf-levels-fade cf-levels-fade--left"  aria-hidden="true" />}
            {levelFadeRight && <div className="cf-levels-fade cf-levels-fade--right" aria-hidden="true" />}
            <div ref={levelsRef} className="cf-levels">
              <button
                onClick={() => setLevel('all')}
                className={`cf-level-btn${level === 'all' ? ' cf-level-btn--active' : ''}`}
              >
                {t('comm.level_all')}
              </button>
              {ALL_LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`cf-level-btn${level === l ? ' cf-level-btn--active' : ''}`}
                >
                  {LEVEL_ICONS[l]} {t(LEVEL_LABEL_KEYS[l])}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading && communities.length === 0 ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : communities.length === 0 ? (
        <EmptyState
          icon="Groups"
          title={joinedOnly ? t('comm.empty_joined') : t('comm.empty_none')}
          description={joinedOnly ? t('comm.empty_joined_desc') : t('comm.empty_none_desc')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {communities.map((c) => (
              <CommunityCard
                key={c.id}
                community={c}
                onToggleMembership={handleToggleMembership}
              />
            ))}
          </div>

          {hasMore && (
            <div className="text-center pt-8">
              <button
                onClick={() => fetchCommunities(page + 1, level, search, joinedOnly)}
                disabled={loading}
                className="btn-secondary"
              >
                {loading ? <Spinner size="sm" /> : t('comm.load_more')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
