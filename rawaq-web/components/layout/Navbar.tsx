'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { clientFetchInvalidate, clientGetJson } from '@/lib/client-fetch'
import { formatRelativeTime } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import type { Notification, NotificationType } from '@/types/database'

// ── Notification bell ───────────────────────────────────────
const NOTIF_ICONS: Partial<Record<NotificationType, string>> = {
  booking_confirmed: '🎟️',
  booking_cancelled: '❌',
  event_reminder: '🔔',
  comment_reply: '💬',
  mention: '👋',
  organizer_approved: '✅',
  event_cancelled: '🚫',
  tip_received: '💰',
}

function notifTitle(n: Notification, t: (k: string) => string): string {
  const p = n.payload as Record<string, string>
  switch (n.type) {
    case 'booking_confirmed': return `${t('notif.booking_confirmed')}: ${p.event_title ?? ''}`
    case 'booking_cancelled': return `${t('notif.booking_cancelled')}: ${p.event_title ?? ''}`
    case 'event_reminder': return `${p.event_title ?? ''} — ${t('notif.event_reminder')}`
    case 'comment_reply': return t('notif.comment_reply')
    case 'mention': return t('notif.mention')
    case 'organizer_approved': return t('notif.organizer_approved')
    case 'event_cancelled': return `${t('notif.event_cancelled')}: ${p.event_title ?? ''}`
    case 'tip_received': return `${t('notif.tip_received')} — SAR ${p.amount ?? ''}`
    default: return n.type
  }
}

function NotificationBell({ userId }: { userId: string }) {
  const supabase = createSupabaseBrowserClient()
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()

  useEffect(() => {
    void fetchNotifications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real-time: new notification pushed for this user
  useEffect(() => {
    const channel = supabase
      .channel(`notifs-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          startTransition(() => {
            const n = payload.new as Notification
            setNotifications((prev) => [n, ...prev].slice(0, 5))
            setUnread((c) => c + 1)
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function fetchNotifications(force = false) {
    setLoading(true)
    try {
      const json = await clientGetJson<{ data: { data: Notification[]; total: number } }>(
        '/api/notifications?per_page=5',
        { ttlMs: 20_000, force, scopeKey: userId },
      )
      const list = json.data?.data ?? []
      setNotifications(list)
      setUnread(list.filter((n: Notification) => !n.is_read).length)
    } finally {
      setLoading(false)
    }
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    clientFetchInvalidate('/api/notifications', userId)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnread(0)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost relative p-2"
        aria-label="Notifications"
      >
        <svg className={`w-5 h-5 text-gray-600 ${unread > 0 ? 'animate-bell-wobble' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 end-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-[3px] leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="fixed top-[4.5rem] inset-x-3 mt-0 w-auto max-w-none bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden animate-fade-in sm:absolute sm:top-auto sm:inset-x-auto sm:end-0 sm:mt-2 sm:w-80">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-900">{t('notif.title')}</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline">
                  {t('notif.mark_all_read')}
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">{t('notif.empty')}</p>
            ) : (
              <div>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${n.is_read ? '' : 'bg-brand-50'
                      }`}
                  >
                    <span className="text-lg shrink-0 mt-0.5">{NOTIF_ICONS[n.type] ?? '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${n.is_read ? 'text-gray-600' : 'font-medium text-gray-900'}`}>
                        {notifTitle(n, t)}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{formatRelativeTime(n.created_at)}</p>
                    </div>
                    {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-1" />}
                  </div>
                ))}
              </div>
            )}

            <div className="px-4 py-2.5 border-t border-gray-100">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-brand-600 font-medium hover:underline"
              >
                {t('notif.view_all')}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Navbar ─────────────────────────────────────────────
export function Navbar() {
  const { user, profile, signOut, loading } = useAuth()
  const { t, locale, toggleLocale } = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    router.push('/')
    router.refresh()
    setSigningOut(false)
    setMenuOpen(false)
  }

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== '/' && pathname.startsWith(href))
    return (
      <Link
        href={href}
        className={`nav-link ${active ? 'nav-link--active' : ''}`}
      >
        {label}
      </Link>
    )
  }

  const isLanding = pathname === '/'

  const headerBase = isLanding
    ? 'fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300'
    : 'sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300'
  const headerTheme = isLanding
    ? scrolled
      ? 'navbar-landing-scrolled'
      : 'navbar-landing-top'
    : `bg-white/92 backdrop-blur-md border-b border-gray-100 ${scrolled ? 'navbar-scrolled' : ''}`

  return (
    <header className={`${headerBase} ${headerTheme}`}>
      <nav className={`max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 gap-6 ${isLanding ? 'nav--dark' : ''}`}>
        {/* Logo */}
        <Link href="/" className="nav-logo flex items-center gap-2 shrink-0">
          <span className="nav-wand leading-none"><Image src="/icon.png" alt="" width={150} height={28} /></span>
          {/* <span className="hidden sm:block font-bold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--c-gold-dim)', letterSpacing: '-0.01em' }}>
            Rawaq
          </span> */}
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {navLink('/events', t('nav.events'))}
          {navLink('/communities', t('nav.communities'))}
          {user && navLink('/feed', `👥 ${t('nav.feed')}`)}
          {user && navLink('/saved', `🤍 ${t('nav.saved')}`)}
          {user && navLink('/chat', t('nav.chat'))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 ms-auto">
          {/* Locale toggle */}
          <button
            onClick={toggleLocale}
            className="nav-locale btn-ghost text-xs font-bold px-2.5 py-1.5 rounded-lg tracking-wide"
            title="Switch language"
          >
            {locale === 'en' ? 'ع' : 'EN'}
          </button>

          {loading ? (
            <Spinner size="sm" />
          ) : user ? (
            <>
              {/* Notification bell */}
              <NotificationBell userId={user.id} />

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-2 btn-ghost px-3 py-1.5"
                >
                  <span className="nav-user-chip w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center uppercase">
                    {profile?.display_name?.[0] ?? user.email?.[0] ?? '?'}
                  </span>
                  <span className="nav-user-name hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
                    {profile?.display_name ?? user.email}
                  </span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute end-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden animate-fade-in">
                      {profile?.role === 'organizer' && (
                        <Link href="/organizer" onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                          📊 {t('nav.dashboard')}
                        </Link>
                      )}
                      <Link href="/communities" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        🏘️ {t('nav.communities')}
                      </Link>
                      {profile?.role === 'admin' && (
                        <Link href="/admin" onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                          🛡️ {t('nav.admin')}
                        </Link>
                      )}
                      <Link href="/feed" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        👥 {t('nav.feed')}
                      </Link>
                      <Link href="/saved" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        🤍 {t('nav.saved_events')}
                      </Link>
                      <Link href="/bookings" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        🎟️ {t('nav.my_bookings')}
                      </Link>
                      <Link href="/plans" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        ⭐ {t('nav.my_plans')}
                      </Link>
                      <Link href="/profile" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        ⚙️ {t('nav.profile_settings')}
                      </Link>
                      <div className="border-t border-gray-100" />
                      <button
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {signingOut ? <Spinner size="sm" /> : '🚪'}
                        {t('nav.logout')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <Link href="/login" className="btn-primary text-sm">{t('nav.login')}</Link>
          )}
        </div>
      </nav>
    </header>
  )
}

