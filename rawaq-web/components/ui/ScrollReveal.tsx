'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  delay?: 0 | 1 | 2 | 3 | 4
  /** Root margin — how far before the element enters the viewport to trigger */
  offset?: string
}

/**
 * Wraps children with a scroll-triggered entrance animation.
 * Uses IntersectionObserver to add the `in-view` class when the element
 * scrolls into view, which triggers the CSS transition defined in globals.css.
 */
export function ScrollReveal({ children, className = '', delay = 0, offset = '-60px' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('in-view')
          observer.unobserve(el)
        }
      },
      { threshold: 0.12, rootMargin: `0px 0px ${offset} 0px` },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [offset])

  const delayClass = delay > 0 ? `reveal-delay-${delay}` : ''

  return (
    <div ref={ref} className={`reveal ${delayClass} ${className}`}>
      {children}
    </div>
  )
}
