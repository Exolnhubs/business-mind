'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Community, CommunityLevel } from '@/types/database'

type CommunityWithMembership = Community & { is_member: boolean }
type MembershipMutationResponse = { is_member?: boolean; member_count?: number }

const LEVEL_LABELS: Record<CommunityLevel, string> = {
  micro:    'Micro',
  interest: 'Interest',
  district: 'District',
  city:     'City',
  country:  'Country',
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

  async function handleJoinLeave(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    setLoading(true)
    const method = community.is_member ? 'DELETE' : 'POST'
    const endpoint = community.is_member
      ? `/api/communities/${community.slug}/leave`
      : `/api/communities/${community.slug}/join`
    const res = await fetch(endpoint, { method })
    if (res.ok) {
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
        <img src={community.cover_url} alt="" className="h-32 w-full object-cover" />
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
              Verified
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${LEVEL_COLORS[community.level]}`}>
            {LEVEL_ICONS[community.level]} {LEVEL_LABELS[community.level]}
          </span>
          {community.is_member && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Joined
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
          <span className="text-xs text-gray-400">
            {community.member_count.toLocaleString()} member{community.member_count !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleJoinLeave}
            disabled={loading}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
              community.is_member
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {loading ? '...' : community.is_member ? 'Joined' : 'Join'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function CommunitiesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([])
  const [loading, setLoading]         = useState(true)
  const [level, setLevel]             = useState<CommunityLevel | 'all'>('all')
  const [search, setSearch]           = useState('')
  const [joinedOnly, setJoinedOnly]   = useState(false)
  const [page, setPage]               = useState(1)
  const [hasMore, setHasMore]         = useState(false)
  const [suggested, setSuggested]     = useState<CommunityWithMembership[]>([])
  const [suggestedJoining, setSuggestedJoining] = useState<string | null>(null)
  const PER_PAGE = 18

  const fetchSuggested = useCallback(async () => {
    if (!user) return
    const res = await fetch('/api/communities?per_page=6&page=1')
    if (res.ok) {
      const json = await res.json() as { data: { data: CommunityWithMembership[] } }
      setSuggested((json.data.data ?? []).filter((c) => !c.is_member))
    }
  }, [user])

  useEffect(() => { fetchSuggested() }, [fetchSuggested])

  async function joinSuggested(community: CommunityWithMembership) {
    setSuggestedJoining(community.slug)
    const res = await fetch(`/api/communities/${community.slug}/join`, { method: 'POST' })
    if (res.ok) {
      setSuggested((prev) => prev.filter((c) => c.slug !== community.slug))
      setCommunities((prev) =>
        prev.map((c) => c.slug === community.slug ? { ...c, is_member: true, member_count: c.member_count + 1 } : c)
      )
    }
    setSuggestedJoining(null)
  }

  const fetchCommunities = useCallback(async (p: number, lvl: CommunityLevel | 'all', q: string, memberOnly = false) => {
    setLoading(true)
    const sp = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) })
    if (lvl !== 'all') sp.set('level', lvl)
    if (q.trim()) sp.set('q', q.trim())
    if (memberOnly) sp.set('member_only', 'true')

    const res = await fetch(`/api/communities?${sp}`)
    if (res.ok) {
      const json = await res.json() as { data: { data: CommunityWithMembership[]; has_more: boolean } }
      if (p === 1) {
        setCommunities(json.data.data)
      } else {
        setCommunities((prev) => [...prev, ...json.data.data])
      }
      setHasMore(json.data.has_more)
      setPage(p)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchCommunities(1, level, search, joinedOnly), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [level, search, joinedOnly, fetchCommunities])

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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Rawaq Communities</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Find your people</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">Explore local circles, interest groups, and city communities where events turn into real relationships.</p>
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
              My Communities
            </button>
          )}
        </div>
      </div>

      {/* Suggested for you — shown when user is logged in, not filtering */}
      {user && !joinedOnly && !search && suggested.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Suggested for you</h2>
          <div className="flex flex-wrap gap-3">
            {suggested.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${LEVEL_COLORS[c.level].split(' ')[0]}`}>
                  {LEVEL_ICONS[c.level]}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.member_count.toLocaleString()} members</p>
                </div>
                <button
                  onClick={() => joinSuggested(c)}
                  disabled={suggestedJoining === c.slug}
                  className="ml-2 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
                >
                  {suggestedJoining === c.slug ? '...' : 'Join'}
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
            Create Community
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search communities..."
          className="input flex-1"
        />
        <div className="flex min-h-[44px] flex-wrap gap-2">
          <button
            onClick={() => setLevel('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              level === 'all' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {ALL_LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                level === l ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {LEVEL_ICONS[l]} {LEVEL_LABELS[l]}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Grid */}
      {loading && communities.length === 0 ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : communities.length === 0 ? (
        <EmptyState
          icon="Groups"
          title={joinedOnly ? 'No joined communities yet' : 'No communities found'}
          description={
            joinedOnly
              ? 'Communities you join will appear here so you can filter by them quickly.'
              : 'Try a different search or filter.'
          }
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
                {loading ? <Spinner size="sm" /> : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
