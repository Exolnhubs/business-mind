'use client'

import type { CSSProperties } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'
import { ScrollReveal } from '@/components/ui/ScrollReveal'

const COMMUNITIES_EN = [
  { name: 'Running Club Casablanca', cat: 'Sport', members: '2.4K', posts: '18 today', color: '#e85d3a' },
  { name: 'Jazz & Soul — Riyadh', cat: 'Music', members: '1.1K', posts: '7 today', color: '#f5a623' },
  { name: 'Startup Founders MENA', cat: 'Business', members: '5.1K', posts: '34 today', color: '#2ab8a0' },
  { name: 'Arabic Cinema Lovers', cat: 'Culture', members: '3.2K', posts: '12 today', color: '#8b6be8' },
  { name: 'Street Food — Cairo', cat: 'Food', members: '8.7K', posts: '56 today', color: '#f5a623' },
  { name: 'UX/Product MENA', cat: 'Tech', members: '2.9K', posts: '22 today', color: '#2ab8a0' },
  { name: 'Surf Crew Agadir', cat: 'Sport', members: '890', posts: '9 today', color: '#e85d3a' },
  { name: 'Contemporary Art Beirut', cat: 'Art', members: '1.7K', posts: '15 today', color: '#8b6be8' },
]

const COMMUNITIES_AR = [
  { name: 'نادي الجري — الدار البيضاء', cat: 'رياضة', members: '٢٤٠٠', posts: '١٨ اليوم', color: '#e85d3a' },
  { name: 'جاز وسول — الرياض', cat: 'موسيقى', members: '١١٠٠', posts: '٧ اليوم', color: '#f5a623' },
  { name: 'مؤسّسو الشركات — MENA', cat: 'أعمال', members: '٥١٠٠', posts: '٣٤ اليوم', color: '#2ab8a0' },
  { name: 'عشّاق السينما العربية', cat: 'ثقافة', members: '٣٢٠٠', posts: '١٢ اليوم', color: '#8b6be8' },
  { name: 'طعام الشوارع — القاهرة', cat: 'طعام', members: '٨٧٠٠', posts: '٥٦ اليوم', color: '#f5a623' },
  { name: 'تجربة المستخدم — MENA', cat: 'تقنية', members: '٢٩٠٠', posts: '٢٢ اليوم', color: '#2ab8a0' },
  { name: 'ركوب الأمواج — أغادير', cat: 'رياضة', members: '٨٩٠', posts: '٩ اليوم', color: '#e85d3a' },
  { name: 'الفن المعاصر — بيروت', cat: 'فن', members: '١٧٠٠', posts: '١٥ اليوم', color: '#8b6be8' },
]

function CommunityCard({
  name,
  cat,
  members,
  posts,
  color,
}: {
  name: string
  cat: string
  members: string
  posts: string
  color: string
}) {
  return (
    <Link
      href="/communities"
      className="lp-comm-card block"
      style={{ '--card-color': color } as CSSProperties}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="lp-comm-card-icon"
          style={{ background: color + '22', border: `1px solid ${color}40`, color }}
        >
          {name[0]}
        </div>
        <span
          style={{
            background: color + '18',
            color,
            fontSize: '0.625rem',
            fontWeight: 700,
            padding: '0.2rem 0.625rem',
            borderRadius: '2rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {cat}
        </span>
      </div>
      <div className="lp-comm-card-name">{name}</div>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: '0.75rem', color: 'oklch(0.52 0.015 72)' }}>{members}</span>
        <span style={{ fontSize: '0.75rem', color: color + 'cc' }}>● {posts}</span>
      </div>
    </Link>
  )
}

export function CommunitiesSection() {
  const { t, locale } = useLocale()
  const isAr = locale === 'ar'

  const cats = [
    t('landing.cat_all'),
    t('landing.cat_sport'),
    t('landing.cat_music'),
    t('landing.cat_business'),
    t('landing.cat_culture'),
    t('landing.cat_food'),
    t('landing.cat_tech'),
    t('landing.cat_art'),
  ]

  const catKeysEn = ['All', 'Sport', 'Music', 'Business', 'Culture', 'Food', 'Tech', 'Art']
  const catKeysAr = ['الكل', 'رياضة', 'موسيقى', 'أعمال', 'ثقافة', 'طعام', 'تقنية', 'فن']

  const [activeIdx, setActiveIdx] = useState(0)

  const data = isAr ? COMMUNITIES_AR : COMMUNITIES_EN
  const catKeys = isAr ? catKeysAr : catKeysEn
  const filtered = activeIdx === 0 ? data : data.filter((c) => c.cat === catKeys[activeIdx])

  return (
    <section
      className="py-20 sm:py-28"
      style={{
        background:
          'linear-gradient(180deg, oklch(0.2 0.03 72) 0%, var(--c-ink-mid) 42%, oklch(0.16 0.024 66) 100%)',
        borderTop: '1px solid oklch(1 0 0 / 0.05)',
        borderBottom: '1px solid oklch(1 0 0 / 0.05)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <ScrollReveal>
          <div className="mb-10">
            <div className="lp-section-label">{t('landing.comm_label')}</div>
            <h2 className="section-heading" style={{ color: 'oklch(0.94 0.01 82)' }}>
              {t('landing.comm_title')}{' '}
              <span style={{ color: 'var(--c-gold)' }}>{t('landing.comm_title_accent')}</span>
            </h2>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={1}>
          <div className="flex flex-wrap gap-2 mb-8">
            {cats.map((cat, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className="lp-cat-pill"
                style={{
                  borderColor: activeIdx === i ? 'var(--c-gold)' : 'oklch(1 0 0 / 0.12)',
                  background: activeIdx === i ? 'oklch(0.78 0.18 72 / 0.14)' : 'transparent',
                  color: activeIdx === i ? 'var(--c-gold)' : 'oklch(0.52 0.015 72)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={2}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filtered.map((community, i) => (
              <CommunityCard key={i} {...community} />
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={3}>
          <div className="text-center mt-10">
            <Link
              href="/communities"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: 'var(--c-gold)',
                textDecoration: 'none',
                borderBottom: '1px solid oklch(0.78 0.18 72 / 0.4)',
                paddingBottom: '2px',
              }}
            >
              {t('landing.explore_comm')}
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
