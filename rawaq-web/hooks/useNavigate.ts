'use client'

import { useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Navigation with a built-in pending flag for `router.push`-based buttons.
 *
 * `<Link>` clicks already surface progress via the global NavigationProgress
 * bar, but buttons that navigate programmatically give no feedback on the
 * control itself. Wrapping `router.push` in a transition lets the button show a
 * spinner / disable itself until the destination commits, preventing
 * double-clicks on cold navigations.
 *
 *   const { navigate, isNavigating } = useNavigate()
 *   <button onClick={() => navigate('/bookings')} disabled={isNavigating}>…</button>
 */
export function useNavigate() {
  const router = useRouter()
  const [isNavigating, startTransition] = useTransition()

  const navigate = useCallback(
    (href: string, opts?: { replace?: boolean }) => {
      startTransition(() => {
        if (opts?.replace) router.replace(href)
        else router.push(href)
      })
    },
    [router],
  )

  return { navigate, isNavigating }
}
