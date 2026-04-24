'use client'

import { useEffect, useState } from 'react'
import { useLocale } from '@/contexts/locale-context'

const ACTIVITY_KEYS = [
  'landing.activity_1',
  'landing.activity_2',
  'landing.activity_3',
  'landing.activity_4',
  'landing.activity_5',
  'landing.activity_6',
  'landing.activity_7',
] as const

const ACTIVITY_ICONS = ['🎸', '🎟', '🏃', '🎨', '🎟', '🏄', '🎵']

export function ActivityFeed() {
  const { t } = useLocale()
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx((i) => (i + 1) % ACTIVITY_KEYS.length)
        setVisible(true)
      }, 300)
    }, 2800)

    return () => clearInterval(id)
  }, [])

  return (
    <div className="lp-activity-feed">
      <div className="lp-activity-dot" />
      <span
        className="lp-activity-text"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        {ACTIVITY_ICONS[idx]} {t(ACTIVITY_KEYS[idx])}
      </span>
    </div>
  )
}
