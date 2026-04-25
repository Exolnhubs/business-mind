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

const NETWORK_ERROR_RE = /failed to fetch|network request failed|fetch failed|offline|internet/i

export function classifyResponse(res: Response): ClassifiedError | null {
  const status = res.status

  if (status >= 200 && status < 400) return null

  if (status === 429) {
    const header = res.headers.get('Retry-After')
    const parsed = header ? parseInt(header, 10) : Number.NaN
    return {
      kind: 'rate_limited',
      retryAfterSec: Number.isFinite(parsed) ? parsed : null,
    }
  }

  if (status === 401 || status === 403) return { kind: 'auth' }
  if (status >= 500 && status <= 599) return { kind: 'transient' }
  if (status >= 400 && status < 500) return { kind: 'client' }

  return { kind: 'unknown' }
}

export function classifyThrown(err: unknown, ctx: ThrownContext): ClassifiedError {
  if (ctx.timedOut) return { kind: 'timeout' }

  if (err instanceof DOMException && err.name === 'AbortError') {
    return { kind: 'timeout' }
  }

  const message =
    err instanceof Error ? err.message
      : typeof err === 'string' ? err
      : ''

  if (!ctx.isOnline) return { kind: 'offline' }
  if (NETWORK_ERROR_RE.test(message)) return { kind: 'transient' }

  return { kind: 'unknown' }
}
