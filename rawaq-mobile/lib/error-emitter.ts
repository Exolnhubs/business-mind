import type { ClassifiedError } from './error-classifier'

export type ErrorEvent = {
  classified: ClassifiedError
  retry?: () => void
}

type Listener = (event: ErrorEvent) => void

const listeners = new Set<Listener>()

export const errorEmitter = {
  emit(event: ErrorEvent): void {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // Listener failures must never break the fetch path.
      }
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
