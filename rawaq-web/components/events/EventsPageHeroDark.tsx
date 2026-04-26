'use client'

import { useLocale } from '@/contexts/locale-context'

interface EventsPageHeroDarkProps {
  activeFilterCount: number
}

export function EventsPageHeroDark({ activeFilterCount }: EventsPageHeroDarkProps) {
  const { t, locale } = useLocale()
  const isAr = locale === 'ar'
  const ff = isAr ? 'var(--font-arabic)' : 'var(--font-display)'
  const fb = isAr ? 'var(--font-arabic)' : 'var(--font-sans)'

  const chips = isAr
    ? ['🎵 أمسيات موسيقية', '🎨 ورش إبداعية', '📍 خيارات قريبة']
    : ['🎵 Music nights', '🎨 Creative workshops', '📍 Nearby picks']

  return (
    <section className="dark-hero" style={{ paddingTop: 0 }}>
      {/* Star pattern */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `
            repeating-linear-gradient(0deg,   oklch(1 0 0 / 0.055) 0px, transparent 1px, transparent 39px, oklch(1 0 0 / 0.055) 40px),
            repeating-linear-gradient(90deg,  oklch(1 0 0 / 0.055) 0px, transparent 1px, transparent 39px, oklch(1 0 0 / 0.055) 40px),
            repeating-linear-gradient(45deg,  oklch(1 0 0 / 0.028) 0px, transparent 1px, transparent 27px, oklch(1 0 0 / 0.028) 28px),
            repeating-linear-gradient(-45deg, oklch(1 0 0 / 0.028) 0px, transparent 1px, transparent 27px, oklch(1 0 0 / 0.028) 28px)`,
        }}
      />
      <div className="dark-hero-glow-a" aria-hidden />
      <div className="dark-hero-glow-b" aria-hidden />

      <div
        className="relative max-w-7xl mx-auto px-4 sm:px-6"
        style={{ paddingTop: '3.5rem', paddingBottom: '2.5rem' }}
      >
        {/* Badge */}
        <div
          className="animate-badge-pop"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'oklch(0.78 0.18 72 / 0.10)',
            border: '1px solid oklch(0.78 0.18 72 / 0.28)',
            borderRadius: 40, padding: '5px 14px', marginBottom: 20,
          }}
        >
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--c-gold)',
            boxShadow: '0 0 6px oklch(0.78 0.18 72 / 0.8)',
            animation: 'ef-dot-pulse 1.6s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--c-gold)',
            fontFamily: ff,
          }}>
            {t('events.hero.badge')}
          </span>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
          {/* Left — headline */}
          <div style={{ flex: '0 0 auto', maxWidth: 480 }}>
            <h1
              className="animate-hero-in"
              style={{
                fontFamily: ff,
                fontWeight: isAr ? 800 : 700,
                fontSize: 'clamp(28px, 4vw, 48px)',
                lineHeight: 1.08,
                letterSpacing: isAr ? '-0.01em' : '-0.025em',
                marginBottom: 14,
                color: 'oklch(0.94 0.01 82)',
              }}
            >
              {t('events.hero.title')}{' '}
              <span style={{ color: 'var(--c-gold)' }}>{t('events.hero.subtitle').split('.')[0]}.</span>
            </h1>

            <p
              className="animate-hero-in"
              style={{
                fontSize: 15, lineHeight: 1.75,
                color: 'oklch(0.62 0.015 75)',
                fontFamily: fb, fontWeight: 300,
                marginBottom: 20,
                animationDelay: '0.12s',
              }}
            >
              {t('events.hero.subtitle').split('.').slice(1).join('.').trim()}
            </p>

            {/* Quick chips */}
            <div
              className="animate-hero-in flex flex-wrap gap-2"
              style={{ animationDelay: '0.2s' }}
            >
              {chips.map((c, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12, fontWeight: 500, padding: '5px 14px', borderRadius: 40,
                    background: 'oklch(0.14 0.022 68)',
                    border: '1px solid oklch(1 0 0 / 0.07)',
                    color: 'oklch(0.62 0.015 75)',
                    fontFamily: ff, cursor: 'default',
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Right — stat cards */}
          <div
            className="animate-hero-in flex flex-col sm:flex-row gap-3 flex-1"
            style={{ animationDelay: '0.28s' }}
          >
            {/* Active filters */}
            <div className="dark-stat-card">
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'oklch(0.52 0.015 72)',
                fontFamily: ff, marginBottom: 8,
              }}>
                {t('events.hero.stat.search_mode')}
              </div>
              <div style={{
                fontFamily: ff, fontWeight: 700,
                fontSize: 40, lineHeight: 1,
                color: 'var(--c-gold)',
              }}>
                {activeFilterCount}
              </div>
              <div style={{
                fontSize: 12, color: 'oklch(0.52 0.015 72)',
                marginTop: 6, lineHeight: 1.5, fontFamily: fb,
              }}>
                {t('events.hero.stat.search_mode_sub')}
              </div>
            </div>

            {/* Live pulse */}
            <div className="dark-stat-card dark-stat-card--amber">
              <div
                aria-hidden
                style={{
                  position: 'absolute', inset: 0, borderRadius: '1rem',
                  background: 'radial-gradient(circle at 80% 20%, oklch(0.78 0.18 72 / 0.16), transparent 70%)',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative' }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: 'var(--c-gold)',
                  fontFamily: ff, marginBottom: 6,
                }}>
                  {t('events.hero.stat.weekend_pulse')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#3dba6a', flexShrink: 0,
                    boxShadow: '0 0 8px #3dba6a',
                    animation: 'chat-live-pulse 2.2s ease-in-out infinite',
                  }} />
                  <span style={{
                    fontFamily: ff, fontWeight: 800,
                    fontSize: 22, color: 'oklch(0.94 0.01 82)',
                  }}>
                    {t('events.hero.stat.live')}
                  </span>
                </div>
                <div style={{
                  fontSize: 12, color: 'oklch(0.52 0.015 72)',
                  lineHeight: 1.5, fontFamily: fb,
                }}>
                  {t('events.hero.stat.weekend_pulse_sub')}
                </div>
              </div>
            </div>

            {/* Best use */}
            <div className="dark-stat-card">
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'oklch(0.52 0.015 72)',
                fontFamily: ff, marginBottom: 8,
              }}>
                {t('events.hero.stat.best_use')}
              </div>
              <div style={{
                fontFamily: ff, fontWeight: 700,
                fontSize: 15, color: 'oklch(0.94 0.01 82)', marginBottom: 4,
              }}>
                {t('events.hero.stat.best_use_title')}
              </div>
              <div style={{
                fontSize: 12, color: 'oklch(0.52 0.015 72)',
                lineHeight: 1.5, fontFamily: fb,
              }}>
                {t('events.hero.stat.best_use_sub')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
