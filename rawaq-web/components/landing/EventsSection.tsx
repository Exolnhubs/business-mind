'use client'

import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import { ScrollReveal } from '@/components/ui/ScrollReveal'

const EVENTS_EN = [
  { title: 'Tech Summit Cairo 2025', cat: 'Business', country: 'Egypt', date: 'Sat May 10', price: 'EGP 350', att: '830', color: '#2ab8a0', featured: true },
  { title: 'Jazz Night — Riyadh', cat: 'Music', country: 'Saudi Arabia', date: 'Fri May 2', price: 'SAR 120', att: '142', color: '#f5a623', featured: false },
  { title: 'Comedy Night Dubai', cat: 'Entertainment', country: 'UAE', date: 'Thu May 8', price: 'AED 150', att: '310', color: '#e85d3a', featured: false },
  { title: 'Startup Mixer — Amman', cat: 'Networking', country: 'Jordan', date: 'Wed May 7', price: 'Free', att: '280', color: '#8b6be8', featured: false },
  { title: 'Food Festival Casablanca', cat: 'Food', country: 'Morocco', date: 'Sat May 17', price: 'MAD 80', att: '1.2K', color: '#f5a623', featured: true },
  { title: 'Art Exhibition Beirut', cat: 'Art', country: 'Lebanon', date: 'Fri May 9', price: 'Free', att: '450', color: '#8b6be8', featured: false },
]

const EVENTS_AR = [
  { title: 'قمة التقنية القاهرة ٢٠٢٥', cat: 'أعمال', country: 'مصر', date: 'السبت ١٠ مايو', price: '٣٥٠ جنيه', att: '٨٣٠', color: '#2ab8a0', featured: true },
  { title: 'ليلة جاز — الرياض', cat: 'موسيقى', country: 'السعودية', date: 'الجمعة ٢ مايو', price: '١٢٠ ريال', att: '١٤٢', color: '#f5a623', featured: false },
  { title: 'ليلة الكوميديا — دبي', cat: 'ترفيه', country: 'الإمارات', date: 'الخميس ٨ مايو', price: '١٥٠ درهم', att: '٣١٠', color: '#e85d3a', featured: false },
  { title: 'ملتقى الشركات الناشئة — عمّان', cat: 'تواصل', country: 'الأردن', date: 'الأربعاء ٧ مايو', price: 'مجاني', att: '٢٨٠', color: '#8b6be8', featured: false },
  { title: 'مهرجان الطعام — الدار البيضاء', cat: 'طعام', country: 'المغرب', date: 'السبت ١٧ مايو', price: '٨٠ درهم', att: '١٢٠٠', color: '#f5a623', featured: true },
  { title: 'معرض الفن — بيروت', cat: 'فن', country: 'لبنان', date: 'الجمعة ٩ مايو', price: 'مجاني', att: '٤٥٠', color: '#8b6be8', featured: false },
]

function AvatarStack() {
  return (
    <div style={{ display: 'flex' }}>
      {['#e85d3a', '#2ab8a0', '#f5a623'].map((color, i) => (
        <div
          key={i}
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: color,
            border: '2px solid oklch(0.16 0.025 68)',
            marginInlineStart: i > 0 ? -5 : 0,
            fontSize: 7,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0f0d0a',
          }}
        >
          {String.fromCharCode(65 + i)}
        </div>
      ))}
    </div>
  )
}

function EventCard({
  title,
  cat,
  country,
  date,
  price,
  att,
  color,
  featured,
  featuredLabel,
  goingLabel,
}: {
  title: string
  cat: string
  country: string
  date: string
  price: string
  att: string
  color: string
  featured: boolean
  featuredLabel: string
  goingLabel: string
}) {
  const isFree = price === 'Free' || price === 'مجاني'

  return (
    <Link href="/events" className="lp-event-card block">
      <div
        className="lp-event-card-img"
        style={{
          background: `linear-gradient(135deg, ${color}28, ${color}08)`,
          borderBottom: `1px solid ${color}20`,
        }}
      >
        <div className="lp-event-card-img-placeholder" style={{ color: `${color}55` }}>
          [ event photo ]
          <br />
          {title}
        </div>
        {featured && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              insetInlineStart: 10,
              background: 'var(--c-gold)',
              color: 'var(--c-ink)',
              fontSize: '0.625rem',
              fontWeight: 700,
              padding: '0.2rem 0.625rem',
              borderRadius: '2rem',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.04em',
            }}
          >
            {featuredLabel}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top: 10,
            insetInlineEnd: 10,
            background: 'oklch(0.12 0.02 68 / 0.8)',
            backdropFilter: 'blur(8px)',
            color: isFree ? '#2ab8a0' : 'oklch(0.94 0.01 82)',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '0.25rem 0.75rem',
            borderRadius: '2rem',
            fontFamily: 'var(--font-display)',
          }}
        >
          {price}
        </div>
      </div>

      <div className="lp-event-card-body">
        <div className="flex items-center justify-between mb-2">
          <span className="lp-event-card-cat" style={{ background: color + '18', color }}>
            {cat}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'oklch(0.52 0.015 72)' }}>{country}</span>
        </div>
        <div className="lp-event-card-title">{title}</div>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: '0.75rem', color: 'oklch(0.52 0.015 72)' }}>
            📅 {date}
          </span>
          <div className="flex items-center gap-1.5">
            <AvatarStack />
            <span style={{ fontSize: '0.6875rem', color: 'oklch(0.52 0.015 72)' }}>
              {att} {goingLabel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export function EventsSection() {
  const { t, locale } = useLocale()
  const isAr = locale === 'ar'
  const data = isAr ? EVENTS_AR : EVENTS_EN

  return (
    <section
      className="py-20 sm:py-28"
      style={{
        background:
          'linear-gradient(180deg, oklch(0.11 0.022 66) 0%, var(--c-ink) 54%, oklch(0.13 0.028 70) 100%)',
        borderTop: '1px solid oklch(1 0 0 / 0.04)',
        borderBottom: '1px solid oklch(1 0 0 / 0.04)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <ScrollReveal>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <div className="lp-section-label">
                {t('landing.ev_label')}
              </div>
              <h2 className="section-heading" style={{ color: 'oklch(0.94 0.01 82)' }}>
                {t('landing.ev_title')}{' '}
                <span style={{ color: 'var(--c-gold)' }}>{t('landing.ev_title_accent')}</span>
              </h2>
            </div>
            <Link
              href="/events"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: 'var(--c-gold)',
                textDecoration: 'none',
                borderBottom: '1px solid oklch(0.78 0.18 72 / 0.4)',
                paddingBottom: '2px',
                flexShrink: 0,
              }}
            >
              {t('landing.view_all_events')}
            </Link>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={1}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.map((event, i) => (
              <EventCard
                key={i}
                {...event}
                featuredLabel={t('landing.ev_featured')}
                goingLabel={t('landing.ev_going')}
              />
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
