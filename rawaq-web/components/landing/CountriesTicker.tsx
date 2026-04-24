'use client'

import { useLocale } from '@/contexts/locale-context'

const COUNTRIES = [
  { flag: '🇸🇦', en: 'Saudi Arabia', ar: 'السعودية' },
  { flag: '🇦🇪', en: 'UAE', ar: 'الإمارات' },
  { flag: '🇪🇬', en: 'Egypt', ar: 'مصر' },
  { flag: '🇯🇴', en: 'Jordan', ar: 'الأردن' },
  { flag: '🇰🇼', en: 'Kuwait', ar: 'الكويت' },
  { flag: '🇶🇦', en: 'Qatar', ar: 'قطر' },
  { flag: '🇧🇭', en: 'Bahrain', ar: 'البحرين' },
  { flag: '🇴🇲', en: 'Oman', ar: 'عُمان' },
  { flag: '🇱🇧', en: 'Lebanon', ar: 'لبنان' },
  { flag: '🇲🇦', en: 'Morocco', ar: 'المغرب' },
  { flag: '🇹🇳', en: 'Tunisia', ar: 'تونس' },
  { flag: '🇮🇶', en: 'Iraq', ar: 'العراق' },
  { flag: '🇵🇸', en: 'Palestine', ar: 'فلسطين' },
  { flag: '🇩🇿', en: 'Algeria', ar: 'الجزائر' },
]

export function CountriesTicker() {
  const { locale } = useLocale()
  const doubled = [...COUNTRIES, ...COUNTRIES]

  return (
    <section
      className="py-3 overflow-hidden"
      style={{
        borderTop: '1px solid oklch(0.78 0.18 72 / 0.12)',
        borderBottom: '1px solid oklch(0.78 0.18 72 / 0.12)',
        backgroundColor: 'oklch(0.13 0.022 68 / 0.85)',
      }}
    >
      <div className="marquee-wrap">
        <div
          className="marquee-track"
          style={{
            animationDirection: locale === 'ar' ? 'reverse' : 'normal',
          }}
        >
          {doubled.map((c, i) => (
            <span
              key={i}
              className="marquee-pill"
              style={{
                color: i % 4 === 0 ? 'var(--c-gold)' : 'oklch(0.52 0.015 72)',
              }}
            >
              <span className="text-base">{c.flag}</span>
              {locale === 'ar' ? c.ar : c.en}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
