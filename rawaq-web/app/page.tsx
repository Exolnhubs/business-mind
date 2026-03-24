'use client'

import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { useLocale } from '@/contexts/locale-context'

const CATEGORY_KEYS = [
  { icon: '🏋️', key: 'cat.sports' },
  { icon: '🎨', key: 'cat.arts' },
  { icon: '🍽️', key: 'cat.food' },
  { icon: '💼', key: 'cat.business' },
  { icon: '🎵', key: 'cat.music' },
  { icon: '📚', key: 'cat.education' },
  { icon: '👨‍👩‍👧', key: 'cat.family' },
  { icon: '🏕️', key: 'cat.outdoor' },
  { icon: '💻', key: 'cat.tech' },
  { icon: '🧘', key: 'cat.wellness' },
]

const COUNTRIES = [
  { flag: '🇸🇦', en: 'Saudi Arabia', ar: 'السعودية' },
  { flag: '🇦🇪', en: 'UAE',          ar: 'الإمارات' },
  { flag: '🇪🇬', en: 'Egypt',        ar: 'مصر' },
  { flag: '🇯🇴', en: 'Jordan',       ar: 'الأردن' },
  { flag: '🇰🇼', en: 'Kuwait',       ar: 'الكويت' },
  { flag: '🇶🇦', en: 'Qatar',        ar: 'قطر' },
  { flag: '🇧🇭', en: 'Bahrain',      ar: 'البحرين' },
  { flag: '🇴🇲', en: 'Oman',         ar: 'عُمان' },
  { flag: '🇱🇧', en: 'Lebanon',      ar: 'لبنان' },
  { flag: '🇲🇦', en: 'Morocco',      ar: 'المغرب' },
  { flag: '🇹🇳', en: 'Tunisia',      ar: 'تونس' },
  { flag: '🇮🇶', en: 'Iraq',         ar: 'العراق' },
  { flag: '🇵🇸', en: 'Palestine',    ar: 'فلسطين' },
]

const HOW_STEPS = [
  { step: '01', icon: '🔍', titleKey: 'landing.how_1_title', bodyKey: 'landing.how_1_body' },
  { step: '02', icon: '🎟️', titleKey: 'landing.how_2_title', bodyKey: 'landing.how_2_body' },
  { step: '03', icon: '🙌', titleKey: 'landing.how_3_title', bodyKey: 'landing.how_3_body' },
]

export default function LandingPage() {
  const { t, locale } = useLocale()

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="bg-gradient-to-b from-brand-50 to-white py-20 sm:py-28 px-4">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 bg-brand-100 text-brand-700 text-sm font-medium px-4 py-1.5 rounded-full">
              🌍 {t('landing.badge')}
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 leading-tight">
              {t('landing.hero_line1')}<br />
              <span className="text-brand-500">{t('landing.hero_line2')}</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
              {t('landing.hero_sub')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href="/events" className="btn-primary px-8 py-3 text-base">
                {t('landing.browse_events')}
              </Link>
              <Link href="/register" className="btn-secondary px-8 py-3 text-base">
                {t('landing.create_account')}
              </Link>
            </div>
          </div>
        </section>

        {/* ── Countries strip ──────────────────────────────────── */}
        <section className="border-y border-gray-100 bg-white py-5">
          <div className="flex gap-4 whitespace-nowrap px-6 flex-wrap justify-center">
            {COUNTRIES.map((c) => (
              <span key={c.en} className="text-sm text-gray-500 font-medium">
                {c.flag} {locale === 'ar' ? c.ar : c.en}
              </span>
            ))}
          </div>
        </section>

        {/* ── Categories ───────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 space-y-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('landing.categories_title')}</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {CATEGORY_KEYS.map((c) => (
              <Link
                key={c.key}
                href="/events"
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors shadow-sm"
              >
                <span>{c.icon}</span> {t(c.key)}
              </Link>
            ))}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section className="bg-gray-50 py-16 px-4">
          <div className="max-w-5xl mx-auto space-y-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">{t('landing.how_title')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {HOW_STEPS.map((h) => (
                <div key={h.step} className="card p-7 space-y-3 text-center">
                  <div className="text-4xl">{h.icon}</div>
                  <div className="text-xs font-bold text-brand-400 tracking-widest uppercase">{t('landing.step')} {h.step}</div>
                  <h3 className="text-lg font-bold text-gray-900">{t(h.titleKey)}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{t(h.bodyKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Organizers CTA ───────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <div className="bg-gradient-to-r from-brand-500 to-brand-600 rounded-3xl p-8 sm:p-12 text-white text-center space-y-5">
            <div className="text-5xl">🏢</div>
            <h2 className="text-2xl sm:text-3xl font-bold">{t('landing.org_title')}</h2>
            <p className="text-brand-100 max-w-xl mx-auto">
              {t('landing.org_sub')}
            </p>
            <Link
              href="/register"
              className="inline-block bg-white text-brand-600 font-semibold px-8 py-3 rounded-xl hover:bg-brand-50 transition-colors text-sm"
            >
              {t('landing.org_cta')}
            </Link>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────── */}
        <section className="text-center py-16 px-4 space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('landing.final_title')}</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            {t('landing.final_sub')}
          </p>
          <Link href="/events" className="btn-primary px-8 py-3 text-base inline-block">
            {t('landing.see_all')}
          </Link>
        </section>

      </main>

      <Footer />
    </div>
  )
}
