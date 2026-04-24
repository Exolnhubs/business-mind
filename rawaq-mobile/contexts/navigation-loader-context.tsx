import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { RouteLoadingOverlay } from '@/components/ui/RouteLoadingOverlay'

interface NavigationLoaderContextValue {
  isVisible: boolean
  beginNavigation: () => void
  endNavigation: () => void
  resetNavigation: () => void
}

const SHOW_DELAY_MS = 120
const MIN_VISIBLE_MS = 180

const NavigationLoaderContext = createContext<NavigationLoaderContextValue | null>(null)

export function NavigationLoaderProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false)
  const pendingCountRef = useRef(0)
  const visibleSinceRef = useRef<number | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }, [])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const beginNavigation = useCallback(() => {
    pendingCountRef.current += 1
    clearHideTimer()

    if (isVisible || showTimerRef.current) {
      return
    }

    showTimerRef.current = setTimeout(() => {
      showTimerRef.current = null
      if (pendingCountRef.current <= 0) {
        return
      }
      visibleSinceRef.current = Date.now()
      setIsVisible(true)
    }, SHOW_DELAY_MS)
  }, [clearHideTimer, isVisible])

  const endNavigation = useCallback(() => {
    pendingCountRef.current = Math.max(0, pendingCountRef.current - 1)

    if (pendingCountRef.current > 0) {
      return
    }

    clearShowTimer()

    if (!isVisible) {
      return
    }

    const elapsed = visibleSinceRef.current ? Date.now() - visibleSinceRef.current : MIN_VISIBLE_MS
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed)

    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      visibleSinceRef.current = null
      setIsVisible(false)
    }, remaining)
  }, [clearHideTimer, clearShowTimer, isVisible])

  const resetNavigation = useCallback(() => {
    pendingCountRef.current = 0
    clearShowTimer()
    clearHideTimer()
    visibleSinceRef.current = null
    setIsVisible(false)
  }, [clearHideTimer, clearShowTimer])

  const value = useMemo<NavigationLoaderContextValue>(() => ({
    isVisible,
    beginNavigation,
    endNavigation,
    resetNavigation,
  }), [beginNavigation, endNavigation, isVisible, resetNavigation])

  return (
    <NavigationLoaderContext.Provider value={value}>
      {children}
      {isVisible ? <RouteLoadingOverlay /> : null}
    </NavigationLoaderContext.Provider>
  )
}

export function useNavigationLoader() {
  const context = useContext(NavigationLoaderContext)
  if (!context) {
    throw new Error('useNavigationLoader must be used within NavigationLoaderProvider')
  }
  return context
}
