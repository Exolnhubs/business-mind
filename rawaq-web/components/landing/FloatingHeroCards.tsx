'use client'

import type { CSSProperties } from 'react'
import { useLocale } from '@/contexts/locale-context'

interface FloatCardProps {
  title: string
  category: string
  country: string
  attendees: string
  time: string
  color: string
  className?: string
  style?: CSSProperties
}

interface CommPillProps {
  name: string
  members: string
  active?: boolean
}

function AvatarStack() {
  const colors = ['#e85d3a', '#2ab8a0', '#f5a623']

  return (
    <div className="lp-avatar-stack">
      {colors.map((color, i) => (
        <div
          key={i}
          className="lp-avatar"
          style={{
            background: color,
            marginInlineStart: i > 0 ? '-6px' : 0,
          }}
        >
          {String.fromCharCode(65 + i)}
        </div>
      ))}
    </div>
  )
}

function FloatCard({
  title,
  category,
  country,
  attendees,
  time,
  color,
  className,
  style,
}: FloatCardProps) {
  return (
    <div className={`lp-float-card ${className ?? ''}`} style={style}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="lp-float-card-badge" style={{ background: color + '22', color }}>
          {category}
        </span>
        <span style={{ fontSize: '0.6875rem', color: 'oklch(0.52 0.015 72)' }}>{country}</span>
      </div>
      <div className="lp-float-card-title">{title}</div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AvatarStack />
          <span style={{ fontSize: '0.6875rem', color: 'oklch(0.52 0.015 72)' }}>{attendees}</span>
        </div>
        <span style={{ fontSize: '0.6875rem', color: 'oklch(0.52 0.015 72)' }}>{time}</span>
      </div>
    </div>
  )
}

function CommPill({ name, members, active }: CommPillProps) {
  return (
    <div className={`lp-comm-pill ${active ? 'lp-comm-pill--active' : 'lp-comm-pill--inactive'}`}>
      <div
        className="lp-comm-pill-avatar"
        style={{
          background: active ? 'var(--c-gold)' : 'oklch(1 0 0 / 0.12)',
          color: active ? 'var(--c-ink)' : 'oklch(0.94 0.01 82)',
        }}
      >
        {name[0]}
      </div>
      <div>
        <div className="lp-comm-pill-name">{name}</div>
        <div className="lp-comm-pill-sub">{members}</div>
      </div>
    </div>
  )
}

export function FloatingHeroCards() {
  const { locale } = useLocale()

  const cards =
    locale === 'ar'
      ? [
          { title: 'ليلة جاز — الرياض', category: 'موسيقى', country: '🇸🇦', attendees: '١٤٢ سيحضر', time: 'الجمعة ٨م', color: '#f5a623' },
          { title: 'قمة التقنية القاهرة ٢٠٢٥', category: 'أعمال', country: '🇪🇬', attendees: '٨٣٠ سيحضر', time: 'السبت ١٠ص', color: '#2ab8a0' },
          { title: 'ليلة الكوميديا — دبي', category: 'ترفيه', country: '🇦🇪', attendees: '٣١٠ سيحضر', time: 'الخميس ٩م', color: '#e85d3a' },
        ]
      : [
          { title: 'Jazz Night — Riyadh', category: 'Music', country: '🇸🇦', attendees: '142 going', time: 'Fri 8 PM', color: '#f5a623' },
          { title: 'Tech Summit Cairo 2025', category: 'Business', country: '🇪🇬', attendees: '830 going', time: 'Sat 10 AM', color: '#2ab8a0' },
          { title: 'Comedy Night Dubai', category: 'Entertainment', country: '🇦🇪', attendees: '310 going', time: 'Thu 9 PM', color: '#e85d3a' },
        ]

  const pills =
    locale === 'ar'
      ? [
          { name: 'نادي الجري — الدار البيضاء', members: '٢٤٠٠ عضو', active: true },
          { name: 'مجتمع الفن — بيروت', members: '١٨٠٠ عضو', active: false },
          { name: 'مؤسّسو الشركات — MENA', members: '٥١٠٠ عضو', active: false },
        ]
      : [
          { name: 'Running Club Casablanca', members: '2.4K members', active: true },
          { name: 'Art Collective Beirut', members: '1.8K members', active: false },
          { name: 'Startup Founders MENA', members: '5.1K members', active: false },
        ]

  return (
    <div className="hidden lg:block relative" style={{ flex: 1, height: 520 }} aria-hidden="true">
      <FloatCard {...cards[0]} className="lp-float-a" style={{ top: 20, insetInlineStart: 40 }} />
      <FloatCard {...cards[1]} className="lp-float-b" style={{ top: 130, insetInlineEnd: 0 }} />
      <FloatCard {...cards[2]} className="lp-float-c" style={{ bottom: 80, insetInlineStart: 10 }} />

      <div className="lp-float-d flex flex-col gap-2 absolute" style={{ top: 0, insetInlineEnd: -10 }}>
        {pills.map((pill, i) => (
          <CommPill key={i} {...pill} />
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          margin: 'auto',
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, oklch(0.78 0.18 72 / 0.22) 0%, transparent 70%)',
          filter: 'blur(30px)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
