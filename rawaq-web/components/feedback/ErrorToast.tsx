'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useLocale } from '@/contexts/locale-context'
import { errorEmitter, type ErrorEvent } from '@/lib/error-emitter'
import type { ClassifiedError } from '@/lib/error-classifier'

type ToastItem = {
  id: number
  classified: ClassifiedError
  retry?: () => void
  dismissAfterMs: number
}

const MAX_TOASTS = 3
let nextId = 1

function dismissDelayFor(c: ClassifiedError): number {
  if (c.kind === 'rate_limited') {
    const sec = c.retryAfterSec ?? 6
    const clamped = Math.min(Math.max(sec, 6), 10)
    return clamped * 1000
  }
  return 6000
}

function titleKey(c: ClassifiedError): string {
  switch (c.kind) {
    case 'rate_limited': return 'errors.rate_limited.title'
    case 'timeout':      return 'errors.timeout.title'
    case 'offline':      return 'errors.offline.title'
    default:             return 'errors.transient.title'
  }
}

function bodyKeyAndVars(c: ClassifiedError): { key: string; seconds?: number } {
  switch (c.kind) {
    case 'rate_limited':
      return c.retryAfterSec != null
        ? { key: 'errors.rate_limited.body', seconds: c.retryAfterSec }
        : { key: 'errors.rate_limited.body_no_seconds' }
    case 'timeout': return { key: 'errors.timeout.body' }
    case 'offline': return { key: 'errors.offline.body' }
    default:        return { key: 'errors.transient.body' }
  }
}

export function ErrorToastProvider({ children }: { children: React.ReactNode }) {
  const { t, dir } = useLocale()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  useEffect(() => {
    const unsub = errorEmitter.subscribe((event: ErrorEvent) => {
      const id = nextId++
      const dismissAfterMs = dismissDelayFor(event.classified)
      setToasts(prev => {
        const next = [...prev, { id, classified: event.classified, retry: event.retry, dismissAfterMs }]
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next
      })
      const timer = setTimeout(() => dismiss(id), dismissAfterMs)
      timersRef.current.set(id, timer)
    })
    return unsub
  }, [dismiss])

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current.clear()
    }
  }, [])

  return (
    <>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        dir={dir}
        style={{
          position: 'fixed',
          bottom: 16,
          insetInlineEnd: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 9999,
          pointerEvents: 'none',
          maxWidth: 'calc(100vw - 32px)',
          width: 360,
        }}
      >
        {toasts.map(toast => {
          const body = bodyKeyAndVars(toast.classified)
          let bodyText = t(body.key)
          if (body.seconds != null) bodyText = bodyText.replace('{seconds}', String(body.seconds))
          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'auto',
                background: 'var(--c-ink, #1a1410)',
                color: 'var(--c-paper, #fafaf7)',
                borderInlineStart: '4px solid var(--c-gold, #d8a23a)',
                padding: '12px 14px',
                borderRadius: 8,
                boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{t(titleKey(toast.classified))}</div>
                  <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>{bodyText}</div>
                  {toast.retry && (
                    <button
                      type="button"
                      onClick={() => { toast.retry?.(); dismiss(toast.id) }}
                      style={{
                        marginTop: 8,
                        background: 'transparent',
                        color: 'var(--c-gold, #d8a23a)',
                        border: '1px solid var(--c-gold, #d8a23a)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {t('errors.action.retry')}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t('errors.action.dismiss')}
                  onClick={() => dismiss(toast.id)}
                  style={{
                    background: 'transparent',
                    color: 'inherit',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 18,
                    lineHeight: 1,
                    opacity: 0.6,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
