'use client'

import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import { ScrollReveal } from '@/components/ui/ScrollReveal'

const FEATURE_ICONS = ['🎫', '👥', '📊', '💬']
const FEATURE_KEYS = [
  { title: 'landing.host_f1_title', desc: 'landing.host_f1_desc' },
  { title: 'landing.host_f2_title', desc: 'landing.host_f2_desc' },
  { title: 'landing.host_f3_title', desc: 'landing.host_f3_desc' },
  { title: 'landing.host_f4_title', desc: 'landing.host_f4_desc' },
] as const

export function HostSection() {
  const { t } = useLocale()

  return (
    <section
      className="py-20 sm:py-28 overflow-hidden relative"
      style={{
        background:
          'linear-gradient(180deg, oklch(0.17 0.025 66) 0%, var(--c-ink-mid) 52%, oklch(0.2 0.028 72) 100%)',
        borderTop: '1px solid oklch(1 0 0 / 0.05)',
        borderBottom: '1px solid oklch(1 0 0 / 0.05)',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-20%',
          insetInlineEnd: '-10%',
          width: 560,
          height: 560,
          borderRadius: '50%',
          background: 'radial-gradient(circle, oklch(0.78 0.18 72 / 0.08) 0%, transparent 70%)',
          filter: 'blur(50px)',
          pointerEvents: 'none',
        }}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
        <div className="flex flex-col lg:flex-row gap-14 lg:gap-20 items-start lg:items-center">
          <div className="flex-shrink-0 lg:w-[420px]">
            <ScrollReveal>
              <div className="lp-section-label">{t('landing.host_label')}</div>
              <h2 className="section-heading mb-5" style={{ color: 'oklch(0.94 0.01 82)' }}>
                {t('landing.host_title')}{' '}
                <span style={{ color: 'var(--c-gold)' }}>{t('landing.host_title_accent')}</span>
              </h2>
              <p
                className="mb-8 text-base leading-relaxed"
                style={{ color: 'oklch(0.52 0.015 72)' }}
              >
                {t('landing.host_sub')}
              </p>
              <Link href="/register" className="btn-hero-primary inline-flex">
                {t('landing.host_cta')}
              </Link>
            </ScrollReveal>
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURE_KEYS.map((feature, i) => (
              <ScrollReveal key={i} delay={((i % 3) + 1) as 1 | 2 | 3}>
                <div className="lp-host-feature">
                  <span className="lp-host-feature-icon">{FEATURE_ICONS[i]}</span>
                  <div className="lp-host-feature-title">{t(feature.title)}</div>
                  <div className="lp-host-feature-desc">{t(feature.desc)}</div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
