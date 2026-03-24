'use client'

import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'

export function Footer() {
  const { t } = useLocale()
  return (
    <footer className="mt-auto border-t border-gray-100 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-brand-600 font-bold text-lg">
              <span>🪄</span> Rawaq
            </div>
            <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Platform */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{t('footer.platform')}</p>
            <div className="flex flex-col gap-1.5 text-sm text-gray-500">
              <Link href="/events" className="hover:text-gray-800 transition-colors">{t('footer.browse_events')}</Link>
              <Link href="/register" className="hover:text-gray-800 transition-colors">{t('footer.sign_up_free')}</Link>
              <Link href="/login" className="hover:text-gray-800 transition-colors">{t('nav.login')}</Link>
            </div>
          </div>

          {/* Company */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{t('footer.company')}</p>
            <div className="flex flex-col gap-1.5 text-sm text-gray-500">
              <Link href="/about" className="hover:text-gray-800 transition-colors">{t('footer.about')}</Link>
              <Link href="/terms" className="hover:text-gray-800 transition-colors">{t('footer.terms')}</Link>
              <Link href="/privacy" className="hover:text-gray-800 transition-colors">{t('footer.privacy')}</Link>
              <a href="mailto:hello@rawaq.app" className="hover:text-gray-800 transition-colors">{t('footer.contact')}</a>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} {t('footer.rights')}</p>
          <p className="text-xs text-gray-400">🌍 {t('footer.connecting')}</p>
        </div>
      </div>
    </footer>
  )
}
