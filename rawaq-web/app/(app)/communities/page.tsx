'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Community, CommunityLevel } from '@/types/database'

type CommunityWithMembership = Community & { is_member: boolean }

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
  onToggleMembership: (slug: string, joined: boolean) => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleJoinLeave() {
    setLoading(true)
    const method = community.is_member ? 'DELETE' : 'POST'
    const endpoint = community.is_member
      ? `/api/communities/${community.slug}/leave`
      : `/api/communities/${community.slug}/join`
    const res = await fetch(endpoint, { method })
    if (res.ok) onToggleMembership(community.slug, !community.is_member)
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {community.cover_url ? (
        <img src={community.cover_url} alt="" className="w-full h-28 object-cover" />
      ) : (
        <div className={`w-full h-28 flex items-center justify-center text-4xl ${LEVEL_COLORS[community.level].split(' ')[0]}`}>
          {LEVEL_ICONS[community.level]}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <Link
              href={`/communities/${community.slug}`}
              className="font-semibold text-gray-900 hover:text-brand-600 transition-colors line-clamp-1"
            >
              {community.name}
            </Link>
            {community.name_ar && (
              <p className="text-xs text-gray-400 mt-0.5" dir="rtl">{community.name_ar}</p>
            )}
          </div>
          {community.is_verified && (
            <span className="shrink-0 text-sm">✓</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${LEVEL_COLORS[community.level]}`}>
            {LEVEL_ICONS[community.level]} {LEVEL_LABELS[community.level]}
          </span>
          {community.city && (
            <span className="text-xs text-gray-500">{community.city}</span>
          )}
        </div>

        {community.description && (
          <p className="text-xs text-gray-500 mb-3 line-clamp-2">{community.description}</p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {community.member_count.toLocaleString()} member{community.member_count !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleJoinLeave}
            disabled={loading}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              community.is_member
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {loading ? '...' : community.is_member ? 'Joined ✓' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CommunitiesPage() {
  const { user } = useAuth()
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([])
  const [loading, setLoading]         = useState(true)
  const [level, setLevel]             = useState<CommunityLevel | 'all'>('all')
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)
  const [hasMore, setHasMore]         = useState(false)
  const PER_PAGE = 18

  const fetchCommunities = useCallback(async (p: number, lvl: CommunityLevel | 'all', q: string) => {
    setLoading(true)
    const sp = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) })
    if (lvl !== 'all') sp.set('level', lvl)
    if (q.trim()) sp.set('q', q.trim())

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
    const t = setTimeout(() => fetchCommunities(1, level, search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [level, search, fetchCommunities])

  function handleToggleMembership(slug: string, joined: boolean) {
    setCommunities((prev) =>
      prev.map((c) =>
        c.slug === slug
          ? { ...c, is_member: joined, member_count: joined ? c.member_count + 1 : Math.max(c.member_count - 1, 0) }
          : c
      )
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Communities</h1>
        <p className="text-gray-500 mt-1">Find your people. Join communities around you.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search communities..."
          className="input flex-1"
        />
        <div className="flex gap-2 flex-wrap">
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

      {/* Grid */}
      {loading && communities.length === 0 ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : communities.length === 0 ? (
        <EmptyState icon="🏘️" title="No communities found" description="Try a different search or filter" />
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
                onClick={() => fetchCommunities(page + 1, level, search)}
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
