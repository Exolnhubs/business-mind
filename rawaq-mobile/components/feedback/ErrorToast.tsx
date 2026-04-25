import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocale } from '@/contexts/locale-context'
import { errorEmitter, type ErrorEvent } from '@/lib/error-emitter'
import type { ClassifiedError } from '@/lib/error-classifier'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'

type ToastItem = {
  id: number
  classified: ClassifiedError
  retry?: () => void
  dismissAfterMs: number
  anim: Animated.Value
}

const MAX_TOASTS = 3
const TAB_BAR_OFFSET = 88
let nextId = 1

function dismissDelayFor(classified: ClassifiedError): number {
  if (classified.kind === 'rate_limited') {
    const sec = classified.retryAfterSec ?? 6
    return Math.min(Math.max(sec, 6), 10) * 1000
  }
  return 6000
}

function titleKey(classified: ClassifiedError): string {
  switch (classified.kind) {
    case 'rate_limited': return 'errors.rate_limited.title'
    case 'timeout': return 'errors.timeout.title'
    case 'offline': return 'errors.offline.title'
    default: return 'errors.transient.title'
  }
}

function bodyKeyAndVars(classified: ClassifiedError): { key: string; seconds?: number } {
  switch (classified.kind) {
    case 'rate_limited':
      return classified.retryAfterSec != null
        ? { key: 'errors.rate_limited.body', seconds: classified.retryAfterSec }
        : { key: 'errors.rate_limited.body_no_seconds' }
    case 'timeout':
      return { key: 'errors.timeout.body' }
    case 'offline':
      return { key: 'errors.offline.body' }
    default:
      return { key: 'errors.transient.body' }
  }
}

export function ErrorToastHost() {
  const { t, isRTL } = useLocale()
  const insets = useSafeAreaInsets()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const clearTimer = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    clearTimer(id)
    setToasts((prev) => {
      const target = prev.find((toast) => toast.id === id)
      if (!target) return prev

      Animated.timing(target.anim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }
      })

      return prev
    })
  }, [clearTimer])

  const mountToast = useCallback((event: ErrorEvent) => {
    const id = nextId++
    const anim = new Animated.Value(0)
    const dismissAfterMs = dismissDelayFor(event.classified)

    setToasts((prev) => {
      const next = [...prev, { id, classified: event.classified, retry: event.retry, dismissAfterMs, anim }]
      const overflow = next.length - MAX_TOASTS
      if (overflow > 0) {
        const dropped = next.slice(0, overflow)
        for (const toast of dropped) clearTimer(toast.id)
        return next.slice(overflow)
      }
      return next
    })

    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()

    const timer = setTimeout(() => dismiss(id), dismissAfterMs)
    timersRef.current.set(id, timer)
  }, [clearTimer, dismiss])

  useEffect(() => {
    const unsub = errorEmitter.subscribe(mountToast)
    return unsub
  }, [mountToast])

  useEffect(() => () => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
  }, [])

  const bottom = useMemo(() => insets.bottom + TAB_BAR_OFFSET, [insets.bottom])

  if (toasts.length === 0) return null

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      {toasts.map((toast) => {
        const body = bodyKeyAndVars(toast.classified)
        let bodyText = t(body.key)
        if (body.seconds != null) bodyText = bodyText.replace('{seconds}', String(body.seconds))

        return (
          <Animated.View
            key={toast.id}
            style={[
              styles.toast,
              isRTL ? styles.toastRTL : styles.toastLTR,
              {
                opacity: toast.anim,
                transform: [{
                  translateY: toast.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                }],
              },
            ]}
          >
            <View style={styles.body}>
              <Text style={styles.title}>{t(titleKey(toast.classified))}</Text>
              <Text style={styles.message}>{bodyText}</Text>
              {toast.retry ? (
                <Pressable
                  onPress={() => {
                    toast.retry?.()
                    dismiss(toast.id)
                  }}
                  style={styles.retryBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryText}>{t('errors.action.retry')}</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => dismiss(toast.id)}
              accessibilityRole="button"
              accessibilityLabel={t('errors.action.dismiss')}
              hitSlop={8}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>x</Text>
            </Pressable>
          </Animated.View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    gap: Spacing.sm,
    zIndex: 90,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1a1410',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    ...Shadow.modal,
  },
  toastLTR: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.brand[500],
  },
  toastRTL: {
    borderRightWidth: 4,
    borderRightColor: Colors.brand[500],
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#fafaf7',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    marginBottom: 2,
  },
  message: {
    color: '#fafaf7',
    opacity: 0.88,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.brand[500],
    borderRadius: Radius.sm,
    paddingVertical: 5,
    paddingHorizontal: Spacing.sm + 2,
  },
  retryText: {
    color: Colors.brand[400],
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  closeBtn: {
    paddingLeft: Spacing.sm,
  },
  closeText: {
    color: '#fafaf7',
    opacity: 0.6,
    fontSize: 20,
    lineHeight: 20,
  },
})
