'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { HappeningCard } from '@/components/communities/HappeningCard'
import { PostHappeningForm } from '@/components/communities/PostHappeningForm'
import { useHappenings } from '@/hooks/useHappenings'
import { formatDate } from '@/lib/utils'
import type { Community, CommunityLevel, Event } from '@/types/database'

type CommunityDetail = Community & {
  is_member: boolean
  event_count: number
  ancestors: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>[]
  recent_events: Pick<Event, 'id' | 'title' | 'title_ar' | 'cover_image_url' | 'start_at' | 'city' | 'is_free' | 'price' | 'currency' | 'bookings_count'>[]
  recent_members: Array<{ id: string; display_name: string; avatar_url: string | null; joined_at: string }>
  activity: Array<{ id: string; type: 'member_joined' | 'event_published'; title: string; subtitle: string; created_at: string; href: string | null }>
}
type MembershipMutationResponse = { is_member?: boolean; member_count?: number }

const LEVEL_ICONS: Record<CommunityLevel, string> = {
  micro:    '🏘️',
  interest: '🎯',
  district: '🏙️',
  city:     '🌆',
  country:  '🌍',
}

export default function CommunityDetailPage() {
  const { slug }   = useParams<{ slug: string }>()
  const { user }   = useAuth()
  const router     = useRouter()

  const [community, setCommunity] = useState<CommunityDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [joining, setJoining]     = useState(false)
  const [events, setEvents]       = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [nextCursor, setNextCursor]       = useState<string | null>(null)
  const [showPostForm, setShowPostForm]   = useState(false)

  const isMember = community?.is_member ?? false
  const { happenings, loading: happeningsLoading, posting, post, toggleRsvp, toggleReact, remove, report } =
    useHappenings(slug, isMember)

  useEffect(() => {
    fetch(`/api/communities/${slug}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => setCommunity(json.data))
      .catch(() => router.replace('/communities'))
      .finally(() => setLoading(false))
  }, [slug, router])

  async function loadEvents(cursor?: string) {
    setEventsLoading(true)
    const sp = new URLSearchParams({ per_page: '12' })
    if (cursor) sp.set('cursor', cursor)
    const res = await fetch(`/api/communities/${slug}/events?${sp}`)
    if (res.ok) {
      const json = await res.json() as { data: { events: Event[]; next_cursor: string | null } }
      setEvents((prev) => cursor ? [...prev, ...json.data.events] : json.data.events)
      setNextCursor(json.data.next_cursor)
    }
    setEventsLoading(false)
  }

  useEffect(() => {
    if (community) loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community?.id])

  async function toggleMembership() {
    if (!user) { router.push('/login'); return }
    if (!community) return
    setJoining(true)
    const method   = community.is_member ? 'DELETE' : 'POST'
    const endpoint = community.is_member
      ? `/api/communities/${slug}/leave`
      : `/api/communities/${slug}/join`
    const res = await fetch(endpoint, { method })
    if (res.ok) {
      const json = await res.json() as { data?: MembershipMutationResponse }
      setCommunity((prev) =>
        prev
          ? {
              ...prev,
              is_member: json.data?.is_member ?? !prev.is_member,
              member_count: json.data?.member_count ?? (!prev.is_member ? prev.member_count + 1 : Math.max(prev.member_count - 1, 0)),
            }
          : prev
      )
    }
    setJoining(false)
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>
  }

  if (!community) return null

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero */}
      <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm mb-8">
        {community.cover_url ? (
          <img src={community.cover_url} alt="" className="w-full h-48 object-cover" />
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center text-6xl">
            {LEVEL_ICONS[community.level]}
          </div>
        )}
        <div className="p-6">
          {/* Breadcrumb ancestors */}
          {community.ancestors.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-2 flex-wrap">
              {community.ancestors.map((a, i) => (
                <span key={a.id} className="flex items-center gap-1">
                  {i > 0 && <span>›</span>}
                  <Link href={`/communities/${a.slug}`} className="hover:text-brand-600 transition-colors">
                    {LEVEL_ICONS[a.level]} {a.name}
                  </Link>
                </span>
              ))}
              <span>›</span>
              <span className="text-gray-600">{community.name}</span>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{community.name}</h1>
                {community.is_verified && (
                  <span className="text-brand-500 text-lg" title="Verified">✓</span>
                )}
              </div>
              {community.name_ar && (
                <p className="text-gray-500 text-sm" dir="rtl">{community.name_ar}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                <span>{LEVEL_ICONS[community.level]} {community.level}</span>
                {community.city && <span>📍 {community.city}</span>}
                <span>👥 {community.member_count.toLocaleString()} members</span>
                <span>📅 {community.event_count} events</span>
              </div>
            </div>

            <button
              onClick={toggleMembership}
              disabled={joining}
              className={`shrink-0 px-5 py-2.5 rounded-xl font-semibold transition-colors ${
                community.is_member
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-brand-600 text-white hover:bg-brand-700'
              }`}
            >
              {joining ? <Spinner size="sm" /> : community.is_member ? 'Leave community' : 'Join community'}
            </button>
          </div>

          {community.description && (
            <p className="mt-4 text-gray-600 text-sm leading-relaxed">{community.description}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-8">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Members</h2>
            <span className="text-sm text-gray-500">{community.member_count.toLocaleString()} total</span>
          </div>
          {community.recent_members.length === 0 ? (
            <p className="text-sm text-gray-500">No members yet.</p>
          ) : (
            <div className="space-y-3">
              {community.recent_members.map((member) => (
                <div key={member.id} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                    {member.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      member.display_name.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{member.display_name}</p>
                    <p className="text-xs text-gray-500">Joined {formatDate(member.joined_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h2>
          {community.activity.length === 0 ? (
            <p className="text-sm text-gray-500">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {community.activity.map((item) => {
                const row = (
                  <div className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-3">
                    <div className="mt-0.5 text-lg">{item.type === 'member_joined' ? '👋' : '🗓️'}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.subtitle}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(item.created_at)}</p>
                    </div>
                  </div>
                )
                return item.href ? <Link key={item.id} href={item.href}>{row}</Link> : <div key={item.id}>{row}</div>
              })}
            </div>
          )}
        </div>
      </div>

      {/* Happenings section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">What&apos;s Happening Now</h2>
            <p className="text-xs text-gray-400 mt-0.5">Spontaneous, time-limited posts from members</p>
          </div>
          {isMember && !showPostForm && (
            <button
              onClick={() => setShowPostForm(true)}
              className="text-sm font-semibold bg-brand-600 text-white px-4 py-2 rounded-xl hover:bg-brand-700 transition-colors"
            >
              + Post happening
            </button>
          )}
        </div>

        {showPostForm && (
          <PostHappeningForm
            posting={posting}
            onPost={async (data) => {
              const ok = await post(data)
              if (ok) setShowPostForm(false)
              return ok
            }}
            onCancel={() => setShowPostForm(false)}
          />
        )}

        {happeningsLoading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : happenings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-10 text-center">
            <p className="text-2xl mb-2">📍</p>
            <p className="text-sm font-medium text-gray-600">Nothing happening right now</p>
            {isMember && (
              <p className="text-xs text-gray-400 mt-1">Be the first — post a happening!</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {happenings.map((h) => (
              <HappeningCard
                key={h.id}
                happening={h}
                onRsvp={toggleRsvp}
                onReact={toggleReact}
                onDelete={remove}
                onReport={report}
              />
            ))}
          </div>
        )}
      </div>

      {/* Events section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Upcoming Events</h2>
          <Link
            href={`/events?community=${slug}`}
            className="text-sm text-brand-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {eventsLoading && events.length === 0 ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : events.length === 0 ? (
          <EmptyState icon="📅" title="No upcoming events" description="Be the first to create an event in this community" />
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="flex gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-brand-200 hover:shadow-sm transition-all"
              >
                {ev.cover_image_url ? (
                  <img src={ev.cover_image_url} alt="" className="w-20 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-20 h-16 rounded-lg bg-brand-50 flex items-center justify-center text-2xl shrink-0">📅</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 line-clamp-1">{ev.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(ev.start_at)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">📍 {ev.city}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    ev.is_free ? 'bg-green-50 text-green-700' : 'bg-brand-50 text-brand-700'
                  }`}>
                    {ev.is_free ? 'Free' : `${ev.price} ${ev.currency}`}
                  </span>
                </div>
              </Link>
            ))}

            {nextCursor && (
              <div className="text-center pt-4">
                <button
                  onClick={() => loadEvents(nextCursor)}
                  disabled={eventsLoading}
                  className="btn-secondary text-sm"
                >
                  {eventsLoading ? <Spinner size="sm" /> : 'Load more events'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
