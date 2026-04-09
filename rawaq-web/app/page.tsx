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

        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="hero-dark relative overflow-hidden">
          {/* Geometric crosshatch pattern */}
          <div className="hero-star-pattern" aria-hidden />
          {/* Ambient amber glow — bottom-right */}
          <div className="hero-amber-glow" aria-hidden />
          {/* Secondary glow — top-left */}
          <div className="hero-amber-glow-2" aria-hidden />

          <div className="relative max-w-6xl mx-auto px-6 sm:px-10 pt-24 pb-28 sm:pt-32 sm:pb-40">

            {/* Badge */}
            <div
              className="animate-badge-pop inline-flex items-center gap-2.5 border border-amber-500/25 text-amber-400/90 text-[11px] font-bold tracking-[0.18em] uppercase px-4 py-1.5 rounded-full mb-10"
            >
              <span>🌍</span>
              <span>{t('landing.badge')}</span>
            </div>

            {/* Headline */}
            <h1
              className="hero-headline animate-hero-in"
              style={{ animationDelay: '0.05s' }}
            >
              {t('landing.hero_line1')}
              <br />
              <span className="text-amber-400">{t('landing.hero_line2')}</span>
            </h1>

            {/* Sub-headline */}
            <p
              className="animate-hero-in mt-6 text-lg sm:text-xl leading-relaxed max-w-2xl"
              style={{
                animationDelay: '0.18s',
                color: 'oklch(0.72 0.018 76)',
              }}
            >
              {t('landing.hero_sub')}
            </p>

            {/* CTAs */}
            <div
              className="animate-hero-in flex flex-wrap gap-3 mt-9"
              style={{ animationDelay: '0.32s' }}
            >
              <Link href="/events" className="btn-hero-primary">
                {t('landing.browse_events')}
              </Link>
              <Link href="/register" className="btn-hero-outline">
                {t('landing.create_account')}
              </Link>
            </div>

            {/* Stats */}
            <div
              className="animate-hero-in flex gap-0 mt-16 divide-x divide-white/10"
              style={{ animationDelay: '0.48s' }}
            >
              {STATS.map((s) => (
                <div key={s.label} className="pe-8 ps-8 first:ps-0">
                  <div className="hero-stat-value">{s.value}</div>
                  <div className="hero-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Countries marquee ──────────────────────────────────── */}
        <section
          className="py-5"
          style={{
            borderTop: '1px solid oklch(0.88 0.012 78)',
            borderBottom: '1px solid oklch(0.88 0.012 78)',
            backgroundColor: 'var(--c-paper)',
          }}
        >
          <div className="marquee-wrap">
            <div className="marquee-track">
              {[...COUNTRIES, ...COUNTRIES].map((c, i) => (
                <span key={i} className="marquee-pill">
                  <span className="text-base">{c.flag}</span>
                  {locale === 'ar' ? c.ar : c.en}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Categories ─────────────────────────────────────────── */}
        <section className="py-20 sm:py-24 px-6" style={{ backgroundColor: 'var(--c-paper)' }}>
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <h2 className="section-heading text-center mb-12">
                {t('landing.categories_title')}
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={1}>
              <div className="flex flex-wrap justify-center gap-3">
                {CATEGORY_KEYS.map((c) => (
                  <Link
                    key={c.key}
                    href="/events"
                    className="category-chip flex items-center gap-2.5 bg-white rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm"
                    style={{
                      border: '1px solid oklch(0.87 0.012 78)',
                      color: 'oklch(0.38 0.025 70)',
                    }}
                  >
                    <span className="text-base leading-none">{c.icon}</span>
                    {t(c.key)}
                  </Link>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────── */}
        <section
          className="py-20 sm:py-28 px-6 overflow-hidden"
          style={{ backgroundColor: 'var(--c-ink-mid)' }}
        >
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <h2
                className="section-heading text-center mb-16 sm:mb-20"
                style={{ color: 'oklch(0.93 0.01 80)' }}
              >
                {t('landing.how_title')}
              </h2>
            </ScrollReveal>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8">
              {HOW_STEPS.map((h, idx) => (
                <ScrollReveal key={h.step} delay={(idx + 1) as 1 | 2 | 3}>
                  <div className="how-step">
                    <div className="how-step-number">{h.step}</div>
                    <span className="how-step-icon">{h.icon}</span>
                    <h3>{t(h.titleKey)}</h3>
                    <p>{t(h.bodyKey)}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Organiser CTA ──────────────────────────────────────── */}
        <section className="py-16 sm:py-20 px-6" style={{ backgroundColor: 'var(--c-paper)' }}>
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <div className="org-cta-panel">
                {/* Decorative orbs inside amber panel */}
                <div className="org-cta-orb" aria-hidden />
                <div className="org-cta-orb-2" aria-hidden />

                <div className="relative z-10 p-10 sm:p-14">
                  <div className="text-5xl mb-5">🏢</div>
                  <h2 className="org-cta-title">{t('landing.org_title')}</h2>
                  <p className="org-cta-body">{t('landing.org_sub')}</p>
                  <Link href="/register" className="org-cta-btn">
                    {t('landing.org_cta')}
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────── */}
        <section
          className="py-20 sm:py-28 px-6 text-center"
          style={{ backgroundColor: 'var(--c-muted)' }}
        >
          <ScrollReveal>
            <h2 className="final-heading mb-4">{t('landing.final_title')}</h2>
          </ScrollReveal>
          <ScrollReveal delay={1}>
            <p
              className="max-w-md mx-auto mb-8 text-base leading-relaxed"
              style={{ color: 'oklch(0.52 0.02 70)' }}
            >
              {t('landing.final_sub')}
            </p>
          </ScrollReveal>
          <ScrollReveal delay={2}>
            <Link href="/events" className="btn-primary px-10 py-3.5 text-base inline-block">
              {t('landing.see_all')}
            </Link>
          </ScrollReveal>
        </section>

      </main>

      <Footer />
    </div>
  )
}
