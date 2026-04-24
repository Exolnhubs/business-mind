'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { formatRelativeTime } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Notification, NotificationType } from '@/types/database'

const ICONS: Record<NotificationType, string> = {
  booking_confirmed:   '🎟️',
  booking_cancelled:   '❌',
  event_reminder:      '🔔',
  comment_reply:       '💬',
  mention:             '👋',
  organizer_approved:  '✅',
  organizer_rejected:  '❌',
  organizer_suspended: '⛔',
  event_cancelled:     '🚫',
  tip_received:        '💰',
  waitlist_promoted:   '🎉',
  new_follower:        '👤',
  new_review:          '⭐',
  new_attendee:        '🙋',
  new_comment:         '💬',
  event_updated:       '📝',
  new_event_published:        '🎉',
  event_sold_out:             '🎊',
  referral_signup_reward:     '🎁',
  referral_conversion_reward: '🎉',
  community_new_event:        '🗓️',
  community_happening:        '📍',
  follow_request:  '👤',
  follow_accepted: '✅',
  say_hi:          '👋',
}

function notificationLabel(n: Notification): { title: string; subtitle: string; href: string | null } {
  const p = n.payload as Record<string, string>
  switch (n.type) {
    case 'booking_confirmed':
      return { title: 'Booking confirmed', subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'booking_cancelled':
      return { title: 'Booking cancelled', subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'event_reminder':
      return { title: 'Event starting soon', subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'comment_reply':
      return { title: 'Someone replied to your comment', subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'mention':
      return { title: 'You were mentioned', subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'organizer_approved':
      return { title: 'Organizer account approved! 🎉', subtitle: 'You can now create events', href: '/organizer' }
    case 'event_cancelled':
      return { title: 'Event was cancelled', subtitle: p.event_title ?? '', href: null }
    case 'tip_received':
      return { title: `You received a SAR ${p.amount ?? ''} donation`, subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'event_updated':
      return { title: 'Event details updated', subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'new_event_published':
      return { title: `New event from ${p.organizer_name ?? 'an organizer you follow'}`, subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'event_sold_out':
      return { title: 'Your event sold out! 🎊', subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'community_new_event':
      return { title: `New event in ${p.community_name ?? 'your community'}`, subtitle: p.event_title ?? '', href: p.event_id ? `/events/${p.event_id}` : null }
    case 'community_happening':
      return { title: `${p.community_name ?? 'Community'}: something's happening`, subtitle: p.body ?? '', href: null }
    case 'follow_request':
      return { title: `${p.actor_name ?? 'Someone'} wants to follow you`, subtitle: '', href: p.actor_id ? `/user/${p.actor_id}` : null }
    case 'follow_accepted':
      return { title: `${p.actor_name ?? 'Someone'} accepted your follow request`, subtitle: '', href: p.actor_id ? `/user/${p.actor_id}` : null }
    case 'say_hi':
      return { title: `${p.actor_name ?? 'Someone'} waved at you 👋`, subtitle: '', href: p.actor_id ? `/user/${p.actor_id}` : null }
    default:
      return { title: n.type, subtitle: '', href: null }
  }
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [fetching, setFetching] = useState(true)
  const [marking, setMarking] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const PER_PAGE = 30

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user) return
    fetchNotifications(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function fetchNotifications(p: number) {
    setFetching(true)
    const res = await fetch(`/api/notifications?page=${p}&per_page=${PER_PAGE}`)
    if (res.ok) {
      const { data } = await res.json() as { data: { data: Notification[]; total: number } }
      if (p === 1) {
        setNotifications(data.data)
      } else {
        setNotifications((prev) => [...prev, ...data.data])
      }
      setTotal(data.total)
      setPage(p)
    }
    setFetching(false)
  }

  async function markAllRead() {
    setMarking(true)
    await fetch('/api/notifications', { method: 'PATCH' })
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setMarking(false)
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length
  const hasMore = notifications.length < total

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <TicketFlipLoader size="md" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔔 Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={marking}
            className="btn-secondary text-xs"
          >
            {marking ? <Spinner size="sm" /> : 'Mark all read'}
          </button>
        )}
      </div>

      {/* List */}
      {fetching && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState icon="🔔" title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const { title, subtitle, href } = notificationLabel(n)
            const itemClass = `flex items-start gap-3.5 p-4 rounded-xl border transition-colors ${
              n.is_read ? 'bg-white border-gray-100' : 'bg-brand-50 border-brand-100'
            } ${href ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`
            const inner = (
              <>
                <span className="text-2xl shrink-0 mt-0.5">{ICONS[n.type] ?? '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.is_read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                    {title}
                  </p>
                  {subtitle && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(n.created_at)}</p>
                </div>
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
              </>
            )
            return href ? (
              <Link key={n.id} href={href} className={itemClass}>{inner}</Link>
            ) : (
              <div key={n.id} className={itemClass}>{inner}</div>
            )
          })}

          {/* Load more */}
          {hasMore && (
            <div className="text-center pt-4">
              <button
                onClick={() => fetchNotifications(page + 1)}
                disabled={fetching}
                className="btn-secondary text-sm"
              >
                {fetching ? <Spinner size="sm" /> : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

