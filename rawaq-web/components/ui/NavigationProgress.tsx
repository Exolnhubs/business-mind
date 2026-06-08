'use client'

/**
 * Global navigation progress bar.
 *
 * App Router gives no `routeChangeStart` event, so we detect navigation *intent*
 * ourselves — intercepting same-origin anchor clicks and patching
 * history.pushState/replaceState (which `router.push/replace` call under the
 * hood) — to start the bar the instant the user acts. We then complete it when
 * the resolved pathname/searchParams settle. This closes the "click → dead zone"
 * gap on cold/uncached navigations where nothing renders until the next segment
 * is ready, which is what makes users re-click.
 *
 * Mounted client-only (ssr:false) so `useSearchParams` never forces a Suspense
 * boundary on otherwise-static pages.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams?.toString() ?? ''}`

  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didMountRef = useRef(false)

  const clearTimers = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    if (hideRef.current) { clearTimeout(hideRef.current); hideRef.current = null }
  }, [])

  const start = useCallback(() => {
    if (tickRef.current) return // already running
    if (hideRef.current) { clearTimeout(hideRef.current); hideRef.current = null }
    setVisible(true)
    setProgress(8)
    tickRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p
        const inc = p < 40 ? 9 : p < 70 ? 5 : 2 // ease out as it fills
        return Math.min(p + inc, 90)
      })
    }, 240)
  }, [])

  const done = useCallback(() => {
    clearTimers()
    setProgress(100)
    hideRef.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 220)
  }, [clearTimers])

  // Complete the bar when the route actually settles (skip initial mount).
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    done()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  // Detect navigation start: anchor clicks + programmatic history changes.
  useEffect(() => {
    const sameDestination = (url: URL) =>
      url.pathname === window.location.pathname && url.search === window.location.search

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      const target = anchor.getAttribute('target')
      if (target && target !== '_self') return
      if (anchor.hasAttribute('download')) return
      let url: URL
      try { url = new URL(href, window.location.href) } catch { return }
      if (url.origin !== window.location.origin || sameDestination(url)) return
      start()
    }

    const origPush = window.history.pushState
    const origReplace = window.history.replaceState
    window.history.pushState = function (...args: Parameters<typeof origPush>) {
      const url = args[2]
      if (url) {
        try {
          const u = new URL(String(url), window.location.href)
          if (!sameDestination(u)) start()
        } catch { /* ignore */ }
      }
      return origPush.apply(this, args)
    }
    window.history.replaceState = function (...args: Parameters<typeof origReplace>) {
      return origReplace.apply(this, args)
    }
    const onPop = () => start()

    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPop)

    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPop)
      window.history.pushState = origPush
      window.history.replaceState = origReplace
      clearTimers()
    }
  }, [start, clearTimers])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] h-0.5 pointer-events-none" aria-hidden="true">
      <div
        className="h-full bg-brand-500 shadow-[0_0_10px_rgba(99,102,241,0.7)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: progress >= 100 ? 0 : 1 }}
      />
    </div>
  )
}
