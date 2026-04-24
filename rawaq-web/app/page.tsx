'use client'

import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { ScrollReveal } from '@/components/ui/ScrollReveal'
import { useLocale } from '@/contexts/locale-context'
import { ActivityFeed } from '@/components/landing/ActivityFeed'
import { CountriesTicker } from '@/components/landing/CountriesTicker'
import { FloatingHeroCards } from '@/components/landing/FloatingHeroCards'
import { CommunitiesSection } from '@/components/landing/CommunitiesSection'
import { EventsSection } from '@/components/landing/EventsSection'
import { HostSection } from '@/components/landing/HostSection'
import { HowSection } from '@/components/landing/HowSection'

const STATS = [
  { value: '13+', labelKey: 'landing.stat_countries' },
  { value: '500+', labelKey: 'landing.stat_events' },
  { value: '10K+', labelKey: 'landing.stat_attendees' },
] as const

function HeroBadge({ text }: { text: string }) {
  return (
    <div className="animate-badge-pop inline-flex items-center gap-2.5 mb-8">
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'oklch(0.78 0.18 72 / 0.12)',
          border: '1px solid oklch(0.78 0.18 72 / 0.28)',
          borderRadius: '2rem',
          padding: '0.4rem 0.875rem',
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--c-gold)',
            boxShadow: '0 0 6px oklch(0.78 0.18 72 / 0.8)',
          }}
        />
        <span
          style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--c-gold)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {text}
        </span>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const { t, locale } = useLocale()
  const isAr = locale === 'ar'

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-1">
        <section className="hero-dark relative min-h-screen flex flex-col justify-between">
          <div className="hero-star-pattern" aria-hidden />
          <div className="hero-amber-glow" aria-hidden />
          <div className="hero-amber-glow-2" aria-hidden />

          <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 flex flex-col lg:flex-row items-center gap-12 lg:gap-20 flex-1">
            <div className="flex-shrink-0 lg:w-[520px] z-10">
              <HeroBadge text={t('landing.badge')} />

              <div className="mb-7">
                <ActivityFeed />
              </div>

              <h1 className="hero-headline animate-hero-in mb-6" style={{ animationDelay: '0.05s' }}>
                {t('landing.hero_line1')}
                <br />
                <span style={{ color: 'var(--c-gold)' }}>{t('landing.hero_line2')}</span>
              </h1>

              <p
                className="animate-hero-in text-base sm:text-lg leading-relaxed max-w-xl mb-9"
                style={{
                  animationDelay: '0.18s',
                  color: 'oklch(0.62 0.015 75)',
                }}
              >
                {t('landing.hero_sub')}
              </p>

              <div className="animate-hero-in flex flex-col sm:flex-row gap-3 mb-12" style={{ animationDelay: '0.32s' }}>
                <Link href="/events" className="btn-hero-primary text-center">
                  {t('landing.browse_events')}
                </Link>
                <Link href="/register" className="btn-hero-outline text-center">
                  {t('landing.create_account')}
                </Link>
              </div>

              <div
                className="animate-hero-in flex gap-0 divide-x divide-white/10"
                style={{
                  animationDelay: '0.48s',
                  flexDirection: isAr ? 'row-reverse' : 'row',
                }}
              >
                {STATS.map((stat) => (
                  <div
                    key={stat.labelKey}
                    className="pe-8 ps-8 first:ps-0 last:pe-0"
                    style={{ borderInlineColor: 'oklch(1 0 0 / 0.1)' }}
                  >
                    <div className="hero-stat-value">{stat.value}</div>
                    <div className="hero-stat-label">{t(stat.labelKey)}</div>
                  </div>
                ))}
              </div>
            </div>

            <FloatingHeroCards />
          </div>

          <CountriesTicker />
        </section>

        <CommunitiesSection />
        <EventsSection />
        <HostSection />
        <HowSection />

        {/* <section className="py-16 sm:py-20 px-4 sm:px-6" style={{ backgroundColor: 'var(--c-ink-mid)' }}>
          <div className="max-w-6xl mx-auto">
            <ScrollReveal>
              <div className="org-cta-panel">
                <div className="org-cta-orb" aria-hidden />
                <div className="org-cta-orb-2" aria-hidden />
                <div className="relative z-10 p-8 sm:p-14">
                  <div className="text-5xl mb-5">HQ</div>
                  <h2 className="org-cta-title">{t('landing.org_title')}</h2>
                  <p className="org-cta-body">{t('landing.org_sub')}</p>
                  <Link href="/register" className="org-cta-btn">
                    {t('landing.org_cta')}
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section> */}

        <section
          className="py-20 sm:py-28 px-4 sm:px-6 text-center relative overflow-hidden"
          style={{ backgroundColor: 'var(--c-ink)' }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(135deg, oklch(0.78 0.18 72 / 0.10) 0%, transparent 50%, oklch(0.62 0.16 55 / 0.07) 100%)',
              borderTop: '1px solid oklch(0.78 0.18 72 / 0.15)',
              borderBottom: '1px solid oklch(0.78 0.18 72 / 0.15)',
            }}
          />
          <div className="relative">
            <ScrollReveal>
              <h2 className="final-heading mb-4" style={{ color: 'oklch(0.94 0.01 82)' }}>
                {t('landing.cta_title')}{' '}
                <span style={{ color: 'var(--c-gold)' }}>{t('landing.cta_title_accent')}</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={1}>
              <p
                className="max-w-md mx-auto mb-8 text-base leading-relaxed"
                style={{ color: 'oklch(0.52 0.015 72)' }}
              >
                {t('landing.cta_sub')}
              </p>
            </ScrollReveal>
            <ScrollReveal delay={2}>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/register" className="btn-hero-primary text-center">
                  {t('landing.cta_join')}
                </Link>
                <Link href="/register" className="btn-hero-outline text-center">
                  {t('landing.cta_host')}
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
