'use client'
import { useId } from 'react'

export function PlanBadge({ planId, size = 16 }: { planId?: string | null; size?: number }) {
  const uid = useId().replace(/:/g, '')

  if (planId === 'user_premium') {
    return (
      <svg
        width={size} height={size} viewBox="0 0 20 20" fill="none"
        aria-label="Premium member" role="img"
        style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}
      >
        <circle cx="10" cy="10" r="10" fill="#1D9BF0" />
        <polyline
          points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (planId === 'org_pro') {
    return (
      <svg
        width={size} height={size} viewBox="0 0 20 20" fill="none"
        aria-label="Pro organizer" role="img"
        style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}
      >
        <defs>
          <linearGradient id={`plat-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A8A9AD" />
            <stop offset="100%" stopColor="#E8E9EC" />
          </linearGradient>
        </defs>
        <circle cx="10" cy="10" r="10" fill={`url(#plat-${uid})`} />
        <polyline
          points="5,10 8.5,13.5 15,7"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (planId === 'org_elite') {
    const s = size * (22 / 20)
    return (
      <svg
        width={s} height={s} viewBox="0 0 22 22" fill="none"
        aria-label="Elite organizer" role="img"
        style={{ display: 'inline', verticalAlign: 'middle', flexShrink: 0 }}
      >
        <defs>
          <radialGradient id={`gold-${uid}`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFE066" />
            <stop offset="100%" stopColor="#FF8C00" />
          </radialGradient>
        </defs>
        <circle cx="11" cy="11" r="10.5" fill="none" stroke="#FFD700" strokeWidth="1" />
        <circle cx="11" cy="11" r="9" fill={`url(#gold-${uid})`} />
        <polyline
          points="6,11 9.5,14.5 16,8"
          stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    )
  }

  return null
}
