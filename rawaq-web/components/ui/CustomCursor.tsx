'use client'

import { useEffect, useRef } from 'react'

/**
 * Dual cursor: amber diamond hotspot + trailing dashed ring.
 *
 * Architecture: zero-size wrapper divs are positioned by JS (transform: translate),
 * inner elements handle visual shape and CSS animations separately.
 * This avoids the browser compositing conflict when JS transform and CSS
 * individual `rotate` property are on the same element.
 */
export function CustomCursor() {
  const dotWrapRef  = useRef<HTMLDivElement>(null)
  const ringWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return

    const dotWrap  = dotWrapRef.current
    const ringWrap = ringWrapRef.current
    if (!dotWrap || !ringWrap) return

    let mouseX = 0, mouseY = 0
    let ringX = 0, ringY = 0
    let started = false
    let rafId: number

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY

      if (!started) {
        // Teleport ring to cursor on first move so it doesn't sweep in from (0,0)
        ringX = mouseX
        ringY = mouseY
        started = true
        dotWrap.style.opacity  = '1'
        ringWrap.style.opacity = '1'
      }
    }

    const onOver = (e: MouseEvent) => {
      const hit = (e.target as HTMLElement).closest(
        'a, button, [role="button"], input, select, textarea, label'
      )
      const method = hit ? 'add' : 'remove'
      dotWrap.classList[method]('cursor--hover')
      ringWrap.classList[method]('cursor--hover')
    }

    const onLeave = () => {
      dotWrap.style.opacity  = '0'
      ringWrap.style.opacity = '0'
    }
    const onEnter = () => {
      if (started) {
        dotWrap.style.opacity  = '1'
        ringWrap.style.opacity = '1'
      }
    }

    function tick() {
      // Dot snaps to exact mouse position
      dotWrap!.style.transform = `translate(${mouseX}px, ${mouseY}px)`

      // Ring lerps behind (springy trail)
      ringX += (mouseX - ringX) * 0.11
      ringY += (mouseY - ringY) * 0.11
      ringWrap!.style.transform = `translate(${ringX}px, ${ringY}px)`

      rafId = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseover', onOver)
    document.documentElement.addEventListener('mouseleave', onLeave)
    document.documentElement.addEventListener('mouseenter', onEnter)
    tick()

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseover', onOver)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      document.documentElement.removeEventListener('mouseenter', onEnter)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <>
      {/* Zero-size wrapper positioned by JS — inner shape floats via CSS */}
      <div ref={dotWrapRef} className="cursor-dot-wrap" aria-hidden>
        <div className="cursor-dot-shape" />
      </div>
      <div ref={ringWrapRef} className="cursor-ring-wrap" aria-hidden>
        <div className="cursor-ring-shape" />
      </div>
    </>
  )
}
