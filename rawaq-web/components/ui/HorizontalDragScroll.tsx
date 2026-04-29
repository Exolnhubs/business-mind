'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

type HorizontalDragScrollProps = {
  children: ReactNode
  className?: string
  contentClassName?: string
  style?: CSSProperties
  contentStyle?: CSSProperties
  ariaLabel?: string
  showEndFade?: boolean
  fadeColor?: string
  dir?: 'ltr' | 'rtl'
}

export function HorizontalDragScroll({
  children,
  className,
  contentClassName,
  style,
  contentStyle,
  ariaLabel,
  showEndFade = false,
  fadeColor = 'transparent',
  dir = 'ltr',
}: HorizontalDragScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showFade, setShowFade] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let isDown = false
    let startX = 0
    let startY = 0
    let scrollLeft = 0
    let didDrag = false

    const updateFade = () => {
      if (!showEndFade) return
      setShowFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
    }

    const onMove = (e: MouseEvent) => {
      if (!isDown) return
      e.preventDefault()
      const walkX = e.clientX - startX
      const walkY = e.clientY - startY
      const walk = Math.abs(walkX) >= Math.abs(walkY) ? walkX : -walkY
      if (Math.abs(walk) > 4) didDrag = true
      el.scrollLeft = scrollLeft - walk * 1.4
    }

    const onUp = () => {
      if (!isDown) return
      isDown = false
      el.style.cursor = 'grab'
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      isDown = true
      didDrag = false
      startX = e.clientX
      startY = e.clientY
      scrollLeft = el.scrollLeft
      el.style.cursor = 'grabbing'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }

    const onClickCapture = (e: MouseEvent) => {
      if (!didDrag) return
      e.preventDefault()
      e.stopPropagation()
      didDrag = false
    }

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      if (el.scrollWidth <= el.clientWidth + 4) return
      e.preventDefault()
      el.scrollLeft += e.deltaY * 1.5
    }

    const resizeObserver = showEndFade && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateFade)
      : null
    resizeObserver?.observe(el)
    if (el.firstElementChild) resizeObserver?.observe(el.firstElementChild)

    const raf = requestAnimationFrame(updateFade)
    el.style.cursor = 'grab'
    el.addEventListener('mousedown', onDown)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('scroll', updateFade, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', updateFade)

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver?.disconnect()
      el.removeEventListener('mousedown', onDown)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('scroll', updateFade)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', updateFade)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [showEndFade])

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      {showEndFade && showFade && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            insetInlineEnd: 0,
            top: 0,
            bottom: 0,
            width: 64,
            pointerEvents: 'none',
            zIndex: 1,
            background: dir === 'rtl'
              ? `linear-gradient(to left, ${fadeColor}, transparent)`
              : `linear-gradient(to right, ${fadeColor}, transparent)`,
          }}
        />
      )}
      <div
        ref={scrollRef}
        aria-label={ariaLabel}
        className="scrollbar-hide"
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          userSelect: 'none',
        }}
      >
        <div
          className={contentClassName}
          style={{ display: 'flex', ...contentStyle }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
