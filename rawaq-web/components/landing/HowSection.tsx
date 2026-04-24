'use client'

import { useLocale } from '@/contexts/locale-context'
import { ScrollReveal } from '@/components/ui/ScrollReveal'

const STEP_KEYS = [
  { n: '01', titleKey: 'landing.how_1_title', bodyKey: 'landing.how_1_body' },
  { n: '02', titleKey: 'landing.how_2_title', bodyKey: 'landing.how_2_body' },
  { n: '03', titleKey: 'landing.how_3_title', bodyKey: 'landing.how_3_body' },
] as const

export function HowSection() {
  const { t, locale } = useLocale()
  const isAr = locale === 'ar'

  return (
    <section
      className="py-20 sm:py-28 overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, oklch(0.1 0.02 66) 0%, var(--c-ink) 56%, oklch(0.12 0.03 72) 100%)',
        borderTop: '1px solid oklch(1 0 0 / 0.04)',
        borderBottom: '1px solid oklch(1 0 0 / 0.04)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <ScrollReveal>
          <div className="text-center mb-14 sm:mb-18">
            <div
              className="lp-section-label"
              style={{ color: 'var(--c-gold-dim)', justifyContent: 'center', display: 'flex' }}
            >
              {t('landing.how_label')}
            </div>
            <h2 className="section-heading" style={{ color: 'oklch(0.94 0.01 82)' }}>
              {t('landing.how_title')}{' '}
              <span style={{ color: 'var(--c-gold-dim)' }}>{t('landing.how_title_accent')}</span>
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-6 relative">
          <div
            className="hidden sm:block absolute"
            aria-hidden
            style={{
              top: 27,
              insetInlineStart: 'calc(16.67% + 28px)',
              width: 'calc(33.33% - 56px)',
              height: 1,
              background: `linear-gradient(${isAr ? '270deg' : '90deg'}, var(--c-gold) 0%, transparent 100%)`,
              opacity: 0.4,
            }}
          />
          <div
            className="hidden sm:block absolute"
            aria-hidden
            style={{
              top: 27,
              insetInlineStart: 'calc(50% + 28px)',
              width: 'calc(33.33% - 56px)',
              height: 1,
              background: `linear-gradient(${isAr ? '90deg' : '270deg'}, transparent 0%, var(--c-gold) 100%)`,
              opacity: 0.4,
            }}
          />

          {STEP_KEYS.map((s, idx) => (
            <ScrollReveal key={s.n} delay={((idx + 1) as 1 | 2 | 3)}>
              <div className="lp-how-step">
                <div className="lp-how-step-num animate-step-pulse">{s.n}</div>
                <div className="lp-how-step-title">{t(s.titleKey)}</div>
                <div className="lp-how-step-desc">{t(s.bodyKey)}</div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
