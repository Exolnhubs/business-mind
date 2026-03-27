'use client'

import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { useLocale } from '@/contexts/locale-context'
import { ScrollReveal } from '@/components/ui/ScrollReveal'

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

const STATS = [
  { value: '13+',  label: 'Countries' },
  { value: '500+', label: 'Events' },
  { value: '10K+', label: 'Attendees' },
]

export default function LandingPage() {
  const { t, locale } = useLocale()

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white py-20 sm:py-28 px-4">
          {/* Floating orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="animate-float-slow absolute -top-16 -left-16 w-72 h-72 rounded-full bg-brand-200 opacity-30 blur-3xl" />
            <div className="animate-float-slower absolute top-24 -right-20 w-96 h-96 rounded-full bg-brand-300 opacity-20 blur-3xl" />
            <div className="animate-float-slow absolute bottom-0 left-1/3 w-56 h-56 rounded-full bg-brand-100 opacity-40 blur-2xl" />
          </div>

          <div className="relative max-w-4xl mx-auto text-center space-y-6">
            <div className="animate-badge-pop inline-flex items-center gap-2 bg-brand-100 text-brand-700 text-sm font-medium px-4 py-1.5 rounded-full">
              🌍 {t('landing.badge')}
            </div>
            <h1
              className="animate-hero-in text-4xl sm:text-6xl font-bold text-gray-900 leading-tight"
              style={{ animationDelay: '0.1s' }}
            >
              {t('landing.hero_line1')}<br />
              <span className="animate-gradient bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400 bg-clip-text text-transparent">
                {t('landing.hero_line2')}
              </span>
            </h1>
            <p
              className="animate-hero-in text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed"
              style={{ animationDelay: '0.25s' }}
            >
              {t('landing.hero_sub')}
            </p>
            <div
              className="animate-hero-in flex flex-col sm:flex-row gap-3 justify-center pt-2"
              style={{ animationDelay: '0.4s' }}
            >
              <Link href="/events" className="btn-primary px-8 py-3 text-base">
                {t('landing.browse_events')}
              </Link>
              <Link href="/register" className="btn-secondary px-8 py-3 text-base">
                {t('landing.create_account')}
              </Link>
            </div>

            {/* Stats row */}
            <div
              className="animate-hero-in flex justify-center gap-10 pt-6"
              style={{ animationDelay: '0.55s' }}
            >
              {STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-2xl font-bold text-brand-600">{s.value}</div>
                  <div className="text-xs text-gray-400 font-medium mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Countries marquee ────────────────────────────────── */}
        <section className="border-y border-gray-100 bg-white py-5">
          <div className="marquee-wrap">
            <div className="marquee-track">
              {/* Duplicate list for seamless loop */}
              {[...COUNTRIES, ...COUNTRIES].map((c, i) => (
                <span key={i} className="flex items-center gap-1.5 text-sm text-gray-500 font-medium px-5">
                  {c.flag} {locale === 'ar' ? c.ar : c.en}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Categories ───────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 space-y-8 text-center">
          <ScrollReveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('landing.categories_title')}</h2>
          </ScrollReveal>
          <ScrollReveal delay={1}>
            <div className="flex flex-wrap justify-center gap-3">
              {CATEGORY_KEYS.map((c) => (
                <Link
                  key={c.key}
                  href="/events"
                  className="category-chip flex items-center gap-2 bg-white border border-gray-200 rounded-full px-5 py-2.5 text-sm font-medium text-gray-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 shadow-sm"
                >
                  <span>{c.icon}</span> {t(c.key)}
                </Link>
              ))}
            </div>
          </ScrollReveal>
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section className="bg-gray-50 py-16 px-4">
          <div className="max-w-5xl mx-auto space-y-10">
            <ScrollReveal>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">{t('landing.how_title')}</h2>
            </ScrollReveal>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {HOW_STEPS.map((h, idx) => (
                <ScrollReveal key={h.step} delay={(idx + 1) as 1 | 2 | 3}>
                  <div className="card p-7 space-y-3 text-center">
                    <div className="relative inline-flex">
                      <div className="text-4xl">{h.icon}</div>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="animate-step-pulse inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-100 text-brand-600 text-xs font-bold">
                        {h.step}
                      </span>
                      <span className="text-xs font-bold text-brand-400 tracking-widest uppercase">{t('landing.step')}</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{t(h.titleKey)}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{t(h.bodyKey)}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Organizers CTA ───────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <ScrollReveal>
            <div className="relative overflow-hidden animate-gradient bg-gradient-to-r from-brand-400 via-brand-600 to-brand-500 rounded-3xl p-8 sm:p-12 text-white text-center space-y-5">
              {/* Decorative blurred circles */}
              <div className="pointer-events-none absolute -top-10 -left-10 w-48 h-48 rounded-full bg-white opacity-10 blur-2xl" aria-hidden />
              <div className="pointer-events-none absolute -bottom-12 -right-8 w-64 h-64 rounded-full bg-white opacity-10 blur-2xl" aria-hidden />
              <div className="relative">
                <div className="text-5xl mb-4">🏢</div>
                <h2 className="text-2xl sm:text-3xl font-bold">{t('landing.org_title')}</h2>
                <p className="text-brand-100 max-w-xl mx-auto mt-3">
                  {t('landing.org_sub')}
                </p>
                <Link
                  href="/register"
                  className="mt-5 inline-block bg-white text-brand-600 font-semibold px-8 py-3 rounded-xl hover:bg-brand-50 transition-colors text-sm"
                >
                  {t('landing.org_cta')}
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* ── Final CTA ────────────────────────────────────────── */}
        <section className="text-center py-16 px-4 space-y-5">
          <ScrollReveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('landing.final_title')}</h2>
          </ScrollReveal>
          <ScrollReveal delay={1}>
            <p className="text-gray-500 max-w-md mx-auto">
              {t('landing.final_sub')}
            </p>
          </ScrollReveal>
          <ScrollReveal delay={2}>
            <Link href="/events" className="btn-primary px-8 py-3 text-base inline-block">
              {t('landing.see_all')}
            </Link>
          </ScrollReveal>
        </section>

      </main>

      <Footer />
    </div>
  )
}
