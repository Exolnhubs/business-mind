'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { Spinner } from '@/components/ui/Spinner'

export function Navbar() {
  const { user, profile, signOut, loading } = useAuth()
  const { t, locale, toggleLocale } = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    router.push('/')
    router.refresh()
    setSigningOut(false)
    setMenuOpen(false)
  }

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={`text-sm font-medium transition-colors hover:text-brand-600 ${
        pathname.startsWith(href) ? 'text-brand-600' : 'text-gray-600'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-100">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-brand-600 shrink-0">
          <span className="text-2xl">🪄</span>
          <span className="hidden sm:block">Rawaq</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {navLink('/events', t('nav.events'))}
          {user && navLink('/chat', t('nav.chat'))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 ms-auto">
          {/* Locale toggle */}
          <button
            onClick={toggleLocale}
            className="btn-ghost text-xs font-semibold px-2.5 py-1.5 rounded-lg"
            title="Switch language"
          >
            {locale === 'en' ? 'ع' : 'EN'}
          </button>

          {loading ? (
            <Spinner size="sm" />
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 btn-ghost px-3 py-1.5"
              >
                <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center uppercase">
                  {profile?.display_name?.[0] ?? user.email?.[0] ?? '?'}
                </span>
                <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
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
                    {profile?.role === 'admin' && (
                      <Link href="/admin" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                        🛡️ Admin Panel
                      </Link>
                    )}
                    <Link href="/bookings" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                      🎟️ {t('nav.my_bookings')}
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
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="btn-ghost text-sm">{t('nav.login')}</Link>
              <Link href="/register" className="btn-primary text-sm">{t('nav.register')}</Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
