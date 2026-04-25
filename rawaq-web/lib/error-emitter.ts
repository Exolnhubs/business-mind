import type { ClassifiedError } from './error-classifier'

export type ErrorEvent = {
  classified: ClassifiedError
  retry?: () => void   // present only when caller is retryable (GET)
}

type Listener = (event: ErrorEvent) => void

const listeners = new Set<Listener>()

export const errorEmitter = {
  emit(event: ErrorEvent): void {
    for (const fn of listeners) {
      try { fn(event) } catch { /* listener errors must not break callers */ }
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
