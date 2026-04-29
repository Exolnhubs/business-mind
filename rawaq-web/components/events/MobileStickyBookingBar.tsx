'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface MobileStickyBookingBarProps {
  priceLabel: string
  label?: string
  disabled?: boolean
  isBooked?: boolean
  isCancelled?: boolean
  sentinelId: string
}

export function MobileStickyBookingBar({
  priceLabel,
  label,
  disabled = false,
  isBooked = false,
  isCancelled = false,
  sentinelId,
}: MobileStickyBookingBarProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const sentinel = document.getElementById(sentinelId)
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinelId])

  if (isCancelled) return null

  return (
    <div
      className={cn(
        'lg:hidden fixed bottom-0 inset-x-0 z-50',
        'transition-transform duration-300 ease-out',
        visible ? 'translate-y-0' : 'translate-y-full'
      )}
      style={{
        background: 'oklch(0.985 0.007 80)',
        borderTop: '1px solid oklch(0.90 0.012 78)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {isBooked ? 'Your booking' : 'From'}
          </p>
          <p
            className="text-lg font-bold leading-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--c-gold-dim)' }}
          >
            {priceLabel}
          </p>
        </div>
        <a
          href="#booking-panel"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
          className={cn(
            'shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold uppercase tracking-wide transition-all',
            'active:scale-95',
            disabled
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed pointer-events-none'
              : 'text-[var(--c-ink)]',
          )}
          style={disabled ? {} : {
            background: 'var(--c-gold)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {isBooked ? 'View Booking' : (label ?? 'Book Now')}
        </a>
      </div>
    </div>
  )
}
