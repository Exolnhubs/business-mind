'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { UserHappeningCard, UserHappeningCardSkeleton } from './UserHappeningCard'
import { UserFollowButton } from './UserFollowButton'
import type { FollowState } from './UserFollowButton'
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard'

interface SharedCommunity {
  id: string
  name: string
  slug: string
  member_count: number
  viewer_is_member: boolean
}

interface Props {
  targetId: string
  followState: FollowState
  isMutual: boolean
  sharedCommunities: SharedCommunity[]
}

type Tab = 'activity' | 'events' | 'communities'

interface Happening {
  id: string
  body: string
  created_at: string
  expires_at: string | null
  communities: { name: string; slug: string } | null
  reactions: Array<{ count: number }>
  rsvps: Array<{ count: number }>
}

export function UserProfileTabs({ targetId, followState, isMutual, sharedCommunities }: Props) {
  const [tab, setTab]                     = useState<Tab>('activity')
  const [happenings, setHappenings]       = useState<Happening[]>([])
  const [happeningsLoaded, setHappeningsLoaded] = useState(false)
  const [happeningsLoading, setHappeningsLoading] = useState(false)
  const [happeningsBefore, setHappeningsBefore] = useState<string | null>(null)
  const [happeningsHasMore, setHappeningsHasMore] = useState(true)

  const [events, setEvents]               = useState<any[]>([])
  const [eventsLoaded, setEventsLoaded]   = useState(false)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsOffset, setEventsOffset]   = useState(0)
  const [eventsHasMore, setEventsHasMore] = useState(true)

  const [allCommunities, setAllCommunities]         = useState<any[]>([])
  const [communitiesLoaded, setCommunitiesLoaded]   = useState(false)
  const [communitiesExpanded, setCommunitiesExpanded] = useState(false)

  async function loadHappenings() {
    if (happeningsLoading) return
    setHappeningsLoading(true)
    const url = `/api/users/${targetId}/happenings?limit=10${happeningsBefore ? `&before=${happeningsBefore}` : ''}`
    const res = await fetch(url)
    if (res.ok) {
      const { data } = await res.json() as { data: Happening[] }
      setHappenings((prev) => [...prev, ...data])
      setHappeningsHasMore(data.length === 10)
      if (data.length > 0) setHappeningsBefore(data[data.length - 1].created_at)
    }
    setHappeningsLoaded(true)
    setHappeningsLoading(false)
  }

  async function loadEvents() {
    if (eventsLoading) return
    setEventsLoading(true)
    const res = await fetch(`/api/users/${targetId}/events?limit=8&offset=${eventsOffset}`)
    if (res.ok) {
      const { data } = await res.json() as { data: any[] }
      setEvents((prev) => [...prev, ...data])
      setEventsHasMore(data.length === 8)
      setEventsOffset((o) => o + data.length)
    }
    setEventsLoaded(true)
    setEventsLoading(false)
  }

  async function loadCommunities() {
    const res = await fetch(`/api/communities?member_only=true&user_id=${targetId}`)
    if (res.ok) {
      const { data } = await res.json() as { data: any[] }
      setAllCommunities(data ?? [])
    }
    setCommunitiesLoaded(true)
  }

  function switchTab(next: Tab) {
    setTab(next)
    if (next === 'activity' && !happeningsLoaded) loadHappenings()
    if (next === 'events' && isMutual && !eventsLoaded) loadEvents()
    if (next === 'communities' && !communitiesLoaded) loadCommunities()
  }

  // Load activity tab on mount (it's the default tab)
  useEffect(() => { loadHappenings() }, []) // eslint-disable-line react-hooks/exhaustive-deps


  const tabClass = (t: Tab) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="space-y-0">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        <button onClick={() => switchTab('activity')} className={tabClass('activity')}>Activity</button>
        <button onClick={() => switchTab('events')} className={tabClass('events')}>
          Events {!isMutual && <span className="ml-1">🔒</span>}
        </button>
        <button onClick={() => switchTab('communities')} className={tabClass('communities')}>Communities</button>
      </div>

      {/* Activity panel */}
      {tab === 'activity' && (
        <div className="py-4 space-y-3">
          {happeningsLoading && happenings.length === 0 && (
            <>
              <UserHappeningCardSkeleton />
              <UserHappeningCardSkeleton />
              <UserHappeningCardSkeleton />
            </>
          )}
          {happeningsLoaded && happenings.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No public activity yet.</p>
          )}
          {happenings.map((h) => <UserHappeningCard key={h.id} {...h} />)}
          {happeningsHasMore && happeningsLoaded && (
            <button
              onClick={loadHappenings}
              disabled={happeningsLoading}
              className="w-full py-2 text-sm text-brand-600 hover:underline disabled:opacity-50"
            >
              {happeningsLoading ? 'Loading\u2026' : 'Load more'}
            </button>
          )}
        </div>
      )}

      {/* Events panel */}
      {tab === 'events' && (
        <div className="py-4">
          {!isMutual ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-gray-500 text-sm">You both need to follow each other to see attended events.</p>
              {followState === 'none' && (
                <UserFollowButton targetId={targetId} initialState="none" />
              )}
            </div>
          ) : (
            <>
              {eventsLoading && events.length === 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[0,1,2].map((i) => <EventCardSkeleton key={i} />)}
                </div>
              )}
              {eventsLoaded && events.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-10">No events attended yet.</p>
              )}
              {events.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {events.map((e) => <EventCard key={e.id} event={e} priority={false} />)}
                </div>
              )}
              {eventsHasMore && eventsLoaded && (
                <button
                  onClick={loadEvents}
                  disabled={eventsLoading}
                  className="w-full py-2 mt-4 text-sm text-brand-600 hover:underline disabled:opacity-50"
                >
                  {eventsLoading ? 'Loading\u2026' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Communities panel */}
      {tab === 'communities' && (
        <div className="py-4 space-y-6">
          {/* In common */}
          {sharedCommunities.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">In common</h4>
              <div className="space-y-2">
                {sharedCommunities.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100">
                    <Link href={`/communities/${c.slug}`} className="text-sm font-medium text-gray-800 hover:text-brand-600">{c.name}</Link>
                    {!c.viewer_is_member && (
                      <Link href={`/communities/${c.slug}`} className="text-xs text-brand-600 font-medium hover:underline">Join</Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All communities */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">All communities</h4>
            {!communitiesLoaded ? (
              <div className="space-y-2">
                {[0,1,2].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
              </div>
            ) : allCommunities.length === 0 ? (
              <p className="text-sm text-gray-400">Not a member of any public communities.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {(communitiesExpanded ? allCommunities : allCommunities.slice(0, 6)).map((c: any) => (
                    <div key={c.id} className="flex items-center p-3 rounded-xl border border-gray-100">
                      <Link href={`/communities/${c.slug}`} className="text-sm font-medium text-gray-800 hover:text-brand-600">{c.name}</Link>
                    </div>
                  ))}
                </div>
                {allCommunities.length > 6 && (
                  <button
                    onClick={() => setCommunitiesExpanded((v) => !v)}
                    className="text-xs text-brand-600 hover:underline mt-2"
                  >
                    {communitiesExpanded ? 'Show less' : `Show ${allCommunities.length - 6} more`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
