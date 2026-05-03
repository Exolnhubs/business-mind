export type ClassifiedError =
  | { kind: 'rate_limited'; retryAfterSec: number | null }
  | { kind: 'transient' }
  | { kind: 'offline' }
  | { kind: 'timeout' }
  | { kind: 'auth' }
  | { kind: 'client' }
  | { kind: 'unknown' }

export type ThrownContext = {
  isOnline: boolean
  timedOut: boolean
}

export function classifyResponse(res: Response): ClassifiedError | null {
  const s = res.status
  if (s >= 200 && s < 400) return null
  if (s === 429) {
    const header = res.headers.get('Retry-After')
    const parsed = header ? parseInt(header, 10) : NaN
    return { kind: 'rate_limited', retryAfterSec: Number.isFinite(parsed) && parsed > 0 ? parsed : null }
  }
  if (s === 401 || s === 403) return { kind: 'auth' }
  if (s >= 500 && s <= 599) return { kind: 'transient' }
  if (s >= 400 && s < 500) return { kind: 'client' }
  return { kind: 'unknown' }
}

export function classifyThrown(err: unknown, ctx: ThrownContext): ClassifiedError {
  if (ctx.timedOut) return { kind: 'timeout' }
  if (err instanceof DOMException && err.name === 'AbortError') {
    // timedOut is false here — the abort came from route navigation or component
    // unmount (Next.js cancels in-flight fetches on navigation via its own signal).
    // Treat as 'unknown' so the caller gets no toast and the original DOMException
    // is re-thrown as-is, preserving its AbortError identity for callers that care.
    return { kind: 'unknown' }
  }
  if (err instanceof TypeError) {
    return ctx.isOnline ? { kind: 'transient' } : { kind: 'offline' }
  }
  return { kind: 'unknown' }
}
